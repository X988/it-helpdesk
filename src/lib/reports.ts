import type { Priority, TaskDirection, TicketStatus } from "@prisma/client";

export type ReportTicket = {
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  direction: TaskDirection;
  workMinutes: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  category: { name: string };
  assignee: { id: string; name: string; username: string | null } | null;
  requester: { name: string; username: string | null; department: string | null };
  organization: { name: string; domain: string } | null;
};

export type GroupRow = { key: string; label: string; count: number; done: number; workMinutes: number };

export type ReportSummary = {
  total: number;
  open: number;
  done: number;
  cancelled: number;
  workMinutes: number;
  /** average minutes from creation to resolution, null if nothing resolved */
  avgResolutionMinutes: number | null;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<Priority, number>;
  byDirection: GroupRow[];
  byCategory: GroupRow[];
  byAssignee: GroupRow[];
};

const DONE: TicketStatus[] = ["RESOLVED", "CLOSED"];
const OPEN: TicketStatus[] = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER"];

function bump(map: Map<string, GroupRow>, key: string, label: string, t: ReportTicket) {
  const row = map.get(key) ?? { key, label, count: 0, done: 0, workMinutes: 0 };
  row.count += 1;
  if (DONE.includes(t.status)) row.done += 1;
  row.workMinutes += t.workMinutes ?? 0;
  map.set(key, row);
}

function sorted(map: Map<string, GroupRow>) {
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
}

export function summarize(
  tickets: ReportTicket[],
  directionLabels: Record<TaskDirection, string>,
): ReportSummary {
  const byStatus: Record<TicketStatus, number> = {
    NEW: 0,
    IN_PROGRESS: 0,
    WAITING_FOR_USER: 0,
    RESOLVED: 0,
    CLOSED: 0,
    CANCELLED: 0,
  };
  const byPriority: Record<Priority, number> = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 };
  const dir = new Map<string, GroupRow>();
  const cat = new Map<string, GroupRow>();
  const asg = new Map<string, GroupRow>();
  let workMinutes = 0;
  let resolvedMs = 0;
  let resolvedN = 0;

  for (const t of tickets) {
    byStatus[t.status] += 1;
    byPriority[t.priority] += 1;
    workMinutes += t.workMinutes ?? 0;
    const end = t.resolvedAt ?? (t.status === "CLOSED" ? t.closedAt : null);
    if (end && DONE.includes(t.status)) {
      resolvedMs += Math.max(0, end.getTime() - t.createdAt.getTime());
      resolvedN += 1;
    }
    bump(dir, t.direction, directionLabels[t.direction], t);
    bump(cat, t.category.name, t.category.name, t);
    if (t.assignee) {
      bump(asg, t.assignee.id, t.assignee.username ? `${t.assignee.name} (${t.assignee.username})` : t.assignee.name, t);
    } else {
      bump(asg, "none", "Не назначен", t);
    }
  }

  return {
    total: tickets.length,
    open: OPEN.reduce((s, k) => s + byStatus[k], 0),
    done: byStatus.RESOLVED + byStatus.CLOSED,
    cancelled: byStatus.CANCELLED,
    workMinutes,
    avgResolutionMinutes: resolvedN ? Math.round(resolvedMs / resolvedN / 60_000) : null,
    byStatus,
    byPriority,
    byDirection: sorted(dir),
    byCategory: sorted(cat),
    byAssignee: sorted(asg),
  };
}

/** Parse YYYY-MM-DD; returns null on invalid input. */
export function parseDay(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Resolve the [from, toExclusive) range; defaults to the current month. */
export function resolveRange(fromRaw?: string, toRaw?: string, now = new Date()) {
  const from = parseDay(fromRaw) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const toDay = parseDay(toRaw) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toExclusive = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);
  if (toExclusive <= from) {
    return { from, toDay: from, toExclusive: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1) };
  }
  return { from, toDay, toExclusive };
}

/** RFC 4180 CSV cell; also neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][], separator = ";"): string {
  // BOM so Excel opens UTF-8 Cyrillic correctly; ";" is Excel's default separator in RU/UA locales.
  return "﻿" + rows.map((r) => r.map(csvCell).join(separator)).join("\r\n") + "\r\n";
}
