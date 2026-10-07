import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import SupportContacts from "@/components/SupportContacts";
import { formatPerson, priorityLabel, statusLabel, directionLabel } from "@/lib/labels";
import { isStaffRole } from "@/lib/roles";
import { staffWhere } from "@/lib/ticket-access";
import { average, compliance, durationMinutes, median } from "@/lib/metrics";
import { kyivParts, kyivWallToUtc } from "@/lib/sla";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ period?: string }>;
const OPEN_STATUSES = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER"] as const;

function minutesLabel(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} мин`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function percentLabel(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");

  const params = await searchParams;
  const periodDays = params.period === "30" ? 30 : 7;
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const kyiv = kyivParts(now);
  const todayStart = kyivWallToUtc(kyiv.year, kyiv.month, kyiv.day, 0, 0);

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, username: true, role: true, departmentId: true, isActive: true },
  });
  if (!me?.isActive) redirect("/login");

  const scope = staffWhere({
    userId: session.userId,
    role: me.role,
    departmentId: me.departmentId,
  });
  const isStaff = isStaffRole(me.role);

  const [
    recentTickets,
    openCount,
    newToday,
    waitingCount,
    unassignedCount,
    periodTickets,
    openTickets,
    admins,
  ] = await Promise.all([
    db.ticket.findMany({
      where: scope,
      include: {
        category: true,
        assignee: { select: { name: true, username: true, email: true } },
        requester: { select: { name: true, username: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.ticket.count({ where: { ...scope, status: { in: [...OPEN_STATUSES] } } }),
    db.ticket.count({ where: { ...scope, createdAt: { gte: todayStart } } }),
    db.ticket.count({ where: { ...scope, status: "WAITING_FOR_USER" } }),
    isStaff
      ? db.ticket.count({
          where: { ...scope, status: { in: [...OPEN_STATUSES] }, assigneeId: null },
        })
      : Promise.resolve(0),
    isStaff
      ? db.ticket.findMany({
          where: { ...scope, createdAt: { gte: periodStart } },
          select: {
            id: true,
            createdAt: true,
            firstResponseAt: true,
            resolvedAt: true,
            breachedResponseAt: true,
            breachedResolveAt: true,
            category: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    isStaff
      ? db.ticket.findMany({
          where: { ...scope, status: { in: [...OPEN_STATUSES] } },
          select: {
            id: true,
            assignee: { select: { id: true, name: true, username: true } },
          },
        })
      : Promise.resolve([]),
    !isStaff
      ? db.user.findMany({
          where: { isActive: true, role: "ADMIN" },
          select: { id: true, name: true, username: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const responseTimes = periodTickets
    .filter((ticket) => ticket.firstResponseAt)
    .map((ticket) => durationMinutes(ticket.createdAt, ticket.firstResponseAt!));
  const resolutionTimes = periodTickets
    .filter((ticket) => ticket.resolvedAt)
    .map((ticket) => durationMinutes(ticket.createdAt, ticket.resolvedAt!));
  const resolved = periodTickets.filter((ticket) => ticket.resolvedAt);
  const breachedResolved = resolved.filter((ticket) => ticket.breachedResolveAt).length;
  const breachedPeriod = periodTickets.filter(
    (ticket) => ticket.breachedResponseAt || ticket.breachedResolveAt,
  ).length;

  const categoryCounts = new Map<string, number>();
  for (const ticket of periodTickets) {
    categoryCounts.set(ticket.category.name, (categoryCounts.get(ticket.category.name) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const load = new Map<string, { label: string; count: number }>();
  let unassignedFromList = 0;
  for (const ticket of openTickets) {
    if (!ticket.assignee) {
      unassignedFromList += 1;
      continue;
    }
    const current = load.get(ticket.assignee.id);
    load.set(ticket.assignee.id, {
      label: formatPerson(ticket.assignee.name, ticket.assignee.username),
      count: (current?.count ?? 0) + 1,
    });
  }
  const agentLoad = [...load.values()].sort((a, b) => b.count - a.count);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>{isStaff ? "Панель специалиста" : "Мои заявки"}</h1>
          <p className="muted">{formatPerson(me.name, me.username)}</p>
        </div>
        <div className="actionRow" style={{ marginBottom: 0 }}>
          <Link className="button secondary" href="/kb">База знаний</Link>
          <Link className="button secondary" href="/notifications">Уведомления</Link>
          {isStaff && <Link className="button secondary" href="/tickets">Заявки</Link>}
          {isStaff && <Link className="button secondary" href="/queue">Очередь</Link>}
          {session.role === "ADMIN" && (
            <>
              <Link className="button secondary" href="/admin/users">Сотрудники и роли</Link>
              <Link className="button secondary" href="/admin/departments">Отделы</Link>
              <Link className="button secondary" href="/admin/categories">Категории</Link>
              <Link className="button secondary" href="/admin/sla">SLA</Link>
              <Link className="button secondary" href="/admin/canned">Шаблоны</Link>
              <Link className="button secondary" href="/admin/audit">Аудит</Link>
              <Link className="button secondary" href="/admin/ad">Active Directory</Link>
              <Link className="button secondary" href="/admin/organizations">Организации</Link>
            </>
          )}
          <Link className="button" href="/tickets/new">+ Новая заявка</Link>
          <LogoutButton />
        </div>
      </header>

      <section className="grid">
        <div className="card"><b>{openCount}</b><p className="muted">Открытые</p></div>
        <div className="card"><b>{newToday}</b><p className="muted">Новые сегодня</p></div>
        <div className="card"><b>{waitingCount}</b><p className="muted">{isStaff ? "Ожидают ответа" : "Ждут вашего ответа"}</p></div>
        {isStaff && <div className="card"><b>{unassignedCount}</b><p className="muted">Без исполнителя</p></div>}
      </section>

      {isStaff && (
        <>
          <section className="section">
            <div className="top" style={{ marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>Показатели</h2>
                <p className="muted">Период определяется по дате создания заявки. Время ответа/решения — календарная длительность.</p>
              </div>
              <div className="actionRow" style={{ marginBottom: 0 }}>
                <Link className={`button ${periodDays === 7 ? "" : "secondary"}`} href="/dashboard?period=7">7 дней</Link>
                <Link className={`button ${periodDays === 30 ? "" : "secondary"}`} href="/dashboard?period=30">30 дней</Link>
              </div>
            </div>
            <div className="grid">
              <div className="card"><b>{periodTickets.length}</b><p className="muted">Создано за {periodDays} дней</p></div>
              <div className="card"><b className={breachedPeriod ? "late" : undefined}>{breachedPeriod}</b><p className="muted">С просрочкой SLA</p></div>
              <div className="card"><b>{minutesLabel(average(responseTimes))}</b><p className="muted">Средний первый ответ</p></div>
              <div className="card"><b>{minutesLabel(median(responseTimes))}</b><p className="muted">Медиана первого ответа</p></div>
              <div className="card"><b>{minutesLabel(average(resolutionTimes))}</b><p className="muted">Среднее решение</p></div>
              <div className="card"><b>{minutesLabel(median(resolutionTimes))}</b><p className="muted">Медиана решения</p></div>
              <div className="card"><b>{percentLabel(compliance(resolved.length, breachedResolved))}</b><p className="muted">Решено в SLA</p></div>
              <div className="card"><b>{unassignedFromList}</b><p className="muted">Открытых без исполнителя</p></div>
            </div>
          </section>

          <section className="metricColumns section">
            <article className="card">
              <h2>Топ категорий</h2>
              {topCategories.length ? (
                <ol className="metricList">
                  {topCategories.map(([name, count]) => <li key={name}><span>{name}</span><b>{count}</b></li>)}
                </ol>
              ) : <p className="muted">Нет данных за период.</p>}
            </article>
            <article className="card">
              <h2>Загрузка специалистов</h2>
              {agentLoad.length ? (
                <ol className="metricList">
                  {agentLoad.map((agent) => <li key={agent.label}><span>{agent.label}</span><b>{agent.count}</b></li>)}
                </ol>
              ) : <p className="muted">Нет назначенных открытых заявок.</p>}
            </article>
          </section>
        </>
      )}

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
            {recentTickets.length === 0 ? (
              <tr><td colSpan={isStaff ? 8 : 6} className="muted">{isStaff ? "Заявок пока нет." : "У вас пока нет заявок. Создайте первую."}</td></tr>
            ) : recentTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td><Link href={`/tickets/${ticket.id}`}>HD-{ticket.number}</Link></td>
                <td>{ticket.subject}</td>
                {isStaff && <td>{formatPerson(ticket.requester.name, ticket.requester.username)}</td>}
                <td>{ticket.category.name}</td>
                {isStaff && <td>{directionLabel[ticket.direction]}</td>}
                <td>{priorityLabel[ticket.priority]}</td>
                <td>{statusLabel[ticket.status]}</td>
                <td>
                  {ticket.assignee
                    ? <>
                        {formatPerson(ticket.assignee.name, ticket.assignee.username)}
                        {!isStaff && ticket.assignee.email ? <><br /><a href={`mailto:${ticket.assignee.email}`} className="muted">{ticket.assignee.email}</a></> : null}
                      </>
                    : <span className="muted">Ещё не назначен</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
