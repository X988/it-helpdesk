"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client-api";
export default function LogoutButton() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function logout() { setBusy(true); setError(""); try { await api("/api/auth/logout"); router.push("/login"); router.refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }
  return <div><button className="secondary" onClick={logout} disabled={busy}>Выйти</button>{error && <p role="alert" className="error">{error}</p>}</div>;
}
