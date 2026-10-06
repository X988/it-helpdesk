import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_DOMAIN, getLoginDomains } from "@/lib/domain-login";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const organizations = await db.organization.findMany({
    where: { isActive: true },
    select: { name: true, domain: true },
    orderBy: { name: "asc" },
  });
  const byDomain = new Map<string, string>();
  for (const domain of getLoginDomains()) byDomain.set(domain, domain);
  for (const org of organizations) {
    const domain = org.domain.trim().toLowerCase();
    if (!domain) continue;
    byDomain.set(domain, org.name ? `${org.name} (${domain})` : domain);
  }
  const domains = [...byDomain.entries()].map(([value, label]) => ({ value, label }));
  const defaultDomain = byDomain.has(DEFAULT_DOMAIN) ? DEFAULT_DOMAIN : domains[0]?.value || "";
  return <LoginForm domains={domains} defaultDomain={defaultDomain} />;
}
