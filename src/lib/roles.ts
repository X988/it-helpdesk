import type { Role } from "@prisma/client";

/** People who work the queue: support, programmers, administrators. */
export const STAFF_ROLES: Role[] = ["TECHNICIAN", "PROGRAMMER", "ADMIN"];

export function isStaffRole(role: Role | string) {
  return role === "TECHNICIAN" || role === "PROGRAMMER" || role === "ADMIN";
}
