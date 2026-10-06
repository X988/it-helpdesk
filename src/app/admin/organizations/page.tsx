import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import OrganizationsAdmin from "./OrganizationsAdmin";

export default async function AdminOrganizationsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "ADMIN") redirect("/dashboard");
  return (
    <main className="shell">
      <header className="top">
        <div>
          <Link href="/dashboard" className="muted">
            ← К панели
          </Link>
          <h1>Организации</h1>
          <p className="muted">Домен организации попадает в список на экране входа. Сотрудников можно загрузить из AD или назначить вручную в «Сотрудники».</p>
        </div>
        <LogoutButton />
      </header>
      <OrganizationsAdmin />
    </main>
  );
}
