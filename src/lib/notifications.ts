import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";

export async function notifyUser(userId: string, type: NotificationType, ticketId: string, text: string, keyboard?: unknown) {
  await db.notification.create({ data: { userId, ticketId, type } });
  const connection = await db.telegramConnection.findUnique({ where: { userId } });
  if (connection) await sendTelegram(connection.chatId, text, keyboard).catch(() => undefined);
}

export async function notifyTechnicians(type: NotificationType, ticketId: string, text: string, keyboard?: unknown) {
  const users = await db.user.findMany({ where: { isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] } }, select: { id: true, telegram: { select: { chatId: true } } } });
  await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, ticketId, type })) });
  await Promise.all(users.flatMap((u) => u.telegram ? [sendTelegram(u.telegram.chatId, text, keyboard).catch(() => undefined)] : []));
}

export type Tx = Prisma.TransactionClient;
