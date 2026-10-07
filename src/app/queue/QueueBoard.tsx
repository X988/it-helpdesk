"use client";

import Link from "next/link";
import { DragEvent, useState } from "react";
import { useRouter } from "next/navigation";

type QueueStatus = "NEW" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED";

type Ticket = {
  id: string;
  number: number;
  subject: string;
  priorityLabel: string;
  status: QueueStatus;
  ageMinutes: number;
  assignee: string | null;
  breached: boolean;
  slaLabel: string;
  workMinutes: number | null;
};

const columns: Array<{ status: QueueStatus; title: string }> = [
  { status: "NEW", title: "Новые" },
  { status: "IN_PROGRESS", title: "В работе" },
  { status: "WAITING_FOR_USER", title: "Ожидание" },
  { status: "RESOLVED", title: "Решено" },
];

const allowed: Record<QueueStatus, QueueStatus[]> = {
  NEW: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS"],
};

function ageLabel(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} ч`;
  return `${Math.floor(minutes / (24 * 60))} дн`;
}

export default function QueueBoard({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function move(ticket: Ticket, target: QueueStatus) {
    if (ticket.status === target || busyId) return;
    if (!allowed[ticket.status].includes(target)) {
      setError("Такой переход статуса запрещён.");
      return;
    }

    setError("");
    setBusyId(ticket.id);
    try {
      let response: Response;
      if (ticket.status === "NEW" && target === "IN_PROGRESS") {
        response = await fetch(`/api/tickets/${ticket.id}/claim`, { method: "POST" });
      } else {
        const payload: Record<string, unknown> = { status: target };
        if (target === "WAITING_FOR_USER") {
          const reason = window.prompt("Что ждём от пользователя?", "Уточнение информации");
          if (reason == null) return;
          payload.waitingReasonType = "USER";
          payload.waitingReasonText = reason.trim() || "Ответ пользователя";
        }
        if (target === "RESOLVED") {
          const initial = ticket.workMinutes ? String(ticket.workMinutes) : "";
          const raw = window.prompt("Затраченное время, минут", initial);
          if (raw == null) return;
          const minutes = Number(raw);
          if (!Number.isInteger(minutes) || minutes < 1) {
            setError("Для решения заявки укажите затраченное время в минутах.");
            return;
          }
          payload.workMinutes = minutes;
        }
        if (ticket.status === "RESOLVED" && target === "IN_PROGRESS") {
          const comment = window.prompt("Почему заявка возвращается в работу?");
          if (comment == null) return;
          if (!comment.trim()) {
            setError("Для возврата в работу нужен комментарий.");
            return;
          }
          payload.comment = comment.trim();
        }

        response = await fetch(`/api/tickets/${ticket.id}/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || data.error || "Не удалось изменить статус.");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setDraggedId(null);
    }
  }

  function drop(event: DragEvent<HTMLDivElement>, target: QueueStatus) {
    event.preventDefault();
    const ticket = tickets.find((item) => item.id === draggedId);
    if (ticket) void move(ticket, target);
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="kanbanBoard" aria-label="Очередь заявок">
        {columns.map((column) => (
          <div
            key={column.status}
            className="kanbanColumn"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, column.status)}
          >
            <div className="kanbanHeading">
              <h2>{column.title}</h2>
              <span className="badgeCount">{tickets.filter((ticket) => ticket.status === column.status).length}</span>
            </div>
            <div className="kanbanCards">
              {tickets.filter((ticket) => ticket.status === column.status).map((ticket) => (
                <article
                  key={ticket.id}
                  className={`ticketCard ${ticket.breached ? "ticketCardLate" : ""}`}
                  draggable={busyId !== ticket.id}
                  onDragStart={() => setDraggedId(ticket.id)}
                  onDragEnd={() => setDraggedId(null)}
                >
                  <div className="ticketCardTop">
                    <Link href={`/tickets/${ticket.id}`}>HD-{ticket.number}</Link>
                    <span>{ticket.priorityLabel}</span>
                  </div>
                  <h3>{ticket.subject}</h3>
                  <dl className="ticketFacts">
                    <div><dt>Возраст</dt><dd>{ageLabel(ticket.ageMinutes)}</dd></div>
                    <div><dt>Исполнитель</dt><dd>{ticket.assignee ?? "Не назначен"}</dd></div>
                    <div><dt>SLA</dt><dd className={ticket.breached ? "late" : undefined}>{ticket.slaLabel}</dd></div>
                  </dl>
                  {allowed[ticket.status].length > 0 && (
                    <div className="queueFallback">
                      <label>
                        Переместить
                        <select
                          defaultValue=""
                          aria-label={`Изменить статус HD-${ticket.number}`}
                          onChange={(event) => {
                            const value = event.target.value as QueueStatus;
                            if (value) void move(ticket, value);
                            event.currentTarget.value = "";
                          }}
                          disabled={busyId === ticket.id}
                        >
                          <option value="">Выберите…</option>
                          {allowed[ticket.status].map((status) => (
                            <option key={status} value={status}>
                              {columns.find((column) => column.status === status)?.title ?? status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </article>
              ))}
              {tickets.every((ticket) => ticket.status !== column.status) && <p className="muted">Нет заявок</p>}
            </div>
          </div>
        ))}
      </section>
      <p className="muted">Карточку можно перетащить в допустимую колонку или использовать список «Переместить» с клавиатуры.</p>
    </>
  );
}
