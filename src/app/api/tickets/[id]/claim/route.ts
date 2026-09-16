import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["TECHNICIAN", "ADMIN"]);
    const { id } = await context.params;

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
