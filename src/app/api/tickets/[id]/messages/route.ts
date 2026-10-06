import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket, canWriteInternal } from "@/lib/ticket-access";
import { messageCreateSchema } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const parsed = messageCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    if (parsed.data.visibility === "INTERNAL" && !canWriteInternal(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ticket = await db.ticket.findUnique({
      where: { id },
      select: { id: true, requesterId: true, assigneeId: true, departmentId: true, number: true, subject: true, firstResponseAt: true },
    });
    if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, ticket, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const message = await db.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({ data: { ticketId: id, authorId: session.userId, ...parsed.data } });
      if (
        parsed.data.visibility === "PUBLIC" &&
        !ticket.firstResponseAt &&
        (session.role === "TECHNICIAN" || session.role === "ADMIN")
      ) {
        await tx.ticket.updateMany({
          where: { id, firstResponseAt: null },
          data: { firstResponseAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: parsed.data.visibility === "INTERNAL" ? "INTERNAL_MESSAGE_CREATED" : "PUBLIC_MESSAGE_CREATED",
          entityType: "Ticket",
          entityId: id,
        },
      });
      return created;
    });

    if (parsed.data.visibility === "PUBLIC") {
      const targetId = session.userId === ticket.requesterId ? ticket.assigneeId : ticket.requesterId;
      if (targetId) {
        await db.notification.create({ data: { userId: targetId, ticketId: id, type: "NEW_MESSAGE" } }).catch(() => undefined);
        const link = await db.telegramConnection.findUnique({ where: { userId: targetId } });
        if (link) {
          await import("@/lib/telegram").then((m) =>
            m.sendTelegram(link.chatId, `HD-${ticket.number}: новое сообщение\n${ticket.subject}`),
          ).catch(() => undefined);
        }
        const person = await db.user.findUnique({ where: { id: targetId }, select: { email: true } });
        if (person?.email) {
          await db.notificationOutbox.create({
            data: {
              userId: targetId,
              ticketId: id,
              channel: "EMAIL",
              payload: {
                to: person.email,
                subject: `HD-${ticket.number}: новое сообщение`,
                text: `${ticket.subject}\n${process.env.APP_URL || ""}/tickets/${id}`,
              },
            },
          }).catch(() => undefined);
        }
      }
    }
    return NextResponse.json({ message }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
