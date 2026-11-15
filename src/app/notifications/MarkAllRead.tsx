"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function markAll() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setError("Не удалось отметить уведомления");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={markAll} disabled={busy}>
        {busy ? "Сохранение…" : "Отметить все прочитанными"}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
