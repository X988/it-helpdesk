import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  addCalendarMinutes,
  businessMinutesBetween,
  initialDeadlines,
  isBreach,
  kyivWallToUtc,
  pauseResolve,
  resumeResolve,
  DEFAULT_POLICIES,
} from "@/lib/sla";
import { canTransition, isUserTransition } from "@/lib/transitions";
import { canReadTicket } from "@/lib/ticket-access";
import { average, compliance, median } from "@/lib/metrics";
import { canonicalMime } from "@/lib/storage";

describe("business SLA", () => {
  it("moves Friday 17:40 plus 8 business hours to Monday 16:40", () => {
    const friday = kyivWallToUtc(2026, 10, 9, 17, 40);
    expect(friday.getUTCDay()).toBe(5);
    const due = addBusinessMinutes(friday, 8 * 60);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(due);
    expect(parts).toContain("Mon");
    expect(parts).toContain("16:40");
  });

  it("starts after 18:00 on the next business morning", () => {
    const due = addBusinessMinutes(kyivWallToUtc(2026, 10, 9, 18, 10), 60);
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(due);
    expect(label).toContain("Mon");
    expect(label).toContain("10:00");
  });

  it("starts before 09:00 at 09:00 the same weekday", () => {
    const due = addBusinessMinutes(kyivWallToUtc(2026, 10, 7, 8, 15), 30);
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(due);
    expect(label).toContain("Wed");
    expect(label).toContain("09:30");
  });

  it("skips the weekend", () => {
    const due = addBusinessMinutes(kyivWallToUtc(2026, 10, 10, 12, 0), 60);
    const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", weekday: "short" }).format(due);
    expect(label).toContain("Mon");
  });

  it("counts only open minutes between two instants", () => {
    const start = kyivWallToUtc(2026, 10, 9, 17, 0);
    const end = kyivWallToUtc(2026, 10, 12, 10, 0);
    expect(businessMinutesBetween(start, end)).toBe(60 + 60);
  });

  it("keeps critical SLA on the wall clock overnight", () => {
    const created = kyivWallToUtc(2026, 10, 7, 2, 0);
    const policy = DEFAULT_POLICIES.find((item) => item.priority === "URGENT")!;
    const deadlines = initialDeadlines(created, policy);
    expect(deadlines.slaResponseDue.getTime() - created.getTime()).toBe(15 * 60_000);
    expect(deadlines.slaResolveDue.getTime() - created.getTime()).toBe(4 * 60 * 60_000);
    expect(addCalendarMinutes(created, 15).toISOString()).toBe(deadlines.slaResponseDue.toISOString());
  });

  it("pauses resolution and resumes with the remaining budget", () => {
    const created = kyivWallToUtc(2026, 10, 7, 10, 0);
    const pausedAt = kyivWallToUtc(2026, 10, 7, 11, 0);
    const paused = pauseResolve({
      createdAt: created,
      now: pausedAt,
      pausedMinutes: 0,
      resolveMinutes: 8 * 60,
      mode: "BUSINESS_TIME",
    });
    expect(paused.slaRemainingResolveMinutes).toBe(7 * 60);
    const resumedAt = kyivWallToUtc(2026, 10, 8, 10, 0);
    const resumed = resumeResolve({
      now: resumedAt,
      waitingSince: pausedAt,
      pausedMinutes: 0,
      remainingMinutes: paused.slaRemainingResolveMinutes,
      mode: "BUSINESS_TIME",
    });
    expect(resumed.slaPausedMinutes).toBe(8 * 60);
    expect(resumed.slaResolveDue.getTime()).toBe(addBusinessMinutes(resumedAt, 7 * 60).getTime());
  });

  it("treats the exact deadline as still inside SLA", () => {
    const due = new Date("2026-10-07T12:00:00.000Z");
    expect(isBreach(due, due)).toBe(false);
    expect(isBreach(new Date(due.getTime() + 1), due)).toBe(true);
  });
});

describe("transitions and access", () => {
  it("forbids NEW to CLOSED and allows reopen", () => {
    expect(canTransition("NEW", "CLOSED")).toBe(false);
    expect(canTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(isUserTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("NEW", "IN_PROGRESS")).toBe(true);
  });

  it("hides other departments from a technician and internal notes from a user", () => {
    expect(canReadTicket("USER", "u1", { requesterId: "u2", departmentId: "d1" }, null)).toBe(false);
    expect(canReadTicket("USER", "u1", { requesterId: "u1", departmentId: "d1" }, null)).toBe(true);
    expect(canReadTicket("TECHNICIAN", "t1", { requesterId: "u1", departmentId: "d2" }, "d1")).toBe(false);
    expect(canReadTicket("TECHNICIAN", "t1", { requesterId: "u1", assigneeId: "t1", departmentId: "d2" }, "d1")).toBe(true);
    expect(canReadTicket("TECHNICIAN", "t1", { requesterId: "u1" }, "d1")).toBe(true);
    expect(canReadTicket("ADMIN", "a1", { requesterId: "u1", departmentId: "d9" }, null)).toBe(true);
  });
});

describe("metrics", () => {
  it("computes median and compliance", () => {
    expect(median([1, 9, 3])).toBe(3);
    expect(average([2, 4])).toBe(3);
    expect(compliance(4, 1)).toBe(0.75);
  });
});

describe("uploads", () => {
  it("rejects an unknown extension", () => {
    const file = new File(["x"], "note.exe", { type: "application/octet-stream" });
    expect(() => canonicalMime(file)).toThrow("INVALID_FILE_TYPE");
  });

  it("accepts docx and zip", () => {
    expect(canonicalMime(new File(["x"], "a.docx", { type: "application/octet-stream" }))).toContain("wordprocessingml");
    expect(canonicalMime(new File(["x"], "a.zip", { type: "application/zip" }))).toBe("application/zip");
  });
});
