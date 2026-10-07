import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { cannedSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function parse(formData: FormData) {
  return cannedSchema.safeParse({
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || ""),
    categoryId: String(formData.get("categoryId") || "") || null,
    isActive: formData.get("isActive") === "on",
  });
}

async function addCanned(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const parsed = parse(formData);
  if (!parsed.success) return;
  const row = await db.cannedResponse.create({ data: { ...parsed.data, createdBy: actor.userId } });
  await db.auditLog.create({ data: { actorId: actor.userId, action: "CANNED_CREATED", entityType: "CannedResponse", entityId: row.id, metadata: { before: {}, after: parsed.data } } });
  revalidatePath("/admin/canned");
}

async function saveCanned(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") || "");
  const parsed = parse(formData);
  if (!parsed.success) return;
  const current = await db.cannedResponse.findUnique({ where: { id } });
  if (!current) return;
  await db.$transaction(async (tx) => {
    await tx.cannedResponse.update({ where: { id }, data: parsed.data });
    await tx.auditLog.create({ data: { actorId: actor.userId, action: "CANNED_UPDATED", entityType: "CannedResponse", entityId: id, metadata: { before: { title: current.title, body: current.body, categoryId: current.categoryId, isActive: current.isActive }, after: parsed.data } } });
  });
  revalidatePath("/admin/canned");
}

export default async function CannedAdminPage() {
  try { await requireRole(["ADMIN"]); } catch { redirect("/dashboard"); }
  const [rows, categories] = await Promise.all([
    db.cannedResponse.findMany({ orderBy: [{ isActive: "desc" }, { title: "asc" }], include: { category: { select: { id: true, name: true } } } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <main className="shell">
      <header className="top"><div><p className="muted">АДМИНИСТРИРОВАНИЕ</p><h1>Шаблоны ответов</h1></div><Link className="button secondary" href="/dashboard">На панель</Link></header>
      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Новый шаблон</h2>
        <form action={addCanned} className="ticketForm">
          <label>Название<input name="title" required /></label>
          <label>Категория<select name="categoryId" defaultValue=""><option value="">Все категории</option>{categories.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Текст<textarea name="body" rows={5} required /></label>
          <label><input name="isActive" type="checkbox" defaultChecked /> Активен</label>
          <button type="submit">Добавить</button>
        </form>
      </section>
      <section className="grid">
        {rows.map((row)=>(
          <article className="card" key={row.id}>
            <form action={saveCanned} className="ticketForm">
              <input type="hidden" name="id" value={row.id} />
              <label>Название<input name="title" defaultValue={row.title} /></label>
              <label>Категория<select name="categoryId" defaultValue={row.categoryId ?? ""}><option value="">Все категории</option>{categories.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Текст<textarea name="body" rows={6} defaultValue={row.body} /></label>
              <label><input name="isActive" type="checkbox" defaultChecked={row.isActive} /> Активен</label>
              <button type="submit">Сохранить</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
