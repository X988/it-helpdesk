import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["TECHNICIAN", "ADMIN"]);
    const staff = await db.user.findMany({
      where: { isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] } },
      select: { id: true, name: true, username: true, role: true },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ staff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
