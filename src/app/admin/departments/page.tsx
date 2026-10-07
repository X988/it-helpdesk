import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function addDepartment(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (name.length < 2 || name.length > 120) return;
  const exists = await db.department.findFirst({ where: { name }, select: { id: true } });
  if (exists) return;
  const department = await db.department.create({
    data: { name, description, source: "MANUAL" },
  });
  await db.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "DEPARTMENT_CREATED",
      entityType: "Department",
      entityId: department.id,
      metadata: { before: {}, after: { name, description, source: "MANUAL" } },
    },
  });
  revalidatePath("/admin/departments");
}

async function saveDepartment(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") || "");
  const current = await db.department.findUnique({ where: { id } });
  if (!current) return;
  const requestedName = String(formData.get("name") || "").trim();
  const name = current.source === "AD" ? current.name : requestedName;
  if (name.length < 2 || name.length > 120) return;
  const description = String(formData.get("description") || "").trim() || null;
  const isActive = formData.get("isActive") === "on";
  await db.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { name, description, isActive } });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "DEPARTMENT_UPDATED",
        entityType: "Department",
        entityId: id,
        metadata: {
          before: { name: current.name, description: current.description, isActive: current.isActive },
          after: { name, description, isActive },
        },
      },
    });
  });
  revalidatePath("/admin/departments");
}

export default async function DepartmentsAdminPage() {
  try { await requireRole(["ADMIN"]); } catch { redirect("/dashboard"); }

  const departments = await db.department.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true, categories: true, tickets: true } } },
  });

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">АДМИНИСТРИРОВАНИЕ</p>
          <h1>Отделы</h1>
          <p className="muted">AD-отделы связаны с OU и не переименовываются вручную. Ручные отделы можно редактировать.</p>
        </div>
        <Link className="button secondary" href="/dashboard">На панель</Link>
      </header>

      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Добавить отдел</h2>
        <form action={addDepartment} className="ticketForm">
          <label>Название<input name="name" required minLength={2} maxLength={120} /></label>
          <label>Описание<input name="description" maxLength={300} /></label>
          <button type="submit">Добавить</button>
        </form>
      </section>

      <section className="card tableCard">
        <table>
          <thead><tr><th>Отдел</th><th>Источник / OU</th><th>Использование</th><th>Активен</th><th></th></tr></thead>
          <tbody>
            {departments.map((department) => (
              <tr key={department.id}>
                <td>
                  <form id={`department-${department.id}`} action={saveDepartment} />
                  <input form={`department-${department.id}`} type="hidden" name="id" value={department.id} />
                  <input form={`department-${department.id}`} name="name" defaultValue={department.name} disabled={department.source === "AD"} />
                  <input form={`department-${department.id}`} name="description" defaultValue={department.description ?? ""} placeholder="Описание" />
                </td>
                <td>
                  <b>{department.source === "AD" ? "Active Directory" : "Вручную"}</b>
                  <div className="muted">{department.adOuDn ?? "—"}</div>
                </td>
                <td className="muted">
                  Пользователи: {department._count.users}<br />
                  Категории: {department._count.categories}<br />
                  Заявки: {department._count.tickets}
                </td>
                <td><input form={`department-${department.id}`} name="isActive" type="checkbox" defaultChecked={department.isActive} /></td>
                <td><button form={`department-${department.id}`} type="submit">Сохранить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
