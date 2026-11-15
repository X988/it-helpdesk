import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import AdminNav from "@/components/AdminNav";
import CategoriesAdmin from "./CategoriesAdmin";

export default async function AdminCategoriesPage() {
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
          <h1>Категории заявок</h1>
          <p className="muted">Скрытые категории не предлагаются в новых заявках, но остаются в старых и в отчётах.</p>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>
      <AdminNav current="/admin/categories" />
      <CategoriesAdmin />
    </main>
  );
}
