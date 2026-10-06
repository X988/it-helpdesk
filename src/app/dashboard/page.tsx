import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import SupportContacts from "@/components/SupportContacts";
import { formatPerson, priorityLabel, statusLabel, directionLabel } from "@/lib/labels";

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect("/login");
  const me = await db.user.findUnique({
    where: { id: s.userId },
    select: { name: true, username: true, role: true, departmentId: true, isActive: true },
  });
  if (!me?.isActive) redirect("/login");
  const { staffWhere } = await import("@/lib/ticket-access");
  const where = staffWhere({ userId: s.userId, role: me.role, departmentId: me.departmentId });
  const isStaff = me.role === "ADMIN" || me.role === "TECHNICIAN";
  const [tickets, newCount, progress, waiting, admins] = await Promise.all([
    db.ticket.findMany({
      where,
      include: {
        category: true,
        assignee: { select: { name: true, username: true, email: true } },
        requester: { select: { name: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.ticket.count({ where: { ...where, status: "NEW" } }),
    db.ticket.count({ where: { ...where, status: "IN_PROGRESS" } }),
    db.ticket.count({ where: { ...where, status: "WAITING_FOR_USER" } }),
    !isStaff
      ? db.user.findMany({
          where: { isActive: true, role: "ADMIN" },
          select: { id: true, name: true, username: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>{isStaff ? "Панель специалиста" : "Мои заявки"}</h1>
          <p className="muted">{formatPerson(me?.name, me?.username)}</p>
        </div>
        <div className="actionRow" style={{ marginBottom: 0 }}>
          <Link className="button secondary" href="/kb">База знаний</Link>
          {isStaff && <Link className="button secondary" href="/queue">Очередь</Link>}
          {s.role === "ADMIN" && (
            <>
              <Link className="button secondary" href="/admin/users">Роли</Link>
              <Link className="button secondary" href="/admin/sla">SLA</Link>
              <Link className="button secondary" href="/admin/ad">
                Active Directory
              </Link>
              <Link className="button secondary" href="/admin/organizations">
                Организации
              </Link>
            </>
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
          <p className="muted">{isStaff ? "Ожидают ответа" : "Ждут вашего ответа"}</p>
        </div>
      </section>

      {!isStaff && (
        <section className="section">
          <SupportContacts contacts={admins} title="Контакты администраторов IT" />
        </section>
      )}

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Тема</th>
              {isStaff && <th>Автор</th>}
              <th>Категория</th>
              {isStaff && <th>Направление</th>}
              <th>Приоритет</th>
              <th>Статус</th>
              <th>{isStaff ? "Специалист" : "Кто решает"}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={isStaff ? 8 : 6} className="muted">
                  {isStaff ? "Заявок пока нет." : "У вас пока нет заявок. Создайте первую."}
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/tickets/${t.id}`}>HD-{t.number}</Link>
                  </td>
                  <td>{t.subject}</td>
                  {isStaff && <td>{formatPerson(t.requester.name, t.requester.username)}</td>}
                  <td>{t.category.name}</td>
                  {isStaff && <td>{directionLabel[t.direction]}</td>}
                  <td>{priorityLabel[t.priority]}</td>
                  <td>{statusLabel[t.status]}</td>
                  <td>
                    {t.assignee ? (
                      <>
                        {formatPerson(t.assignee.name, t.assignee.username)}
                        {!isStaff && t.assignee.email ? (
                          <>
                            <br />
                            <a href={`mailto:${t.assignee.email}`} className="muted">
                              {t.assignee.email}
                            </a>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">Ещё не назначен</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
