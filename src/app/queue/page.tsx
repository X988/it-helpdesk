import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { staffWhere } from "@/lib/ticket-access";
import { priorityLabel } from "@/lib/labels";
import QueueBoard from "./QueueBoard";

export const dynamic = "force-dynamic";

const queueStatuses = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED"] as const;

export default async function QueuePage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role === "USER") redirect("/dashboard");

  const now = new Date();
  const tickets = await db.ticket.findMany({
    where: {
      ...staffWhere(session),
      status: { in: [...queueStatuses] },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      priority: true,
      status: true,
      createdAt: true,
      firstResponseAt: true,
      slaResponseDue: true,
      slaResolveDue: true,
      breachedResponseAt: true,
      breachedResolveAt: true,
      workMinutes: true,
      assignee: { select: { name: true, username: true } },
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });

  const serialized = tickets.map((ticket) => {
    const due = ticket.firstResponseAt ? ticket.slaResolveDue : ticket.slaResponseDue;
    const breached = Boolean(ticket.breachedResponseAt || ticket.breachedResolveAt);
    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      priorityLabel: priorityLabel[ticket.priority],
      status: ticket.status,
      ageMinutes: Math.max(0, Math.floor((now.getTime() - ticket.createdAt.getTime()) / 60_000)),
      assignee: ticket.assignee ? ticket.assignee.name || ticket.assignee.username : null,
      breached,
      slaLabel: breached ? "Просрочен" : due ? due.toLocaleString("ru-RU") : "—",
      workMinutes: ticket.workMinutes,
    };
  });

  return (
    <main className="shell wideShell">
      <header className="top">
        <div>
          <p className="muted">ОЧЕРЕДЬ</p>
          <h1>Канбан</h1>
          <p className="muted">Изменения проходят через те же server-side переходы, SLA и RBAC, что и карточка заявки.</p>
        </div>
        <div className="actionRow">
          <Link className="button secondary" href="/tickets">Таблица</Link>
          <Link className="button secondary" href="/dashboard">Панель</Link>
        </div>
      </header>
      <QueueBoard tickets={serialized} />
    </main>
  );
}
