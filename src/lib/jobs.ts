import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { sendTelegram } from "@/lib/telegram";
import { isBreach } from "@/lib/sla";
import { enqueueUserNotification } from "@/lib/notifications";

const AUTO_CLOSE_MS = 3 * 24 * 60 * 60 * 1000;

function appUrl() {
  return (process.env.APP_URL || "").replace(/\/$/, "");
}

function ticketLink(id: string) {
  const base = appUrl();
  return base ? `${base}/tickets/${id}` : `/tickets/${id}`;
}

export async function runMaintenance(now = new Date()) {
  const closed = await autoCloseResolved(now);
  const breaches = await markBreaches(now);
  const mail = await drainOutbox();
  return { closed, breaches, mail };
}

export async function autoCloseResolved(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_MS);
  const due = await db.ticket.findMany({
    where: { status: "RESOLVED", resolvedAt: { lte: cutoff } },
    select: { id: true, requesterId: true, number: true, subject: true },
    take: 200,
  });
  let closed = 0;
  for (const ticket of due) {
    const changed = await db.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticket.id, status: "RESOLVED", resolvedAt: { lte: cutoff } },
        data: { status: "CLOSED", closedAt: now },
      });
      if (result.count !== 1) return false;
      await tx.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus: "RESOLVED", toStatus: "CLOSED", actorId: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "AUTO_CLOSED",
          entityType: "Ticket",
          entityId: ticket.id,
          metadata: { before: { status: "RESOLVED" }, after: { status: "CLOSED" } },
        },
      });
      await enqueueUserNotification(tx, {
        userId: ticket.requesterId,
        type: "TICKET_CLOSED",
        ticketId: ticket.id,
        subject: `HD-${ticket.number}: заявка закрыта автоматически`,
        text: `HD-${ticket.number}: заявка закрыта автоматически\n${ticket.subject}\n${ticketLink(ticket.id)}`,
      });
      return true;
    });
    if (changed) closed += 1;
  }
  return closed;
}

export async function markBreaches(now = new Date()) {
  const open = await db.ticket.findMany({
    where: {
      status: { notIn: ["CLOSED", "CANCELLED", "RESOLVED"] },
      OR: [
        { firstResponseAt: null, breachedResponseAt: null, slaResponseDue: { not: null } },
        { breachedResolveAt: null, slaResolveDue: { not: null }, status: { not: "WAITING_FOR_USER" } },
      ],
    },
    select: {
      id: true,
      number: true,
      subject: true,
      firstResponseAt: true,
      slaResponseDue: true,
      slaResolveDue: true,
      breachedResponseAt: true,
      breachedResolveAt: true,
      status: true,
      assignee: { select: { id: true } },
    },
    take: 300,
  });

  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  let breaches = 0;
  for (const ticket of open) {
    const responseBreach =
      !ticket.firstResponseAt && !ticket.breachedResponseAt && isBreach(now, ticket.slaResponseDue);
    const resolveBreach =
      ticket.status !== "WAITING_FOR_USER" &&
      !ticket.breachedResolveAt &&
      isBreach(now, ticket.slaResolveDue);

    const events = [
      ...(responseBreach
        ? [{ type: "SLA_RESPONSE_BREACH" as const, label: "просрочена реакция" }]
        : []),
      ...(resolveBreach
        ? [{ type: "SLA_RESOLVE_BREACH" as const, label: "просрочено решение" }]
        : []),
    ];
    if (!events.length) continue;

    const recipients = new Set<string>();
    if (ticket.assignee) recipients.add(ticket.assignee.id);
    for (const admin of admins) recipients.add(admin.id);

    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          ...(responseBreach ? { breachedResponseAt: null } : {}),
          ...(resolveBreach ? { breachedResolveAt: null } : {}),
        },
        data: {
          ...(responseBreach ? { breachedResponseAt: now } : {}),
          ...(resolveBreach ? { breachedResolveAt: now } : {}),
        },
      });
      if (updated.count !== 1) return false;

      for (const event of events) {
        await tx.auditLog.create({
          data: {
            action: event.type,
            entityType: "Ticket",
            entityId: ticket.id,
            metadata: {
              before: {},
              after: { breachedAt: now, kind: event.type },
            },
          },
        });

        const text = `HD-${ticket.number}: ${event.label}\n${ticket.subject}\n${ticketLink(ticket.id)}`;
        for (const userId of recipients) {
          await enqueueUserNotification(tx, {
            userId,
            type: event.type,
            ticketId: ticket.id,
            subject: `SLA HD-${ticket.number}`,
            text,
          });
        }
      }
      return true;
    });

    if (changed) breaches += events.length;
  }
  return breaches;
}

export async function drainOutbox() {
  const rows = await db.notificationOutbox.findMany({
    where: { status: "PENDING", attempts: { lt: 5 } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let sent = 0;
  for (const row of rows) {
    const payload = row.payload as {
      to?: string;
      subject?: string;
      text?: string;
      chatId?: string;
      keyboard?: unknown;
    };
    try {
      if (row.channel === "EMAIL" && payload.to && payload.subject && payload.text) {
        const result = await sendMail({ to: payload.to, subject: payload.subject, text: payload.text });
        if (!result.delivered && result.mode === "smtp") throw new Error("SMTP_FAILED");
      } else if (row.channel === "TELEGRAM" && payload.chatId && payload.text) {
        await sendTelegram(payload.chatId, payload.text, payload.keyboard);
      }
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 300) : "FAILED",
          status: row.attempts >= 4 ? "FAILED" : "PENDING",
        },
      });
    }
  }
  return sent;
}
