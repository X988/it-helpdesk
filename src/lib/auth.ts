import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

export const COOKIE_NAME = "helpdesk_session";
export const SESSION_SECONDS = 12 * 60 * 60;
export type Session = { userId: string; role: Role; email: string; name: string };
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function createSessionToken(userId: string) {
  const raw = randomBytes(32).toString("base64url");
  await db.authSession.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  return raw;
}
export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
}
export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(COOKIE_NAME);
}
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await db.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, role: true, email: true, name: true, isActive: true } } } });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return { userId: session.user.id, role: session.user.role, email: session.user.email, name: session.user.name };
}
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new HttpError(401, "UNAUTHORIZED");
  return session;
}
export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.role)) throw new HttpError(403, "FORBIDDEN");
  return session;
}
