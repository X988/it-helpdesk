"use client";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client-api";
export default function NewTicketForm({ categories, uploadsEnabled }: { categories: { id: string; name: string }[]; uploadsEnabled: boolean }) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [createdId, setCreatedId] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = event.currentTarget; const fields = new FormData(form);
    try {
      const files = (form.elements.namedItem("files") as HTMLInputElement | null)?.files;
      if (files && (files.length > 5 || Array.from(files).some(file => file.size > 10 * 1024 * 1024 || file.size === 0))) throw new Error("Выберите до 5 непустых файлов, каждый до 10 МБ.");
      let id = createdId;
      if (!id) { const { ticket } = await api<{ ticket: { id: string } }>("/api/tickets", "POST", { subject: fields.get("subject"), description: fields.get("description"), categoryId: fields.get("categoryId"), priority: fields.get("priority") }); id = ticket.id; setCreatedId(id); }
      if (files?.length) { const body = new FormData(); for (const file of Array.from(files)) body.append("files", file); await api("/api/tickets/" + id + "/attachments", "POST", body); }
      router.push("/tickets/" + id); router.refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <main id="content" className="shell"><Link href="/dashboard">← К заявкам</Link><section className="card formCard section"><h1>Новая заявка</h1>{!categories.length ? <p role="status">Нет доступных категорий. Администратор должен добавить хотя бы одну.</p> : <form onSubmit={submit} className="ticketForm"><fieldset disabled={busy || Boolean(createdId)}><label>Тема<input name="subject" required minLength={3} maxLength={160} /></label><label>Категория<select name="categoryId" required defaultValue=""><option value="" disabled>Выберите категорию</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Приоритет<select name="priority" defaultValue="NORMAL"><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="URGENT">Срочный</option></select></label><label>Описание<textarea name="description" required minLength={5} maxLength={10000} rows={8} /></label></fieldset>{uploadsEnabled && <label>Скриншоты и файлы<input name="files" type="file" disabled={busy} multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" /></label>}<p className="muted">{uploadsEnabled ? "До 5 файлов за загрузку, каждый до 10 МБ." : "Файлы станут доступны после настройки хранилища."}</p>{createdId && <p role="status">Заявка уже сохранена. <Link href={"/tickets/" + createdId}>Открыть заявку без повторной загрузки файлов</Link>.</p>}{error && <p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy ? "Сохранение…" : createdId ? "Повторить загрузку файлов" : "Создать заявку"}</button></form>}</section></main>;
}
