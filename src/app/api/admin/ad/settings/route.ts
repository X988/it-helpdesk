import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getAdminOuSetting, setAdminOu } from "@/lib/ldap-sync";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const setting = await getAdminOuSetting();
    const last = await db.appSetting.findUnique({ where: { key: "ad_last_sync_at" } });
    const bindConfigured =
      Boolean(process.env.LDAP_BIND_DN?.trim()) && Boolean(process.env.LDAP_BIND_PASSWORD);
    return NextResponse.json({
      ...setting,
      lastSyncAt: last?.value ?? null,
      bindConfigured,
      ldapUrl: process.env.LDAP_URL ?? null,
      baseDn: process.env.LDAP_BASE_DN ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    const body = (await request.json().catch(() => null)) as { adminOuDn?: string | null } | null;
    if (!body || !("adminOuDn" in body)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const dn = body.adminOuDn?.trim() || null;
    if (dn) {
      const exists = await db.adDepartment.findUnique({ where: { dn } });
      if (!exists) {
        return NextResponse.json({ error: "Отдел (OU) не найден. Сначала выполните синхронизацию." }, { status: 404 });
      }
    }
    const setting = await setAdminOu(dn);
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "AD_ADMIN_OU_SET",
        entityType: "AdDepartment",
        entityId: setting.department?.id,
        metadata: { adminOuDn: dn, name: setting.department?.name },
      },
    });
    return NextResponse.json(setting);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
