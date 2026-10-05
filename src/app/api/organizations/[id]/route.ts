import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { organizationSchema } from "@/lib/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = organizationSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
    }
    const org = await db.organization.update({ where: { id }, data: parsed.data });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "ORGANIZATION_UPDATED",
        entityType: "Organization",
        entityId: id,
        metadata: parsed.data,
      },
    });
    return NextResponse.json({ organization: org });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 404 });
  }
}
