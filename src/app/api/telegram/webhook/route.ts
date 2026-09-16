import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-telegram-bot-api-secret-token") !== expected) return new NextResponse("Forbidden", { status: 403 });
  const update = await request.json().catch(() => null);
  const message = update?.message; const text = typeof message?.text === "string" ? message.text : ""; const chatId = message?.chat?.id;
  if (!chatId || !text.startsWith("/start ")) return NextResponse.json({ ok: true });
  const raw = text.slice(7).trim(); const tokenHash = createHash("sha256").update(raw).digest("hex");
  const link = await db.telegramLinkToken.findUnique({ where: { tokenHash } });
  if (!link || link.usedAt || link.expiresAt <= new Date()) { await sendTelegram(String(chatId), "Ссылка недействительна или истекла."); return NextResponse.json({ ok: true }); }
  await db.$transaction(async (tx) => {
    await tx.telegramConnection.upsert({ where: { userId: link.userId }, update: { chatId: String(chatId), linkedAt: new Date() }, create: { userId: link.userId, chatId: String(chatId) } });
    await tx.telegramLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: link.userId, action: "TELEGRAM_LINKED", entityType: "User", entityId: link.userId } });
  });
  await sendTelegram(String(chatId), "Telegram успешно подключён к IT Help Desk.");
  return NextResponse.json({ ok: true });
}
