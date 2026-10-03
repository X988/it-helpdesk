import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin, validId, readBody, HttpError } from "@/lib/http";
import { isTerminal } from "@/lib/ticket-access";
import { lockedTicket, requireTicketAccess } from "@/lib/tickets";
import { putPrivateObject, deletePrivateObject, safeObjectKey, safeFilename, validateUpload, MAX_FILE_SIZE, MAX_BATCH_FILES, MAX_TICKET_FILES, storageConfigured } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const uploaded: string[] = [];
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const id = validId((await context.params).id);
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) throw new HttpError(404, "NOT_FOUND");
    requireTicketAccess(session, ticket);
    if (isTerminal(ticket.status)) throw new HttpError(409, "TICKET_FINISHED");
    if (!storageConfigured()) throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
    await rateLimit("uploads", session.userId, 10, 60_000);
    const bytes = await readBody(request, MAX_BATCH_FILES * MAX_FILE_SIZE + 1024 * 1024);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new HttpError(400, "INVALID_MULTIPART"); }
    const values = form.getAll("files");
    if (!values.length || values.length > MAX_BATCH_FILES || values.some(value => !(value instanceof File))) throw new HttpError(400, "INVALID_FILE_COUNT");
    const files = values as File[];
    // Validate the entire batch before the first object is written.
    for (const file of files) await validateUpload(file);
    const data = files.map(file => ({ ticketId: id, uploaderId: session.userId, originalName: safeFilename(file.name), objectKey: safeObjectKey(id), mimeType: file.type, size: file.size }));
    for (let i = 0; i < files.length; i++) { uploaded.push(data[i].objectKey); await putPrivateObject(data[i].objectKey, files[i]); }
    const attachments = await db.$transaction(async tx => {
      const current = await lockedTicket(tx, id);
      requireTicketAccess(session, current);
      if (isTerminal(current.status)) throw new HttpError(409, "TICKET_FINISHED");
      if ((await tx.ticketAttachment.count({ where: { ticketId: id } })) + files.length > MAX_TICKET_FILES) throw new HttpError(409, "TICKET_FILE_LIMIT");
      const created = [];
      for (const row of data) created.push(await tx.ticketAttachment.create({ data: row, select: { id: true, originalName: true, size: true } }));
      await tx.auditLog.create({ data: { actorId: session.userId, action: "ATTACHMENTS_UPLOADED", entityType: "Ticket", entityId: id, metadata: { count: created.length } } });
      return created;
    });
    return NextResponse.json({ attachments }, { status: 201 });
  } catch (error) {
    const cleanup = await Promise.allSettled(uploaded.map(deletePrivateObject));
    if (cleanup.some(result => result.status === "rejected")) console.error("Helpdesk storage cleanup failed; reconcile object inventory with TicketAttachment");
    return apiError(error);
  }
}
