import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

/** Mark notifications as read: `{ all: true }` or `{ ids: [...] }`. Only the caller's own rows are touched. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const where =
      "all" in parsed.data
        ? { userId: session.userId, readAt: null }
        : { userId: session.userId, readAt: null, id: { in: parsed.data.ids } };
    const { count } = await db.notification.updateMany({ where, data: { readAt: new Date() } });
    return NextResponse.json({ updated: count });
  } catch (error) {
    return apiError(error);
  }
}
