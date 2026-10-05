import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import AdDirectoryAdmin from "./AdDirectoryAdmin";

export default async function AdminAdPage() {
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
          <h1>Active Directory</h1>
          <p className="muted">Отделы (OU), пользователи и назначение OU админов Help Desk</p>
        </div>
        <LogoutButton />
      </header>
      <AdDirectoryAdmin />
    </main>
  );
}
