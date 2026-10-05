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

/**
 * Authenticate against Active Directory / LDAP.
 * Bind strategies tried in order:
 * 1) user@UPN_SUFFIX (if LDAP_UPN_SUFFIX set)
 * 2) DOMAIN\username
 * 3) username@domain.local (synthetic)
 *
 * Optional service bind (LDAP_BIND_DN) is used only to look up profile attributes
 * after a successful user bind; if absent, attributes may be minimal.
 */
export async function authenticateWithLdap(parsed: ParsedDomainLogin, password: string): Promise<LdapProfile> {
  if (!password) throw new Error("INVALID_CREDENTIALS");
  const cfg = ldapConfig();
  const expectedDomain = cfg.domain.toLowerCase();
  if (parsed.domain !== expectedDomain) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const client = new Client({
    url: cfg.url,
    timeout: 10_000,
    connectTimeout: 10_000,
    tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized },
  });

  const bindCandidates = [
    cfg.upnSuffix ? `${parsed.username}@${cfg.upnSuffix}` : "",
    `${parsed.domain}\\${parsed.username}`,
    `${parsed.username}@${cfg.upnSuffix || `${parsed.domain}.local`}`,
  ].filter(Boolean);

  let boundAs = "";
  let lastError: unknown;
  for (const dn of bindCandidates) {
    try {
      await client.bind(dn, password);
      boundAs = dn;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!boundAs) {
    try {
      await client.unbind();
    } catch {
      /* ignore */
    }
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
        await client.bind(cfg.bindDn, cfg.bindPassword);
      }
      const filter = cfg.searchFilter.replaceAll("{{username}}", parsed.username.replace(/[\\*()]/g, "\\$&"));
      const { searchEntries } = await client.search(cfg.baseDn, {
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
    try {
      await client.unbind();
    } catch {
      /* ignore */
    }
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
