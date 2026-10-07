import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket, canWriteInternal } from "@/lib/ticket-access";
import { isStaffRole } from "@/lib/roles";
import { messageCreateSchema } from "@/lib/validation";
import { enqueueUserNotification } from "@/lib/notifications";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const parsed = messageCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.visibility === "INTERNAL" && !canWriteInternal(session.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const ticket = await db.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        requesterId: true,
        assigneeId: true,
        departmentId: true,
        number: true,
        subject: true,
        firstResponseAt: true,
      },
    });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, ticket, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const targetId =
      parsed.data.visibility === "PUBLIC"
        ? session.userId === ticket.requesterId
          ? ticket.assigneeId
          : ticket.requesterId
        : null;

    const message = await db.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: { ticketId: id, authorId: session.userId, ...parsed.data },
      });

      if (
        parsed.data.visibility === "PUBLIC" &&
        !ticket.firstResponseAt &&
        isStaffRole(session.role)
      ) {
        await tx.ticket.updateMany({
          where: { id, firstResponseAt: null },
          data: { firstResponseAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action:
            parsed.data.visibility === "INTERNAL"
              ? "INTERNAL_MESSAGE_CREATED"
              : "PUBLIC_MESSAGE_CREATED",
          entityType: "Ticket",
          entityId: id,
        },
      });

      if (targetId) {
        const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/tickets/${id}`;
        await enqueueUserNotification(tx, {
          userId: targetId,
          type: "NEW_MESSAGE",
          ticketId: id,
          subject: `HD-${ticket.number}: новое сообщение`,
          text: `HD-${ticket.number}: новое сообщение\n${ticket.subject}\n${link}`,
        });
      }

      return created;
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
