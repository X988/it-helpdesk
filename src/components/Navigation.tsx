import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
export default async function Navigation() {
  const session = await getSession();
  return <nav className="nav shell" aria-label="Основная навигация"><Link className="brand" href={session ? "/dashboard" : "/"}>IT Help Desk</Link><div className="navLinks">{session ? <><Link href="/dashboard">Заявки</Link><Link href="/notifications">Уведомления</Link><Link href="/profile">{session.name}</Link>{session.role === "ADMIN" && <><Link href="/admin">Управление</Link><Link href="/admin/audit">Журнал</Link></>}<LogoutButton /></> : <Link className="button" href="/login">Войти</Link>}</div></nav>;
}
