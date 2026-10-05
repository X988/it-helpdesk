import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { applyAdminRolesFromOu } from "@/lib/ldap-sync";

export async function POST() {
  try {
    const session = await requireRole(["ADMIN"]);
    const result = await applyAdminRolesFromOu();
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "AD_APPLY_ADMIN_ROLES",
        entityType: "AdDepartment",
        metadata: result,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
