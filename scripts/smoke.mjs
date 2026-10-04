import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
const origin = process.env.APP_URL ?? "http://localhost:3000";
async function call(path, cookie, body, method = body === undefined ? "GET" : "POST") {
  return fetch(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(10_000) });
}
async function authenticate(email, password) {
  const response = await call("/api/auth/login", null, { email, password });
  assert.equal(response.status, 200, "Login failed");
  return response.headers.get("set-cookie").split(";")[0];
}
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await call("/api/health")).ok) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(ready, "Production server did not become healthy");
assert.equal((await call("/api/tickets")).status, 401);
const publicPage = await call("/");
assert.equal(publicPage.status, 200); assert.equal(publicPage.headers.get("x-content-type-options"), "nosniff");
assert.ok((await publicPage.text()).includes('lang="ru"'));
const adminCookie = await authenticate(process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);
for (const path of ["/dashboard", "/tickets/new", "/admin", "/admin/audit", "/profile", "/notifications"]) assert.equal((await call(path, adminCookie)).status, 200, "Page failed: " + path);
const userPassword = randomBytes(24).toString("base64url");
const userEmail = "smoke-" + randomUUID() + "@example.test";
const createUser = await call("/api/admin/users", adminCookie, { name: "Smoke fixture", email: userEmail, password: userPassword, role: "USER" });
assert.equal(createUser.status, 201); const { user } = await createUser.json(); assert.ok(!("passwordHash" in user));
const userCookie = await authenticate(userEmail, userPassword);
assert.equal((await call("/api/admin/users", userCookie)).status, 403);
assert.equal((await call("/admin", userCookie)).status, 307);
const { categories } = await (await call("/api/categories", userCookie)).json();
assert.ok(categories.length > 0);
const draft = { subject: "Smoke fixture printer", description: "Synthetic CI printer incident", categoryId: categories[0].id, priority: "HIGH" };
const created = await call("/api/tickets", userCookie, draft); assert.equal(created.status, 201); const { ticket } = await created.json(); const base = "/api/tickets/" + ticket.id;
await call("/api/tickets", adminCookie, { ...draft, subject: "Administrator-only fixture" });
assert.equal((await call(base + "/claim", userCookie, {})).status, 403);
assert.equal((await call(base + "/claim", adminCookie, {})).status, 200);
assert.equal((await call(base + "/messages", adminCookie, { body: "Private smoke fixture", visibility: "INTERNAL" })).status, 201);
let visible = await (await call(base, userCookie)).json(); assert.equal(visible.ticket.messages.length, 0);
assert.equal((await call(base + "/messages", userCookie, { body: "Not permitted", visibility: "INTERNAL" })).status, 403);
assert.equal((await call(base + "/status", adminCookie, { status: "RESOLVED" })).status, 200);
const page = await call("/tickets/" + ticket.id, userCookie); assert.equal(page.status, 200); assert.ok((await page.text()).includes("Подтвердить решение"));
assert.equal((await call(base + "/status", userCookie, { status: "IN_PROGRESS" })).status, 200);
visible = await (await call(base, userCookie)).json(); assert.equal(visible.ticket.resolvedAt, null);
assert.equal((await call(base + "/status", adminCookie, { status: "RESOLVED" })).status, 200);
assert.equal((await call(base + "/status", userCookie, { status: "CLOSED" })).status, 200);
assert.equal((await call(base + "/messages", userCookie, { body: "After closure" })).status, 409);
const listing = await (await call("/api/tickets", userCookie)).json();
assert.equal(listing.tickets.length, 1); assert.equal(listing.tickets[0].id, ticket.id);
assert.equal((await call("/api/admin/users/" + user.id, adminCookie, { role: "USER", isActive: false }, "PATCH")).status, 200);
assert.equal((await call("/api/tickets", userCookie)).status, 401);
assert.equal((await call("/api/auth/logout", adminCookie, {})).status, 200);
assert.equal((await call("/api/tickets", adminCookie)).status, 401);
console.log("Production HTTP smoke passed: pages, role isolation, ticket lifecycle and session revocation");
