import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ticketCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const session = await requireSession();
    const where = session.role === "USER" ? { requesterId: session.userId } : {};
    const tickets = await db.ticket.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true, username: true } },
        assignee: { select: { id: true, name: true, email: true, username: true } },
        organization: { select: { id: true, name: true, domain: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ tickets });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = ticketCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ticket", details: parsed.error.flatten() }, { status: 400 });
    }

    const category = await db.category.findFirst({
      where: { id: parsed.data.categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 400 });

    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { organizationId: true },
    });

    let organizationId = parsed.data.organizationId ?? me?.organizationId ?? null;
    if (organizationId) {
      const org = await db.organization.findFirst({
        where: { id: organizationId, isActive: true },
        select: { id: true },
      });
      if (!org) organizationId = null;
    }

    const ticket = await db.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          subject: parsed.data.subject,
          description: parsed.data.description,
          categoryId: parsed.data.categoryId,
          priority: parsed.data.priority,
          direction: parsed.data.direction,
          requesterId: session.userId,
          organizationId,
        },
      });
      await tx.ticketStatusHistory.create({
        data: { ticketId: created.id, toStatus: "NEW", actorId: session.userId },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "TICKET_CREATED",
          entityType: "Ticket",
          entityId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
