import type { MessageVisibility, NotificationType, Prisma, TicketStatus } from "@prisma/client";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";
import { notificationLabel, statusLabel } from "@/lib/labels";

export type Tx = Prisma.TransactionClient;

type Keyboard = { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };

function telegramEnabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function ticketUrl(ticketId: string) {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/tickets/${ticketId}` : "";
}

/** Telegram only accepts public http(s) URLs in buttons; skip the button for local/IP setups it rejects. */
function openButton(ticketId: string) {
  const url = ticketUrl(ticketId);
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\//i.test(url) ? [{ text: "Открыть заявку", url }] : [];
}

/** Store in-app notifications and push them to linked Telegram chats. Never throws. */
async function deliver(userIds: string[], type: NotificationType, ticketId: string, text: string, keyboard?: Keyboard) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  try {
    const users = await db.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true, telegram: { select: { chatId: true } } },
    });
    if (!users.length) return;
    await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, ticketId, type })) });
    if (!telegramEnabled()) return;
    const url = ticketUrl(ticketId);
    const body = url && !keyboard ? `${text}\n${url}` : text;
    await Promise.all(
      users.flatMap((u) => (u.telegram ? [sendTelegram(u.telegram.chatId, body, keyboard).catch(() => undefined)] : [])),
    );
  } catch (error) {
    console.error("notification delivery failed", error);
  }
}

/** Run delivery after the HTTP response is sent so Telegram latency never slows the UI. */
function schedule(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    // Outside a request scope (scripts/tests): run detached.
    void task();
  }
}

async function staffIds(exclude: string[] = []) {
  const staff = await db.user.findMany({
    where: { isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] }, id: { notIn: exclude } },
    select: { id: true },
  });
  return staff.map((s) => s.id);
}

async function loadTicket(ticketId: string) {
  return db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, number: true, subject: true, requesterId: true, assigneeId: true },
  });
}

const head = (t: { number: number; subject: string }) => `HD-${t.number} · ${t.subject}`;

/** Legacy helpers kept for compatibility with external callers. */
export async function notifyUser(userId: string, type: NotificationType, ticketId: string, text: string, keyboard?: Keyboard) {
  await deliver([userId], type, ticketId, text, keyboard);
}

export async function notifyTechnicians(type: NotificationType, ticketId: string, text: string, keyboard?: Keyboard) {
  await deliver(await staffIds(), type, ticketId, text, keyboard);
}

export function onTicketCreated(ticketId: string, actorId: string) {
  schedule(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    const keyboard: Keyboard = {
      inline_keyboard: [[{ text: "Взять в работу", callback_data: `claim:${t.id}` }, ...openButton(t.id)]],
    };
    await deliver(await staffIds([actorId]), "TICKET_CREATED", t.id, `🆕 ${notificationLabel.TICKET_CREATED}\n${head(t)}`, keyboard);
  });
}

export function onTicketAssigned(ticketId: string, actorId: string) {
  schedule(async () => {
    const t = await loadTicket(ticketId);
    if (!t?.assigneeId) return;
    const assignee = await db.user.findUnique({ where: { id: t.assigneeId }, select: { name: true } });
    if (t.assigneeId !== actorId) {
      await deliver([t.assigneeId], "TICKET_ASSIGNED", t.id, `👤 Вам назначена заявка\n${head(t)}`);
    }
    if (t.requesterId !== actorId && t.requesterId !== t.assigneeId) {
      await deliver(
        [t.requesterId],
        "TICKET_ASSIGNED",
        t.id,
        `👤 Вашей заявкой занимается ${assignee?.name ?? "специалист"}\n${head(t)}`,
      );
    }
  });
}

export function onStatusChanged(ticketId: string, from: TicketStatus, to: TicketStatus, actorId: string) {
  schedule(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    let type: NotificationType = "STATUS_CHANGED";
    if (to === "WAITING_FOR_USER") type = "WAITING_FOR_USER";
    else if (to === "RESOLVED") type = "TICKET_RESOLVED";
    else if (to === "CLOSED") type = "TICKET_CLOSED";
    else if (to === "IN_PROGRESS" && from === "RESOLVED") type = "TICKET_REOPENED";
    const text = `🔔 ${notificationLabel[type]}: ${statusLabel[to]}\n${head(t)}`;

    if (t.requesterId !== actorId) {
      const keyboard: Keyboard | undefined =
        to === "RESOLVED"
          ? {
              inline_keyboard: [
                [
                  { text: "✅ Проблема решена", callback_data: `fixed:${t.id}` },
                  { text: "↩️ Не решена", callback_data: `reopen:${t.id}` },
                ],
              ],
            }
          : undefined;
      const extra = to === "WAITING_FOR_USER" ? "\nСпециалисту нужен ваш ответ — откройте заявку." : "";
      await deliver([t.requesterId], type, t.id, text + extra, keyboard);
    }
    if (t.assigneeId && t.assigneeId !== actorId && t.assigneeId !== t.requesterId) {
      await deliver([t.assigneeId], type, t.id, text);
    }
  });
}

export function onMessageCreated(ticketId: string, authorId: string, visibility: MessageVisibility, body: string) {
  schedule(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
    const text = `💬 ${visibility === "INTERNAL" ? "Внутренняя заметка" : notificationLabel.NEW_MESSAGE}\n${head(t)}\n\n${preview}`;
    let recipients: string[];
    if (visibility === "INTERNAL") {
      recipients = t.assigneeId ? [t.assigneeId] : [];
    } else if (authorId === t.requesterId && !t.assigneeId) {
      recipients = await staffIds();
    } else {
      recipients = [t.requesterId, ...(t.assigneeId ? [t.assigneeId] : [])];
    }
    await deliver(recipients.filter((id) => id !== authorId), "NEW_MESSAGE", t.id, text);
  });
}
