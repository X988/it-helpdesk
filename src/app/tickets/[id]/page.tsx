import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";
import TicketActions from "./TicketActions";
import LogoutButton from "@/components/LogoutButton";
import {
  formatOrganization,
  formatPerson,
  formatWorkTime,
  priorityLabel,
  statusLabel,
  directionLabel,
  roleLabel,
} from "@/lib/labels";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const { id } = await params;
  const t = await db.ticket.findUnique({
    where: { id },
    include: {
      category: true,
      organization: { select: { name: true, domain: true } },
      requester: {
        select: {
          name: true,
          email: true,
          username: true,
          department: true,
          organization: { select: { name: true, domain: true } },
        },
      },
      assignee: { select: { id: true, name: true, username: true } },
      attachments: true,
      messages: {
        where: s.role === "USER" ? { visibility: "PUBLIC" } : {},
        include: { author: { select: { name: true, username: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!t || !canReadTicket(s.role, s.userId, t.requesterId)) notFound();
  const manage = s.role !== "USER";
  const org = t.organization ?? t.requester.organization;

  return (
    <main className="shell">
      <div className="top" style={{ marginBottom: 12 }}>
        <Link href="/dashboard" className="muted">
          ← К заявкам
        </Link>
        <LogoutButton />
      </div>
      <header className="ticketHeader">
        <div>
          <p className="muted">
            HD-{t.number} · {t.category.name}
          </p>
          <h1>{t.subject}</h1>
        </div>
        <span className="status">{statusLabel[t.status]}</span>
      </header>
      <div className="ticketLayout">
        <section>
          <article className="card">
            <h2>Описание</h2>
            <p className="pre">{t.description}</p>
          </article>
          <article className="card section">
            <h2>Переписка</h2>
            {t.messages.length === 0 ? (
              <p className="muted">Сообщений пока нет.</p>
            ) : (
              t.messages.map((m) => (
                <div className={`message ${m.visibility === "INTERNAL" ? "internal" : ""}`} key={m.id}>
                  <b>{formatPerson(m.author.name, m.author.username)}</b>
                  <span className="muted">
                    {" "}
                    {roleLabel[m.author.role]} · {m.createdAt.toLocaleString("uk-UA")}
                  </span>
                  {m.visibility === "INTERNAL" && <small> ВНУТР.</small>}
                  <p className="pre">{m.body}</p>
                </div>
              ))
            )}
            <TicketActions
              id={t.id}
              canManage={manage}
              currentStatus={t.status}
              currentAssigneeId={t.assignee?.id ?? null}
              currentWorkMinutes={t.workMinutes}
            />
          </article>
        </section>
        <aside>
          <div className="card">
            <h3>Детали</h3>
            <p>
              <b>Приоритет:</b> {priorityLabel[t.priority]}
            </p>
            <p>
              <b>Направление:</b> {directionLabel[t.direction]}
            </p>
            <p>
              <b>Автор:</b> {formatPerson(t.requester.name, t.requester.username)}
            </p>
            <p>
              <b>Отдел:</b> {t.requester.department ?? "—"}
            </p>
            <p>
              <b>Организация:</b> {formatOrganization(org?.name, org?.domain)}
            </p>
            <p>
              <b>Специалист:</b> {formatPerson(t.assignee?.name, t.assignee?.username)}
            </p>
            <p>
              <b>Затрачено:</b> {formatWorkTime(t.workMinutes)}
            </p>
          </div>
          <div className="card section">
            <h3>Файлы</h3>
            {t.attachments.length === 0 ? (
              <p className="muted">Нет файлов</p>
            ) : (
              t.attachments.map((a) => (
                <p key={a.id}>
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    {a.originalName}
                  </a>{" "}
                  <span className="muted">({Math.ceil(a.size / 1024)} KB)</span>
                </p>
              ))
            )}
          </div>
          <div className="card section">
            <h3>История</h3>
            {t.statusHistory.map((h) => (
              <p key={h.id} className="muted">
                {h.fromStatus ? statusLabel[h.fromStatus] : "—"} → {statusLabel[h.toStatus]}
                <br />
                {h.createdAt.toLocaleString("uk-UA")}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
