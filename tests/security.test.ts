import { describe, test, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { availableTransitions, canReadTicket, canManageTicket, canWriteInternal, transitions } from "@/lib/ticket-access";
import { passwordSchema, emailSchema, ticketCreateSchema, messageCreateSchema } from "@/lib/validation";
import { HttpError, requireSameOrigin, readJson, readBody, validId, apiError } from "@/lib/http";
import { validateUpload, safeFilename, safeObjectKey, MAX_FILE_SIZE } from "@/lib/storage";
import { ticketQuery } from "@/lib/ticket-query";
const user = { userId: randomUUID(), name: "Fixture", email: "fixture@example.test", role: "USER" as const };
afterEach(() => vi.restoreAllMocks());
describe("authorization and state policy", () => {
  test("requester isolation and explicit staff allowlist", () => {
    expect(canReadTicket("USER", "a", "a")).toBe(true);
    expect(canReadTicket("USER", "a", "b")).toBe(false);
    expect(canReadTicket("TECHNICIAN", "a", "b")).toBe(true);
    expect(canReadTicket("ADMIN", "a", "b")).toBe(true);
    expect(canReadTicket("UNRECOGNIZED" as Role, "a", "b")).toBe(false);
    expect(canManageTicket("USER")).toBe(false);
    expect(canWriteInternal("USER")).toBe(false);
  });
  test("only assignee or admin can manage another person's ticket", () => {
    const ticket = { status: "IN_PROGRESS" as const, requesterId: "owner", assigneeId: "tech" };
    expect(availableTransitions("TECHNICIAN", "other", ticket)).toEqual([]);
    expect(availableTransitions("TECHNICIAN", "tech", ticket)).toContain("RESOLVED");
    expect(availableTransitions("USER", "owner", ticket)).toEqual([]);
  });
  test("requester can confirm or reopen a resolved ticket, including staff requester", () => {
    const ticket = { status: "RESOLVED" as const, requesterId: "owner", assigneeId: "tech" };
    expect(availableTransitions("USER", "owner", ticket)).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(availableTransitions("TECHNICIAN", "owner", ticket)).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(availableTransitions("USER", "other", ticket)).toEqual([]);
  });
  test("closed and cancelled tickets have no outgoing transitions", () => {
    expect(transitions.CLOSED).toEqual([]); expect(transitions.CANCELLED).toEqual([]);
  });
});
describe("input, CSRF and bounded requests", () => {
  test("email is normalized before validation", () => expect(emailSchema.parse("  PERSON@EXAMPLE.TEST  ")).toBe("person@example.test"));
  test("bcrypt passwords cannot silently exceed 72 bytes", () => {
    expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("я".repeat(40)).success).toBe(false);
  });
  test("ticket and message validation rejects whitespace and arbitrary enums", () => {
    expect(ticketCreateSchema.safeParse({ subject: "   ", description: "valid description", categoryId: randomUUID() }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ body: "message", visibility: "SECRET" }).success).toBe(false);
  });
  test("IDs are UUIDs, not database casts of arbitrary user input", () => {
    expect(validId(randomUUID())).toBeTruthy(); expect(() => validId("not-a-uuid")).toThrow(HttpError);
  });
  test("CSRF rejects missing, foreign and null origins", () => {
    const good = process.env.APP_URL!;
    expect(() => requireSameOrigin(new Request(good, { headers: { origin: good } }))).not.toThrow();
    for (const origin of [undefined, "null", "https://foreign.example"]) expect(() => requireSameOrigin(new Request(good, { headers: origin ? { origin } : {} }))).toThrow(HttpError);
  });
  test("JSON has a content-type and syntax requirement", async () => {
    await expect(readJson(new Request("http://localhost", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
  test("oversized Content-Length is rejected before reading the body", async () => {
    await expect(readBody(new Request("http://localhost", { method: "POST", headers: { "content-length": "100000" }, body: "small" }), 100)).rejects.toMatchObject({ status: 413 });
  });
  test("stream is bounded even without Content-Length", async () => {
    await expect(readBody(new Request("http://localhost", { method: "POST", body: "abcdef" }), 5)).rejects.toMatchObject({ status: 413 });
  });
  test("database errors become 500 and disclose no private message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiError(new Error("password secret in a provider URL"));
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
  });
  test("pagination and filters never remove requester scope", () => {
    const query = ticketQuery({ page: "2", assignment: "unassigned", q: "Printer" }, user);
    expect(query.where.requesterId).toBe(user.userId); expect(query.where.assigneeId).toBeUndefined(); expect(query.skip).toBe(20);
    expect(() => ticketQuery({ page: "-1" }, user)).toThrow(HttpError);
  });
});
describe("attachment validation", () => {
  test("rejects empty and oversized files", async () => {
    await expect(validateUpload(new File([], "empty.txt", { type: "text/plain" }))).rejects.toMatchObject({ code: "INVALID_FILE_SIZE" });
    await expect(validateUpload(new File([new Uint8Array(MAX_FILE_SIZE + 1)], "large.pdf", { type: "application/pdf" }))).rejects.toMatchObject({ code: "INVALID_FILE_SIZE" });
  });
  test("rejects executable type and MIME spoofing", async () => {
    await expect(validateUpload(new File(["binary"], "app.exe", { type: "application/octet-stream" }))).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
    await expect(validateUpload(new File(["<script>"], "image.png", { type: "image/png" }))).rejects.toMatchObject({ code: "INVALID_FILE_CONTENT" });
  });
  test("accepts supported signatures and valid UTF-8 text", async () => {
    for (const file of [
      new File([new Uint8Array([137,80,78,71,13,10,26,10])], "image.png", { type: "image/png" }),
      new File(["%PDF-1.7\nfixture"], "file.pdf", { type: "application/pdf" }),
      new File(["Тестовый документ"], "file.txt", { type: "text/plain" }),
    ]) await expect(validateUpload(file)).resolves.toBeUndefined();
  });
  test("text cannot hide NUL or invalid UTF-8", async () => {
    await expect(validateUpload(new File([new Uint8Array([0])], "file.txt", { type: "text/plain" }))).rejects.toMatchObject({ code: "INVALID_FILE_CONTENT" });
    await expect(validateUpload(new File([new Uint8Array([255])], "file.txt", { type: "text/plain" }))).rejects.toMatchObject({ code: "INVALID_FILE_CONTENT" });
  });
  test("object keys exclude the supplied filename and are unique", () => {
    const id = randomUUID(); expect(safeObjectKey(id)).not.toBe(safeObjectKey(id));
    expect(safeFilename("../../folder\\secret\r\n.txt")).not.toMatch(/[/\\\r\n]/);
  });
});
