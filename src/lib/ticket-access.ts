import type { Role } from "@prisma/client";

export function canReadTicket(role: Role, userId: string, requesterId: string) {
  return role !== "USER" || userId === requesterId;
}

export function canWriteInternal(role: Role) {
  return role === "TECHNICIAN" || role === "ADMIN";
}

export function canManageTicket(role: Role) {
  return role === "TECHNICIAN" || role === "ADMIN";
}
