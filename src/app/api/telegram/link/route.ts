import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireSession, hashToken } from "@/lib/auth";
import { apiError, requireSameOrigin, HttpError } from "@/lib/http";
import { telegramConfigured } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); const session = await requireSession();
    if (!telegramConfigured()) throw new HttpError(503, "TELEGRAM_NOT_CONFIGURED");
    await rateLimit("telegram-link", session.userId, 5, 60_000);
    const raw = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 10 * 60_000);
    await db.$transaction(async tx => { await tx.telegramLinkToken.deleteMany({ where: { userId: session.userId, usedAt: null } }); await tx.telegramLinkToken.create({ data: { userId: session.userId, tokenHash: hashToken(raw), expiresAt } }); });
    return NextResponse.json({ url: "https://t.me/" + process.env.TELEGRAM_BOT_USERNAME + "?start=" + raw, expiresAt });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request); const session = await requireSession();
    await db.$transaction(async tx => { await tx.telegramConnection.deleteMany({ where: { userId: session.userId } }); await tx.telegramLinkToken.deleteMany({ where: { userId: session.userId } }); await tx.auditLog.create({ data: { actorId: session.userId, action: "TELEGRAM_UNLINKED", entityType: "User", entityId: session.userId } }); });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
