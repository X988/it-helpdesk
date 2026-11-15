import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

/** Create a one-time deep link https://t.me/<bot>?start=<token> valid for 10 minutes. */
export async function POST() {
  try {
    const session = await requireSession();
    const username = process.env.TELEGRAM_BOT_USERNAME;
    if (!username || !process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: "Telegram bot is not configured" }, { status: 503 });
    }
    const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.telegramLinkToken.create({ data: { userId: session.userId, tokenHash, expiresAt } });
    return NextResponse.json({ url: `https://t.me/${username}?start=${raw}`, expiresAt });
  } catch (error) {
    return apiError(error);
  }
}

/** Unlink the caller's Telegram chat. */
export async function DELETE() {
  try {
    const session = await requireSession();
    const { count } = await db.telegramConnection.deleteMany({ where: { userId: session.userId } });
    if (count) {
      await db.auditLog.create({
        data: { actorId: session.userId, action: "TELEGRAM_UNLINKED", entityType: "User", entityId: session.userId },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
