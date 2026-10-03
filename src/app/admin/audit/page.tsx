import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/labels";
const actions: Record<string, string> = { TICKET_CREATED: "Создание заявки", TICKET_ASSIGNED: "Назначение специалиста", STATUS_CHANGED: "Смена статуса", PUBLIC_MESSAGE_CREATED: "Публичное сообщение", INTERNAL_MESSAGE_CREATED: "Внутренняя заметка", ATTACHMENTS_UPLOADED: "Загрузка файлов", USER_CREATED: "Создание аккаунта", USER_UPDATED: "Изменение аккаунта", CATEGORY_CREATED: "Создание категории", CATEGORY_UPDATED: "Изменение категории", TELEGRAM_LINKED: "Подключение Telegram", TELEGRAM_UNLINKED: "Отключение Telegram", BOOTSTRAP_ADMIN_CREATED: "Создание первого администратора" };
export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession(); if (!session) redirect("/login"); if (session.role !== "ADMIN") redirect("/dashboard");
  const rawPage = Number((await searchParams).page ?? 1); const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const [entries, total] = await Promise.all([db.auditLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }), db.auditLog.count()]);
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(entries.flatMap(entry => entry.actorId ? [entry.actorId] : []))] } }, select: { id: true, name: true } });
  const names = new Map(actors.map(actor => [actor.id, actor.name]));
  return <main id="content" className="shell"><h1>Журнал действий</h1><p className="muted">Изменения заявок, назначений, аккаунтов и категорий. Записи доступны только администратору.</p><section className="card tableCard"><table><caption className="srOnly">Журнал действий</caption><thead><tr><th scope="col">Дата</th><th scope="col">Автор</th><th scope="col">Действие</th><th scope="col">Объект</th><th scope="col">Данные</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{entry.actorId ? names.get(entry.actorId) ?? "Удалённый аккаунт" : "Система"}</td><td>{actions[entry.action] ?? entry.action}</td><td>{entry.entityType === "Ticket" && entry.entityId ? <Link href={"/tickets/" + entry.entityId}>Заявка</Link> : entry.entityType}</td><td className="pre">{entry.metadata ? JSON.stringify(entry.metadata) : "—"}</td></tr>)}</tbody></table></section><nav className="pagination" aria-label="Страницы журнала">{page > 1 && <Link href={"/admin/audit?page=" + (page - 1)}>← Назад</Link>}<span>Страница {page} · Записей: {total}</span>{page * 50 < total && <Link href={"/admin/audit?page=" + (page + 1)}>Далее →</Link>}</nav></main>;
}
