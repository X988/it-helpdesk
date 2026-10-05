import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { organizationSchema } from "@/lib/validation";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgs = await db.organization.findMany({
      where: session.role === "ADMIN" ? {} : { isActive: true },
      orderBy: [{ name: "asc" }, { domain: "asc" }],
    });
    return NextResponse.json({ organizations: orgs });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(["ADMIN"]);
    const parsed = organizationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid organization", details: parsed.error.flatten() }, { status: 400 });
    }
    const org = await db.organization.create({ data: parsed.data });
    await db.auditLog.create({
      data: {
        actorId: session.userId,
        action: "ORGANIZATION_CREATED",
        entityType: "Organization",
        entityId: org.id,
        metadata: { name: org.name, domain: org.domain },
      },
    });
    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Organization already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
