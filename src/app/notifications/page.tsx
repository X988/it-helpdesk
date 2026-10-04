import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
import MarkRead from "./MarkRead";
export default async function Notifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession(); if (!session) redirect("/login");
  const raw = Number((await searchParams).page ?? 1); const page = Number.isSafeInteger(raw) && raw > 0 && raw <= 100000 ? raw : 1;
  const [notifications, total] = await Promise.all([db.notification.findMany({ where: { userId: session.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, skip: (page - 1) * 30 }), db.notification.count({ where: { userId: session.userId } })]);
  return <main id="content" className="shell"><header className="top"><h1>Уведомления</h1><MarkRead /></header><section className="card">{!notifications.length && <p className="muted">Пока нет уведомлений.</p>}{notifications.map(item => <article className="userRow" key={item.id}><p>{!item.readAt && <b>Новое · </b>}{item.text ?? "Изменение заявки"}</p><p className="muted">{formatDate(item.createdAt)}{item.ticketId && <> · <Link href={"/tickets/" + item.ticketId}>Открыть заявку</Link></>}</p></article>)}</section><nav className="pagination" aria-label="Страницы уведомлений">{page > 1 && <Link href={"/notifications?page=" + (page - 1)}>← Назад</Link>}<span>Страница {page}</span>{page * 30 < total && <Link href={"/notifications?page=" + (page + 1)}>Далее →</Link>}</nav></main>;
}
