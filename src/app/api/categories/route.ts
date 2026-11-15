import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { categorySchema } from "@/lib/validation";

/** Active categories for everyone; `?all=1` (ADMIN only) also returns hidden ones with ticket counts. */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const all = new URL(request.url).searchParams.get("all") === "1";
    if (all && session.role === "ADMIN") {
      const categories = await db.category.findMany({
        select: { id: true, name: true, isActive: true, _count: { select: { tickets: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        categories: categories.map(({ _count, ...c }) => ({ ...c, ticketCount: _count.tickets })),
      });
    }
    const categories = await db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    const parsed = categorySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const category = await db.category.create({ data: { name: parsed.data.name, isActive: parsed.data.isActive ?? true } });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "CATEGORY_CREATED",
        entityType: "Category",
        entityId: category.id,
        metadata: { name: category.name },
      },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
