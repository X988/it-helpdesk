import { db } from "@/lib/db";
import { onStatusChanged } from "@/lib/notifications";

export type RequesterDecision = "fixed" | "reopen";

/**
 * The requester confirms a RESOLVED ticket ("fixed" → CLOSED) or rejects the
 * resolution ("reopen" → IN_PROGRESS). Used by the web UI and the Telegram bot.
 * Returns the new status, or null if the ticket is not RESOLVED / not theirs.
 */
export async function applyRequesterDecision(ticketId: string, userId: string, decision: RequesterDecision) {
  const target = decision === "fixed" ? "CLOSED" : "IN_PROGRESS";
  const applied = await db.$transaction(async (tx) => {
    const changed = await tx.ticket.updateMany({
      where: { id: ticketId, requesterId: userId, status: "RESOLVED" },
      data:
        target === "CLOSED"
          ? { status: target, closedAt: new Date() }
          : { status: target, closedAt: null, resolvedAt: null },
    });
    if (changed.count !== 1) return false;
    await tx.ticketStatusHistory.create({
      data: { ticketId, fromStatus: "RESOLVED", toStatus: target, actorId: userId },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: target === "CLOSED" ? "USER_CONFIRMED_RESOLUTION" : "TICKET_REOPENED",
        entityType: "Ticket",
        entityId: ticketId,
      },
    });
    return true;
  });
  if (!applied) return null;
  onStatusChanged(ticketId, "RESOLVED", target, userId);
  return target;
}

/**
 * When the requester answers a ticket that is WAITING_FOR_USER, put it back to
 * IN_PROGRESS so it reappears in the specialist's queue.
 */
export async function resumeAfterRequesterReply(ticketId: string, userId: string) {
  const resumed = await db.$transaction(async (tx) => {
    const changed = await tx.ticket.updateMany({
      where: { id: ticketId, requesterId: userId, status: "WAITING_FOR_USER" },
      data: { status: "IN_PROGRESS" },
    });
    if (changed.count !== 1) return false;
    await tx.ticketStatusHistory.create({
      data: { ticketId, fromStatus: "WAITING_FOR_USER", toStatus: "IN_PROGRESS", actorId: userId },
    });
    return true;
  });
  return resumed;
}
