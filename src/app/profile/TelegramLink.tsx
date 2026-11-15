"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TelegramLink({ linkedAt, botConfigured }: { linkedAt: string | null; botConfigured: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createLink() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/telegram/link", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError(r?.status === 503 ? "Telegram-бот не настроен на сервере." : "Не удалось создать ссылку.");
      return;
    }
    const d = (await r.json()) as { url: string };
    setUrl(d.url);
    window.open(d.url, "_blank", "noopener,noreferrer");
  }

  async function unlink() {
    if (!window.confirm("Отключить уведомления в Telegram?")) return;
    setBusy(true);
    setError("");
    const r = await fetch("/api/telegram/link", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError("Не удалось отключить.");
      return;
    }
    router.refresh();
  }

  if (!botConfigured) {
    return <p className="muted">Telegram-бот не настроен. Обратитесь к администратору.</p>;
  }

  return (
    <div>
      {linkedAt ? (
        <p>
          <b>Подключён</b> <span className="muted">с {linkedAt}</span>
        </p>
      ) : (
        <p>
          <b>Не подключён</b>
        </p>
      )}
      <div className="actionRow">
        <button type="button" onClick={createLink} disabled={busy}>
          {linkedAt ? "Подключить другой чат" : "Подключить Telegram"}
        </button>
        {linkedAt && (
          <button type="button" className="secondary" onClick={unlink} disabled={busy}>
            Отключить
          </button>
        )}
      </div>
      {url && (
        <p className="muted">
          Если Telegram не открылся, перейдите по <a href={url} target="_blank" rel="noreferrer">ссылке</a> и нажмите
          «Запустить» (Start). Ссылка действует 10 минут. После подключения обновите страницу.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
