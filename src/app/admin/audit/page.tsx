import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatPerson } from "@/lib/labels";

export const dynamic = "force-dynamic";

type Params = Promise<{ actorId?: string; action?: string; entity?: string; entityId?: string }>;

export default async function AuditAdminPage({ searchParams }: { searchParams: Params }) {
  try { await requireRole(["ADMIN"]); } catch { redirect("/dashboard"); }
  const params = await searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  if (params.actorId) where.actorId = params.actorId;
  if (params.action) where.action = { contains: params.action, mode: "insensitive" };
  if (params.entity) where.entityType = { contains: params.entity, mode: "insensitive" };
  if (params.entityId) where.entityId = params.entityId;

  const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((id): id is string => Boolean(id)))];
  const users = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, username: true } }) : [];
  const names = new Map(users.map((user) => [user.id, formatPerson(user.name, user.username)]));

  return (
    <main className="shell">
      <header className="top"><div><p className="muted">АДМИНИСТРИРОВАНИЕ</p><h1>Аудит</h1><p className="muted">Последние 100 событий по заданным фильтрам. Журнал доступен только для чтения.</p></div><Link className="button secondary" href="/dashboard">На панель</Link></header>
      <form className="card filterBar" method="get">
        <input name="actorId" defaultValue={params.actorId ?? ""} placeholder="actorId" />
        <input name="action" defaultValue={params.action ?? ""} placeholder="Действие" />
        <input name="entity" defaultValue={params.entity ?? ""} placeholder="Сущность" />
        <input name="entityId" defaultValue={params.entityId ?? ""} placeholder="entityId" />
        <button type="submit">Фильтровать</button>
        <Link className="button secondary" href="/admin/audit">Сбросить</Link>
      </form>
      <section className="card tableCard">
        <table>
          <thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Сущность</th><th>Diff</th></tr></thead>
          <tbody>
            {logs.map((log)=>(
              <tr key={log.id}>
                <td>{log.createdAt.toLocaleString("ru-RU")}</td>
                <td>{log.actorId ? names.get(log.actorId) ?? log.actorId : "Система"}</td>
                <td><b>{log.action}</b></td>
                <td>{log.entityType}<div className="muted">{log.entityId ?? "—"}</div></td>
                <td><pre className="auditDiff">{log.metadata ? JSON.stringify(log.metadata, null, 2) : "—"}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
