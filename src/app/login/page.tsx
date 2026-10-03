"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client-api";
export default function Login() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); const form = new FormData(event.currentTarget);
    try { await api("/api/auth/login", "POST", { email: form.get("email"), password: form.get("password") }); router.push("/dashboard"); router.refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <main id="content" className="shell"><section className="card auth"><h1>Вход</h1><form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="username" maxLength={254} /></label><label>Пароль<input name="password" type="password" required autoComplete="current-password" maxLength={128} /></label>{error && <p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy ? "Вход…" : "Войти"}</button></form><p className="muted">Если вы забыли пароль, обратитесь к администратору.</p></section></main>;
}
