import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { sendTelegram, telegram } from "@/lib/telegram";

async function callback(update: any) {
  const q = update.callback_query; const chatId = String(q?.message?.chat?.id ?? ""); const data = String(q?.data ?? "");
  if (!chatId || !data) return;
  const connection = await db.telegramConnection.findUnique({ where: { chatId }, include: { user: true } });
  if (!connection || !connection.user.isActive) return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Аккаунт не подключён" });
  const [action, ticketId] = data.split(":");
  if (!ticketId) return;

  if (action === "claim") {
    if (!(["TECHNICIAN","ADMIN"] as string[]).includes(connection.user.role)) return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Недостаточно прав" });
    const won = await db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({ where: { id: ticketId, status: "NEW", assigneeId: null }, data: { status: "IN_PROGRESS", assigneeId: connection.userId } });
      if (changed.count !== 1) return false;
      await tx.ticketAssignment.create({ data: { ticketId, toAssigneeId: connection.userId, actorId: connection.userId } });
      await tx.ticketStatusHistory.create({ data: { ticketId, fromStatus: "NEW", toStatus: "IN_PROGRESS", actorId: connection.userId } }); return true;
    });
    return telegram("answerCallbackQuery", { callback_query_id: q.id, text: won ? "Заявка назначена вам" : "Заявку уже взял другой специалист" });
  }

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.requesterId !== connection.userId || ticket.status !== "RESOLVED") return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Действие уже недоступно" });
  const target = action === "fixed" ? "CLOSED" : action === "reopen" ? "IN_PROGRESS" : null; if (!target) return;
  await db.$transaction(async (tx) => {
    const changed = await tx.ticket.updateMany({ where: { id: ticketId, requesterId: connection.userId, status: "RESOLVED" }, data: { status: target, closedAt: target === "CLOSED" ? new Date() : null } });
    if (changed.count !== 1) return;
    await tx.ticketStatusHistory.create({ data: { ticketId, fromStatus: "RESOLVED", toStatus: target, actorId: connection.userId } });
    await tx.auditLog.create({ data: { actorId: connection.userId, action: target === "CLOSED" ? "USER_CONFIRMED_RESOLUTION" : "TICKET_REOPENED", entityType: "Ticket", entityId: ticketId } });
  });
  return telegram("answerCallbackQuery", { callback_query_id: q.id, text: target === "CLOSED" ? "Заявка закрыта" : "Заявка возвращена в работу" });
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-telegram-bot-api-secret-token") !== expected) return new NextResponse("Forbidden", { status: 403 });
  const update = await request.json().catch(() => null); if (!update) return NextResponse.json({ ok: true });
  if (update.callback_query) { await callback(update); return NextResponse.json({ ok: true }); }
  const message = update.message; const text = typeof message?.text === "string" ? message.text : ""; const chatId = message?.chat?.id;
  if (!chatId || !text.startsWith("/start ")) return NextResponse.json({ ok: true });
  const tokenHash = createHash("sha256").update(text.slice(7).trim()).digest("hex"); const link = await db.telegramLinkToken.findUnique({ where: { tokenHash } });
  if (!link || link.usedAt || link.expiresAt <= new Date()) { await sendTelegram(String(chatId), "Ссылка недействительна или истекла."); return NextResponse.json({ ok: true }); }
  await db.$transaction(async (tx) => { await tx.telegramConnection.upsert({ where: { userId: link.userId }, update: { chatId: String(chatId), linkedAt: new Date() }, create: { userId: link.userId, chatId: String(chatId) } }); await tx.telegramLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } }); });
  await sendTelegram(String(chatId), "Telegram успешно подключён к IT Help Desk."); return NextResponse.json({ ok: true });
}
