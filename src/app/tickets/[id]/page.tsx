import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";
import { isStaffRole } from "@/lib/roles";
import TicketActions from "./TicketActions";
import LogoutButton from "@/components/LogoutButton";
import SupportContacts from "@/components/SupportContacts";
import {
  formatOrganization,
  formatPerson,
  formatWorkTime,
  priorityLabel,
  statusLabel,
  directionLabel,
  roleLabel,
} from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await db.ticket.findUnique({ where: { id }, select: { number: true, subject: true } });
  return { title: ticket ? `HD-${ticket.number} · ${ticket.subject}` : "Заявка" };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const actor = await db.user.findUnique({
    where: { id: s.userId },
    select: { isActive: true, role: true, departmentId: true },
  });
  if (!actor?.isActive) redirect("/login");
  const { id } = await params;
  const isStaff = isStaffRole(actor.role);
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
      assignee: { select: { id: true, name: true, username: true, email: true } },
      attachments: true,
      messages: {
        where: isStaff ? {} : { visibility: "PUBLIC" },
        include: { author: { select: { id: true, name: true, username: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!t || !canReadTicket(actor.role, s.userId, t, actor.departmentId)) notFound();
  const manage = isStaff;
  const org = t.organization ?? t.requester.organization;

  const cannedResponses = isStaff
    ? await db.cannedResponse.findMany({
        where: {
          isActive: true,
          OR: [{ categoryId: null }, { categoryId: t.categoryId }],
        },
        orderBy: { title: "asc" },
        select: { id: true, title: true, body: true },
        take: 40,
      })
    : [];

  const admins = !isStaff
    ? await db.user.findMany({
        where: { isActive: true, role: "ADMIN" },
        select: { id: true, name: true, username: true, email: true, role: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <main className="shell">
      <div className="top" style={{ marginBottom: 12 }}>
        <Link href="/dashboard" className="muted">
          ← {isStaff ? "К панели" : "К моим заявкам"}
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
          <article className="card section chatCard">
            <h2>{isStaff ? "Переписка / чат" : "Чат с поддержкой"}</h2>
            <p className="muted" style={{ marginTop: -8 }}>
              {isStaff
                ? "Публичные сообщения видит пользователь. Внутренние заметки — только IT."
                : "Пишите сюда вопросы специалисту. Ответы появятся в этом чате."}
            </p>
            <div className="chat">
              {t.messages.length === 0 ? (
                <p className="muted">Сообщений пока нет. Напишите первое ниже.</p>
              ) : (
                t.messages.map((m) => {
                  const mine = m.author.id === s.userId;
                  return (
                    <div
                      className={`chatBubble ${mine ? "mine" : "theirs"} ${m.visibility === "INTERNAL" ? "internal" : ""}`}
                      key={m.id}
                    >
                      <div className="chatMeta">
                        <b>{formatPerson(m.author.name, m.author.username)}</b>
                        <span className="muted">
                          {" "}
                          {roleLabel[m.author.role]} · {m.createdAt.toLocaleString("uk-UA")}
                        </span>
                        {m.visibility === "INTERNAL" && <small> ВНУТР.</small>}
                      </div>
                      <p className="pre">{m.body}</p>
                    </div>
                  );
                })
              )}
            </div>
            <TicketActions
              id={t.id}
              canManage={manage}
              currentStatus={t.status}
              currentPriority={t.priority}
              currentAssigneeId={t.assignee?.id ?? null}
              currentWorkMinutes={t.workMinutes}
              cannedResponses={cannedResponses}
              chatMode={!isStaff}
            />
          </article>
        </section>
        <aside>
          <div className="card">
            <h3>Детали</h3>
            <p>
              <b>Статус:</b> {statusLabel[t.status]}
            </p>
            <p>
              <b>Приоритет:</b> {priorityLabel[t.priority]}
            </p>
            {isStaff && (
              <p>
                <b>Направление:</b> {directionLabel[t.direction]}
              </p>
            )}
            {isStaff && (
              <p>
                <b>Автор:</b> {formatPerson(t.requester.name, t.requester.username)}
              </p>
            )}
            {isStaff && (
              <p>
                <b>Отдел:</b> {t.requester.department ?? "—"}
              </p>
            )}
            {isStaff && (
              <p>
                <b>Организация:</b> {formatOrganization(org?.name, org?.domain)}
              </p>
            )}
            <p>
              <b>SLA:</b>{" "}
              <span className={t.breachedResponseAt || t.breachedResolveAt ? "late" : undefined}>
                {t.breachedResponseAt || t.breachedResolveAt
                  ? "Просрочен"
                  : (t.firstResponseAt ? t.slaResolveDue : t.slaResponseDue)?.toLocaleString("ru-RU") ?? "—"}
              </span>
            </p>
            <p>
              <b>{isStaff ? "Специалист" : "Кто решает"}:</b>{" "}
              {t.assignee ? formatPerson(t.assignee.name, t.assignee.username) : "Ещё не назначен"}
            </p>
            {!isStaff && t.assignee?.email && (
              <p>
                <b>Email специалиста:</b>{" "}
                <a href={`mailto:${t.assignee.email}`}>{t.assignee.email}</a>
              </p>
            )}
            {isStaff && (
              <p>
                <b>Затрачено:</b> {formatWorkTime(t.workMinutes)}
              </p>
            )}
          </div>

          {!isStaff && (
            <div className="section">
              <SupportContacts contacts={admins} title="Контакты администраторов" />
            </div>
          )}

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
            <h3>История статусов</h3>
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
