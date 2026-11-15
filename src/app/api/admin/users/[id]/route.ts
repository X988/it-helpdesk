import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { userUpdateSchema } from "@/lib/validation";

/** Change role / active flag / organization / department of a user (ADMIN only). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const parsed = userUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid user update" }, { status: 400 });
    const data = parsed.data;

    if (id === session.userId && (data.isActive === false || (data.role && data.role !== "ADMIN"))) {
      return NextResponse.json({ error: "Нельзя заблокировать себя или снять с себя роль администратора" }, { status: 400 });
    }

    const before = await db.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Never leave the system without an active administrator.
    const losesAdmin =
      before.role === "ADMIN" && before.isActive && ((data.role && data.role !== "ADMIN") || data.isActive === false);
    if (losesAdmin) {
      const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
      if (admins <= 1) {
        return NextResponse.json({ error: "Должен остаться хотя бы один активный администратор" }, { status: 400 });
      }
    }

    if (data.organizationId) {
      const org = await db.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
      if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 400 });
    }

    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { ...data, department: data.department === "" ? null : data.department },
        select: { id: true, name: true, username: true, role: true, isActive: true, organizationId: true, department: true },
      });
      // A blocked account must not keep receiving Telegram notifications.
      if (data.isActive === false) await tx.telegramConnection.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: "USER_UPDATED",
          entityType: "User",
          entityId: id,
          metadata: { before, changes: data },
        },
      });
      return updated;
    });
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
