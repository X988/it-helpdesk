import type { Prisma, Priority, TaskDirection, TicketStatus } from "@prisma/client";

export const TICKET_STATUSES: TicketStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
];
export const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const DIRECTIONS: TaskDirection[] = ["PROGRAMMING", "ADMINISTRATION", "OTHER"];

/** Statuses that still need work. "open" in the status filter expands to these. */
export const OPEN_STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER"];

export const PAGE_SIZE = 25;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TicketFilters = {
  q: string;
  /** "" = all, "open" = OPEN_STATUSES, or a single TicketStatus */
  status: "" | "open" | TicketStatus;
  priority: "" | Priority;
  direction: "" | TaskDirection;
  categoryId: string;
  /** "" = anyone, "me", "none", or a user id */
  assignee: string;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function pick<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/** Parse URL search params into validated filters; unknown values are dropped. */
export function parseTicketFilters(params: RawParams): TicketFilters {
  const statusRaw = first(params.status);
  const status = statusRaw === "open" ? "open" : pick(statusRaw, TICKET_STATUSES);
  const assigneeRaw = first(params.assignee);
  const assignee =
    assigneeRaw === "me" || assigneeRaw === "none" || UUID_RE.test(assigneeRaw) ? assigneeRaw : "";
  const categoryRaw = first(params.categoryId);
  const pageNum = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).slice(0, 200),
    status,
    priority: pick(first(params.priority), PRIORITIES),
    direction: pick(first(params.direction), DIRECTIONS),
    categoryId: UUID_RE.test(categoryRaw) ? categoryRaw : "",
    assignee,
    page: Number.isFinite(pageNum) && pageNum > 0 ? Math.min(pageNum, 10000) : 1,
  };
}

/** Extract a ticket number from "HD-15", "hd15", "#15" or "15". */
export function parseTicketNumber(q: string): number | null {
  const m = /^(?:hd-?|#)?\s*(\d{1,9})$/i.exec(q.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 2147483647 ? n : null;
}

/**
 * Build the Prisma where clause. `scope` restricts what the viewer may see
 * (e.g. own tickets only for USER); filters are AND-ed on top of it.
 * USER viewers ignore assignee/direction filters.
 */
export function buildTicketWhere(
  filters: TicketFilters,
  viewer: { userId: string; isStaff: boolean },
): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [];
  if (!viewer.isStaff) and.push({ requesterId: viewer.userId });

  if (filters.status === "open") and.push({ status: { in: OPEN_STATUSES } });
  else if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });

  if (viewer.isStaff) {
    if (filters.direction) and.push({ direction: filters.direction });
    if (filters.assignee === "me") and.push({ assigneeId: viewer.userId });
    else if (filters.assignee === "none") and.push({ assigneeId: null });
    else if (filters.assignee) and.push({ assigneeId: filters.assignee });
  }

  if (filters.q) {
    const or: Prisma.TicketWhereInput[] = [
      { subject: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
    if (viewer.isStaff) {
      or.push({ requester: { name: { contains: filters.q, mode: "insensitive" } } });
      or.push({ requester: { username: { contains: filters.q, mode: "insensitive" } } });
    }
    const num = parseTicketNumber(filters.q);
    if (num) or.push({ number: num });
    and.push({ OR: or });
  }

  return and.length ? { AND: and } : {};
}

/** Serialize filters back into a query string (empty values omitted). */
export function filtersToQuery(filters: Partial<TicketFilters>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === "" || v == null) continue;
    if (k === "page" && v === 1) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: TicketFilters) {
  return Boolean(f.q || f.status || f.priority || f.direction || f.categoryId || f.assignee);
}
