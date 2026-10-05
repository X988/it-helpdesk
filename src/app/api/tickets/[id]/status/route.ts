import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canManageTicket } from "@/lib/ticket-access";
import { statusChangeSchema } from "@/lib/validation";

const transitions: Record<string, string[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (!canManageTicket(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    const parsed = statusChangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const current = await db.ticket.findUnique({
      where: { id },
      select: { status: true, workMinutes: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!transitions[current.status]?.includes(parsed.data.status)) {
      return NextResponse.json({ error: "Invalid transition" }, { status: 409 });
    }

    let workMinutes = parsed.data.workMinutes;
    if (parsed.data.workHours != null && workMinutes == null) {
      workMinutes = Math.round(parsed.data.workHours * 60);
    }

    const needsTime = parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED";
    if (needsTime) {
      const total = workMinutes ?? current.workMinutes;
      if (total == null || total < 1) {
        return NextResponse.json(
          { error: "WORK_TIME_REQUIRED", message: "Укажите затраченное время (минуты или часы)" },
          { status: 400 },
        );
      }
      workMinutes = total;
    }

    const ticket = await db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id, status: current.status },
        data: {
          status: parsed.data.status,
          resolvedAt: parsed.data.status === "RESOLVED" ? new Date() : undefined,
          closedAt: parsed.data.status === "CLOSED" ? new Date() : undefined,
          ...(workMinutes != null ? { workMinutes } : {}),
        },
      });
      if (changed.count !== 1) return null;
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: current.status,
          toStatus: parsed.data.status,
          actorId: session.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "STATUS_CHANGED",
          entityType: "Ticket",
          entityId: id,
          metadata: {
            from: current.status,
            to: parsed.data.status,
            workMinutes: workMinutes ?? null,
          },
        },
      });
      return tx.ticket.findUnique({ where: { id } });
    });
    if (!ticket) return NextResponse.json({ error: "Ticket changed concurrently" }, { status: 409 });
    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
