"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Category = { id: string; name: string; isActive: boolean; ticketCount: number };

async function fetchCategories(): Promise<Category[]> {
  const r = await fetch("/api/categories?all=1");
  if (!r.ok) throw new Error("load");
  const d = await r.json();
  return d.categories ?? [];
}

export default function CategoriesAdmin() {
  const [items, setItems] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await fetchCategories());
    } catch {
      setError("Не удалось загрузить категории");
    }
  }, []);

  useEffect(() => {
    fetchCategories()
      .then(setItems)
      .catch(() => setError("Не удалось загрузить категории"));
  }, []);

  async function send(url: string, method: string, body: unknown, failText: string) {
    setBusy(true);
    setError("");
    const r = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError(r?.status === 409 ? "Категория с таким названием уже есть" : failText);
      return false;
    }
    await reload();
    return true;
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    if (await send("/api/categories", "POST", { name }, "Не удалось создать категорию")) form.reset();
  }

  async function rename(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    if (await send(`/api/categories/${id}`, "PATCH", { name }, "Не удалось переименовать")) setEditingId(null);
  }

  return (
    <div>
      <section className="card formCard" style={{ marginBottom: 20 }}>
        <h2>Добавить категорию</h2>
        <form onSubmit={create} className="inlineForm">
          <input name="name" required maxLength={80} placeholder="Например: Телефония" aria-label="Название категории" />
          <button type="submit" disabled={busy}>
            Добавить
          </button>
        </form>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="card tableCard">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Заявок</th>
              <th>Состояние</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={c.isActive ? "" : "inactiveRow"}>
                <td>
                  {editingId === c.id ? (
                    <form onSubmit={(e) => rename(e, c.id)} className="inlineForm">
                      <input name="name" required maxLength={80} defaultValue={c.name} aria-label="Новое название" autoFocus />
                      <button type="submit" disabled={busy}>
                        Сохранить
                      </button>
                      <button type="button" className="secondary" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <b>{c.name}</b>
                  )}
                </td>
                <td>{c.ticketCount}</td>
                <td>{c.isActive ? "Активна" : <span className="muted">Скрыта</span>}</td>
                <td>
                  <div className="actionRow" style={{ marginBottom: 0 }}>
                    {editingId !== c.id && (
                      <button type="button" className="secondary" onClick={() => setEditingId(c.id)}>
                        Переименовать
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        send(`/api/categories/${c.id}`, "PATCH", { isActive: !c.isActive }, "Не удалось изменить")
                      }
                    >
                      {c.isActive ? "Скрыть" : "Показать"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
