import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const session = await requireRole(STAFF_ROLES);
    const staff = await db.user.findMany({
      where:
        session.role === "ADMIN"
          ? { isActive: true, role: { in: STAFF_ROLES } }
          : session.departmentId
            ? { isActive: true, role: { in: STAFF_ROLES }, departmentId: session.departmentId }
            : { id: session.userId, isActive: true, role: { in: STAFF_ROLES } },
      select: { id: true, name: true, username: true, role: true },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ staff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: message },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}
