import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { categoryAdminSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function payload(formData: FormData) {
  return categoryAdminSchema.safeParse({
    name: String(formData.get("name") || ""),
    ownerDepartmentId: String(formData.get("ownerDepartmentId") || "") || null,
    isActive: formData.get("isActive") === "on",
    isHidden: formData.get("isHidden") === "on",
    sortOrder: Number(formData.get("sortOrder") || 0),
  });
}

async function addCategory(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const parsed = payload(formData);
  if (!parsed.success) return;
  const category = await db.category.create({ data: parsed.data });
  await db.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "CATEGORY_CREATED",
      entityType: "Category",
      entityId: category.id,
      metadata: { before: {}, after: parsed.data },
    },
  });
  revalidatePath("/admin/categories");
}

async function saveCategory(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") || "");
  const parsed = payload(formData);
  if (!parsed.success) return;
  const current = await db.category.findUnique({ where: { id } });
  if (!current) return;
  await db.$transaction(async (tx) => {
    await tx.category.update({ where: { id }, data: parsed.data });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: id,
        metadata: {
          before: {
            name: current.name,
            ownerDepartmentId: current.ownerDepartmentId,
            isActive: current.isActive,
            isHidden: current.isHidden,
            sortOrder: current.sortOrder,
          },
          after: parsed.data,
        },
      },
    });
  });
  revalidatePath("/admin/categories");
}

export default async function CategoriesAdminPage() {
  try { await requireRole(["ADMIN"]); } catch { redirect("/dashboard"); }
  const [categories, departments] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { ownerDepartment: { select: { id: true, name: true } }, _count: { select: { tickets: true } } },
    }),
    db.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="shell">
      <header className="top">
        <div><p className="muted">АДМИНИСТРИРОВАНИЕ</p><h1>Категории</h1><p className="muted">Категория маршрутизирует новую заявку в отдел-владелец. Используемые категории не удаляются — их скрывают или деактивируют.</p></div>
        <Link className="button secondary" href="/dashboard">На панель</Link>
      </header>

      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Новая категория</h2>
        <form action={addCategory} className="ticketForm">
          <label>Название<input name="name" required minLength={2} maxLength={80} /></label>
          <label>Отдел-владелец<select name="ownerDepartmentId" defaultValue=""><option value="">Не задан</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Порядок<input name="sortOrder" type="number" min={0} defaultValue={0} /></label>
          <label><input name="isActive" type="checkbox" defaultChecked /> Активна</label>
          <label><input name="isHidden" type="checkbox" /> Скрыта от пользователей</label>
          <button type="submit">Добавить</button>
        </form>
      </section>

      <section className="card tableCard">
        <table>
          <thead><tr><th>Категория</th><th>Отдел</th><th>Порядок</th><th>Активна</th><th>Скрыта</th><th>Заявок</th><th></th></tr></thead>
          <tbody>
            {categories.map((category)=>(
              <tr key={category.id}>
                <td>
                  <form id={`category-${category.id}`} action={saveCategory} />
                  <input form={`category-${category.id}`} type="hidden" name="id" value={category.id} />
                  <input form={`category-${category.id}`} name="name" defaultValue={category.name} />
                </td>
                <td><select form={`category-${category.id}`} name="ownerDepartmentId" defaultValue={category.ownerDepartmentId ?? ""}><option value="">Не задан</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                <td><input form={`category-${category.id}`} name="sortOrder" type="number" min={0} defaultValue={category.sortOrder} /></td>
                <td><input form={`category-${category.id}`} name="isActive" type="checkbox" defaultChecked={category.isActive} /></td>
                <td><input form={`category-${category.id}`} name="isHidden" type="checkbox" defaultChecked={category.isHidden} /></td>
                <td>{category._count.tickets}</td>
                <td><button form={`category-${category.id}`} type="submit">Сохранить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
