import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_DOMAIN,
  LOCAL_SEED_USER_MAP,
  parseDomainLogin,
  syntheticEmail,
} from "@/lib/domain-login";
import { authenticateWithLdap, isLdapConfigured } from "@/lib/ldap-auth";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  username: string | null;
};

function normalizeBody(body: unknown): { login?: string; username?: string; domain?: string; password: string } {
  if (!body || typeof body !== "object") throw new Error("INVALID_BODY");
  const o = body as Record<string, unknown>;
  const password = typeof o.password === "string" ? o.password : "";
  if (!password || password.length < 8 || password.length > 128) throw new Error("INVALID_BODY");

  // Preferred: login "energo\\user" or username+domain
  if (typeof o.login === "string" || typeof o.username === "string") {
    return {
      login: typeof o.login === "string" ? o.login : undefined,
      username: typeof o.username === "string" ? o.username : undefined,
      domain: typeof o.domain === "string" ? o.domain : undefined,
      password,
    };
  }

  // Legacy email login → treat local-part as username when domain matches seed/example
  if (typeof o.email === "string") {
    const email = o.email.trim().toLowerCase();
    const at = email.indexOf("@");
    if (at > 0) {
      return { username: email.slice(0, at), domain: DEFAULT_DOMAIN, password };
    }
  }

  throw new Error("INVALID_BODY");
}

async function authenticateLocal(parsed: ReturnType<typeof parseDomainLogin>, password: string): Promise<AuthUser> {
  const allowedDomain = DEFAULT_DOMAIN;
  if (parsed.domain !== allowedDomain) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const seedEmail = LOCAL_SEED_USER_MAP[parsed.username];
  const synthetic = syntheticEmail(parsed.username, parsed.domain);

  const user =
    (await db.user.findFirst({
      where: {
        OR: [
          { username: parsed.username },
          ...(seedEmail ? [{ email: seedEmail }] : []),
          { email: synthetic },
        ],
      },
    })) ?? null;

  if (!user || !user.isActive) throw new Error("INVALID_CREDENTIALS");
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // Backfill username for seed accounts so later logins resolve cleanly.
  if (!user.username) {
    try {
      await db.user.update({ where: { id: user.id }, data: { username: parsed.username } });
    } catch {
      /* unique race — ignore */
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    username: user.username ?? parsed.username,
  };
}

async function authenticateLdapAndSync(parsed: ReturnType<typeof parseDomainLogin>, password: string): Promise<AuthUser> {
  const profile = await authenticateWithLdap(parsed, password);

  const existing =
    (await db.user.findFirst({
      where: {
        OR: [{ username: profile.username }, { email: profile.email }],
      },
    })) ?? null;

  if (existing) {
    if (!existing.isActive) throw new Error("INVALID_CREDENTIALS");
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        username: profile.username,
        name: profile.name || existing.name,
        email: existing.email || profile.email,
        department: profile.department ?? existing.department,
        organization: profile.organization ?? existing.organization,
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      username: updated.username,
    };
  }

  // First successful AD login creates a USER account. Admins promote roles in DB.
  // passwordHash is a random unusable hash — password lives in AD only.
  const randomHash = await bcrypt.hash(`ldap-only:${profile.username}:${Date.now()}`, 12);
  const created = await db.user.create({
    data: {
      email: profile.email,
      username: profile.username,
      name: profile.name,
      passwordHash: randomHash,
      role: Role.USER,
      department: profile.department,
      organization: profile.organization,
    },
  });
  return {
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
    username: created.username,
  };
}

/**
 * Authenticate a domain login. Uses LDAP when LDAP_URL is set; otherwise local seed/bcrypt fallback.
 */
export async function authenticateDomainLogin(body: unknown): Promise<AuthUser> {
  const normalized = normalizeBody(body);
  let parsed;
  try {
    parsed = parseDomainLogin(normalized);
  } catch {
    throw new Error("INVALID_BODY");
  }

  if (isLdapConfigured()) {
    try {
      return await authenticateLdapAndSync(parsed, normalized.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg === "INVALID_CREDENTIALS" ||
        /invalid credentials/i.test(msg) ||
        /AcceptSecurityContext/i.test(msg) ||
        /\bdata 52e\b/i.test(msg)
      ) {
        throw new Error("INVALID_CREDENTIALS");
      }
      // Network/config errors should not leak details to the client.
      console.error("LDAP auth failed:", err);
      throw new Error("INVALID_CREDENTIALS");
    }
  }

  return authenticateLocal(parsed, normalized.password);
}
