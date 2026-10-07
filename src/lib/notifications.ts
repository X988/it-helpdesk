import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/roles";

export type Tx = Prisma.TransactionClient;

export type NotificationEnvelope = {
  userId: string;
  type: NotificationType;
  ticketId: string;
  subject: string;
  text: string;
  telegramKeyboard?: unknown;
};

/**
 * Persist the in-app notification and durable external deliveries in the same DB transaction.
 * No network call happens here: the maintenance worker drains NotificationOutbox with retries.
 */
export async function enqueueUserNotification(tx: Tx, input: NotificationEnvelope) {
  const recipient = await tx.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      telegram: { select: { chatId: true } },
    },
  });
  if (!recipient?.isActive) return;

  await tx.notification.create({
    data: { userId: recipient.id, ticketId: input.ticketId, type: input.type },
  });

  const deliveries: Prisma.NotificationOutboxCreateManyInput[] = [];
  if (recipient.email) {
    deliveries.push({
      userId: recipient.id,
      ticketId: input.ticketId,
      channel: "EMAIL",
      payload: { to: recipient.email, subject: input.subject, text: input.text },
    });
  }
  if (recipient.telegram?.chatId) {
    deliveries.push({
      userId: recipient.id,
      ticketId: input.ticketId,
      channel: "TELEGRAM",
      payload: {
        chatId: recipient.telegram.chatId,
        text: input.text,
        ...(input.telegramKeyboard ? { keyboard: input.telegramKeyboard } : {}),
      },
    });
  }
  if (deliveries.length) await tx.notificationOutbox.createMany({ data: deliveries });
}

/** Compatibility helper for existing call sites. */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  ticketId: string,
  text: string,
  keyboard?: unknown,
) {
  const subject = text.split("\n")[0]?.slice(0, 160) || "IT Help Desk";
  await db.$transaction((tx) =>
    enqueueUserNotification(tx, {
      userId,
      type,
      ticketId,
      subject,
      text,
      telegramKeyboard: keyboard,
    }),
  );
}

/** Notify active queue staff. Prefer department-specific recipients at the call site when available. */
export async function notifyTechnicians(
  type: NotificationType,
  ticketId: string,
  text: string,
  keyboard?: unknown,
) {
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: STAFF_ROLES } },
    select: { id: true },
  });
  const subject = text.split("\n")[0]?.slice(0, 160) || "IT Help Desk";
  await db.$transaction(async (tx) => {
    for (const user of users) {
      await enqueueUserNotification(tx, {
        userId: user.id,
        type,
        ticketId,
        subject,
        text,
        telegramKeyboard: keyboard,
      });
    }
  });
}
