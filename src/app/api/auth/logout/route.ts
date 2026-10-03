import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { apiError, requireSameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try { requireSameOrigin(request); await clearSessionCookie(); return NextResponse.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
