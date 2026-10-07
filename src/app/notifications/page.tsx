import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const labels: Record<NotificationType, string> = {
  TICKET_CREATED: "Создана новая заявка",
  TICKET_ASSIGNED: "Вам назначена заявка",
  STATUS_CHANGED: "Статус заявки изменён",
  NEW_MESSAGE: "Новое сообщение",
  WAITING_FOR_USER: "Ожидается ответ пользователя",
  TICKET_RESOLVED: "Заявка решена",
  TICKET_REOPENED: "Заявка возвращена в работу",
  TICKET_CLOSED: "Заявка закрыта",
  SLA_RESPONSE_BREACH: "Просрочена первая реакция",
  SLA_RESOLVE_BREACH: "Просрочено решение",
};

async function markAllRead() {
  "use server";
  const session = await requireSession();
  await db.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

async function markRead(formData: FormData) {
  "use server";
  const session = await requireSession();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await db.notification.updateMany({
    where: { id, userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");

  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    include: {
      ticket: { select: { id: true, number: true, subject: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Уведомления</h1>
          <p className="muted">Непрочитанных: {unread}</p>
        </div>
        <div className="actionRow">
          {unread > 0 && <form action={markAllRead}><button type="submit">Прочитать все</button></form>}
          <Link className="button secondary" href="/dashboard">Панель</Link>
        </div>
      </header>

      <section className="notificationList">
        {notifications.length === 0 ? (
          <div className="card"><p className="muted">Уведомлений пока нет.</p></div>
        ) : notifications.map((item) => (
          <article className={`card notificationItem ${item.readAt ? "" : "notificationUnread"}`} key={item.id}>
            <div>
              <div className="notificationTitle">
                <b>{labels[item.type]}</b>
                {!item.readAt && <span className="unreadDot" aria-label="Непрочитано" />}
              </div>
              {item.ticket ? (
                <p>
                  <Link href={`/tickets/${item.ticket.id}`}>
                    HD-{item.ticket.number} · {item.ticket.subject}
                  </Link>
                </p>
              ) : null}
              <p className="muted">{item.createdAt.toLocaleString("ru-RU")}</p>
            </div>
            {!item.readAt && (
              <form action={markRead}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="secondary">Прочитано</button>
              </form>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
