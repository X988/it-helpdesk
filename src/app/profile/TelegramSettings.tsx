"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client-api";
export default function TelegramSettings({ configured, linked }: { configured: boolean; linked: boolean }) {
  const router = useRouter(); const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function action(unlink = false) { setBusy(true); setError(""); setUrl(""); try { if (unlink) { await api("/api/telegram/link", "DELETE"); router.refresh(); } else { const data = await api<{ url: string }>("/api/telegram/link"); setUrl(data.url); } } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  return <section className="section"><h2>Telegram</h2>{configured ? <><p className="muted">{linked ? "Telegram подключён. Уведомления поступают в личный чат с ботом." : "Подключите личный чат с ботом, чтобы получать уведомления о заявках."}</p><div className="actionRow"><button disabled={busy} onClick={() => action()}>{linked ? "Переподключить" : "Получить ссылку"}</button>{linked && <button className="secondary" disabled={busy} onClick={() => action(true)}>Отключить Telegram</button>}<button className="secondary" onClick={() => router.refresh()}>Проверить подключение</button></div>{url && <p className="notice"><a href={url} target="_blank" rel="noopener noreferrer">Открыть бота и нажать Start</a><br />Ссылка действует 10 минут. После подключения нажмите «Проверить подключение».</p>}</> : <p className="muted">Telegram ещё не настроен администратором. Уведомления доступны на сайте.</p>}{error && <p role="alert" className="error">{error}</p>}</section>;
}
