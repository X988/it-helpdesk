import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, requireSameOrigin, readJson, parseInput, HttpError } from "@/lib/http";
import { userCreateSchema } from "@/lib/validation";
import { createUser, userSelect } from "@/lib/admin";
export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new HttpError(400, "INVALID_PAGE");
    const [users, total] = await db.$transaction([db.user.findMany({ select: userSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }), db.user.count()]);
    return NextResponse.json({ users, total, page });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { requireSameOrigin(request); const session = await requireRole(["ADMIN"]); return NextResponse.json({ user: await createUser(session, parseInput(userCreateSchema, await readJson(request))) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
