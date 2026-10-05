"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({ className = "secondary" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still redirect */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className={className} onClick={logout} disabled={busy}>
      {busy ? "Выход…" : "Выйти"}
    </button>
  );
}
