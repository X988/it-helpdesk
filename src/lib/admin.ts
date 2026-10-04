import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";
import { HttpError, validId } from "@/lib/http";
export const userSelect = { id: true, email: true, name: true, role: true, isActive: true, department: true, organization: true, createdAt: true } satisfies Prisma.UserSelect;
export async function createUser(session: Session, data: { email: string; name: string; role: "USER" | "TECHNICIAN" | "ADMIN"; password: string; organization: string; department: string }) {
  if (session.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  const { password, ...fields } = data;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    return await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { ...fields, passwordHash }, select: userSelect });
      await tx.auditLog.create({ data: { actorId: session.userId, action: "USER_CREATED", entityType: "User", entityId: user.id } });
      return user;
    });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "EMAIL_EXISTS"); throw error; }
}
export async function updateUser(session: Session, id: string, data: { role: "USER" | "TECHNICIAN" | "ADMIN"; isActive: boolean; password?: string }) {
  if (session.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  validId(id);
  if (id === session.userId && (data.role !== "ADMIN" || !data.isActive)) throw new HttpError(409, "CANNOT_DISABLE_SELF");
  const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
  return db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "NOT_FOUND");
    const user = await tx.user.update({ where: { id }, data: { role: data.role, isActive: data.isActive, ...(passwordHash ? { passwordHash } : {}) }, select: userSelect });
    if (passwordHash || !data.isActive || data.role !== current.role) await tx.authSession.deleteMany({ where: { userId: id } });
    if (!data.isActive) await tx.telegramLinkToken.deleteMany({ where: { userId: id, usedAt: null } });
    await tx.auditLog.create({ data: { actorId: session.userId, action: "USER_UPDATED", entityType: "User", entityId: id, metadata: { role: data.role, isActive: data.isActive, passwordReset: Boolean(passwordHash) } } });
    return user;
  });
}
