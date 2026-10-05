import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { formatPerson, priorityLabel, statusLabel, directionLabel } from "@/lib/labels";

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect("/login");
  const where = s.role === "USER" ? { requesterId: s.userId } : {};
  const me = await db.user.findUnique({
    where: { id: s.userId },
    select: { name: true, username: true, role: true },
  });
  const [tickets, newCount, progress, waiting] = await Promise.all([
    db.ticket.findMany({
      where,
      include: {
        category: true,
        assignee: { select: { name: true, username: true } },
        requester: { select: { name: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.ticket.count({ where: { ...where, status: "NEW" } }),
    db.ticket.count({ where: { ...where, status: "IN_PROGRESS" } }),
    db.ticket.count({ where: { ...where, status: "WAITING_FOR_USER" } }),
  ]);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>{s.role === "USER" ? "Мои заявки" : "Панель специалиста"}</h1>
          <p className="muted">{formatPerson(me?.name, me?.username)}</p>
        </div>
        <div className="actionRow" style={{ marginBottom: 0 }}>
          {s.role === "ADMIN" && (
            <Link className="button secondary" href="/admin/organizations">
              Организации
            </Link>
          )}
          <Link className="button" href="/tickets/new">
            + Новая заявка
          </Link>
          <LogoutButton />
        </div>
      </header>
      <section className="grid">
        <div className="card">
          <b>{newCount}</b>
          <p className="muted">Новые</p>
        </div>
        <div className="card">
          <b>{progress}</b>
          <p className="muted">В работе</p>
        </div>
        <div className="card">
          <b>{waiting}</b>
          <p className="muted">Ожидают ответа</p>
        </div>
      </section>
      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Тема</th>
              <th>Категория</th>
              <th>Направление</th>
              <th>Приоритет</th>
              <th>Статус</th>
              <th>Специалист</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/tickets/${t.id}`}>HD-{t.number}</Link>
                </td>
                <td>{t.subject}</td>
                <td>{t.category.name}</td>
                <td>{directionLabel[t.direction]}</td>
                <td>{priorityLabel[t.priority]}</td>
                <td>{statusLabel[t.status]}</td>
                <td>{formatPerson(t.assignee?.name, t.assignee?.username)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
