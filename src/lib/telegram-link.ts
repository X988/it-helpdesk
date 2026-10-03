import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
export async function consumeLinkToken(raw: string, chatId: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new HttpError(400, "INVALID_LINK_TOKEN");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  try {
    return await db.$transaction(async tx => {
      const link = await tx.telegramLinkToken.findUnique({ where: { tokenHash } });
      if (!link) throw new HttpError(409, "LINK_EXPIRED");
      const user = await tx.user.findUnique({ where: { id: link.userId }, select: { isActive: true } });
      if (!user?.isActive) throw new HttpError(409, "LINK_EXPIRED");
      const used = await tx.telegramLinkToken.updateMany({ where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new HttpError(409, "LINK_EXPIRED");
      const existing = await tx.telegramConnection.findUnique({ where: { chatId } });
      if (existing && existing.userId !== link.userId) throw new HttpError(409, "CHAT_ALREADY_LINKED");
      await tx.telegramConnection.upsert({ where: { userId: link.userId }, update: { chatId, linkedAt: new Date() }, create: { userId: link.userId, chatId } });
      await tx.auditLog.create({ data: { actorId: link.userId, action: "TELEGRAM_LINKED", entityType: "User", entityId: link.userId } });
      return link.userId;
    });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "CHAT_ALREADY_LINKED"); throw error; }
}
