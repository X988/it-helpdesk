import { Client } from "ldapts";
import { db } from "@/lib/db";
import { parseOuFromDn } from "@/lib/ldap-dn";

export { parseOuFromDn } from "@/lib/ldap-dn";

export type LdapSyncStats = {
  departments: number;
  users: number;
  adminOuDn: string | null;
  bindMode: "service" | "user";
};

export type LdapBindCredentials = {
  /** Service account DN or UPN, or user UPN/netbios for one-off sync */
  bindDn: string;
  bindPassword: string;
  mode: "service" | "user";
};

function ldapConfig() {
  const url = process.env.LDAP_URL?.trim();
  if (!url) throw new Error("LDAP_NOT_CONFIGURED");
  return {
    url,
    baseDn: process.env.LDAP_BASE_DN?.trim() || "",
    domain: (process.env.LDAP_DOMAIN || "").trim().toLowerCase(),
    upnSuffix: process.env.LDAP_UPN_SUFFIX?.trim() || "",
    bindDn: process.env.LDAP_BIND_DN?.trim() || "",
    bindPassword: process.env.LDAP_BIND_PASSWORD || "",
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
    ouRoot: process.env.LDAP_OU_ROOT?.trim() || "",
  };
}

function createClient(cfg: ReturnType<typeof ldapConfig>) {
  return new Client({
    url: cfg.url,
    timeout: 30_000,
    connectTimeout: 15_000,
    tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized },
  });
}

async function safeUnbind(client: Client) {
  try {
    await client.unbind();
  } catch {
    /* ignore */
  }
}

function pickAttr(entry: Record<string, unknown>, key: string): string {
  const v = entry[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  if (v == null) return "";
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return String(v);
}

export function resolveSyncBind(opts?: {
  username?: string;
  password?: string;
}): LdapBindCredentials {
  const cfg = ldapConfig();
  if (cfg.bindDn && cfg.bindPassword) {
    return { bindDn: cfg.bindDn, bindPassword: cfg.bindPassword, mode: "service" };
  }
  const user = (opts?.username ?? "").trim();
  const pass = opts?.password ?? "";
  if (!user || !pass) {
    throw new Error("LDAP_BIND_REQUIRED");
  }
  const upn = `${user}@${cfg.upnSuffix}`;
  // Prefer UPN; caller may retry — we try UPN first here
  return { bindDn: upn, bindPassword: pass, mode: "user" };
}

async function bindClient(
  client: Client,
  creds: LdapBindCredentials,
  cfg: ReturnType<typeof ldapConfig>,
) {
  if (creds.mode === "service") {
    await client.bind(creds.bindDn, creds.bindPassword);
    return;
  }
  // User mode: try UPN then DOMAIN\user
  const userPart = creds.bindDn.includes("@")
    ? creds.bindDn.split("@")[0]
    : creds.bindDn.includes("\\")
      ? creds.bindDn.split("\\")[1]
      : creds.bindDn;
  const candidates = [
    creds.bindDn,
    `${userPart}@${cfg.upnSuffix}`,
    `${cfg.domain}\\${userPart}`,
  ];
  let last: unknown;
  for (const dn of [...new Set(candidates.filter(Boolean))]) {
    try {
      await client.bind(dn, creds.bindPassword);
      return;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("INVALID_CREDENTIALS");
}

type OuRow = { name: string; dn: string; parentDn: string | null; path: string };
type UserRow = {
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  ouName: string | null;
  ouDn: string | null;
  dn: string;
  isDisabled: boolean;
};

function userAccountDisabled(uac: string): boolean {
  const n = Number.parseInt(uac || "0", 10);
  if (Number.isNaN(n)) return false;
  return (n & 0x2) === 0x2; // ACCOUNTDISABLE
}

async function searchAllOus(client: Client, baseDn: string): Promise<OuRow[]> {
  const { searchEntries } = await client.search(baseDn, {
    scope: "sub",
    filter: "(objectClass=organizationalUnit)",
    attributes: ["dn", "ou", "name", "distinguishedName"],
    sizeLimit: 0,
    paged: { pageSize: 500 },
  });
  const rows: OuRow[] = [];
  for (const raw of searchEntries) {
    const entry = raw as Record<string, unknown>;
    const dn = pickAttr(entry, "dn") || pickAttr(entry, "distinguishedName");
    if (!dn) continue;
    const name = pickAttr(entry, "ou") || pickAttr(entry, "name") || parseOuFromDn(dn).ouName || "";
    if (!name) continue;
    const parsed = parseOuFromDn(dn);
    // For OU object itself, path should be this OU + parents
    rows.push({
      name,
      dn,
      parentDn: parsed.parentDn,
      path: parsed.path || name,
    });
  }
  return rows;
}

async function searchAllUsers(client: Client, baseDn: string): Promise<UserRow[]> {
  const { searchEntries } = await client.search(baseDn, {
    scope: "sub",
    filter: "(&(objectCategory=person)(objectClass=user)(!(sAMAccountName=$*)))",
    attributes: [
      "dn",
      "distinguishedName",
      "sAMAccountName",
      "displayName",
      "cn",
      "mail",
      "department",
      "userAccountControl",
    ],
    sizeLimit: 0,
    paged: { pageSize: 500 },
  });
  const rows: UserRow[] = [];
  for (const raw of searchEntries) {
    const entry = raw as Record<string, unknown>;
    const dn = pickAttr(entry, "dn") || pickAttr(entry, "distinguishedName");
    const username = pickAttr(entry, "sAMAccountName").toLowerCase();
    if (!dn || !username) continue;
    const parsed = parseOuFromDn(dn);
    const mail = pickAttr(entry, "mail").toLowerCase() || null;
    const displayName =
      pickAttr(entry, "displayName") || pickAttr(entry, "cn") || username;
    const department = pickAttr(entry, "department") || parsed.ouName || null;
    rows.push({
      username,
      displayName,
      email: mail,
      department,
      ouName: parsed.ouName,
      ouDn: parsed.ouDn,
      dn,
      isDisabled: userAccountDisabled(pickAttr(entry, "userAccountControl")),
    });
  }
  return rows;
}

export async function syncAdDirectory(opts?: {
  username?: string;
  password?: string;
}): Promise<LdapSyncStats> {
  const cfg = ldapConfig();
  if (!cfg.baseDn) throw new Error("LDAP_BASE_DN_MISSING");
  const creds = resolveSyncBind(opts);
  const searchBase = cfg.ouRoot || cfg.baseDn;

  const client = createClient(cfg);
  try {
    await bindClient(client, creds, cfg);
    const [ous, users] = await Promise.all([
      searchAllOus(client, searchBase),
      searchAllUsers(client, searchBase),
    ]);

    const now = new Date();
    const countByOu = new Map<string, number>();
    for (const u of users) {
      if (!u.ouDn) continue;
      countByOu.set(u.ouDn, (countByOu.get(u.ouDn) ?? 0) + 1);
    }

    // Preserve admin OU flag
    const prevAdmin = await db.adDepartment.findFirst({ where: { isAdminOu: true } });
    const adminDnSetting = await db.appSetting.findUnique({ where: { key: "admin_ou_dn" } });
    const preferredAdminDn = adminDnSetting?.value || prevAdmin?.dn || null;

    await db.$transaction(async (tx) => {
      // Replace directory snapshot (simple + consistent for lab size)
      await tx.adDirectoryUser.deleteMany();
      await tx.adDepartment.deleteMany();

      for (const ou of ous) {
        await tx.adDepartment.create({
          data: {
            name: ou.name,
            dn: ou.dn,
            parentDn: ou.parentDn,
            path: ou.path,
            isAdminOu: preferredAdminDn ? ou.dn.toLowerCase() === preferredAdminDn.toLowerCase() : false,
            userCount: countByOu.get(ou.dn) ?? 0,
            syncedAt: now,
          },
        });
      }

      // Batch create users
      const chunk = 100;
      for (let i = 0; i < users.length; i += chunk) {
        const slice = users.slice(i, i + chunk);
        await tx.adDirectoryUser.createMany({
          data: slice.map((u) => ({
            username: u.username,
            displayName: u.displayName,
            email: u.email,
            department: u.department,
            ouName: u.ouName,
            ouDn: u.ouDn,
            dn: u.dn,
            isDisabled: u.isDisabled,
            syncedAt: now,
          })),
        });
      }

      await tx.appSetting.upsert({
        where: { key: "ad_last_sync_at" },
        create: { key: "ad_last_sync_at", value: now.toISOString() },
        update: { value: now.toISOString() },
      });
      await tx.appSetting.upsert({
        where: { key: "ad_last_sync_bind_mode" },
        create: { key: "ad_last_sync_bind_mode", value: creds.mode },
        update: { value: creds.mode },
      });
    });

    // If preferred admin OU was set but OU list empty of that DN, clear flag quietly
    const admin = await db.adDepartment.findFirst({ where: { isAdminOu: true } });

    return {
      departments: ous.length,
      users: users.length,
      adminOuDn: admin?.dn ?? null,
      bindMode: creds.mode,
    };
  } finally {
    await safeUnbind(client);
  }
}

export async function getAdminOuSetting() {
  const [flagged, setting] = await Promise.all([
    db.adDepartment.findFirst({ where: { isAdminOu: true } }),
    db.appSetting.findUnique({ where: { key: "admin_ou_dn" } }),
  ]);
  return {
    department: flagged,
    adminOuDn: setting?.value ?? flagged?.dn ?? null,
  };
}

export async function setAdminOu(dn: string | null) {
  await db.$transaction(async (tx) => {
    await tx.adDepartment.updateMany({ data: { isAdminOu: false } });
    if (dn) {
      await tx.adDepartment.updateMany({
        where: { dn },
        data: { isAdminOu: true },
      });
      await tx.appSetting.upsert({
        where: { key: "admin_ou_dn" },
        create: { key: "admin_ou_dn", value: dn },
        update: { value: dn },
      });
    } else {
      await tx.appSetting.deleteMany({ where: { key: "admin_ou_dn" } });
    }
  });
  return getAdminOuSetting();
}

/**
 * Promote Help Desk users whose AD OU matches the admin OU to ADMIN.
 * Does not demote existing ADMIN/TECHNICIAN outside that OU.
 */
export async function applyAdminRolesFromOu(): Promise<{ promoted: string[]; adminOu: string | null }> {
  const admin = await db.adDepartment.findFirst({ where: { isAdminOu: true } });
  if (!admin) return { promoted: [], adminOu: null };

  const adUsers = await db.adDirectoryUser.findMany({
    where: {
      OR: [{ ouDn: admin.dn }, { ouName: admin.name }],
      isDisabled: false,
    },
    select: { username: true },
  });
  const usernames = adUsers.map((u) => u.username.toLowerCase());
  if (usernames.length === 0) return { promoted: [], adminOu: admin.dn };

  const candidates = await db.user.findMany({
    where: {
      username: { in: usernames },
      isActive: true,
      role: { not: "ADMIN" },
    },
    select: { id: true, username: true, role: true },
  });

  const promoted: string[] = [];
  for (const u of candidates) {
    await db.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
    promoted.push(u.username ?? u.id);
  }
  return { promoted, adminOu: admin.dn };
}

/** Lookup synced AD profile for login enrichment */
export async function lookupSyncedAdUser(username: string) {
  return db.adDirectoryUser.findUnique({
    where: { username: username.toLowerCase() },
  });
}

export async function isUsernameInAdminOu(username: string): Promise<boolean> {
  const admin = await db.adDepartment.findFirst({ where: { isAdminOu: true } });
  if (!admin) return false;
  const u = await db.adDirectoryUser.findUnique({
    where: { username: username.toLowerCase() },
  });
  if (!u || u.isDisabled) return false;
  if (u.ouDn && u.ouDn.toLowerCase() === admin.dn.toLowerCase()) return true;
  if (u.ouName && u.ouName.toLowerCase() === admin.name.toLowerCase()) return true;
  return false;
}
