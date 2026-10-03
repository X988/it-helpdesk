"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client-api";
export default function MarkRead() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function mark() { setBusy(true); setError(""); try { await api("/api/notifications/read"); router.refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  return <div><button className="secondary" disabled={busy} onClick={mark}>Отметить всё прочитанным</button>{error && <p role="alert" className="error">{error}</p>}</div>;
}
