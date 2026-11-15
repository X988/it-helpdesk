import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import AdminNav from "@/components/AdminNav";
import UsersAdmin from "./UsersAdmin";

export default async function AdminUsersPage() {
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
          <h1>Пользователи</h1>
          <p className="muted">
            Учётные записи появляются после первого входа или синхронизации AD. Участники OU администраторов
            получают роль «Админ» автоматически при входе.
          </p>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>
      <AdminNav current="/admin/users" />
      <UsersAdmin currentUserId={s.userId} />
    </main>
  );
}
