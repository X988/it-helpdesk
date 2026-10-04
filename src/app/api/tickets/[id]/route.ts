import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError, validId, HttpError } from "@/lib/http";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const id = validId((await context.params).id);
    const ticket = await db.ticket.findFirst({ where: { id, ...(session.role === "USER" ? { requesterId: session.userId } : {}) }, include: {
      category: { select: { id: true, name: true } }, requester: { select: { id: true, name: true, organization: true, department: true } }, assignee: { select: { id: true, name: true } },
      attachments: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      messages: { where: session.role === "USER" ? { visibility: "PUBLIC" } : {}, include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
    } });
    if (!ticket) throw new HttpError(404, "NOT_FOUND");
    return NextResponse.json({ ticket });
  } catch (error) { return apiError(error); }
}
