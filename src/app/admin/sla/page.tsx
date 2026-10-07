import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { priorityLabel } from "@/lib/labels";
import { slaPolicySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function savePolicy(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const priority = String(formData.get("priority") || "");
  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) return;
  const parsed = slaPolicySchema.safeParse({
    responseMinutes: Number(formData.get("responseMinutes")),
    resolveMinutes: Number(formData.get("resolveMinutes")),
    calendarMode: String(formData.get("calendarMode") || ""),
  });
  if (!parsed.success) return;

  const current = await db.slaPolicy.findUnique({
    where: { priority: priority as "LOW" | "NORMAL" | "HIGH" | "URGENT" },
  });
  if (!current) return;

  await db.$transaction(async (tx) => {
    await tx.slaPolicy.update({
      where: { id: current.id },
      data: { ...parsed.data, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "SLA_POLICY_UPDATED",
        entityType: "SlaPolicy",
        entityId: current.id,
        metadata: {
          before: {
            responseMinutes: current.responseMinutes,
            resolveMinutes: current.resolveMinutes,
            calendarMode: current.calendarMode,
            version: current.version,
          },
          after: { ...parsed.data, version: current.version + 1 },
        },
      },
    });
  });
  revalidatePath("/admin/sla");
}

export default async function SlaAdmin() {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  const policies = await db.slaPolicy.findMany({ orderBy: { priority: "asc" } });

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">АДМИНИСТРИРОВАНИЕ</p>
          <h1>SLA</h1>
          <p className="muted">Новые заявки получают текущую версию политики. Старые заявки сохраняют свой SLA-снимок.</p>
        </div>
        <Link className="button secondary" href="/dashboard">На панель</Link>
      </header>

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Приоритет</th>
              <th>Реакция, мин</th>
              <th>Решение, мин</th>
              <th>Календарь</th>
              <th>Версия</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>
                  <form id={`sla-${policy.id}`} action={savePolicy} />
                  <input form={`sla-${policy.id}`} type="hidden" name="priority" value={policy.priority} />
                  <b>{priorityLabel[policy.priority]}</b>
                </td>
                <td>
                  <input form={`sla-${policy.id}`} name="responseMinutes" type="number" min={1} defaultValue={policy.responseMinutes} />
                </td>
                <td>
                  <input form={`sla-${policy.id}`} name="resolveMinutes" type="number" min={1} defaultValue={policy.resolveMinutes} />
                </td>
                <td>
                  <select form={`sla-${policy.id}`} name="calendarMode" defaultValue={policy.calendarMode}>
                    <option value="BUSINESS_TIME">Рабочее время</option>
                    <option value="CALENDAR_TIME">24/7</option>
                  </select>
                </td>
                <td>{policy.version}</td>
                <td><button form={`sla-${policy.id}`} type="submit">Сохранить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
