"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({
  domains,
  defaultDomain,
}: {
  domains: string[];
  defaultDomain: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [domain, setDomain] = useState(defaultDomain);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username") || "").trim();
    const password = String(f.get("password") || "");
    const domainValue = String(f.get("domain") || domain || defaultDomain).trim() || defaultDomain;

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
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="card auth">
        <p className="muted">IT HELP DESK</p>
        <h1>Вход</h1>
        <p className="muted" style={{ marginTop: -8 }}>
          Введите доменные учётные данные своей организации
        </p>
        <form onSubmit={submit} autoComplete="off">
          <label>
            Домен
            <select
              name="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              aria-label="Домен"
              required
            >
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Имя пользователя
            <div className="domainLogin">
              <span className="domainPrefix" aria-hidden>
                {domain}\
              </span>
              <input
                name="username"
                type="text"
                placeholder="имя пользователя"
                required
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="usernameField"
                defaultValue=""
              />
            </div>
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              defaultValue=""
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}
