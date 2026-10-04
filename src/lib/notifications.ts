import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";
export type Tx = Prisma.TransactionClient;
export async function queueNotification(tx: Tx, userIds: string[], type: NotificationType, ticketId: string, text: string, keyboard?: Prisma.InputJsonValue) {
  const ids = [...new Set(userIds)];
  if (ids.length) await tx.notification.createMany({ data: ids.map(userId => ({ userId, ticketId, type, text, ...(keyboard ? { keyboard } : {}) })) });
}
export async function technicianIds(tx: Tx) {
  return (await tx.user.findMany({ where: { isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] } }, select: { id: true } })).map(u => u.id);
}
export async function deliverNotifications(limit = 25) {
  const now = new Date();
  const rows = await db.notification.findMany({ where: { deliveredAt: null, text: { not: null }, availableAt: { lte: now }, attempts: { lt: 8 }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" }, take: limit });
  let delivered = 0;
  for (const row of rows) {
    const claim = await db.notification.updateMany({ where: { id: row.id, deliveredAt: null, attempts: row.attempts, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } } });
    if (claim.count !== 1) continue;
    try {
      const user = await db.user.findUnique({ where: { id: row.userId }, select: { isActive: true, telegram: true } });
      if (user?.isActive && user.telegram) await sendTelegram(user.telegram.chatId, row.text!, row.keyboard ?? undefined);
      await db.notification.update({ where: { id: row.id }, data: { deliveredAt: new Date(), leaseUntil: null } });
      delivered++;
    } catch {
      await db.notification.update({ where: { id: row.id }, data: { leaseUntil: null, availableAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** row.attempts)) } });
    }
  }
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.telegramLinkToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return { processed: rows.length, delivered };
}
