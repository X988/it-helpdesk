import { Client } from "ldapts";
import type { ParsedDomainLogin } from "@/lib/domain-login";
import { syntheticEmail } from "@/lib/domain-login";

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
    domain: (process.env.LDAP_DOMAIN || "energo").toLowerCase(),
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

/**
 * Authenticate against Active Directory / LDAP.
 * Bind strategies tried in order (fresh TCP connection each time — AD often
 * resets the socket after a failed bind):
 * 1) user@UPN_SUFFIX (if LDAP_UPN_SUFFIX set)
 * 2) DOMAIN\username
 * 3) username@domain.local (synthetic), if different from (1)
 *
 * Optional service bind (LDAP_BIND_DN) is used only to look up profile attributes
 * after a successful user bind; if absent, attributes may be minimal.
 * User-bind alone is enough to sign in.
 */
export async function authenticateWithLdap(parsed: ParsedDomainLogin, password: string): Promise<LdapProfile> {
  if (!password) throw new Error("INVALID_CREDENTIALS");
  const cfg = ldapConfig();
  const expectedDomain = cfg.domain.toLowerCase();
  if (parsed.domain !== expectedDomain) {
    throw new Error("INVALID_CREDENTIALS");
  }

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

  let email = syntheticEmail(parsed.username, parsed.domain);
  let name = parsed.username;
  let department: string | undefined;
  let organization: string | undefined;

  try {
    if (cfg.baseDn) {
      // Re-bind with service account for search if provided (user bind may lack search rights).
      if (cfg.bindDn && cfg.bindPassword) {
        await boundClient.bind(cfg.bindDn, cfg.bindPassword);
      }
      const filter = cfg.searchFilter.replaceAll("{{username}}", parsed.username.replace(/[\\*()]/g, "\\$&"));
      const { searchEntries } = await boundClient.search(cfg.baseDn, {
        scope: "sub",
        filter,
        attributes: ["dn", "cn", "displayName", "mail", "department", "company", "sAMAccountName"],
        sizeLimit: 1,
      });
      const entry = searchEntries[0] as Record<string, unknown> | undefined;
      if (entry) {
        const pick = (key: string) => {
          const v = entry[key];
          if (Array.isArray(v)) return String(v[0] ?? "");
          return v == null ? "" : String(v);
        };
        name = pick("displayName") || pick("cn") || name;
        email = pick("mail") || email;
        department = pick("department") || undefined;
        organization = pick("company") || undefined;
      }
    }
  } catch {
    // Profile lookup is best-effort; successful bind is enough to sign in.
  } finally {
    await safeUnbind(boundClient);
  }

  return {
    username: parsed.username,
    domain: parsed.domain,
    email: email.toLowerCase(),
    name,
    department,
    organization,
  };
}
