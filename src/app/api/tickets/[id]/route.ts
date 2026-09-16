import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        category: true,
        requester: { select: { id: true, name: true, email: true, organization: true, department: true } },
        assignee: { select: { id: true, name: true, email: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        messages: {
          where: session.role === "USER" ? { visibility: "PUBLIC" } : {},
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        assignments: { orderBy: { createdAt: "asc" } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, ticket.requesterId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ ticket });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
