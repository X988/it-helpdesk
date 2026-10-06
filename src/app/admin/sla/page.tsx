import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { priorityLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SlaAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");
  const policies = await db.slaPolicy.findMany({ orderBy: { priority: "asc" } });
  return (
    <main className="shell">
      <h1>SLA</h1>
      <p className="muted">Новые заявки берут текущую версию. Уже созданные хранят свой снимок.</p>
      <section className="card tableCard">
        <table>
          <thead>
            <tr><th>Приоритет</th><th>Реакция, мин</th><th>Решение, мин</th><th>Календарь</th><th>Версия</th></tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>{priorityLabel[policy.priority]}</td>
                <td>{policy.responseMinutes}</td>
                <td>{policy.resolveMinutes}</td>
                <td>{policy.calendarMode === "BUSINESS_TIME" ? "Рабочее время" : "24/7"}</td>
                <td>{policy.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
