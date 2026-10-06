import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatPerson, roleLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["USER", "TECHNICIAN", "ADMIN"];

async function saveUser(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "");
  const departmentId = String(formData.get("departmentId") || "");
  const isActive = formData.get("isActive") === "on";
  if (!id || !ROLES.includes(role as Role)) return;
  if (id === actor.userId && (role !== "ADMIN" || !isActive)) return;

  const department = departmentId
    ? await db.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true, name: true } })
    : null;

  await db.user.update({
    where: { id },
    data: {
      role: role as Role,
      isActive: id === actor.userId ? true : isActive,
      departmentId: department?.id ?? null,
      department: department?.name ?? null,
    },
  });
  revalidatePath("/admin/users");
}

export default async function UsersAdminPage() {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect("/dashboard");
  }

  const [users, departments] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        departmentId: true,
      },
    }),
    db.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Роли</h1>
          <p className="muted">
            Пользователь создаёт заявки. Техподдержка ведёт очередь своего отдела. Администратор видит всё и назначает роли.
            Отдельной роли «программист» нет: это направление заявки «Программирование».
          </p>
        </div>
        <Link className="button secondary" href="/dashboard">На панель</Link>
      </header>
      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Роль</th>
              <th>Отдел</th>
              <th>Активен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <form id={`user-${user.id}`} action={saveUser} />
                  <input form={`user-${user.id}`} type="hidden" name="id" value={user.id} />
                  <b>{formatPerson(user.name, user.username)}</b>
                  <div className="muted">{user.email}</div>
                </td>
                <td>
                  <select form={`user-${user.id}`} name="role" defaultValue={user.role}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel[role]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select form={`user-${user.id}`} name="departmentId" defaultValue={user.departmentId ?? ""}>
                    <option value="">Не задан</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input form={`user-${user.id}`} type="checkbox" name="isActive" defaultChecked={user.isActive} />
                </td>
                <td>
                  <button form={`user-${user.id}`} type="submit">Сохранить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="muted">Человек появляется в списке только после первого входа. Новая роль действует после повторного входа.</p>
    </main>
  );
}
