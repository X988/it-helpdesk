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
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    const assignee = await db.user.findFirst({
      where: {
        id: parsed.data.assigneeId,
        isActive: true,
        role: { in: STAFF_ROLES },
      },
      select: { id: true, departmentId: true, email: true },
    });
    if (!assignee) return NextResponse.json({ error: "ASSIGNEE_NOT_FOUND" }, { status: 400 });

    const current = await db.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        subject: true,
        assigneeId: true,
        status: true,
        requesterId: true,
        departmentId: true,
        updatedAt: true,
      },
    });
    if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, current, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (isStaffRole(session.role) && session.role !== "ADMIN") {
      if (!current.departmentId || session.departmentId !== current.departmentId) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      if (assignee.departmentId !== current.departmentId) {
        return NextResponse.json({ error: "FORBIDDEN", message: "Специалист должен быть из отдела заявки" }, { status: 403 });
      }
    }

    if (current.status === "CLOSED" || current.status === "CANCELLED") {
      return NextResponse.json({ error: "INVALID_TRANSITION" }, { status: 409 });
    }

    const ticket = await db.$transaction(async (tx) => {
      const data: { assigneeId: string; status?: "IN_PROGRESS" } = { assigneeId: assignee.id };
      if (current.status === "NEW") data.status = "IN_PROGRESS";

      const changed = await tx.ticket.updateMany({
        where: {
          id,
          assigneeId: current.assigneeId,
          status: current.status,
          updatedAt: current.updatedAt,
        },
        data,
      });
      if (changed.count !== 1) return null;

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
          metadata: {
            before: { assigneeId: current.assigneeId, status: current.status },
            after: { assigneeId: assignee.id, status: current.status === "NEW" ? "IN_PROGRESS" : current.status },
          },
        },
      });
      await tx.notification.create({
        data: { userId: assignee.id, ticketId: id, type: "TICKET_ASSIGNED" },
      });
      if (assignee.email) {
        await tx.notificationOutbox.create({
          data: {
            userId: assignee.id,
            ticketId: id,
            channel: "EMAIL",
            payload: {
              to: assignee.email,
              subject: `Назначена заявка HD-${current.number}`,
              text: `${current.subject}\n${process.env.APP_URL || ""}/tickets/${id}`,
            },
          },
        });
      }
      return tx.ticket.findUnique({ where: { id } });
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "CONFLICT", message: "Заявку уже изменил другой специалист" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED" },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
