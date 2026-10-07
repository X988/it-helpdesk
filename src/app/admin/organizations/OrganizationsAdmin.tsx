"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatOrganization } from "@/lib/labels";

type Org = { id: string; name: string; domain: string; isActive: boolean };

export default function OrganizationsAdmin() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Org | null>(null);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrgs(d.organizations ?? []))
      .catch(() => setError("Не удалось загрузить"));
  }, []);

  async function reload() {
    const r = await fetch("/api/organizations");
    if (!r.ok) {
      setError("Не удалось загрузить");
      return;
    }
    const d = await r.json();
    setOrgs(d.organizations ?? []);
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        domain: f.get("domain"),
        isActive: true,
      }),
    });
    if (!r.ok) {
      setError("Не удалось создать (возможно, уже есть такая пара название+домен)");
      return;
    }
    e.currentTarget.reset();
    await reload();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const f = new FormData(e.currentTarget);
    const r = await fetch(`/api/organizations/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        domain: f.get("domain"),
        isActive: f.get("isActive") === "true",
      }),
    });
    if (!r.ok) {
      setError("Не удалось сохранить");
      return;
    }
    setEditing(null);
    await reload();
  }

  return (
    <div>
      <section className="card formCard" style={{ marginBottom: 20 }}>
        <h2>Добавить организацию</h2>
        <form onSubmit={create} className="ticketForm">
          <label>
            Название компании
            <input name="name" required maxLength={120} placeholder="КП" />
          </label>
          <label>
            Домен
            <input name="domain" required maxLength={64} placeholder="короткое имя домена" />
          </label>
          <button type="submit">Создать</button>
        </form>
      </section>

      {editing && (
        <section className="card formCard" style={{ marginBottom: 20 }}>
          <h2>Редактировать</h2>
          <form onSubmit={saveEdit} className="ticketForm">
            <label>
              Название
              <input name="name" required defaultValue={editing.name} maxLength={120} />
            </label>
            <label>
              Домен
              <input name="domain" required defaultValue={editing.domain} maxLength={64} />
            </label>
            <label>
              Активна
              <select name="isActive" defaultValue={editing.isActive ? "true" : "false"}>
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
            </label>
            <div className="actionRow">
              <button type="submit">Сохранить</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Отображение</th>
              <th>Название</th>
              <th>Домен</th>
              <th>Активна</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <b>{formatOrganization(o.name, o.domain)}</b>
                </td>
                <td>{o.name}</td>
                <td>{o.domain}</td>
                <td>{o.isActive ? "Да" : "Нет"}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => setEditing(o)}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
