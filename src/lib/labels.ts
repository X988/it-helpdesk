import type { TicketStatus, Priority, Role } from "@prisma/client";
export const statusLabels: Record<TicketStatus, string> = { NEW: "Новая", IN_PROGRESS: "В работе", WAITING_FOR_USER: "Ожидает ответа", RESOLVED: "Решена", CLOSED: "Закрыта", CANCELLED: "Отменена" };
export const priorityLabels: Record<Priority, string> = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" };
export const roleLabels: Record<Role, string> = { USER: "Пользователь", TECHNICIAN: "Специалист", ADMIN: "Администратор" };
export function formatDate(date: Date) { return new Intl.DateTimeFormat("ru-UA", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(date); }
