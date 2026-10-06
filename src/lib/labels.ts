import type { Priority, TicketStatus, TaskDirection, Role } from "@prisma/client";

export const priorityLabel: Record<Priority, string> = {
  LOW: "Низкий",
  NORMAL: "Средний",
  HIGH: "Высокий",
  URGENT: "Критический",
};

export const statusLabel: Record<TicketStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  WAITING_FOR_USER: "Ожидает ответа",
  RESOLVED: "Решена",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

export const directionLabel: Record<TaskDirection, string> = {
  PROGRAMMING: "Программирование",
  ADMINISTRATION: "Администрирование",
  OTHER: "Прочее",
};

export const roleLabel: Record<Role, string> = {
  USER: "Пользователь",
  TECHNICIAN: "Техподдержка",
  ADMIN: "Администратор",
};

/** Display "Имя (логин)" — falls back to name or login alone. */
export function formatPerson(name?: string | null, username?: string | null) {
  const n = (name ?? "").trim();
  const u = (username ?? "").trim();
  if (n && u) return `${n} (${u})`;
  if (n) return n;
  if (u) return u;
  return "—";
}

/** Display "КП (energo)" for an organization. */
export function formatOrganization(name?: string | null, domain?: string | null) {
  const n = (name ?? "").trim();
  const d = (domain ?? "").trim();
  if (n && d) return `${n} (${d})`;
  if (n) return n;
  if (d) return d;
  return "—";
}

export function formatWorkTime(minutes?: number | null) {
  if (minutes == null || minutes < 0) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
