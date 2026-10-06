import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ticketCreateSchema } from "@/lib/validation";
import { staffWhere } from "@/lib/ticket-access";
import { initialDeadlines } from "@/lib/sla";
import { STAFF_ROLES } from "@/lib/roles";
import type { Prisma, TicketStatus, Priority } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = 25;
    const q = url.searchParams.get("q")?.trim();
    const where: Prisma.TicketWhereInput = { ...staffWhere(session) };
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    if (status) where.status = status as TicketStatus;
    if (priority) where.priority = priority as Priority;
    if (url.searchParams.get("categoryId")) where.categoryId = url.searchParams.get("categoryId")!;
    if (url.searchParams.get("departmentId")) where.departmentId = url.searchParams.get("departmentId")!;
    if (url.searchParams.get("assigneeId")) where.assigneeId = url.searchParams.get("assigneeId")!;
    if (url.searchParams.get("breached") === "1") where.breachedResolveAt = { not: null };
    if (url.searchParams.get("mine") === "1") where.assigneeId = session.userId;
    if (url.searchParams.get("unassigned") === "1") where.assigneeId = null;
    if (q) {
      const number = Number(q.replace(/^HD-/i, ""));
      where.AND = [
        {
          OR: [
            ...(Number.isInteger(number) ? [{ number }] : []),
            { subject: { contains: q, mode: "insensitive" } },
            { requester: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
      ];
    }
    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true, username: true } },
          assignee: { select: { id: true, name: true, email: true, username: true } },
          organization: { select: { id: true, name: true, domain: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.ticket.count({ where }),
    ]);
    return NextResponse.json({ tickets, page, pageSize, total });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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
      where: { id: parsed.data.categoryId, isActive: true, ...(session.role === "USER" ? { isHidden: false } : {}) },
      select: { id: true, ownerDepartmentId: true },
    });
    if (!category) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Category not found" }, { status: 400 });

    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { organizationId: true, departmentId: true },
    });

    let organizationId = parsed.data.organizationId ?? me?.organizationId ?? null;
    if (session.role === "USER") organizationId = me?.organizationId ?? null;
    if (organizationId) {
      const org = await db.organization.findFirst({
        where: { id: organizationId, isActive: true },
        select: { id: true },
      });
      if (!org) organizationId = session.role === "USER" ? me?.organizationId ?? null : null;
    }

    const departmentId = category.ownerDepartmentId ?? me?.departmentId ?? null;
    const policy = await db.slaPolicy.findUnique({ where: { priority: parsed.data.priority } });
    const now = new Date();
    const sla = policy
      ? initialDeadlines(now, {
          priority: policy.priority,
          responseMinutes: policy.responseMinutes,
          resolveMinutes: policy.resolveMinutes,
          calendarMode: policy.calendarMode,
          version: policy.version,
        })
      : {};

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
          departmentId,
          source: "WEB",
          ...sla,
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
          metadata: { before: {}, after: { number: created.number, departmentId, priority: created.priority } },
        },
      });
      const staff = await tx.user.findMany({
        where: departmentId
          ? { isActive: true, OR: [{ role: "ADMIN" }, { role: { in: ["TECHNICIAN", "PROGRAMMER"] }, departmentId }] }
          : { isActive: true, role: { in: STAFF_ROLES } },
        select: { id: true, email: true },
      });
      if (staff.length) {
        await tx.notification.createMany({
          data: staff.map((user) => ({ userId: user.id, ticketId: created.id, type: "TICKET_CREATED" as const })),
        });
        await tx.notificationOutbox.createMany({
          data: staff.filter((user) => user.email).map((user) => ({
            userId: user.id,
            ticketId: created.id,
            channel: "EMAIL",
            payload: {
              to: user.email,
              subject: `Новая заявка HD-${created.number}`,
              text: `${created.subject}\n${process.env.APP_URL || ""}/tickets/${created.id}`,
            },
          })),
        });
      }
      return created;
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
