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

    const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true, requesterId: true } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, ticket.requesterId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const message = await db.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({ data: { ticketId: id, authorId: session.userId, ...parsed.data } });
      await tx.auditLog.create({ data: { actorId: session.userId, action: parsed.data.visibility === "INTERNAL" ? "INTERNAL_MESSAGE_CREATED" : "PUBLIC_MESSAGE_CREATED", entityType: "Ticket", entityId: id } });
      return created;
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
