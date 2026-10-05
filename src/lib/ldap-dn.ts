/** Parse OU path from DN: CN=x,OU=DCAdmin,OU=DTE,DC=... → leaf OU + path */
export function parseOuFromDn(dn: string): {
  ouName: string | null;
  ouDn: string | null;
  path: string;
  parentDn: string | null;
  ouParts: string[];
} {
  const parts = dn.split(",").map((p) => p.trim()).filter(Boolean);
  const ouParts: string[] = [];
  for (const p of parts) {
    const m = /^OU=(.+)$/i.exec(p);
    if (m) ouParts.push(m[1]);
  }
  if (ouParts.length === 0) {
    return { ouName: null, ouDn: null, path: "", parentDn: null, ouParts: [] };
  }
  const ouName = ouParts[0];
  const firstOuIdx = parts.findIndex((p) => /^OU=/i.test(p));
  const ouDn = firstOuIdx >= 0 ? parts.slice(firstOuIdx).join(",") : null;
  const parentDn = firstOuIdx >= 0 && firstOuIdx + 1 < parts.length ? parts.slice(firstOuIdx + 1).join(",") : null;
  const path = ouParts.join(" / ");
  return { ouName, ouDn, path, parentDn, ouParts };
}
