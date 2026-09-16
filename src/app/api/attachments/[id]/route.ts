import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";
import { signedDownloadUrl } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await context.params;
    const attachment = await db.ticketAttachment.findUnique({ where: { id }, include: { ticket: { select: { requesterId: true } } } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, attachment.ticket.requesterId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ url: await signedDownloadUrl(attachment.objectKey), expiresIn: 300 });
  } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
}
