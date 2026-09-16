import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";
import { putPrivateObject, safeObjectKey } from "@/lib/storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await context.params;
    const ticket = await db.ticket.findUnique({ where: { id }, select: { requesterId: true } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, ticket.requesterId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const form = await request.formData(); const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length || files.length > 5) return NextResponse.json({ error: "Upload 1-5 files" }, { status: 400 });
    const created = [];
    for (const file of files) {
      const key = safeObjectKey(id); await putPrivateObject(key, file);
      const row = await db.ticketAttachment.create({ data: { ticketId: id, uploaderId: session.userId, originalName: file.name.slice(0,255), objectKey: key, mimeType: file.type, size: file.size } });
      created.push(row);
    }
    await db.auditLog.create({ data: { actorId: session.userId, action: "ATTACHMENTS_UPLOADED", entityType: "Ticket", entityId: id, metadata: { count: created.length } } });
    return NextResponse.json({ attachments: created }, { status: 201 });
  } catch (e) {
    const m = e instanceof Error ? e.message : "UPLOAD_FAILED"; const status = m.startsWith("INVALID_FILE") ? 400 : 401;
    return NextResponse.json({ error: m }, { status });
  }
}
