import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEFAULT_DOMAIN, getLoginDomains } from "@/lib/domain-login";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const domains = getLoginDomains();
  const defaultDomain = domains.includes(DEFAULT_DOMAIN) ? DEFAULT_DOMAIN : domains[0];
  return <LoginForm domains={domains} defaultDomain={defaultDomain} />;
}
