import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, requireSameOrigin, readJson, parseInput, validId, HttpError } from "@/lib/http";
import { categoryUpdateSchema } from "@/lib/validation";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request); const session = await requireRole(["ADMIN"]); const id = validId((await context.params).id); const data = parseInput(categoryUpdateSchema, await readJson(request));
    const category = await db.$transaction(async tx => { const count = await tx.category.updateMany({ where: { id }, data }); if (!count.count) throw new HttpError(404, "NOT_FOUND"); await tx.auditLog.create({ data: { actorId: session.userId, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id, metadata: data } }); return tx.category.findUnique({ where: { id } }); });
    return NextResponse.json({ category });
  } catch (error) { return apiError(error); }
}
