import type { Role } from "@prisma/client";
import { isStaffRole } from "@/lib/roles";

export type TicketAcl = {
  requesterId: string;
  assigneeId?: string | null;
  departmentId?: string | null;
};

function asTicket(value: string | TicketAcl): TicketAcl {
  return typeof value === "string" ? { requesterId: value } : value;
}

/**
 * ADMIN can read every ticket.
 * USER can read only own tickets.
 * Queue staff can read assigned/requested tickets and tickets from their own department.
 * Legacy rows without departmentId are intentionally NOT globally visible to staff.
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
  if (!isStaffRole(role) || !actorDepartmentId || !ticket.departmentId) return false;
  return ticket.departmentId === actorDepartmentId;
}

export function canWriteInternal(role: Role) {
  return isStaffRole(role);
}

export function canManageTicket(role: Role) {
  return isStaffRole(role);
}

export function staffWhere(actor: { userId: string; role: Role; departmentId?: string | null }) {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "USER") return { requesterId: actor.userId };
  return {
    OR: [
      ...(actor.departmentId ? [{ departmentId: actor.departmentId }] : []),
      { assigneeId: actor.userId },
      { requesterId: actor.userId },
    ],
  };
}
