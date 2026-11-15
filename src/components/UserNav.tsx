import Link from "next/link";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";

/** Header navigation: notifications bell with unread counter, profile, role-specific links, logout. */
export default async function UserNav({ userId, role }: { userId: string; role: Role }) {
  const unread = await db.notification.count({ where: { userId, readAt: null } });
  const isStaff = role === "ADMIN" || role === "TECHNICIAN";
  return (
    <nav className="userNav" aria-label="Навигация">
      <Link className="button secondary" href="/dashboard">
        Заявки
      </Link>
      {isStaff && (
        <Link className="button secondary" href="/reports">
          Отчёты
        </Link>
      )}
      <Link
        className="button secondary bell"
        href="/notifications"
        aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
      >
        Уведомления
        {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <Link className="button secondary" href="/profile">
        Профиль
      </Link>
      <LogoutButton />
    </nav>
  );
}
