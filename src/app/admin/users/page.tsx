import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { syntheticEmail } from "@/lib/domain-login";
import { formatPerson, roleLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["USER", "TECHNICIAN", "PROGRAMMER", "ADMIN"];

function asRole(value: string): Role | null {
  return ROLES.includes(value as Role) ? (value as Role) : null;
}

async function departmentById(departmentId: string) {
  if (!departmentId) return null;
  return db.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, name: true },
  });
}

async function saveUser(formData: FormData) {
  "use server";
  const actor = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") || "");
  const role = asRole(String(formData.get("role") || ""));
  const departmentId = String(formData.get("departmentId") || "");
  const isActive = formData.get("isActive") === "on";
  if (!id || !role) return;
  if (id === actor.userId && (role !== "ADMIN" || !isActive)) return;

  const department = await departmentById(departmentId);
  await db.user.update({
    where: { id },
    data: {
      role,
      isActive: id === actor.userId ? true : isActive,
      departmentId: department?.id ?? null,
      department: department?.name ?? null,
    },
  });
  revalidatePath("/admin/users");
}

async function addDepartment(formData: FormData) {
  "use server";
  await requireRole(["ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  if (!name || name.length > 120) return;
  const existing = await db.department.findFirst({ where: { name }, select: { id: true } });
  if (!existing) await db.department.create({ data: { name, source: "MANUAL" } });
  revalidatePath("/admin/users");
}

async function addUser(formData: FormData) {
  "use server";
  await requireRole(["ADMIN"]);
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim() || username;
  const role = asRole(String(formData.get("role") || "")) ?? "USER";
  const department = await departmentById(String(formData.get("departmentId") || ""));
  if (!/^[a-z0-9._-]{1,64}$/.test(username)) return;

  const domain = (process.env.LDAP_DOMAIN || "local").toLowerCase();
  const email = syntheticEmail(username, domain);
  const existing = await db.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });
  const data = {
    name,
    username,
    role,
    isActive: true,
    departmentId: department?.id ?? null,
    department: department?.name ?? null,
  };
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data });
  } else {
    await db.user.create({
      data: {
        ...data,
        email,
        passwordHash: await bcrypt.hash(`manual:${username}:${Date.now()}`, 12),
      },
    });
  }
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
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        departmentId: true,
        department: true,
      },
    }),
    db.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, source: true },
    }),
  ]);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Сотрудники и роли</h1>
          <p className="muted">
            Раздел — это отдел. Роль: пользователь, техподдержка, программист или администратор.
            Учётную запись можно создать вручную или дождаться входа через AD: роль при этом сохранится.
          </p>
        </div>
        <Link className="button secondary" href="/dashboard">На панель</Link>
      </header>

      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Разделы</h2>
        {departments.length === 0 ? <p className="muted">Разделов пока нет.</p> : (
          <ul className="contactList">
            {departments.map((department) => (
              <li key={department.id}>
                <b>{department.name}</b>
                <span className="muted"> · {department.source === "AD" ? "из AD" : "вручную"}</span>
              </li>
            ))}
          </ul>
        )}
        <form action={addDepartment} className="actionRow" style={{ marginTop: 16 }}>
          <input name="name" required maxLength={120} placeholder="Название раздела" />
          <button type="submit">Добавить раздел</button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Новая учётная запись</h2>
        <form action={addUser} className="ticketForm">
          <label>
            Логин
            <input name="username" required placeholder="ivanov" autoCapitalize="none" />
          </label>
          <label>
            Имя
            <input name="name" placeholder="Иван Иванов" />
          </label>
          <label>
            Роль
            <select name="role" defaultValue="USER">
              {ROLES.map((role) => (
                <option key={role} value={role}>{roleLabel[role]}</option>
              ))}
            </select>
          </label>
          <label>
            Раздел
            <select name="departmentId" defaultValue="">
              <option value="">Не задан</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <button type="submit">Добавить</button>
        </form>
      </section>

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Учётная запись</th>
              <th>Роль</th>
              <th>Раздел</th>
              <th>Активен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5}>Пока никого нет. Добавьте учётку выше или попросите сотрудника войти через AD.</td></tr>
            ) : users.map((user) => (
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
                  {!user.departmentId && user.department ? <div className="muted">{user.department}</div> : null}
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
      <p className="muted">Новая роль начинает действовать после повторного входа. Пароль доменной учётки по-прежнему проверяет AD.</p>
    </main>
  );
}
