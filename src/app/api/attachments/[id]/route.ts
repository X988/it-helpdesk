import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireTicketAccess } from "@/lib/tickets";
import { apiError, validId, HttpError } from "@/lib/http";
import { signedDownloadUrl } from "@/lib/storage";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const attachment = await db.ticketAttachment.findUnique({ where: { id: validId((await context.params).id) }, include: { ticket: { select: { requesterId: true } } } });
    if (!attachment) throw new HttpError(404, "NOT_FOUND");
    requireTicketAccess(session, attachment.ticket);
    return NextResponse.redirect(await signedDownloadUrl(attachment.objectKey, attachment.originalName), 302);
  } catch (error) { return apiError(error); }
}
