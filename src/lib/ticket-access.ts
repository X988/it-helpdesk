import type { Role } from "@prisma/client";

export type TicketAcl = {
  requesterId: string;
  assigneeId?: string | null;
  departmentId?: string | null;
};

function asTicket(value: string | TicketAcl): TicketAcl {
  return typeof value === "string" ? { requesterId: value } : value;
}

/**
 * String form keeps the previous behaviour (any technician can read).
 * Object form scopes technicians to their department, assigned tickets, and legacy rows with no department.
 */
export function canReadTicket(
  role: Role,
  userId: string,
  requesterIdOrTicket: string | TicketAcl,
  actorDepartmentId?: string | null,
) {
  const ticket = asTicket(requesterIdOrTicket);
  if (role === "ADMIN") return true;
  if (role === "USER") return userId === ticket.requesterId;
  if (userId === ticket.requesterId || (ticket.assigneeId && userId === ticket.assigneeId)) return true;
  if (!ticket.departmentId) return true;
  if (!actorDepartmentId) return false;
  return ticket.departmentId === actorDepartmentId;
}

export function canWriteInternal(role: Role) {
  return role === "TECHNICIAN" || role === "ADMIN";
}

export function canManageTicket(role: Role) {
  return role === "TECHNICIAN" || role === "ADMIN";
}

export function staffWhere(actor: { userId: string; role: Role; departmentId?: string | null }) {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "USER") return { requesterId: actor.userId };
  return {
    OR: [
      { departmentId: null },
      ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []),
      { assigneeId: actor.userId },
      { requesterId: actor.userId },
    ],
  };
}
