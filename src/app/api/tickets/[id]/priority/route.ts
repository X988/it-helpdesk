import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { canReadTicket } from "@/lib/ticket-access";
import { priorityChangeSchema } from "@/lib/validation";
import { initialDeadlines, pauseResolve, spentResolveMinutes, addMinutes, type CalendarMode } from "@/lib/sla";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(STAFF_ROLES);
    const { id } = await context.params;
    const parsed = priorityChangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    const current = await db.ticket.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, current, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (current.status === "CLOSED" || current.status === "CANCELLED") {
      return NextResponse.json({ error: "INVALID_TRANSITION" }, { status: 409 });
    }
    const policy = await db.slaPolicy.findUnique({ where: { priority: parsed.data.priority } });
    if (!policy) return NextResponse.json({ error: "SLA_POLICY_NOT_FOUND" }, { status: 400 });
    const now = new Date();
    const snap = initialDeadlines(current.createdAt, {
      priority: policy.priority,
      responseMinutes: policy.responseMinutes,
      resolveMinutes: policy.resolveMinutes,
      calendarMode: policy.calendarMode,
      version: policy.version,
    });
    const mode = policy.calendarMode as CalendarMode;
    let slaResolveDue = snap.slaResolveDue;
    let slaRemaining = policy.resolveMinutes;
    if (current.firstResponseAt) {
      const spent = spentResolveMinutes(current.createdAt, now, current.slaPausedMinutes, mode);
      slaRemaining = Math.max(0, policy.resolveMinutes - spent);
      slaResolveDue = addMinutes(now, slaRemaining, mode);
    }
    if (current.status === "WAITING_FOR_USER") {
      const paused = pauseResolve({
        createdAt: current.createdAt,
        now,
        pausedMinutes: current.slaPausedMinutes,
        resolveMinutes: policy.resolveMinutes,
        mode,
      });
      slaRemaining = paused.slaRemainingResolveMinutes;
    }
    const ticket = await db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id, priority: current.priority, updatedAt: current.updatedAt },
        data: {
          priority: parsed.data.priority,
          slaResponseDue: current.firstResponseAt ? current.slaResponseDue : snap.slaResponseDue,
          slaResolveDue,
          slaResponseMinutes: policy.responseMinutes,
          slaResolveMinutes: policy.resolveMinutes,
          slaCalendarMode: policy.calendarMode,
          slaPolicyVersion: policy.version,
          slaCalculatedAt: now,
          slaRemainingResolveMinutes: slaRemaining,
        },
      });
      if (changed.count !== 1) return null;
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "SLA_CHANGED",
          entityType: "Ticket",
          entityId: id,
          metadata: {
            before: { priority: current.priority, slaResolveDue: current.slaResolveDue },
            after: { priority: parsed.data.priority, slaResolveDue, policyVersion: policy.version },
          },
        },
      });
      return tx.ticket.findUnique({ where: { id } });
    });
    if (!ticket) return NextResponse.json({ error: "CONFLICT" }, { status: 409 });
    return NextResponse.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
