import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendTelegram, telegram } from "@/lib/telegram";
import { consumeLinkToken } from "@/lib/telegram-link";
import { claimTicket, transitionTicket } from "@/lib/tickets";
import { apiError, readJson, parseInput, HttpError } from "@/lib/http";
const chat = z.object({ id: z.number().int(), type: z.string() });
const sender = z.object({ id: z.number().int() });
const schema = z.object({ update_id: z.number().int(), message: z.object({ text: z.string().max(4096).optional(), chat, from: sender.optional() }).optional(), callback_query: z.object({ id: z.string().max(200), data: z.string().max(64).optional(), from: sender, message: z.object({ chat }).optional() }).optional() });
export async function POST(request: Request) {
  try {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET; const given = request.headers.get("x-telegram-bot-api-secret-token");
    if (!expected || !given || Buffer.byteLength(expected) !== Buffer.byteLength(given) || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) throw new HttpError(403, "FORBIDDEN");
    const update = parseInput(schema, await readJson(request)); const q = update.callback_query;
    if (q) {
      // Only the sender's private chat can operate a linked account.
      if (!q.message || q.message.chat.type !== "private" || q.from.id !== q.message.chat.id) return NextResponse.json({ ok: true });
      const connection = await db.telegramConnection.findUnique({ where: { chatId: String(q.from.id) }, include: { user: true } });
      let text = "Аккаунт не подключён";
      if (connection?.user.isActive) {
        const parsed = /^(claim|fixed|reopen):([0-9a-f-]{36})$/i.exec(q.data ?? ""); text = "Действие недоступно";
        if (parsed && z.uuid().safeParse(parsed[2]).success) {
          const session = { userId: connection.userId, role: connection.user.role, email: connection.user.email, name: connection.user.name };
          try {
            if (parsed[1] === "claim") { await claimTicket(session, parsed[2]); text = "Заявка назначена вам"; }
            else {
              const ticket = await db.ticket.findUnique({ where: { id: parsed[2] }, select: { requesterId: true, status: true } });
              if (ticket?.requesterId !== session.userId || ticket.status !== "RESOLVED") throw new HttpError(409, "INVALID_TRANSITION");
              await transitionTicket(session, parsed[2], parsed[1] === "fixed" ? "CLOSED" : "IN_PROGRESS");
              text = parsed[1] === "fixed" ? "Заявка закрыта" : "Заявка возвращена в работу";
            }
          } catch (error) { if (!(error instanceof HttpError)) throw error; }
        }
      }
      await telegram("answerCallbackQuery", { callback_query_id: q.id, text });
    } else {
      const message = update.message;
      if (!message || message.chat.type !== "private" || message.from?.id !== message.chat.id || !message.text?.startsWith("/start ")) return NextResponse.json({ ok: true });
      let text = "Telegram успешно подключён к IT Help Desk.";
      try { await consumeLinkToken(message.text.slice(7).trim(), String(message.chat.id)); }
      catch (error) { if (!(error instanceof HttpError)) throw error; text = "Ссылка недействительна, истекла или чат уже подключён к другому аккаунту."; }
      await sendTelegram(String(message.chat.id), text);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
