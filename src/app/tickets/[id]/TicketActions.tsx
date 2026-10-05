"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FilePasteZone from "@/components/FilePasteZone";
import { formatPerson } from "@/lib/labels";

type Staff = { id: string; name: string; username: string | null; role: string };

export default function TicketActions({
  id,
  canManage,
  currentStatus,
  currentAssigneeId,
  currentWorkMinutes,
}: {
  id: string;
  canManage: boolean;
  currentStatus: string;
  currentAssigneeId: string | null;
  currentWorkMinutes: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [workHours, setWorkHours] = useState(
    currentWorkMinutes != null ? String(Math.floor(currentWorkMinutes / 60)) : "",
  );
  const [workMins, setWorkMins] = useState(
    currentWorkMinutes != null ? String(currentWorkMinutes % 60) : "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStaff(d.staff ?? []))
      .catch(() => null);
  }, [canManage]);

  function totalMinutes(): number | null {
    const h = Number(workHours || 0);
    const m = Number(workMins || 0);
    if (!workHours && !workMins) return null;
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || m < 0) return null;
    const total = Math.round(h * 60 + m);
    return total > 0 ? total : null;
  }

  async function claim() {
    setError("");
    const r = await fetch(`/api/tickets/${id}/claim`, { method: "POST" });
    if (!r.ok) setError("Заявку уже взял другой специалист или действие недоступно");
    router.refresh();
  }

  async function status(value: string) {
    setError("");
    const needsTime = value === "RESOLVED" || value === "CLOSED";
    const minutes = totalMinutes() ?? currentWorkMinutes;
    if (needsTime && (minutes == null || minutes < 1)) {
      setError("Укажите затраченное время (часы и/или минуты) перед закрытием");
      return;
    }
    const r = await fetch(`/api/tickets/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: value, workMinutes: minutes ?? undefined }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(data.message || "Переход статуса недоступен");
    }
    router.refresh();
  }

  async function assign() {
    setError("");
    if (!assigneeId) {
      setError("Выберите специалиста");
      return;
    }
    const r = await fetch(`/api/tickets/${id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assigneeId }),
    });
    if (!r.ok) setError("Не удалось назначить специалиста");
    router.refresh();
  }

  async function message(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await fetch(`/api/tickets/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: f.get("body"),
        visibility: f.get("visibility") ?? "PUBLIC",
      }),
    });
    if (!r.ok) {
      setError("Сообщение не отправлено");
      setBusy(false);
      return;
    }
    if (files.length) {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const u = await fetch(`/api/tickets/${id}/attachments`, { method: "POST", body });
      if (!u.ok) setError("Сообщение отправлено, но файлы загрузить не удалось");
    }
    form.reset();
    setFiles([]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="actions">
      {canManage && (
        <>
          <div className="actionRow">
            <button type="button" onClick={claim}>
              Взять в работу
            </button>
            <button type="button" className="secondary" onClick={() => status("WAITING_FOR_USER")}>
              Ждём пользователя
            </button>
            <button type="button" className="secondary" onClick={() => status("RESOLVED")}>
              Решено
            </button>
            {currentStatus === "RESOLVED" && (
              <button type="button" className="secondary" onClick={() => status("CLOSED")}>
                Закрыть
              </button>
            )}
          </div>
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            <label>
              Назначить специалиста
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">— не выбран —</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {formatPerson(u.name, u.username)} [{u.role}]
                  </option>
                ))}
              </select>
            </label>
            <div className="actionRow" style={{ marginTop: 10, marginBottom: 0 }}>
              <button type="button" onClick={assign}>
                Назначить
              </button>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            <p style={{ marginTop: 0 }}>
              <b>Затраченное время</b> <span className="muted">(обязательно при «Решено» / «Закрыть»)</span>
            </p>
            <div className="timeRow">
              <label>
                Часы
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={workHours}
                  onChange={(e) => setWorkHours(e.target.value)}
                />
              </label>
              <label>
                Минуты
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={workMins}
                  onChange={(e) => setWorkMins(e.target.value)}
                />
              </label>
            </div>
          </div>
        </>
      )}
      <form onSubmit={message} className="ticketForm">
        <label>
          Сообщение
          <textarea name="body" required rows={4} />
        </label>
        {canManage && (
          <label>
            Видимость
            <select name="visibility" defaultValue="PUBLIC">
              <option value="PUBLIC">Публичное</option>
              <option value="INTERNAL">Внутренняя заметка</option>
            </select>
          </label>
        )}
        <FilePasteZone onChange={setFiles} />
        <button disabled={busy}>{busy ? "Отправка…" : "Отправить"}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
