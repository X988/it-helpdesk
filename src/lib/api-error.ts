import { NextResponse } from "next/server";

/** Map errors thrown by requireSession/requireRole (and Prisma "not found") to HTTP responses. */
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNAUTHORIZED";
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (code === "P2002") return NextResponse.json({ error: "Already exists" }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
