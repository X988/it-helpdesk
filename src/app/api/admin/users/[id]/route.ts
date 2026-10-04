import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError, requireSameOrigin, readJson, parseInput, validId } from "@/lib/http";
import { userUpdateSchema } from "@/lib/validation";
import { updateUser } from "@/lib/admin";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const session = await requireRole(["ADMIN"]); return NextResponse.json({ user: await updateUser(session, validId((await context.params).id), parseInput(userUpdateSchema, await readJson(request))) }); }
  catch (error) { return apiError(error); }
}
