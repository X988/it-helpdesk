import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { sendTelegram, telegram } from "@/lib/telegram";
import { onTicketAssigned } from "@/lib/notifications";
import { applyRequesterDecision } from "@/lib/ticket-workflow";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
  };
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

async function callback(update: TelegramUpdate) {
  const q = update.callback_query;
  const chatId = String(q?.message?.chat?.id ?? "");
  const data = String(q?.data ?? "");
  if (!chatId || !data || !q) return;
  const connection = await db.telegramConnection.findUnique({ where: { chatId }, include: { user: true } });
  if (!connection || !connection.user.isActive) {
    return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Аккаунт не подключён" });
  }
  const [action, ticketId] = data.split(":");
  if (!ticketId) return;

  if (action === "claim") {
    if (!(["TECHNICIAN", "ADMIN"] as string[]).includes(connection.user.role)) {
      return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Недостаточно прав" });
    }
    const won = await db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id: ticketId, status: "NEW", assigneeId: null },
        data: { status: "IN_PROGRESS", assigneeId: connection.userId },
      });
      if (changed.count !== 1) return false;
      await tx.ticketAssignment.create({ data: { ticketId, toAssigneeId: connection.userId, actorId: connection.userId } });
      await tx.ticketStatusHistory.create({
        data: { ticketId, fromStatus: "NEW", toStatus: "IN_PROGRESS", actorId: connection.userId },
      });
      await tx.auditLog.create({
        data: { actorId: connection.userId, action: "TICKET_CLAIMED", entityType: "Ticket", entityId: ticketId },
      });
      return true;
    });
    if (won) onTicketAssigned(ticketId, connection.userId);
    return telegram("answerCallbackQuery", {
      callback_query_id: q.id,
      text: won ? "Заявка назначена вам" : "Заявку уже взял другой специалист",
    });
  }

  if (action !== "fixed" && action !== "reopen") return;
  const target = await applyRequesterDecision(ticketId, connection.userId, action);
  return telegram("answerCallbackQuery", {
    callback_query_id: q.id,
    text: !target ? "Действие уже недоступно" : target === "CLOSED" ? "Заявка закрыта" : "Заявка возвращена в работу",
  });
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });
  if (update.callback_query) {
    await callback(update);
    return NextResponse.json({ ok: true });
  }
  const message = update.message;
  const text = typeof message?.text === "string" ? message.text : "";
  const chatId = message?.chat?.id;
  if (!chatId || !text.startsWith("/start ")) return NextResponse.json({ ok: true });
  const tokenHash = createHash("sha256").update(text.slice(7).trim()).digest("hex");
  const link = await db.telegramLinkToken.findUnique({ where: { tokenHash } });
  if (!link || link.usedAt || link.expiresAt <= new Date()) {
    await sendTelegram(String(chatId), "Ссылка недействительна или истекла.");
    return NextResponse.json({ ok: true });
  }
  await db.$transaction(async (tx) => {
    // chatId is unique: a chat re-linked to another account must be released first.
    await tx.telegramConnection.deleteMany({ where: { chatId: String(chatId), NOT: { userId: link.userId } } });
    await tx.telegramConnection.upsert({
      where: { userId: link.userId },
      update: { chatId: String(chatId), linkedAt: new Date() },
      create: { userId: link.userId, chatId: String(chatId) },
    });
    await tx.telegramLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
  });
  await sendTelegram(String(chatId), "Telegram успешно подключён к IT Help Desk.");
  return NextResponse.json({ ok: true });
}
