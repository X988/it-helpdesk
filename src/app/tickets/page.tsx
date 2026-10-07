import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, Priority, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { staffWhere } from "@/lib/ticket-access";
import { isStaffRole, STAFF_ROLES } from "@/lib/roles";
import { formatPerson, priorityLabel, statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "CANCELLED"];
const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/tickets?${next.toString()}`;
}

export default async function TicketsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  const paramsRaw = await searchParams;
  const q = one(paramsRaw.q)?.trim() ?? "";
  const status = one(paramsRaw.status);
  const priority = one(paramsRaw.priority);
  const categoryId = one(paramsRaw.categoryId) ?? "";
  const departmentId = one(paramsRaw.departmentId) ?? "";
  const assigneeId = one(paramsRaw.assigneeId) ?? "";
  const breached = one(paramsRaw.breached) === "1";
  const mine = one(paramsRaw.mine) === "1";
  const unassigned = one(paramsRaw.unassigned) === "1";
  const sort = one(paramsRaw.sort) ?? "updated_desc";
  const page = Math.max(1, Number(one(paramsRaw.page) || 1) || 1);
  const pageSize = 25;
  const staff = isStaffRole(session.role);

  const where: Prisma.TicketWhereInput = { ...staffWhere(session) };
  if (status && STATUSES.includes(status as TicketStatus)) where.status = status as TicketStatus;
  if (priority && PRIORITIES.includes(priority as Priority)) where.priority = priority as Priority;
  if (categoryId) where.categoryId = categoryId;
  if (staff && departmentId) where.departmentId = departmentId;
  if (staff && assigneeId) where.assigneeId = assigneeId;
  if (staff && mine) where.assigneeId = session.userId;
  if (staff && unassigned) where.assigneeId = null;

  const and: Prisma.TicketWhereInput[] = [];
  if (breached) and.push({ OR: [{ breachedResponseAt: { not: null } }, { breachedResolveAt: { not: null } }] });
  if (q) {
    const number = Number(q.replace(/^HD-/i, ""));
    and.push({
      OR: [
        ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
        { subject: { contains: q, mode: "insensitive" } },
        { requester: { name: { contains: q, mode: "insensitive" } } },
        { requester: { username: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.TicketOrderByWithRelationInput =
    sort === "created_asc" ? { createdAt: "asc" } :
    sort === "created_desc" ? { createdAt: "desc" } :
    sort === "number_desc" ? { number: "desc" } :
    { updatedAt: "desc" };

  const [tickets, total, categories, departments, agents] = await Promise.all([
    db.ticket.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        requester: { select: { name: true, username: true } },
        assignee: { select: { id: true, name: true, username: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.ticket.count({ where }),
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    staff ? db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    staff ? db.user.findMany({ where: { isActive: true, role: { in: STAFF_ROLES } }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true } }) : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(paramsRaw)) {
    const v = one(value);
    if (v && key !== "page") urlParams.set(key, v);
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>{staff ? "Заявки" : "Мои заявки"}</h1>
          <p className="muted">Найдено: {total}</p>
        </div>
        <div className="actionRow">
          {staff && <Link className="button secondary" href="/queue">Канбан</Link>}
          <Link className="button" href="/tickets/new">+ Новая заявка</Link>
          <Link className="button secondary" href="/dashboard">Панель</Link>
        </div>
      </header>

      <form className="card filterBar" method="get">
        <input name="q" defaultValue={q} placeholder="Номер, тема или автор" />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">Все статусы</option>
          {STATUSES.map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}
        </select>
        <select name="priority" defaultValue={priority ?? ""}>
          <option value="">Все приоритеты</option>
          {PRIORITIES.map((value) => <option key={value} value={value}>{priorityLabel[value]}</option>)}
        </select>
        <select name="categoryId" defaultValue={categoryId}>
          <option value="">Все категории</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        {staff && (
          <>
            <select name="departmentId" defaultValue={departmentId}>
              <option value="">Все отделы</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <select name="assigneeId" defaultValue={assigneeId}>
              <option value="">Все исполнители</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{formatPerson(agent.name, agent.username)}</option>)}
            </select>
            <label className="check"><input name="mine" value="1" type="checkbox" defaultChecked={mine} /> Только мои</label>
            <label className="check"><input name="unassigned" value="1" type="checkbox" defaultChecked={unassigned} /> Без исполнителя</label>
          </>
        )}
        <label className="check"><input name="breached" value="1" type="checkbox" defaultChecked={breached} /> Просроченные</label>
        <select name="sort" defaultValue={sort}>
          <option value="updated_desc">Сначала обновлённые</option>
          <option value="created_desc">Сначала новые</option>
          <option value="created_asc">Сначала старые</option>
          <option value="number_desc">По номеру ↓</option>
        </select>
        <button type="submit">Применить</button>
        <Link className="button secondary" href="/tickets">Сбросить</Link>
      </form>

      <section className="card tableCard ticketsTable">
        <table>
          <thead>
            <tr>
              <th>Номер</th><th>Тема</th><th>Приоритет</th><th>Статус</th><th>Категория</th>
              {staff && <th>Автор</th>}{staff && <th>Отдел</th>}<th>Исполнитель</th><th>SLA</th><th>Обновлена</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr><td colSpan={staff ? 10 : 7} className="muted">По выбранным условиям заявок нет.</td></tr>
            ) : tickets.map((ticket) => {
              const breachedNow = Boolean(ticket.breachedResponseAt || ticket.breachedResolveAt);
              const due = ticket.firstResponseAt ? ticket.slaResolveDue : ticket.slaResponseDue;
              return (
                <tr key={ticket.id}>
                  <td data-label="Номер"><Link href={`/tickets/${ticket.id}`}>HD-{ticket.number}</Link></td>
                  <td data-label="Тема">{ticket.subject}</td>
                  <td data-label="Приоритет">{priorityLabel[ticket.priority]}</td>
                  <td data-label="Статус">{statusLabel[ticket.status]}</td>
                  <td data-label="Категория">{ticket.category.name}</td>
                  {staff && <td data-label="Автор">{formatPerson(ticket.requester.name, ticket.requester.username)}</td>}
                  {staff && <td data-label="Отдел">{ticket.department?.name ?? "—"}</td>}
                  <td data-label="Исполнитель">{ticket.assignee ? formatPerson(ticket.assignee.name, ticket.assignee.username) : "—"}</td>
                  <td data-label="SLA" className={breachedNow ? "late" : undefined}>
                    {breachedNow ? "Просрочен" : due ? due.toLocaleString("ru-RU") : "—"}
                  </td>
                  <td data-label="Обновлена">{ticket.updatedAt.toLocaleString("ru-RU")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <nav className="pager" aria-label="Пагинация">
        {page > 1 ? <Link className="button secondary" href={pageHref(urlParams, page - 1)}>← Назад</Link> : <span />}
        <span className="muted">Страница {page} из {totalPages}</span>
        {page < totalPages ? <Link className="button secondary" href={pageHref(urlParams, page + 1)}>Далее →</Link> : <span />}
      </nav>
    </main>
  );
}
