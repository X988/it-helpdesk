import type { Ticket, TicketStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";
import { HttpError, validId } from "@/lib/http";
import { availableTransitions, canReadTicket, canWriteInternal, canManageTicket, isTerminal } from "@/lib/ticket-access";
import { queueNotification, technicianIds, type Tx } from "@/lib/notifications";
import { statusLabels } from "@/lib/labels";

export async function lockedTicket(tx: Tx, id: string) {
  validId(id);
  await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const ticket = await tx.ticket.findUnique({ where: { id } });
  if (!ticket) throw new HttpError(404, "NOT_FOUND");
  return ticket;
}
export function requireTicketAccess(session: Session, ticket: Pick<Ticket, "requesterId">) {
  if (!canReadTicket(session.role, session.userId, ticket.requesterId)) throw new HttpError(404, "NOT_FOUND");
}
async function logStatus(tx: Tx, session: Session, current: Ticket, status: TicketStatus) {
  await tx.ticketStatusHistory.create({ data: { ticketId: current.id, fromStatus: current.status, toStatus: status, actorId: session.userId } });
  await tx.auditLog.create({ data: { actorId: session.userId, action: "STATUS_CHANGED", entityType: "Ticket", entityId: current.id, metadata: { from: current.status, to: status } } });
}
async function logAssignment(tx: Tx, session: Session, ticket: Ticket, assigneeId: string) {
  await tx.ticketAssignment.create({ data: { ticketId: ticket.id, fromAssigneeId: ticket.assigneeId, toAssigneeId: assigneeId, actorId: session.userId } });
  await tx.auditLog.create({ data: { actorId: session.userId, action: "TICKET_ASSIGNED", entityType: "Ticket", entityId: ticket.id, metadata: { from: ticket.assigneeId, to: assigneeId } } });
}
export async function createTicket(session: Session, data: { subject: string; description: string; priority: Ticket["priority"]; categoryId: string }) {
  return db.$transaction(async tx => {
    const category = await tx.category.findFirst({ where: { id: validId(data.categoryId), isActive: true }, select: { id: true } });
    if (!category) throw new HttpError(400, "CATEGORY_UNAVAILABLE");
    const ticket = await tx.ticket.create({ data: { ...data, requesterId: session.userId } });
    await tx.ticketStatusHistory.create({ data: { ticketId: ticket.id, toStatus: "NEW", actorId: session.userId } });
    await tx.auditLog.create({ data: { actorId: session.userId, action: "TICKET_CREATED", entityType: "Ticket", entityId: ticket.id } });
    await queueNotification(tx, await technicianIds(tx), "TICKET_CREATED", ticket.id, "Новая заявка HD-" + ticket.number + ": " + ticket.subject, { inline_keyboard: [[{ text: "Взять в работу", callback_data: "claim:" + ticket.id }]] });
    return ticket;
  });
}
export async function claimTicket(session: Session, id: string) {
  if (!canManageTicket(session.role)) throw new HttpError(403, "FORBIDDEN");
  return db.$transaction(async tx => {
    const current = await lockedTicket(tx, id);
    if (current.status !== "NEW" || current.assigneeId) throw new HttpError(409, "ALREADY_ASSIGNED");
    const ticket = await tx.ticket.update({ where: { id }, data: { assigneeId: session.userId, status: "IN_PROGRESS" } });
    await logAssignment(tx, session, current, session.userId);
    await logStatus(tx, session, current, "IN_PROGRESS");
    await queueNotification(tx, [current.requesterId], "TICKET_ASSIGNED", id, "Заявка HD-" + current.number + " взята в работу.");
    return ticket;
  });
}
export async function assignTicket(session: Session, id: string, assigneeId: string) {
  if (session.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  validId(assigneeId);
  return db.$transaction(async tx => {
    const current = await lockedTicket(tx, id);
    if (isTerminal(current.status)) throw new HttpError(409, "TICKET_FINISHED");
    const assignee = await tx.user.findFirst({ where: { id: assigneeId, isActive: true, role: { in: ["TECHNICIAN", "ADMIN"] } }, select: { id: true } });
    if (!assignee) throw new HttpError(400, "ASSIGNEE_UNAVAILABLE");
    if (current.assigneeId === assigneeId) return current;
    const ticket = await tx.ticket.update({ where: { id }, data: { assigneeId, status: current.status === "NEW" ? "IN_PROGRESS" : current.status } });
    await logAssignment(tx, session, current, assigneeId);
    if (current.status === "NEW") await logStatus(tx, session, current, "IN_PROGRESS");
    await queueNotification(tx, [current.requesterId, assigneeId], "TICKET_ASSIGNED", id, "Назначен специалист для заявки HD-" + current.number + ".");
    return ticket;
  });
}
export async function transitionTicket(session: Session, id: string, status: TicketStatus) {
  return db.$transaction(async tx => {
    const current = await lockedTicket(tx, id);
    requireTicketAccess(session, current);
    if (!availableTransitions(session.role, session.userId, current).includes(status)) throw new HttpError(409, "INVALID_TRANSITION");
    const assigneeId = !current.assigneeId && status === "IN_PROGRESS" && canManageTicket(session.role) ? session.userId : current.assigneeId;
    const ticket = await tx.ticket.update({ where: { id }, data: { status, assigneeId, resolvedAt: status === "RESOLVED" ? new Date() : status === "CLOSED" ? current.resolvedAt : null, closedAt: status === "CLOSED" ? new Date() : null } });
    if (assigneeId && assigneeId !== current.assigneeId) await logAssignment(tx, session, current, assigneeId);
    await logStatus(tx, session, current, status);
    const type = status === "RESOLVED" ? "TICKET_RESOLVED" : status === "CLOSED" ? "TICKET_CLOSED" : current.status === "RESOLVED" ? "TICKET_REOPENED" : status === "WAITING_FOR_USER" ? "WAITING_FOR_USER" : "STATUS_CHANGED";
    const keyboard: Prisma.InputJsonValue | undefined = status === "RESOLVED" ? { inline_keyboard: [[{ text: "Проблема решена", callback_data: "fixed:" + id }, { text: "Вернуть в работу", callback_data: "reopen:" + id }]] } : undefined;
    await queueNotification(tx, [current.requesterId, ...(assigneeId ? [assigneeId] : [])].filter(u => u !== session.userId), type, id, "HD-" + current.number + ": " + statusLabels[status] + ".", keyboard);
    return ticket;
  });
}
export async function addMessage(session: Session, id: string, data: { body: string; visibility: "PUBLIC" | "INTERNAL" }) {
  if (data.visibility === "INTERNAL" && !canWriteInternal(session.role)) throw new HttpError(403, "FORBIDDEN");
  return db.$transaction(async tx => {
    const current = await lockedTicket(tx, id);
    requireTicketAccess(session, current);
    if (isTerminal(current.status)) throw new HttpError(409, "TICKET_FINISHED");
    const message = await tx.ticketMessage.create({ data: { ticketId: id, authorId: session.userId, ...data } });
    await tx.auditLog.create({ data: { actorId: session.userId, action: data.visibility === "INTERNAL" ? "INTERNAL_MESSAGE_CREATED" : "PUBLIC_MESSAGE_CREATED", entityType: "Ticket", entityId: id } });
    if (data.visibility === "PUBLIC" && session.userId === current.requesterId && current.status === "WAITING_FOR_USER") {
      await tx.ticket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
      await logStatus(tx, session, current, "IN_PROGRESS");
    }
    const staff = current.assigneeId ? [current.assigneeId] : await technicianIds(tx);
    const recipients = data.visibility === "INTERNAL" ? staff : [current.requesterId, ...staff];
    await queueNotification(tx, recipients.filter(u => u !== session.userId), "NEW_MESSAGE", id, "Новое " + (data.visibility === "INTERNAL" ? "внутреннее " : "") + "сообщение в заявке HD-" + current.number + ".");
    return message;
  });
}
