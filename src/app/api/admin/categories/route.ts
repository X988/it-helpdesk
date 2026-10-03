import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, requireSameOrigin, readJson, parseInput, HttpError } from "@/lib/http";
import { categorySchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); const session = await requireRole(["ADMIN"]); const data = parseInput(categorySchema, await readJson(request));
    const category = await db.$transaction(async tx => { const row = await tx.category.create({ data }); await tx.auditLog.create({ data: { actorId: session.userId, action: "CATEGORY_CREATED", entityType: "Category", entityId: row.id } }); return row; });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new HttpError(409, "CATEGORY_EXISTS")); return apiError(error); }
}
