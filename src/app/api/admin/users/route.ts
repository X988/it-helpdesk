import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const ROLES = ["USER", "TECHNICIAN", "ADMIN"] as const;

/** List Help Desk users (ADMIN only). Query: q, role, active=1|0. */
export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const sp = new URL(request.url).searchParams;
    const q = (sp.get("q") ?? "").trim().slice(0, 100);
    const role = sp.get("role") ?? "";
    const active = sp.get("active");
    const and: Prisma.UserWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { department: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if ((ROLES as readonly string[]).includes(role)) and.push({ role: role as (typeof ROLES)[number] });
    if (active === "1") and.push({ isActive: true });
    if (active === "0") and.push({ isActive: false });

    const users = await db.user.findMany({
      where: and.length ? { AND: and } : {},
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        department: true,
        organizationId: true,
        createdAt: true,
        telegram: { select: { linkedAt: true } },
        _count: { select: { tickets: true, assigned: true } },
      },
      orderBy: [{ isActive: "desc" }, { role: "desc" }, { name: "asc" }],
      take: 500,
    });
    return NextResponse.json({
      users: users.map(({ _count, telegram, ...u }) => ({
        ...u,
        telegramLinked: Boolean(telegram),
        ticketCount: _count.tickets,
        assignedCount: _count.assigned,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
