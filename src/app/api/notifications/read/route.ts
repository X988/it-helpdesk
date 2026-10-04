import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try { requireSameOrigin(request); const session = await requireSession(); await db.notification.updateMany({ where: { userId: session.userId, readAt: null }, data: { readAt: new Date() } }); return NextResponse.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
