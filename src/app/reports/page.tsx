import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import { loadReportTickets } from "@/lib/report-query";
import { formatDay, resolveRange, summarize, type GroupRow } from "@/lib/reports";
import { directionLabel, formatWorkTime, priorityLabel, statusLabel } from "@/lib/labels";
import { PRIORITIES, TICKET_STATUSES } from "@/lib/ticket-filters";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function GroupTable({ title, rows, firstCol }: { title: string; rows: GroupRow[]; firstCol: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card tableCard reportTable">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{firstCol}</th>
            <th>Заявок</th>
            <th>Решено</th>
            <th>Затрачено</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                Нет данных
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>
                  <div className="barCell">
                    <span className="bar" style={{ width: `${Math.max(2, Math.round((r.count / max) * 120))}px` }} />
                    <span>{r.count}</span>
                  </div>
                </td>
                <td>{r.done}</td>
                <td className="nowrap">{formatWorkTime(r.workMinutes)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "USER") redirect("/dashboard");
  const sp = await searchParams;
  const { from, toDay, toExclusive } = resolveRange(one(sp.from), one(sp.to));
  const tickets = await loadReportTickets(from, toExclusive);
  const r = summarize(tickets, directionLabel);
  const fromStr = formatDay(from);
  const toStr = formatDay(toDay);
  const qs = `from=${fromStr}&to=${toStr}`;

  const now = new Date();
  const presets = [
    { label: "Этот месяц", from: new Date(now.getFullYear(), now.getMonth(), 1), to: now },
    {
      label: "Прошлый месяц",
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0),
    },
    { label: "30 дней", from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), to: now },
    { label: "Этот год", from: new Date(now.getFullYear(), 0, 1), to: now },
  ];

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Отчёты</h1>
          <p className="muted">
            Заявки, созданные с {from.toLocaleDateString("uk-UA")} по {toDay.toLocaleDateString("uk-UA")}
          </p>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>

      <form className="card filters" method="get" action="/reports">
        <label>
          С
          <input type="date" name="from" defaultValue={fromStr} required />
        </label>
        <label>
          По
          <input type="date" name="to" defaultValue={toStr} required />
        </label>
        <div className="filterButtons wide">
          <button type="submit">Показать</button>
          <a className="button secondary" href={`/api/reports/export?${qs}`} download>
            Скачать CSV
          </a>
        </div>
        <div className="presetRow">
          {presets.map((p) => (
            <Link key={p.label} href={`/reports?from=${formatDay(p.from)}&to=${formatDay(p.to)}`} className="muted">
              {p.label}
            </Link>
          ))}
        </div>
      </form>

      <section className="grid section">
        <div className="card">
          <b>{r.total}</b>
          <p className="muted">Создано</p>
        </div>
        <div className="card">
          <b>{r.done}</b>
          <p className="muted">Решено / закрыто</p>
        </div>
        <div className="card">
          <b>{r.open}</b>
          <p className="muted">Ещё открыто</p>
        </div>
        <div className="card">
          <b>{formatWorkTime(r.avgResolutionMinutes)}</b>
          <p className="muted">Среднее время решения</p>
        </div>
        <div className="card">
          <b>{formatWorkTime(r.workMinutes)}</b>
          <p className="muted">Затрачено всего</p>
        </div>
      </section>

      <div className="reportGrid section">
        <section className="card">
          <h2>По статусам</h2>
          <ul className="statList">
            {TICKET_STATUSES.map((st) => (
              <li key={st}>
                <Link href={`/dashboard?status=${st}`}>{statusLabel[st]}</Link>
                <b>{r.byStatus[st]}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>По приоритетам</h2>
          <ul className="statList">
            {PRIORITIES.map((p) => (
              <li key={p}>
                <span>{priorityLabel[p]}</span>
                <b>{r.byPriority[p]}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <GroupTable title="По специалистам" firstCol="Специалист" rows={r.byAssignee} />
      <GroupTable title="По направлениям" firstCol="Направление" rows={r.byDirection} />
      <GroupTable title="По категориям" firstCol="Категория" rows={r.byCategory} />
      <p className="muted section">
        «Затрачено» — время, указанное специалистом при решении/закрытии заявки. Отменённые заявки учитываются в
        «Создано», но не в «Решено».
      </p>
    </main>
  );
}
