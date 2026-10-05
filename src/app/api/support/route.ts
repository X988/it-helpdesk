import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/** Optional env SUPPORT_CONTACTS = "Name|phone|email;Name2|phone|email" */
function parseExtraContacts() {
  const raw = process.env.SUPPORT_CONTACTS || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, phone, email] = part.split("|").map((s) => (s ?? "").trim());
      return { name: name || "Поддержка", phone: phone || null, email: email || null, source: "config" as const };
    });
}

export async function GET() {
  try {
    await requireSession();
    const admins = await db.user.findMany({
      where: { isActive: true, role: "ADMIN" },
      select: { id: true, name: true, username: true, email: true, role: true },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({
      contacts: admins.map((a) => ({
        id: a.id,
        name: a.name,
        username: a.username,
        email: a.email,
        role: a.role,
        source: "admin" as const,
      })),
      extra: parseExtraContacts(),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
