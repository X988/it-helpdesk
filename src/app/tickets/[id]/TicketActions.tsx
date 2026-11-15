"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FilePasteZone from "@/components/FilePasteZone";
import { formatPerson, roleLabel } from "@/lib/labels";

type Staff = { id: string; name: string; username: string | null; role: string };

export default function TicketActions({
  id,
  canManage,
  currentStatus,
  currentAssigneeId,
  currentWorkMinutes,
  chatMode = false,
  isRequester = false,
}: {
  id: string;
  canManage: boolean;
  currentStatus: string;
  currentAssigneeId: string | null;
  currentWorkMinutes: number | null;
  chatMode?: boolean;
  isRequester?: boolean;
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

  async function decide(decision: "fixed" | "reopen") {
    setError("");
    setBusy(true);
    const r = await fetch(`/api/tickets/${id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) setError("Действие недоступно — обновите страницу");
    router.refresh();
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
      {isRequester && currentStatus === "RESOLVED" && (
        <div className="card confirmBox">
          <p style={{ marginTop: 0 }}>
            <b>Специалист отметил заявку как решённую.</b> Проблема действительно решена?
          </p>
          <div className="actionRow" style={{ marginBottom: 0 }}>
            <button type="button" onClick={() => decide("fixed")} disabled={busy}>
              Да, решена — закрыть
            </button>
            <button type="button" className="secondary" onClick={() => decide("reopen")} disabled={busy}>
              Нет, вернуть в работу
            </button>
          </div>
        </div>
      )}
      {canManage && (
        <>
          <div className="actionRow">
            {currentStatus === "NEW" && (
              <button type="button" onClick={claim}>
                Взять в работу
              </button>
            )}
            {(currentStatus === "WAITING_FOR_USER" || currentStatus === "RESOLVED") && (
              <button type="button" className="secondary" onClick={() => status("IN_PROGRESS")}>
                Вернуть в работу
              </button>
            )}
            {currentStatus === "IN_PROGRESS" && (
              <button type="button" className="secondary" onClick={() => status("WAITING_FOR_USER")}>
                Ждём пользователя
              </button>
            )}
            {(currentStatus === "IN_PROGRESS" || currentStatus === "WAITING_FOR_USER") && (
              <button type="button" className="secondary" onClick={() => status("RESOLVED")}>
                Решено
              </button>
            )}
            {currentStatus === "RESOLVED" && (
              <button type="button" className="secondary" onClick={() => status("CLOSED")}>
                Закрыть
              </button>
            )}
            {["NEW", "IN_PROGRESS", "WAITING_FOR_USER"].includes(currentStatus) && (
              <button
                type="button"
                className="secondary danger"
                onClick={() => window.confirm("Отменить заявку?") && status("CANCELLED")}
              >
                Отменить
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
                    {formatPerson(u.name, u.username)} [{roleLabel[u.role as keyof typeof roleLabel] ?? u.role}]
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
      <form onSubmit={message} className="ticketForm chatComposer">
        <label>
          {chatMode ? "Сообщение в чат" : "Сообщение"}
          <textarea
            name="body"
            required
            rows={4}
            placeholder={chatMode ? "Напишите вопрос или уточнение специалисту…" : undefined}
          />
        </label>
        {canManage && (
          <label>
            Видимость
            <select name="visibility" defaultValue="PUBLIC">
              <option value="PUBLIC">В чат (видно пользователю)</option>
              <option value="INTERNAL">Внутренняя заметка</option>
            </select>
          </label>
        )}
        <FilePasteZone onChange={setFiles} />
        <button disabled={busy}>
          {busy ? "Отправка…" : chatMode ? "Отправить в чат" : "Отправить"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
