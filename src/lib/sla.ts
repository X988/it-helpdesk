/**
 * SLA clock for Europe/Kyiv.
 * BUSINESS_TIME: Mon–Fri 09:00–18:00 (9h). Weekends are closed.
 * Holidays are not applied yet — CalendarProvider is the extension point.
 * CALENDAR_TIME: wall clock, 24/7 (used for URGENT / critical).
 * A deadline hit at the exact instant is still inside SLA (breach is strict > due).
 */

export type SlaPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type CalendarMode = "BUSINESS_TIME" | "CALENDAR_TIME";

export const KYIV = "Europe/Kyiv";
const OPEN = 9 * 60;
const CLOSE = 18 * 60;

export type CalendarProvider = {
  /** Return false to skip a civil Kyiv date (yyyy-mm-dd). Weekends are already skipped by the business clock. */
  isHoliday?: (isoDate: string) => boolean;
};

export const weekdayCalendar: CalendarProvider = {};

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type KyivParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function kyivParts(date: Date): KyivParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: DOW[bag.weekday] ?? 0,
  };
}

function offsetMs(utc: Date) {
  const p = kyivParts(utc);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utc.getTime();
}

export function kyivWallToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const next = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMs(new Date(guess));
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(y: number, m: number, d: number, days: number) {
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate(), weekday: utc.getUTCDay() };
}

function isClosedDay(y: number, m: number, d: number, weekday: number, calendar: CalendarProvider) {
  if (weekday === 0 || weekday === 6) return true;
  return calendar.isHoliday?.(isoDate(y, m, d)) === true;
}

function nextOpenMorning(
  y: number,
  m: number,
  d: number,
  weekday: number,
  calendar: CalendarProvider,
  skipCurrent: boolean,
) {
  let cursor = { year: y, month: m, day: d, weekday };
  if (skipCurrent) cursor = addDays(cursor.year, cursor.month, cursor.day, 1);
  while (isClosedDay(cursor.year, cursor.month, cursor.day, cursor.weekday, calendar)) {
    cursor = addDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return kyivWallToUtc(cursor.year, cursor.month, cursor.day, 9, 0);
}

/** Move to the next instant that is inside business hours. Already-open instants stay put. */
export function snapToBusinessOpen(start: Date, calendar: CalendarProvider = weekdayCalendar) {
  const p = kyivParts(start);
  const mins = p.hour * 60 + p.minute;
  if (!isClosedDay(p.year, p.month, p.day, p.weekday, calendar) && mins >= OPEN && mins < CLOSE) return new Date(start);
  if (!isClosedDay(p.year, p.month, p.day, p.weekday, calendar) && mins < OPEN) {
    return kyivWallToUtc(p.year, p.month, p.day, 9, 0);
  }
  return nextOpenMorning(p.year, p.month, p.day, p.weekday, calendar, true);
}

export function addBusinessMinutes(start: Date, minutes: number, calendar: CalendarProvider = weekdayCalendar) {
  if (minutes <= 0) return new Date(start);
  let cursor = snapToBusinessOpen(start, calendar);
  let left = minutes;
  while (left > 0) {
    const p = kyivParts(cursor);
    const available = CLOSE - (p.hour * 60 + p.minute);
    if (left < available) return new Date(cursor.getTime() + left * 60_000);
    if (left === available) return kyivWallToUtc(p.year, p.month, p.day, 18, 0);
    left -= available;
    cursor = nextOpenMorning(p.year, p.month, p.day, p.weekday, calendar, true);
  }
  return cursor;
}

export function addCalendarMinutes(start: Date, minutes: number) {
  return new Date(start.getTime() + minutes * 60_000);
}

export function businessMinutesBetween(start: Date, end: Date, calendar: CalendarProvider = weekdayCalendar) {
  if (end.getTime() <= start.getTime()) return 0;
  let cursor = snapToBusinessOpen(start, calendar);
  if (cursor.getTime() >= end.getTime()) return 0;
  let total = 0;
  while (cursor.getTime() < end.getTime()) {
    const p = kyivParts(cursor);
    const close = kyivWallToUtc(p.year, p.month, p.day, 18, 0);
    const segmentEnd = close.getTime() < end.getTime() ? close : end;
    total += Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000));
    if (close.getTime() >= end.getTime()) break;
    cursor = nextOpenMorning(p.year, p.month, p.day, p.weekday, calendar, true);
  }
  return total;
}

export function minutesBetween(start: Date, end: Date, mode: CalendarMode, calendar: CalendarProvider = weekdayCalendar) {
  if (mode === "CALENDAR_TIME") return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  return businessMinutesBetween(start, end, calendar);
}

export function addMinutes(start: Date, minutes: number, mode: CalendarMode, calendar: CalendarProvider = weekdayCalendar) {
  return mode === "CALENDAR_TIME" ? addCalendarMinutes(start, minutes) : addBusinessMinutes(start, minutes, calendar);
}

export type SlaSnapshotInput = {
  priority: SlaPriority;
  responseMinutes: number;
  resolveMinutes: number;
  calendarMode: CalendarMode;
  version: number;
};

export function initialDeadlines(createdAt: Date, policy: SlaSnapshotInput, calendar?: CalendarProvider) {
  return {
    slaResponseDue: addMinutes(createdAt, policy.responseMinutes, policy.calendarMode, calendar),
    slaResolveDue: addMinutes(createdAt, policy.resolveMinutes, policy.calendarMode, calendar),
    slaResponseMinutes: policy.responseMinutes,
    slaResolveMinutes: policy.resolveMinutes,
    slaCalendarMode: policy.calendarMode,
    slaPolicyVersion: policy.version,
    slaCalculatedAt: createdAt,
    slaPausedMinutes: 0,
    slaRemainingResolveMinutes: policy.resolveMinutes,
  };
}

export function spentResolveMinutes(
  createdAt: Date,
  now: Date,
  pausedMinutes: number,
  mode: CalendarMode,
  calendar?: CalendarProvider,
) {
  return Math.max(0, minutesBetween(createdAt, now, mode, calendar) - pausedMinutes);
}

/** Freeze resolution SLA. Response SLA keeps running. */
export function pauseResolve(args: {
  createdAt: Date;
  now: Date;
  pausedMinutes: number;
  resolveMinutes: number;
  mode: CalendarMode;
  calendar?: CalendarProvider;
}) {
  const spent = spentResolveMinutes(args.createdAt, args.now, args.pausedMinutes, args.mode, args.calendar);
  return {
    waitingSince: args.now,
    slaRemainingResolveMinutes: Math.max(0, args.resolveMinutes - spent),
  };
}

export function resumeResolve(args: {
  now: Date;
  waitingSince: Date;
  pausedMinutes: number;
  remainingMinutes: number;
  mode: CalendarMode;
  calendar?: CalendarProvider;
}) {
  const paused = args.pausedMinutes + minutesBetween(args.waitingSince, args.now, args.mode, args.calendar);
  return {
    waitingSince: null as Date | null,
    slaPausedMinutes: paused,
    slaRemainingResolveMinutes: args.remainingMinutes,
    slaResolveDue: addMinutes(args.now, args.remainingMinutes, args.mode, args.calendar),
  };
}

export function isBreach(now: Date, due: Date | null) {
  if (!due) return false;
  return now.getTime() > due.getTime();
}

/** One business day in this calendar is 09:00–18:00 = 540 minutes. */
export const DEFAULT_POLICIES: SlaSnapshotInput[] = [
  { priority: "LOW", responseMinutes: 8 * 60, resolveMinutes: 5 * 540, calendarMode: "BUSINESS_TIME", version: 1 },
  { priority: "NORMAL", responseMinutes: 4 * 60, resolveMinutes: 2 * 540, calendarMode: "BUSINESS_TIME", version: 1 },
  { priority: "HIGH", responseMinutes: 60, resolveMinutes: 8 * 60, calendarMode: "BUSINESS_TIME", version: 1 },
  { priority: "URGENT", responseMinutes: 15, resolveMinutes: 4 * 60, calendarMode: "CALENDAR_TIME", version: 1 },
];
