import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canManageTicket, canReadTicket } from "@/lib/ticket-access";
import { statusChangeSchema } from "@/lib/validation";
import { canTransition, isUserTransition } from "@/lib/transitions";
import { pauseResolve, resumeResolve, type CalendarMode } from "@/lib/sla";
import { enqueueUserNotification } from "@/lib/notifications";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const parsed = statusChangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const current = await db.ticket.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, current, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const next = parsed.data.status;
    const staff = canManageTicket(session.role);
    const requesterTransition = session.role === "USER" && isUserTransition(current.status, next);
    if (!staff && !requesterTransition) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (session.role === "USER" && current.requesterId !== session.userId) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!canTransition(current.status, next)) {
      return NextResponse.json({ error: "INVALID_TRANSITION" }, { status: 409 });
    }
    if (next === "IN_PROGRESS" && current.status === "RESOLVED" && !parsed.data.comment) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Для возврата в работу нужен комментарий" },
        { status: 400 },
      );
    }
    if (next === "WAITING_FOR_USER" && !parsed.data.waitingReasonType) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Укажите причину ожидания" },
        { status: 400 },
      );
    }
    if (next === "CANCELLED" && !parsed.data.cancelReasonType) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Укажите причину отмены" },
        { status: 400 },
      );
    }

    let workMinutes = parsed.data.workMinutes;
    if (parsed.data.workHours != null && workMinutes == null) {
      workMinutes = Math.round(parsed.data.workHours * 60);
    }
    const needsTime = next === "RESOLVED" || (next === "CLOSED" && staff);
    if (needsTime && session.role !== "USER") {
      const total = workMinutes ?? current.workMinutes;
      if (total == null || total < 1) {
        return NextResponse.json(
          { error: "WORK_TIME_REQUIRED", message: "Укажите затраченное время (минуты или часы)" },
          { status: 400 },
        );
      }
      workMinutes = total;
    }

    const now = new Date();
    const mode = (current.slaCalendarMode ?? "BUSINESS_TIME") as CalendarMode;
    const slaPatch: Record<string, unknown> = {};

    if (next === "WAITING_FOR_USER" && current.slaResolveMinutes != null) {
      Object.assign(
        slaPatch,
        pauseResolve({
          createdAt: current.createdAt,
          now,
          pausedMinutes: current.slaPausedMinutes,
          resolveMinutes: current.slaResolveMinutes,
          mode,
        }),
      );
    }

    if (
      current.status === "WAITING_FOR_USER" &&
      next === "IN_PROGRESS" &&
      current.waitingSince &&
      current.slaRemainingResolveMinutes != null
    ) {
      Object.assign(
        slaPatch,
        resumeResolve({
          now,
          waitingSince: current.waitingSince,
          pausedMinutes: current.slaPausedMinutes,
          remainingMinutes: current.slaRemainingResolveMinutes,
          mode,
        }),
      );
    }

    const ticket = await db.$transaction(async (tx) => {
      const changed = await tx.ticket.updateMany({
        where: { id, status: current.status, updatedAt: current.updatedAt },
        data: {
          status: next,
          resolvedAt: next === "RESOLVED" ? now : undefined,
          closedAt: next === "CLOSED" ? now : undefined,
          cancelledAt: next === "CANCELLED" ? now : undefined,
          waitingReasonType: next === "WAITING_FOR_USER" ? parsed.data.waitingReasonType : undefined,
          waitingReasonText: next === "WAITING_FOR_USER" ? parsed.data.waitingReasonText : undefined,
          cancelReasonType: next === "CANCELLED" ? parsed.data.cancelReasonType : undefined,
          cancelReasonText: next === "CANCELLED" ? parsed.data.cancelReasonText : undefined,
          ...(workMinutes != null ? { workMinutes } : {}),
          ...slaPatch,
        },
      });
      if (changed.count !== 1) return null;

      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: current.status,
          toStatus: next,
          actorId: session.userId,
        },
      });

      if (parsed.data.comment) {
        await tx.ticketMessage.create({
          data: {
            ticketId: id,
            authorId: session.userId,
            body: parsed.data.comment,
            visibility: "PUBLIC",
          },
        });
      }

      const type =
        next === "RESOLVED"
          ? "TICKET_RESOLVED"
          : next === "CLOSED"
            ? "TICKET_CLOSED"
            : next === "WAITING_FOR_USER"
              ? "WAITING_FOR_USER"
              : next === "IN_PROGRESS" && current.status === "RESOLVED"
                ? "TICKET_REOPENED"
                : "STATUS_CHANGED";

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action:
            next === "IN_PROGRESS" && current.status === "RESOLVED"
              ? "TICKET_REOPENED"
              : "STATUS_CHANGED",
          entityType: "Ticket",
          entityId: id,
          metadata: {
            before: { status: current.status },
            after: { status: next, workMinutes: workMinutes ?? null },
          },
        },
      });

      const targetId =
        session.userId === current.requesterId
          ? current.assigneeId
          : current.requesterId;
      if (targetId && targetId !== session.userId) {
        const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/tickets/${id}`;
        await enqueueUserNotification(tx, {
          userId: targetId,
          type,
          ticketId: id,
          subject: `HD-${current.number}: статус изменён`,
          text: `HD-${current.number}: статус ${current.status} → ${next}\n${current.subject}\n${link}`,
        });
      }

      return tx.ticket.findUnique({ where: { id } });
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "CONFLICT", message: "Заявку уже изменил другой специалист" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
