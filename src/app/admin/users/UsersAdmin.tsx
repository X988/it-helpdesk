"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatOrganization, roleLabel } from "@/lib/labels";

type Role = "USER" | "TECHNICIAN" | "ADMIN";
type User = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  department: string | null;
  organizationId: string | null;
  telegramLinked: boolean;
  ticketCount: number;
  assignedCount: number;
};
type Org = { id: string; name: string; domain: string; isActive: boolean };
type Query = { q: string; role: string; active: string };

const ROLES: Role[] = ["USER", "TECHNICIAN", "ADMIN"];

async function fetchUsers(query: Query): Promise<User[]> {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.role) sp.set("role", query.role);
  if (query.active) sp.set("active", query.active);
  const r = await fetch(`/api/admin/users?${sp}`);
  if (!r.ok) throw new Error("load");
  return (await r.json()).users ?? [];
}

export default function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [query, setQuery] = useState<Query>({ q: "", role: "", active: "" });
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (q: Query) => {
    try {
      setUsers(await fetchUsers(q));
      setError("");
    } catch {
      setError("Не удалось загрузить пользователей");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const initial: Query = { q: "", role: "", active: "" };
    fetchUsers(initial)
      .then(setUsers)
      .catch(() => setError("Не удалось загрузить пользователей"))
      .finally(() => setLoaded(true));
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((d) => setOrgs(d.organizations ?? []))
      .catch(() => undefined);
  }, []);

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q: Query = { q: String(f.get("q") ?? ""), role: String(f.get("role") ?? ""), active: String(f.get("active") ?? "") };
    setQuery(q);
    void reload(q);
  }

  async function update(user: User, changes: Partial<Pick<User, "role" | "isActive" | "organizationId" | "department">>) {
    if (changes.isActive === false && !window.confirm(`Заблокировать ${user.name}? Пользователь не сможет войти.`)) return;
    setSavingId(user.id);
    setError("");
    const r = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    }).catch(() => null);
    setSavingId(null);
    if (!r?.ok) {
      const d = await r?.json().catch(() => null);
      setError(typeof d?.error === "string" && /[а-я]/i.test(d.error) ? d.error : "Не удалось сохранить");
      return;
    }
    await reload(query);
  }

  return (
    <div>
      <form className="card filters" onSubmit={search}>
        <label className="filterSearch">
          Поиск
          <input name="q" placeholder="Имя, логин, email, отдел" maxLength={100} />
        </label>
        <label>
          Роль
          <select name="role" defaultValue="">
            <option value="">Все</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Состояние
          <select name="active" defaultValue="">
            <option value="">Все</option>
            <option value="1">Активные</option>
            <option value="0">Заблокированные</option>
          </select>
        </label>
        <div className="filterButtons">
          <button type="submit">Найти</button>
        </div>
      </form>

      {error && <p className="error section">{error}</p>}

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Организация</th>
              <th>Отдел</th>
              <th>Заявки</th>
              <th>Telegram</th>
              <th>Доступ</th>
            </tr>
          </thead>
          <tbody>
            {loaded && users.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Никого не найдено.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const self = u.id === currentUserId;
              const busy = savingId === u.id;
              return (
                <tr key={u.id} className={u.isActive ? "" : "inactiveRow"}>
                  <td>
                    <b>{u.name}</b>
                    {self && <span className="muted"> (вы)</span>}
                    <br />
                    <span className="muted">
                      {u.username ?? "—"} · {u.email}
                    </span>
                  </td>
                  <td>
                    <select
                      aria-label={`Роль ${u.name}`}
                      value={u.role}
                      disabled={busy || self}
                      onChange={(e) => update(u, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Организация ${u.name}`}
                      value={u.organizationId ?? ""}
                      disabled={busy}
                      onChange={(e) => update(u, { organizationId: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {formatOrganization(o.name, o.domain)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.department || <span className="muted">—</span>}</td>
                  <td className="nowrap">
                    <span title="Создал">{u.ticketCount}</span>
                    {u.role !== "USER" && (
                      <span className="muted" title="Назначено">
                        {" "}
                        / {u.assignedCount}
                      </span>
                    )}
                  </td>
                  <td>{u.telegramLinked ? "Да" : <span className="muted">Нет</span>}</td>
                  <td>
                    {self ? (
                      <span className="muted">Активен</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => update(u, { isActive: !u.isActive })}
                      >
                        {u.isActive ? "Заблокировать" : "Разблокировать"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="muted section">
        «Заявки»: создано пользователем / назначено специалисту. Блокировка действует сразу: активная сессия
        завершается, уведомления в Telegram отключаются.
      </p>
    </div>
  );
}
