import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { categorySchema } from "@/lib/validation";

/**
 * Rename or hide/show a category. Categories are never deleted because tickets
 * reference them; hiding removes them from the "new ticket" form only.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const parsed = categorySchema.partial().safeParse(await request.json().catch(() => null));
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const category = await db.category.update({ where: { id }, data: parsed.data });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: id,
        metadata: parsed.data,
      },
    });
    return NextResponse.json({ category });
  } catch (error) {
    return apiError(error);
  }
}
