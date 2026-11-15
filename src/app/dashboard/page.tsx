import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import AdminNav from "@/components/AdminNav";
import SupportContacts from "@/components/SupportContacts";
import { formatPerson, priorityLabel, statusLabel, directionLabel } from "@/lib/labels";
import {
  DIRECTIONS,
  PAGE_SIZE,
  PRIORITIES,
  TICKET_STATUSES,
  buildTicketWhere,
  filtersToQuery,
  hasActiveFilters,
  parseTicketFilters,
} from "@/lib/ticket-filters";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  const isStaff = s.role === "ADMIN" || s.role === "TECHNICIAN";
  const filters = parseTicketFilters(await searchParams);
  const scope = isStaff ? {} : { requesterId: s.userId };
  const where = buildTicketWhere(filters, { userId: s.userId, isStaff });

  const [me, total, newCount, progress, waiting, mine, categories, staff, admins] = await Promise.all([
    db.user.findUnique({ where: { id: s.userId }, select: { name: true, username: true } }),
    db.ticket.count({ where }),
    db.ticket.count({ where: { ...scope, status: "NEW" } }),
    db.ticket.count({ where: { ...scope, status: "IN_PROGRESS" } }),
    db.ticket.count({ where: { ...scope, status: "WAITING_FOR_USER" } }),
    isStaff
      ? db.ticket.count({
          where: { assigneeId: s.userId, status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_USER"] } },
        })
      : Promise.resolve(0),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    isStaff
      ? db.user.findMany({
          where: { isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] } },
          select: { id: true, name: true, username: true },
          orderBy: { name: "asc" },
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

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const tickets = await db.ticket.findMany({
    where,
    include: {
      category: true,
      assignee: { select: { name: true, username: true, email: true } },
      requester: { select: { name: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const filtered = hasActiveFilters(filters);
  const cols = isStaff ? 9 : 6;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>{isStaff ? "Панель специалиста" : "Мои заявки"}</h1>
          <p className="muted">{formatPerson(me?.name, me?.username)}</p>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>
      {s.role === "ADMIN" && <AdminNav />}
      <div className="actionRow">
        <Link className="button" href="/tickets/new">
          + Новая заявка
        </Link>
      </div>

      <section className="grid">
        <Link className="card cardLink" href={`/dashboard${filtersToQuery({ status: "NEW" })}`}>
          <b>{newCount}</b>
          <p className="muted">Новые</p>
        </Link>
        <Link className="card cardLink" href={`/dashboard${filtersToQuery({ status: "IN_PROGRESS" })}`}>
          <b>{progress}</b>
          <p className="muted">В работе</p>
        </Link>
        <Link className="card cardLink" href={`/dashboard${filtersToQuery({ status: "WAITING_FOR_USER" })}`}>
          <b>{waiting}</b>
          <p className="muted">{isStaff ? "Ожидают ответа" : "Ждут вашего ответа"}</p>
        </Link>
        {isStaff && (
          <Link className="card cardLink" href={`/dashboard${filtersToQuery({ status: "open", assignee: "me" })}`}>
            <b>{mine}</b>
            <p className="muted">Мои открытые</p>
          </Link>
        )}
      </section>

      {!isStaff && (
        <section className="section">
          <SupportContacts contacts={admins} title="Контакты администраторов IT" />
        </section>
      )}

      <form className="card filters section" method="get" action="/dashboard">
        <label className="filterSearch">
          Поиск
          <input
            name="q"
            defaultValue={filters.q}
            placeholder={isStaff ? "Номер (HD-15), тема, текст, автор" : "Номер (HD-15), тема или текст"}
            maxLength={200}
          />
        </label>
        <label>
          Статус
          <select name="status" defaultValue={filters.status}>
            <option value="">Все</option>
            <option value="open">Открытые</option>
            {TICKET_STATUSES.map((v) => (
              <option key={v} value={v}>
                {statusLabel[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Приоритет
          <select name="priority" defaultValue={filters.priority}>
            <option value="">Любой</option>
            {PRIORITIES.map((v) => (
              <option key={v} value={v}>
                {priorityLabel[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Категория
          <select name="categoryId" defaultValue={filters.categoryId}>
            <option value="">Любая</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {isStaff && (
          <>
            <label>
              Направление
              <select name="direction" defaultValue={filters.direction}>
                <option value="">Любое</option>
                {DIRECTIONS.map((v) => (
                  <option key={v} value={v}>
                    {directionLabel[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Специалист
              <select name="assignee" defaultValue={filters.assignee}>
                <option value="">Любой</option>
                <option value="me">Я</option>
                <option value="none">Не назначен</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {formatPerson(u.name, u.username)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="filterButtons">
          <button type="submit">Найти</button>
          {filtered && (
            <Link className="button secondary" href="/dashboard">
              Сбросить
            </Link>
          )}
        </div>
      </form>

      <p className="muted section">
        {filtered ? "Найдено" : "Всего заявок"}: {total}
        {pages > 1 && ` · страница ${page} из ${pages}`}
      </p>

      <section className="card tableCard" style={{ marginTop: 8 }}>
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
              {isStaff && <th>Создана</th>}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={cols} className="muted">
                  {filtered
                    ? "По заданным условиям ничего не найдено."
                    : isStaff
                      ? "Заявок пока нет."
                      : "У вас пока нет заявок. Создайте первую."}
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">
                    <Link href={`/tickets/${t.id}`}>HD-{t.number}</Link>
                  </td>
                  <td>
                    <Link href={`/tickets/${t.id}`} className="plainLink">
                      {t.subject}
                    </Link>
                  </td>
                  {isStaff && <td>{formatPerson(t.requester.name, t.requester.username)}</td>}
                  <td>{t.category.name}</td>
                  {isStaff && <td>{directionLabel[t.direction]}</td>}
                  <td>
                    <span className={`pill prio-${t.priority}`}>{priorityLabel[t.priority]}</span>
                  </td>
                  <td>
                    <span className={`pill st-${t.status}`}>{statusLabel[t.status]}</span>
                  </td>
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
                  {isStaff && <td className="muted nowrap">{t.createdAt.toLocaleDateString("uk-UA")}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {pages > 1 && (
        <nav className="pager" aria-label="Страницы">
          {page > 1 ? (
            <Link className="button secondary" href={`/dashboard${filtersToQuery({ ...filters, page: page - 1 })}`}>
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link className="button secondary" href={`/dashboard${filtersToQuery({ ...filters, page: page + 1 })}`}>
              Вперёд →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
