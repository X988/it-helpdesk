import type { Role, TicketStatus } from "@prisma/client";
export function canManageTicket(role: Role) { return role === "TECHNICIAN" || role === "ADMIN"; }
export function canReadTicket(role: Role, userId: string, requesterId: string) { return canManageTicket(role) || (role === "USER" && userId === requesterId); }
export function canWriteInternal(role: Role) { return canManageTicket(role); }
export const transitions: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"], RESOLVED: ["IN_PROGRESS", "CLOSED"], CLOSED: [], CANCELLED: [],
};
export function availableTransitions(role: Role, userId: string, ticket: { status: TicketStatus; requesterId: string; assigneeId: string | null }): TicketStatus[] {
  if (role === "ADMIN") return transitions[ticket.status];
  if (ticket.requesterId === userId && ticket.status === "RESOLVED") return ["IN_PROGRESS", "CLOSED"];
  if (role === "TECHNICIAN") return ticket.assigneeId === userId ? transitions[ticket.status] : [];
  if (role === "USER" && ticket.requesterId === userId) return ticket.status === "RESOLVED" ? ["IN_PROGRESS", "CLOSED"] : ticket.status === "NEW" ? ["CANCELLED"] : [];
  return [];
}
export function isTerminal(status: TicketStatus) { return status === "CLOSED" || status === "CANCELLED"; }
