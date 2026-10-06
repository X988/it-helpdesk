/** NetBIOS domain of this installation. Empty until LDAP_DOMAIN is set — never a built-in company name. */
export const DEFAULT_DOMAIN = (process.env.LDAP_DOMAIN || "").trim().toLowerCase();

export type ParsedDomainLogin = {
  domain: string;
  username: string;
  /** DOMAIN\username normalized with backslash */
  login: string;
};

/**
 * Parse domain credentials from:
 * - "energo\\o.nikishin" / "ENERGO/o.nikishin"
 * - "o.nikishin@energo.local"
 * - bare "o.nikishin" + optional domain argument
 */
export function parseDomainLogin(input: {
  login?: string | null;
  username?: string | null;
  domain?: string | null;
}): ParsedDomainLogin {
  const rawLogin = (input.login ?? "").trim();
  const rawUser = (input.username ?? "").trim();
  const rawDomain = (input.domain ?? "").trim();

  let domain = "";
  let username = "";

  if (rawLogin) {
    const normalized = rawLogin.replace(/\//g, "\\");
    const at = normalized.indexOf("@");
    if (at > 0) {
      username = normalized.slice(0, at);
      const suffix = normalized.slice(at + 1);
      domain = suffix.split(".")[0] || DEFAULT_DOMAIN;
    } else {
      const slash = normalized.indexOf("\\");
      if (slash > 0) {
        domain = normalized.slice(0, slash);
        username = normalized.slice(slash + 1);
      } else {
        username = normalized;
      }
    }
  } else {
    username = rawUser;
    domain = rawDomain;
  }

  username = username.trim().replace(/^\\+/, "");
  domain = (domain || DEFAULT_DOMAIN).trim().toLowerCase();
  username = username.toLowerCase();

  if (!username || username.includes("@") || username.includes("\\")) {
    throw new Error("INVALID_LOGIN");
  }
  if (!/^[a-z0-9._-]{1,64}$/i.test(username)) {
    throw new Error("INVALID_LOGIN");
  }
  if (!/^[a-z0-9._-]{1,64}$/i.test(domain)) {
    throw new Error("INVALID_LOGIN");
  }

  return {
    domain,
    username,
    login: `${domain}\\${username}`,
  };
}

/** Synthetic mailbox used when AD does not return mail. */
export function syntheticEmail(username: string, domain = DEFAULT_DOMAIN) {
  const emailDomain = (process.env.LDAP_EMAIL_DOMAIN || `${domain}.local`).toLowerCase();
  return `${username.toLowerCase()}@${emailDomain}`;
}

/** Local-dev mapping from sAMAccountName → existing seed emails. */
export const LOCAL_SEED_USER_MAP: Record<string, string> = {
  admin: "admin@example.local",
  tech: "tech@example.local",
  user: "user@example.local",
};

/** Domains configured for this installation. Empty until LDAP_DOMAIN or LDAP_DOMAINS is set. */
export function getLoginDomains(): string[] {
  const raw = process.env.LDAP_DOMAINS || process.env.LDAP_DOMAIN || "";
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9._-]{1,64}$/i.test(s));
  return [...new Set(list)];
}
