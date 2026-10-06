import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES, isStaffRole } from "@/lib/roles";
import { assignSchema } from "@/lib/validation";
import { canReadTicket } from "@/lib/ticket-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(STAFF_ROLES);
    const { id } = await context.params;
    const parsed = assignSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });

    const assignee = await db.user.findFirst({
      where: {
        id: parsed.data.assigneeId,
        isActive: true,
        role: { in: STAFF_ROLES },
      },
      select: { id: true, departmentId: true },
    });
    if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 400 });

    const current = await db.ticket.findUnique({
      where: { id },
      select: { id: true, assigneeId: true, status: true, requesterId: true, departmentId: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, current, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (
      isStaffRole(session.role) && session.role !== "ADMIN" &&
      assignee.departmentId &&
      current.departmentId &&
      assignee.departmentId !== current.departmentId
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (current.status === "CLOSED" || current.status === "CANCELLED") {
      return NextResponse.json({ error: "Ticket closed" }, { status: 409 });
    }

    const ticket = await db.$transaction(async (tx) => {
      const data: { assigneeId: string; status?: "IN_PROGRESS" } = {
        assigneeId: assignee.id,
      };
      if (current.status === "NEW") data.status = "IN_PROGRESS";

      await tx.ticket.update({ where: { id }, data });
      await tx.ticketAssignment.create({
        data: {
          ticketId: id,
          fromAssigneeId: current.assigneeId,
          toAssigneeId: assignee.id,
          actorId: session.userId,
        },
      });
      if (current.status === "NEW") {
        await tx.ticketStatusHistory.create({
          data: {
            ticketId: id,
            fromStatus: "NEW",
            toStatus: "IN_PROGRESS",
            actorId: session.userId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "TICKET_ASSIGNED",
          entityType: "Ticket",
          entityId: id,
          metadata: { assigneeId: assignee.id },
        },
      });
      return tx.ticket.findUnique({ where: { id } });
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
