import { Client } from "ldapts";
import type { ParsedDomainLogin } from "@/lib/domain-login";
import { syntheticEmail } from "@/lib/domain-login";
import { parseOuFromDn } from "@/lib/ldap-dn";

export type LdapProfile = {
  username: string;
  domain: string;
  email: string;
  name: string;
  department?: string;
  organization?: string;
};

export function isLdapConfigured() {
  return Boolean(process.env.LDAP_URL?.trim());
}

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
    searchFilter:
      process.env.LDAP_SEARCH_FILTER?.trim() || "(sAMAccountName={{username}})",
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
  };
}

function createClient(cfg: ReturnType<typeof ldapConfig>) {
  return new Client({
    url: cfg.url,
    timeout: 10_000,
    connectTimeout: 10_000,
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

function isInvalidCredentialsError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  return (
    name === "InvalidCredentialsError" ||
    /invalid credentials/i.test(msg) ||
    /AcceptSecurityContext/i.test(msg) ||
    /\bdata 52e\b/i.test(msg) ||
    /\b0x31\b/.test(msg)
  );
}

type ProfileFields = {
  name: string;
  email: string;
  department?: string;
  organization?: string;
};

async function searchProfile(
  client: Client,
  cfg: ReturnType<typeof ldapConfig>,
  username: string,
  fallback: ProfileFields,
): Promise<ProfileFields> {
  if (!cfg.baseDn) return fallback;
  const filter = cfg.searchFilter.replaceAll("{{username}}", username.replace(/[\\*()]/g, "\\$&"));
  const { searchEntries } = await client.search(cfg.baseDn, {
    scope: "sub",
    filter,
    attributes: [
      "dn",
      "cn",
      "displayName",
      "mail",
      "department",
      "company",
      "sAMAccountName",
      "distinguishedName",
      "physicalDeliveryOfficeName",
    ],
    sizeLimit: 1,
  });
  const entry = searchEntries[0] as Record<string, unknown> | undefined;
  if (!entry) return fallback;
  const pick = (key: string) => {
    const v = entry[key];
    if (Array.isArray(v)) return String(v[0] ?? "");
    return v == null ? "" : String(v);
  };
  const dn = pick("dn") || pick("distinguishedName");
  const ou = dn ? parseOuFromDn(dn) : null;
  return {
    name: pick("displayName") || pick("cn") || fallback.name,
    email: pick("mail") || fallback.email,
    department: pick("department") || ou?.ouName || undefined,
    organization: pick("company") || undefined,
  };
}

/**
 * Authenticate against Active Directory / LDAP.
 * After successful user bind, searches for displayName/department/company
 * with the user connection; if empty and LDAP_BIND_DN is set, re-searches
 * with the service account.
 */
export async function authenticateWithLdap(parsed: ParsedDomainLogin, password: string): Promise<LdapProfile> {
  if (!password) throw new Error("INVALID_CREDENTIALS");
  const cfg = ldapConfig();

  const upn = cfg.upnSuffix ? `${parsed.username}@${cfg.upnSuffix}` : "";
  const netbios = `${parsed.domain}\\${parsed.username}`;
  const syntheticUpn = `${parsed.username}@${cfg.upnSuffix || `${parsed.domain}.local`}`;
  const bindCandidates = [...new Set([upn, netbios, syntheticUpn].filter(Boolean))];

  let boundClient: Client | null = null;
  let lastError: unknown;
  let sawInvalidCredentials = false;

  for (const dn of bindCandidates) {
    const client = createClient(cfg);
    try {
      await client.bind(dn, password);
      boundClient = client;
      break;
    } catch (err) {
      if (isInvalidCredentialsError(err)) sawInvalidCredentials = true;
      lastError = err;
      await safeUnbind(client);
    }
  }

  if (!boundClient) {
    if (sawInvalidCredentials) throw new Error("INVALID_CREDENTIALS");
    throw lastError instanceof Error ? lastError : new Error("INVALID_CREDENTIALS");
  }

  let fields: ProfileFields = {
    email: syntheticEmail(parsed.username, parsed.domain),
    name: parsed.username,
  };

  try {
    // 1) Search with user privileges (often enough for own attributes).
    fields = await searchProfile(boundClient, cfg, parsed.username, fields);

    // 2) If department/company missing and service bind configured — re-search.
    const needsService =
      cfg.bindDn &&
      cfg.bindPassword &&
      (!fields.department || !fields.organization || fields.name === parsed.username);
    if (needsService) {
      await boundClient.bind(cfg.bindDn, cfg.bindPassword);
      fields = await searchProfile(boundClient, cfg, parsed.username, fields);
    }
  } catch {
    // Profile lookup is best-effort; successful bind is enough to sign in.
  } finally {
    await safeUnbind(boundClient);
  }

  return {
    username: parsed.username,
    domain: parsed.domain,
    email: fields.email.toLowerCase(),
    name: fields.name,
    department: fields.department,
    organization: fields.organization,
  };
}
