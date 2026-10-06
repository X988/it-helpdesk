import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffWhere } from "@/lib/ticket-access";
import { priorityLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const columns = [
  { status: "NEW", title: "Новые" },
  { status: "IN_PROGRESS", title: "В работе" },
  { status: "WAITING_FOR_USER", title: "Ожидание" },
  { status: "RESOLVED", title: "Решено" },
] as const;

export default async function QueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "USER") redirect("/dashboard");
  const actor = await db.user.findUnique({
    where: { id: session.userId },
    select: { departmentId: true, role: true, isActive: true },
  });
  if (!actor?.isActive) redirect("/login");
  const tickets = await db.ticket.findMany({
    where: {
      ...staffWhere({ userId: session.userId, role: actor.role, departmentId: actor.departmentId }),
      status: { in: columns.map((column) => column.status) },
    },
    select: {
      id: true,
      number: true,
      subject: true,
      priority: true,
      status: true,
      createdAt: true,
      breachedResolveAt: true,
      assignee: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">ОЧЕРЕДЬ</p>
          <h1>Канбан</h1>
        </div>
        <Link className="button secondary" href="/dashboard">Таблица</Link>
      </header>
      <section className="grid">
        {columns.map((column) => (
          <div key={column.status} className="card">
            <h2>{column.title}</h2>
            {tickets.filter((ticket) => ticket.status === column.status).map((ticket) => (
              <p key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`}>HD-{ticket.number}</Link>
                <br />
                {ticket.subject}
                <br />
                <span className={ticket.breachedResolveAt ? "error" : "muted"}>
                  {priorityLabel[ticket.priority]}
                  {ticket.assignee ? ` · ${ticket.assignee.name}` : " · не назначен"}
                </span>
              </p>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
