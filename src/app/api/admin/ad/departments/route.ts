import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const departments = await db.adDepartment.findMany({
      orderBy: [{ path: "asc" }, { name: "asc" }],
    });
    const last = await db.appSetting.findUnique({ where: { key: "ad_last_sync_at" } });
    return NextResponse.json({
      departments,
      lastSyncAt: last?.value ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
