import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: session.userId, ...(unreadOnly ? { readAt: null } : {}) },
        include: { ticket: { select: { id: true, number: true, subject: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.notification.count({ where: { userId: session.userId, readAt: null } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return apiError(error);
  }
}
