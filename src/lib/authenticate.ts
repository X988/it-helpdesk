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
import { isUsernameInAdminOu, lookupSyncedAdUser } from "@/lib/ldap-sync";

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

  if (typeof o.login === "string" || typeof o.username === "string") {
    return {
      login: typeof o.login === "string" ? o.login : undefined,
      username: typeof o.username === "string" ? o.username : undefined,
      domain: typeof o.domain === "string" ? o.domain : undefined,
      password,
    };
  }

  if (typeof o.email === "string") {
    const email = o.email.trim().toLowerCase();
    const at = email.indexOf("@");
    if (at > 0) {
      return { username: email.slice(0, at), domain: DEFAULT_DOMAIN, password };
    }
  }

  throw new Error("INVALID_BODY");
}

async function resolveOrganizationId(opts: {
  company?: string;
  domain: string;
}): Promise<string | undefined> {
  const domain = opts.domain.toLowerCase();
  const company = (opts.company ?? "").trim();

  // Prefer exact company+domain match; else any org for domain; else create from company.
  if (company) {
    const existing = await db.organization.findFirst({
      where: { name: company, domain },
    });
    if (existing) return existing.id;
    const created = await db.organization.create({
      data: { name: company, domain, isActive: true },
    });
    return created.id;
  }

  const byDomain = await db.organization.findFirst({
    where: { domain, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return byDomain?.id;
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

  if (!user.username) {
    try {
      await db.user.update({ where: { id: user.id }, data: { username: parsed.username } });
    } catch {
      /* unique race — ignore */
    }
  }

  if (!user.organizationId) {
    const orgId = await resolveOrganizationId({ domain: parsed.domain });
    if (orgId) {
      await db.user.update({ where: { id: user.id }, data: { organizationId: orgId } }).catch(() => null);
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
  const synced = await lookupSyncedAdUser(profile.username).catch(() => null);
  const department =
    profile.department || synced?.department || synced?.ouName || undefined;
  const inAdminOu = await isUsernameInAdminOu(profile.username).catch(() => false);

  const orgId = await resolveOrganizationId({
    company: profile.organization,
    domain: profile.domain,
  });

  const existing =
    (await db.user.findFirst({
      where: {
        OR: [{ username: profile.username }, { email: profile.email }],
      },
    })) ?? null;

  if (existing) {
    if (!existing.isActive) throw new Error("INVALID_CREDENTIALS");
    const nextRole = inAdminOu && existing.role !== Role.ADMIN ? Role.ADMIN : existing.role;
    const updated = await db.user.update({
      where: { id: existing.id },
      data: {
        username: profile.username,
        name: profile.name || existing.name,
        email: existing.email || profile.email,
        department: department ?? existing.department,
        organizationId: orgId ?? existing.organizationId,
        role: nextRole,
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

  const randomHash = await bcrypt.hash(`ldap-only:${profile.username}:${Date.now()}`, 12);
  const created = await db.user.create({
    data: {
      email: profile.email,
      username: profile.username,
      name: profile.name,
      passwordHash: randomHash,
      role: inAdminOu ? Role.ADMIN : Role.USER,
      department,
      organizationId: orgId,
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
      console.error("LDAP auth failed:", err);
      throw new Error("INVALID_CREDENTIALS");
    }
  }

  return authenticateLocal(parsed, normalized.password);
}
