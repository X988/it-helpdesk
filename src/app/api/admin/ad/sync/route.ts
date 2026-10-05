import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isLdapConfigured } from "@/lib/ldap-auth";
import { syncAdDirectory } from "@/lib/ldap-sync";

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!isLdapConfigured()) {
      return NextResponse.json({ error: "LDAP не настроен (LDAP_URL пустой)" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { username: true },
    });

    const hasService =
      Boolean(process.env.LDAP_BIND_DN?.trim()) && Boolean(process.env.LDAP_BIND_PASSWORD);
    if (!hasService && !body.password) {
      return NextResponse.json(
        {
          error: "LDAP_BIND_REQUIRED",
          message:
            "Нет service-учётки (LDAP_BIND_DN / LDAP_BIND_PASSWORD). Введите свой доменный пароль для разовой синхронизации или задайте service account в /etc/it-helpdesk.env.",
        },
        { status: 400 },
      );
    }

    const stats = await syncAdDirectory({
      username: me?.username ?? undefined,
      password: body.password,
    });

    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "AD_DIRECTORY_SYNC",
        entityType: "AdDirectory",
        metadata: stats,
      },
    });

    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (message === "LDAP_BIND_REQUIRED") {
      return NextResponse.json(
        {
          error: "LDAP_BIND_REQUIRED",
          message:
            "Нужен LDAP_BIND_DN/LDAP_BIND_PASSWORD или доменный пароль администратора для синхронизации.",
        },
        { status: 400 },
      );
    }
    if (message === "FORBIDDEN" || message === "UNAUTHORIZED") {
      return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
    }
    console.error("AD sync failed:", error);
    return NextResponse.json(
      { error: "SYNC_FAILED", message: "Не удалось синхронизировать AD. Проверьте права bind-учётки." },
      { status: 502 },
    );
  }
}
