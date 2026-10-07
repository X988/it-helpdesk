import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(STAFF_ROLES);
    const { id } = await context.params;
    const current = await db.ticket.findUnique({
      where: { id },
      select: { requesterId: true, assigneeId: true, departmentId: true },
    });
    if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const { canReadTicket } = await import("@/lib/ticket-access");
    if (!canReadTicket(session.role, session.userId, current, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: { id, assigneeId: null, status: "NEW" },
        data: { assigneeId: session.userId, status: "IN_PROGRESS" },
      });
      if (updated.count !== 1) return null;

      await tx.ticketAssignment.create({ data: { ticketId: id, toAssigneeId: session.userId, actorId: session.userId } });
      await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: "NEW", toStatus: "IN_PROGRESS", actorId: session.userId } });
      await tx.auditLog.create({ data: { actorId: session.userId, action: "TICKET_CLAIMED", entityType: "Ticket", entityId: id } });
      return tx.ticket.findUnique({ where: { id } });
    });

    if (!result) return NextResponse.json({ error: "Ticket is already assigned or unavailable" }, { status: 409 });
    return NextResponse.json({ ticket: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
