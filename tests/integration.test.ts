import { beforeAll, beforeEach, afterAll, describe, test, expect, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(), cookieOptions: undefined as unknown,
  uploaded: [] as string[], deleted: [] as string[], failUploadAt: 0,
  sendTelegram: vi.fn(async () => undefined), telegram: vi.fn(async () => undefined),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name)! } : undefined,
    set: (name: string, value: string, options: unknown) => { state.cookies.set(name, value); state.cookieOptions = options; },
    delete: (name: string) => state.cookies.delete(name),
  }),
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegram: state.sendTelegram, telegram: state.telegram,
  telegramConfigured: () => true,
}));
vi.mock("@/lib/storage", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    putPrivateObject: async (key: string) => { state.uploaded.push(key); if (state.failUploadAt === state.uploaded.length) throw new Error("Fixture storage failure"); },
    deletePrivateObject: async (key: string) => { state.deleted.push(key); },
  };
});

import { db } from "@/lib/db";
import { createSessionToken, getSession, hashToken, COOKIE_NAME } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { createTicket, claimTicket, assignTicket, transitionTicket, addMessage } from "@/lib/tickets";
import { createUser, updateUser } from "@/lib/admin";
import { consumeLinkToken } from "@/lib/telegram-link";
import { rateLimit } from "@/lib/rate-limit";
import { deliverNotifications } from "@/lib/notifications";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as listTickets, POST as ticketPost } from "@/app/api/tickets/route";
import { GET as getTicket } from "@/app/api/tickets/[id]/route";
import { POST as uploadFiles } from "@/app/api/tickets/[id]/attachments/route";
import { GET as download } from "@/app/api/attachments/[id]/route";
import { GET as listUsers, POST as userPost } from "@/app/api/admin/users/route";
import { POST as webhook } from "@/app/api/telegram/webhook/route";
import { POST as categoryPost } from "@/app/api/admin/categories/route";
import { POST as jobs } from "@/app/api/jobs/notifications/route";

const run = randomUUID();
const password = "FixturePassword-" + run;
const ids: string[] = [];
let passwordHash: string;
let categoryId: string;
let owner: Session, stranger: Session, tech: Session, otherTech: Session, admin: Session;
function context(id: string) { return { params: Promise.resolve({ id }) }; }
function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(process.env.APP_URL! + path, { method: "POST", headers: { origin: process.env.APP_URL!, "content-type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
}
async function fixture(role: Role): Promise<Session> {
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email: id + "@example.test", name: "Audit fixture " + role, role, passwordHash } });
  ids.push(id);
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}
async function use(session: Session) { state.cookies.set(COOKIE_NAME, await createSessionToken(session.userId)); }
async function ticket(session = owner) { return createTicket(session, { subject: "Audit printer " + run, description: "Synthetic fixture: printer unavailable", priority: "NORMAL", categoryId }); }
async function link(session: Session, raw = randomBytes(32).toString("base64url"), expired = false) {
  await db.telegramLinkToken.create({ data: { userId: session.userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + (expired ? -1_000 : 60_000)) } });
  return raw;
}
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")) throw new Error("Integration tests require TEST_DATABASE_URL for a dedicated *_test database");
  passwordHash = await bcrypt.hash(password, 12);
  owner = await fixture("USER"); stranger = await fixture("USER"); tech = await fixture("TECHNICIAN"); otherTech = await fixture("TECHNICIAN"); admin = await fixture("ADMIN");
  categoryId = (await db.category.create({ data: { name: "Audit fixture " + run } })).id;
  vi.stubEnv("S3_ENDPOINT", "https://objects.example.test");
  vi.stubEnv("S3_REGION", "us-east-1"); vi.stubEnv("S3_BUCKET", "fixture");
  vi.stubEnv("S3_ACCESS_KEY_ID", "fixture"); vi.stubEnv("S3_SECRET_ACCESS_KEY", "fixture-secret");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "fixture-webhook-secret");
});
beforeEach(() => { state.cookies.clear(); state.uploaded = []; state.deleted = []; state.failUploadAt = 0; state.sendTelegram.mockReset(); state.telegram.mockReset(); });
afterAll(async () => {
  if (!ids.length) { await db.$disconnect(); return; }
  // Delete only rows owned by this run; no TRUNCATE and no production database fallback.
  await db.ticket.deleteMany({ where: { requesterId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, ...(categoryId ? [{ entityId: categoryId }] : [])] } });
  await db.telegramLinkToken.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "fixture-" + run } } });
  vi.unstubAllEnvs(); await db.$disconnect();
});

describe("sessions and administration on PostgreSQL", () => {
  test("login normalizes email, stores only the token hash and sets cookie protections", async () => {
    const response = await login(request("/api/auth/login", { email: " " + owner.email.toUpperCase() + " ", password }));
    expect(response.status).toBe(200);
    const token = state.cookies.get(COOKIE_NAME)!;
    const row = await db.authSession.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.tokenHash).not.toBe(token); expect(row.userId).toBe(owner.userId);
    expect(state.cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(await getSession()).toMatchObject({ userId: owner.userId, role: "USER" });
    expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  });
  test("invalid credentials are rejected", async () => expect((await login(request("/api/auth/login", { email: owner.email, password: "incorrect-password" }))).status).toBe(401));
  test("logout revokes the server session, including copied cookies", async () => {
    await use(owner); const token = state.cookies.get(COOKIE_NAME)!;
    expect((await logout(request("/api/auth/logout"))).status).toBe(200);
    state.cookies.set(COOKIE_NAME, token); expect(await getSession()).toBeNull();
  });
  test("expiry, disabled user and current database role are enforced immediately", async () => {
    const person = await fixture("TECHNICIAN"); await use(person);
    await db.user.update({ where: { id: person.userId }, data: { role: "USER" } });
    expect((await getSession())?.role).toBe("USER");
    await db.user.update({ where: { id: person.userId }, data: { isActive: false } });
    expect(await getSession()).toBeNull();
    await db.user.update({ where: { id: person.userId }, data: { isActive: true } });
    await db.authSession.updateMany({ where: { userId: person.userId }, data: { expiresAt: new Date(0) } });
    expect(await getSession()).toBeNull();
  });
  test("only admin can create users or list account details", async () => {
    await use(owner);
    expect((await listUsers(new Request(process.env.APP_URL! + "/api/admin/users"))).status).toBe(403);
    expect((await userPost(request("/api/admin/users", { email: "fixture@example.test", name: "Fixture", password }))).status).toBe(403);
    await expect(createUser(owner, { email: "fixture@example.test", name: "Fixture", role: "ADMIN", password, department: "", organization: "" })).rejects.toMatchObject({ status: 403 });
  });
  test("admin creation excludes hashes; password reset revokes every session", async () => {
    const user = await createUser(admin, { email: randomUUID() + "@example.test", name: "Created fixture", role: "USER", password, department: "", organization: "" });
    ids.push(user.id); expect(user).not.toHaveProperty("passwordHash");
    await createSessionToken(user.id); await createSessionToken(user.id);
    await updateUser(admin, user.id, { role: "USER", isActive: true, password: "Replacement-" + run });
    expect(await db.authSession.count({ where: { userId: user.id } })).toBe(0);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("Replacement-" + run, stored.passwordHash)).toBe(true);
  });
  test("admin cannot disable or demote their own account", async () => {
    await expect(updateUser(admin, admin.userId, { role: "ADMIN", isActive: false })).rejects.toMatchObject({ code: "CANNOT_DISABLE_SELF" });
    await expect(updateUser(admin, admin.userId, { role: "USER", isActive: true })).rejects.toMatchObject({ code: "CANNOT_DISABLE_SELF" });
  });
  test("category management denies a normal user", async () => {
    await use(owner); expect((await categoryPost(request("/api/admin/categories", { name: "forbidden category" }))).status).toBe(403);
  });
});

describe("ticket lifecycle, isolation and concurrent mutations", () => {
  test("create records initial history, audit and durable notifications", async () => {
    const row = await ticket();
    expect(await db.ticketStatusHistory.count({ where: { ticketId: row.id, toStatus: "NEW" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "TICKET_CREATED" } })).toBe(1);
    expect(await db.notification.count({ where: { ticketId: row.id, type: "TICKET_CREATED" } })).toBeGreaterThanOrEqual(3);
  });
  test("deactivated category cannot be used", async () => {
    await db.category.update({ where: { id: categoryId }, data: { isActive: false } });
    try { await expect(ticket()).rejects.toMatchObject({ code: "CATEGORY_UNAVAILABLE" }); }
    finally { await db.category.update({ where: { id: categoryId }, data: { isActive: true } }); }
  });
  test("foreign ticket and internal messages are not exposed to a user", async () => {
    const row = await ticket(); await addMessage(tech, row.id, { body: "Private fixture note", visibility: "INTERNAL" });
    await use(stranger); expect((await getTicket(new Request(process.env.APP_URL!), context(row.id))).status).toBe(404);
    await expect(addMessage(stranger, row.id, { body: "Intrusion", visibility: "PUBLIC" })).rejects.toMatchObject({ status: 404 });
    await use(owner);
    const response = await getTicket(new Request(process.env.APP_URL!), context(row.id)); const data = await response.json();
    expect(response.status).toBe(200); expect(data.ticket.messages).toEqual([]);
    expect(data.ticket.requester).not.toHaveProperty("passwordHash");
  });
  test("normal user cannot write an internal note or claim a ticket", async () => {
    const row = await ticket();
    await expect(addMessage(owner, row.id, { body: "Private", visibility: "INTERNAL" })).rejects.toMatchObject({ status: 403 });
    await expect(claimTicket(owner, row.id)).rejects.toMatchObject({ status: 403 });
  });
  test("simultaneous claims have exactly one winner and one assignment record", async () => {
    const row = await ticket();
    const results = await Promise.allSettled([claimTicket(tech, row.id), claimTicket(otherTech, row.id)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.ticketAssignment.count({ where: { ticketId: row.id } })).toBe(1);
    expect(await db.ticketStatusHistory.count({ where: { ticketId: row.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "TICKET_ASSIGNED" } })).toBe(1);
  });
  test("assignee restriction and administrator reassignment", async () => {
    const row = await ticket(); await claimTicket(tech, row.id);
    await expect(transitionTicket(otherTech, row.id, "RESOLVED")).rejects.toMatchObject({ status: 409 });
    await expect(assignTicket(tech, row.id, otherTech.userId)).rejects.toMatchObject({ status: 403 });
    await expect(assignTicket(admin, row.id, owner.userId)).rejects.toMatchObject({ code: "ASSIGNEE_UNAVAILABLE" });
    expect((await assignTicket(admin, row.id, otherTech.userId)).assigneeId).toBe(otherTech.userId);
  });
  test("requester reply returns a waiting ticket to work without leaking note contents", async () => {
    const row = await ticket(); await claimTicket(tech, row.id); await transitionTicket(tech, row.id, "WAITING_FOR_USER");
    await addMessage(owner, row.id, { body: "Fixture reply", visibility: "PUBLIC" });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("IN_PROGRESS");
    await addMessage(otherTech, row.id, { body: "Secret fixture diagnosis", visibility: "INTERNAL" });
    const notifications = await db.notification.findMany({ where: { ticketId: row.id } });
    expect(JSON.stringify(notifications)).not.toContain("Secret fixture diagnosis");
  });
  test("requester can reopen and confirm; reopening clears resolution timestamps", async () => {
    const row = await ticket(); await claimTicket(tech, row.id); await transitionTicket(tech, row.id, "RESOLVED");
    const reopened = await transitionTicket(owner, row.id, "IN_PROGRESS");
    expect(reopened.resolvedAt).toBeNull(); expect(reopened.closedAt).toBeNull();
    await transitionTicket(tech, row.id, "RESOLVED");
    const closed = await transitionTicket(owner, row.id, "CLOSED"); expect(closed.closedAt).not.toBeNull(); expect(closed.resolvedAt).not.toBeNull();
    await expect(addMessage(owner, row.id, { body: "After closure", visibility: "PUBLIC" })).rejects.toMatchObject({ code: "TICKET_FINISHED" });
    await expect(transitionTicket(admin, row.id, "IN_PROGRESS")).rejects.toMatchObject({ status: 409 });
  });
  test("simultaneous duplicate status changes leave only one history entry", async () => {
    const row = await ticket(); await claimTicket(tech, row.id);
    const results = await Promise.allSettled([transitionTicket(tech, row.id, "RESOLVED"), transitionTicket(tech, row.id, "RESOLVED")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.ticketStatusHistory.count({ where: { ticketId: row.id, toStatus: "RESOLVED" } })).toBe(1);
  });
  test("API list is paginated and cannot select another requester's tickets", async () => {
    const own = await ticket(); const foreign = await ticket(stranger); await use(owner);
    const response = await listTickets(new Request(process.env.APP_URL! + "/api/tickets?q=" + encodeURIComponent(run)));
    const data = await response.json();
    expect(response.status).toBe(200); expect(data.pageSize).toBe(20);
    expect(data.tickets.some((item: { id: string }) => item.id === own.id)).toBe(true);
    expect(data.tickets.some((item: { id: string }) => item.id === foreign.id)).toBe(false);
    expect((await listTickets(new Request(process.env.APP_URL! + "/api/tickets?page=-1"))).status).toBe(400);
  });
  test("CSRF and invalid IDs receive correct errors", async () => {
    await use(owner);
    expect((await ticketPost(request("/api/tickets", {}, { origin: "https://foreign.example" }))).status).toBe(403);
    expect((await getTicket(new Request(process.env.APP_URL!), context("invalid-id"))).status).toBe(400);
  });
});

describe("attachments with controlled S3 transport", () => {
  function uploadRequest(files: File[]) {
    const form = new FormData(); files.forEach(file => form.append("files", file));
    return new Request(process.env.APP_URL! + "/api/upload", { method: "POST", headers: { origin: process.env.APP_URL! }, body: form });
  }
  const pdf = () => new File(["%PDF-1.7 fixture"], "fixture.pdf", { type: "application/pdf" });
  test("entire batch is validated before upload", async () => {
    const row = await ticket(); await use(owner);
    const response = await uploadFiles(uploadRequest([pdf(), new File(["html"], "bad.png", { type: "image/png" })]), context(row.id));
    expect(response.status).toBe(400); expect(state.uploaded).toEqual([]);
    expect(await db.ticketAttachment.count({ where: { ticketId: row.id } })).toBe(0);
  });
  test("transport failure cleans every object and does not report success or unauthorized", async () => {
    const row = await ticket(); await use(owner); state.failUploadAt = 2;
    const response = await uploadFiles(uploadRequest([pdf(), pdf()]), context(row.id));
    expect(response.status).toBe(500); expect(state.deleted).toEqual(state.uploaded);
    expect(await db.ticketAttachment.count({ where: { ticketId: row.id } })).toBe(0);
  });
  test("successful upload returns metadata and download redirects with forced attachment disposition", async () => {
    const row = await ticket(); await use(owner);
    const response = await uploadFiles(uploadRequest([pdf()]), context(row.id)); expect(response.status).toBe(201);
    const data = await response.json(); expect(data.attachments).toHaveLength(1); expect(data.attachments[0]).not.toHaveProperty("objectKey");
    const redirect = await download(new Request(process.env.APP_URL!), context(data.attachments[0].id));
    expect(redirect.status).toBe(302);
    const url = new URL(redirect.headers.get("location")!);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300"); expect(url.searchParams.get("response-content-disposition")).toContain("attachment;");
    await use(stranger); expect((await download(new Request(process.env.APP_URL!), context(data.attachments[0].id))).status).toBe(404);
  });

  test("ticket attachment quota rejects additional objects and cleans the upload", async () => {
    const row = await ticket(); await use(owner);
    await db.ticketAttachment.createMany({ data: Array.from({ length: 20 }, (_, index) => ({ ticketId: row.id, uploaderId: owner.userId, originalName: "fixture.pdf", objectKey: "fixture/" + row.id + "/" + index, mimeType: "application/pdf", size: 10 })) });
    const response = await uploadFiles(uploadRequest([pdf()]), context(row.id));
    expect(response.status).toBe(409); expect(state.deleted).toEqual(state.uploaded);
    expect(await db.ticketAttachment.count({ where: { ticketId: row.id } })).toBe(20);
  });
  test("closed tickets reject attachment changes", async () => {
    const row = await ticket(); await claimTicket(tech, row.id); await transitionTicket(tech, row.id, "RESOLVED"); await transitionTicket(owner, row.id, "CLOSED"); await use(owner);
    expect((await uploadFiles(uploadRequest([pdf()]), context(row.id))).status).toBe(409); expect(state.uploaded).toEqual([]);
  });
});

describe("Telegram, durable delivery and distributed rate limits", () => {
  test("one-time linking token is consumed atomically under concurrent use", async () => {
    const person = await fixture("USER"); const raw = await link(person);
    const results = await Promise.allSettled([consumeLinkToken(raw, "10001"), consumeLinkToken(raw, "10002")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.telegramConnection.count({ where: { userId: person.userId } })).toBe(1);
    await expect(consumeLinkToken(raw, "10003")).rejects.toMatchObject({ code: "LINK_EXPIRED" });
  });
  test("expired and disabled-account tokens cannot link", async () => {
    const person = await fixture("USER"); await expect(consumeLinkToken(await link(person, undefined, true), "10004")).rejects.toMatchObject({ code: "LINK_EXPIRED" });
    const raw = await link(person); await db.user.update({ where: { id: person.userId }, data: { isActive: false } });
    await expect(consumeLinkToken(raw, "10004")).rejects.toMatchObject({ code: "LINK_EXPIRED" });
  });
  test("a chat linked to someone else cannot be stolen and the losing token is not spent", async () => {
    const first = await fixture("USER"); const second = await fixture("USER");
    await consumeLinkToken(await link(first), "10005"); const raw = await link(second);
    await expect(consumeLinkToken(raw, "10005")).rejects.toMatchObject({ code: "CHAT_ALREADY_LINKED" });
    expect((await db.telegramLinkToken.findUniqueOrThrow({ where: { tokenHash: hashToken(raw) } })).usedAt).toBeNull();
  });
  test("webhook rejects wrong secret; group chat actions cannot impersonate an account", async () => {
    expect((await webhook(request("/api/telegram/webhook", { update_id: 1 }))).status).toBe(403);
    const row = await ticket(); await db.telegramConnection.upsert({ where: { userId: tech.userId }, update: { chatId: "10006" }, create: { userId: tech.userId, chatId: "10006" } });
    const response = await webhook(request("/api/telegram/webhook", { update_id: 2, callback_query: { id: "fixture-callback", from: { id: 10006 }, data: "claim:" + row.id, message: { chat: { id: 10006, type: "group" } } } }, { "x-telegram-bot-api-secret-token": "fixture-webhook-secret" }));
    expect(response.status).toBe(200); expect((await db.ticket.findUniqueOrThrow({ where: { id: row.id } })).assigneeId).toBeNull();
  });
  test("private Telegram claim uses the same transaction and audit as the site", async () => {
    const row = await ticket();
    const response = await webhook(request("/api/telegram/webhook", { update_id: 3, callback_query: { id: "fixture-callback", from: { id: 10006 }, data: "claim:" + row.id, message: { chat: { id: 10006, type: "private" } } } }, { "x-telegram-bot-api-secret-token": "fixture-webhook-secret" }));
    expect(response.status).toBe(200); expect((await db.ticket.findUniqueOrThrow({ where: { id: row.id } })).assigneeId).toBe(tech.userId);
    expect(await db.auditLog.count({ where: { entityId: row.id, action: "TICKET_ASSIGNED", actorId: tech.userId } })).toBe(1);
  });
  test("delivery failures schedule retry without losing the in-app notification", async () => {
    const row = await ticket();
    await db.notification.updateMany({ where: { userId: { in: ids }, ticketId: { not: null } }, data: { deliveredAt: new Date() } });
    await db.telegramConnection.upsert({ where: { userId: owner.userId }, update: { chatId: "10007" }, create: { userId: owner.userId, chatId: "10007" } });
    const notification = await db.notification.create({ data: { userId: owner.userId, ticketId: row.id, type: "NEW_MESSAGE", text: "Fixture notification" } });
    state.sendTelegram.mockRejectedValueOnce(new Error("Fixture provider outage"));
    await deliverNotifications();
    const failed = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(failed.deliveredAt).toBeNull(); expect(failed.attempts).toBe(1); expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now()); expect(failed.leaseUntil).toBeNull();
    await db.notification.update({ where: { id: notification.id }, data: { availableAt: new Date(0) } });
    await deliverNotifications(); expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).deliveredAt).not.toBeNull();
  });
  test("atomic rate counters enforce a limit under concurrency", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit("fixture-" + run, owner.userId, 3, 3_600_000)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(5);
  });
  test("notification job cannot be triggered without its separate credential", async () => expect((await jobs(request("/api/jobs/notifications"))).status).toBe(403));
});
