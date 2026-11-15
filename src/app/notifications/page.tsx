import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import { notificationLabel, statusLabel } from "@/lib/labels";
import MarkAllRead from "./MarkAllRead";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const notifications = await db.notification.findMany({
    where: { userId: s.userId },
    include: { ticket: { select: { id: true, number: true, subject: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Уведомления</h1>
          <p className="muted">
            {unread ? `Непрочитанных: ${unread}` : "Все уведомления прочитаны"} · показаны последние 100
          </p>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>

      {unread > 0 && (
        <div className="actionRow">
          <MarkAllRead />
        </div>
      )}

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Событие</th>
              <th>Заявка</th>
              <th>Текущий статус</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            {notifications.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Уведомлений пока нет.
                </td>
              </tr>
            ) : (
              notifications.map((n) => (
                <tr key={n.id} className={n.readAt ? "" : "unread"}>
                  <td>
                    {!n.readAt && <span className="dot" aria-label="Не прочитано" />}
                    {notificationLabel[n.type]}
                  </td>
                  <td>
                    {n.ticket ? (
                      <Link href={`/tickets/${n.ticket.id}`}>
                        HD-{n.ticket.number} · {n.ticket.subject}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{n.ticket ? statusLabel[n.ticket.status] : "—"}</td>
                  <td className="muted">{n.createdAt.toLocaleString("uk-UA")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
