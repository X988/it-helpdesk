"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FilePasteZone from "@/components/FilePasteZone";
import { formatOrganization } from "@/lib/labels";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

type Category = { id: string; name: string };
type Org = { id: string; name: string; domain: string };

export default function NewTicketForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCategories(d.categories))
      .catch(() => setError("Не удалось загрузить категории"));
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrgs(d.organizations ?? []))
      .catch(() => null);
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: f.get("subject"),
        description: f.get("description"),
        categoryId: f.get("categoryId"),
        priority: f.get("priority"),
        direction: f.get("direction"),
        organizationId: f.get("organizationId") || null,
      }),
    });
    if (!r.ok) {
      setError("Не удалось создать заявку");
      setBusy(false);
      return;
    }
    const { ticket } = await r.json();
    if (files.length) {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const u = await fetch(`/api/tickets/${ticket.id}/attachments`, { method: "POST", body });
      if (!u.ok) setError("Заявка создана, но часть файлов загрузить не удалось");
    }
    router.push(`/tickets/${ticket.id}`);
    router.refresh();
  }

  return (
    <main className="shell">
      <div className="top" style={{ marginBottom: 12 }}>
        <Link href="/dashboard" className="muted">
          ← К заявкам
        </Link>
        <LogoutButton />
      </div>
      <div className="card formCard">
        <p className="muted">IT HELP DESK</p>
        <h1>Новая заявка</h1>
        <form onSubmit={submit} className="ticketForm">
          <label>
            Тема
            <input name="subject" required minLength={3} maxLength={160} />
          </label>
          <label>
            Категория
            <select name="categoryId" required defaultValue="">
              <option value="" disabled>
                Выберите категорию
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Направление задачи
            <select name="direction" required defaultValue="">
              <option value="" disabled>
                Выберите направление
              </option>
              <option value="PROGRAMMING">Программирование</option>
              <option value="ADMINISTRATION">Администрирование</option>
              <option value="OTHER">Прочее</option>
            </select>
          </label>
          <label>
            Приоритет
            <select name="priority" defaultValue="NORMAL">
              <option value="LOW">Низкий</option>
              <option value="NORMAL">Обычный</option>
              <option value="HIGH">Высокий</option>
              <option value="URGENT">Срочный</option>
            </select>
          </label>
          {orgs.length > 0 && (
            <label>
              Организация
              <select name="organizationId" defaultValue={orgs[0]?.id ?? ""}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatOrganization(o.name, o.domain)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Описание
            <textarea name="description" required minLength={5} maxLength={10000} rows={8} />
          </label>
          <FilePasteZone onChange={setFiles} />
          {error && <p className="error">{error}</p>}
          <button disabled={busy}>{busy ? "Создание…" : "Создать заявку"}</button>
        </form>
      </div>
    </main>
  );
}
