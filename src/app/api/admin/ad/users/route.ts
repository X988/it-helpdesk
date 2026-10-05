import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(request.url);
    const ouDn = url.searchParams.get("ouDn")?.trim() || "";
    const ouName = url.searchParams.get("ouName")?.trim() || "";
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

    const users = await db.adDirectoryUser.findMany({
      where: {
        AND: [
          ouDn ? { ouDn } : {},
          !ouDn && ouName ? { ouName } : {},
          q
            ? {
                OR: [
                  { username: { contains: q } },
                  { displayName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ displayName: "asc" }, { username: "asc" }],
      take: 500,
    });
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
