import type { TicketStatus } from "@prisma/client";

const transitions: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus) {
  return transitions[from]?.includes(to) ?? false;
}

export function isUserTransition(from: TicketStatus, to: TicketStatus) {
  return (from === "RESOLVED" && to === "CLOSED") || (from === "RESOLVED" && to === "IN_PROGRESS");
}
