import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
export async function GET() {
  try { await requireSession(); return NextResponse.json({ categories: await db.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) }); }
  catch (error) { return apiError(error); }
}
