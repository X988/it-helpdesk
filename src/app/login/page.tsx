"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_DOMAIN = "energo";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username") || "").trim();
    const password = String(f.get("password") || "");
    const domainValue = String(f.get("domain") || domain || DEFAULT_DOMAIN).trim() || DEFAULT_DOMAIN;

    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        login: `${domainValue}\\${username}`,
        domain: domainValue,
        username,
        password,
      }),
    });

    if (r.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError("Неверный логин или пароль");
    }
  }

  return (
    <main className="shell">
      <div className="card auth">
        <p className="muted">IT HELP DESK</p>
        <h1>Вход</h1>
        <p className="muted" style={{ marginTop: -8 }}>
          Доменные учётные данные, например <code>energo\o.nikishin</code>
        </p>
        <form onSubmit={submit}>
          <label>
            Пользователь
            <div className="domainLogin">
              <input
                name="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                aria-label="Домен"
                autoComplete="organization"
                className="domainField"
                required
              />
              <span className="domainSep" aria-hidden>
                \
              </span>
              <input
                name="username"
                type="text"
                placeholder="o.nikishin"
                required
                autoComplete="username"
                className="usernameField"
              />
            </div>
          </label>
          <label>
            Пароль
            <input name="password" type="password" required minLength={8} autoComplete="current-password" />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Войти</button>
        </form>
      </div>
    </main>
  );
}
