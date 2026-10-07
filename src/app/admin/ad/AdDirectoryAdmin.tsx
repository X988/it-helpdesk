"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Dept = {
  id: string;
  name: string;
  dn: string;
  parentDn: string | null;
  path: string;
  isAdminOu: boolean;
  userCount: number;
};

type AdUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  ouName: string | null;
  ouDn: string | null;
  isDisabled: boolean;
};

export default function AdDirectoryAdmin() {
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [users, setUsers] = useState<AdUser[]>([]);
  const [selectedOuDn, setSelectedOuDn] = useState<string>("");
  const [adminOuDn, setAdminOuDn] = useState<string>("");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [bindConfigured, setBindConfigured] = useState(false);
  const [password, setPassword] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    const r = await fetch("/api/admin/ad/settings");
    if (!r.ok) throw new Error("settings");
    const d = await r.json();
    setAdminOuDn(d.adminOuDn ?? "");
    setLastSyncAt(d.lastSyncAt ?? null);
    setBindConfigured(Boolean(d.bindConfigured));
  }, []);

  const loadDepartments = useCallback(async () => {
    const r = await fetch("/api/admin/ad/departments");
    if (!r.ok) throw new Error("departments");
    const d = await r.json();
    setDepartments(d.departments ?? []);
    setLastSyncAt(d.lastSyncAt ?? null);
  }, []);

  const loadUsers = useCallback(async (ouDn: string, query: string) => {
    const params = new URLSearchParams();
    if (ouDn) params.set("ouDn", ouDn);
    if (query) params.set("q", query);
    const r = await fetch(`/api/admin/ad/users?${params}`);
    if (!r.ok) throw new Error("users");
    const d = await r.json();
    setUsers(d.users ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadSettings(), loadDepartments()]);
      } catch {
        setError("Не удалось загрузить данные AD");
      }
    })();
  }, [loadSettings, loadDepartments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers(selectedOuDn, q).catch(() => setError("Не удалось загрузить пользователей"));
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedOuDn, q, loadUsers]);

  async function sync(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/admin/ad/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bindConfigured ? {} : { password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.message || d.error || "Ошибка синхронизации");
        return;
      }
      setPassword("");
      setInfo(
        `Синхронизация завершена: отделов ${d.departments}, пользователей ${d.users} (режим: ${d.bindMode === "service" ? "service account" : "ваш доменный вход"}).`,
      );
      await Promise.all([loadDepartments(), loadSettings(), loadUsers(selectedOuDn, q)]);
    } catch {
      setError("Ошибка сети при синхронизации");
    } finally {
      setBusy(false);
    }
  }

  async function saveAdminOu(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/admin/ad/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminOuDn: adminOuDn || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Не удалось сохранить отдел админов");
        return;
      }
      setInfo(
        d.department
          ? `Отдел админов: ${d.department.name} (${d.department.path || d.department.dn})`
          : "Отдел админов сброшен",
      );
      await loadDepartments();
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  async function applyRoles() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/admin/ad/apply-roles", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Не удалось применить роли");
        return;
      }
      const list = (d.promoted as string[]) || [];
      setInfo(
        list.length
          ? `Повышены до ADMIN (уже входили в Help Desk): ${list.join(", ")}. Им нужно перезайти.`
          : "Некого повышать: либо в OU нет пользователей, либо они ещё не входили в Help Desk, либо уже ADMIN.",
      );
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="card formCard" style={{ marginBottom: 20 }}>
        <h2>Синхронизация с Active Directory</h2>
        <p className="muted">
          Загружает OU (отделы) и пользователей из AD.{" "}
          {bindConfigured
            ? "Используется service account из LDAP_BIND_DN."
            : "Service account не задан — для синхронизации нужен ваш доменный пароль (разово, не сохраняется)."}
        </p>
        {lastSyncAt && (
          <p className="muted">
            Последняя синхронизация: {new Date(lastSyncAt).toLocaleString("ru-RU")}
          </p>
        )}
        <form onSubmit={sync} className="ticketForm">
          {!bindConfigured && (
            <label>
              Ваш доменный пароль (для чтения AD)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={1}
                autoComplete="current-password"
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Синхронизация…" : "Синхронизировать сейчас"}
          </button>
        </form>
      </section>

      <section className="card formCard" style={{ marginBottom: 20 }}>
        <h2>Отдел админов (OU)</h2>
        <p className="muted">
          Пользователи из выбранного OU (например DCAdmin) при входе получают роль ADMIN. Также можно
          массово повысить тех, кто уже входил в систему.
        </p>
        <form onSubmit={saveAdminOu} className="ticketForm">
          <label>
            OU админов
            <select value={adminOuDn} onChange={(e) => setAdminOuDn(e.target.value)}>
              <option value="">— не выбран —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.dn}>
                  {d.path || d.name} ({d.userCount} польз.)
                </option>
              ))}
            </select>
          </label>
          <div className="actionRow">
            <button type="submit" disabled={busy}>
              Сохранить
            </button>
            <button type="button" className="secondary" disabled={busy || !adminOuDn} onClick={applyRoles}>
              Повысить вошедших до ADMIN
            </button>
          </div>
        </form>
      </section>

      <section className="grid" style={{ marginBottom: 20 }}>
        <div className="card">
          <b>{departments.length}</b>
          <p className="muted">Отделов (OU)</p>
        </div>
        <div className="card">
          <b>{users.length}</b>
          <p className="muted">Пользователей в списке</p>
        </div>
      </section>

      <section className="card tableCard" style={{ marginBottom: 20 }}>
        <h2>Отделы</h2>
        <table>
          <thead>
            <tr>
              <th>Путь / имя</th>
              <th>Пользователей</th>
              <th>Админы</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {departments.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  Пока пусто — выполните синхронизацию.
                </td>
              </tr>
            ) : (
              departments.map((d) => (
                <tr key={d.id} style={selectedOuDn === d.dn ? { background: "rgba(37,99,235,.08)" } : undefined}>
                  <td>
                    <b>{d.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {d.path}
                    </div>
                  </td>
                  <td>{d.userCount}</td>
                  <td>{d.isAdminOu ? "да" : "—"}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setSelectedOuDn(d.dn)}>
                      Пользователи
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card tableCard">
        <div className="actionRow" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>
            Пользователи{selectedOuDn ? ` — ${departments.find((d) => d.dn === selectedOuDn)?.name ?? ""}` : ""}
          </h2>
          <div className="actionRow" style={{ marginBottom: 0 }}>
            {selectedOuDn && (
              <button type="button" className="secondary" onClick={() => setSelectedOuDn("")}>
                Все OU
              </button>
            )}
            <input
              placeholder="Поиск (логин, имя, почта)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Логин</th>
              <th>Отдел / OU</th>
              <th>Почта</th>
              <th>Статус AD</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Нет записей.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>
                    <code>{u.username}</code>
                  </td>
                  <td>{u.department || u.ouName || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td>{u.isDisabled ? "отключён" : "активен"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {error && <p className="error">{error}</p>}
      {info && <p className="muted">{info}</p>}
    </div>
  );
}
