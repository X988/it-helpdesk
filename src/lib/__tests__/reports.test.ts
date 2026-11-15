import { describe, expect, it } from "vitest";
import { csvCell, resolveRange, summarize, toCsv, type ReportTicket } from "../reports";
import { directionLabel } from "../labels";

function t(over: Partial<ReportTicket>): ReportTicket {
  return {
    number: 1,
    subject: "s",
    status: "NEW",
    priority: "NORMAL",
    direction: "OTHER",
    workMinutes: null,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    resolvedAt: null,
    closedAt: null,
    category: { name: "Windows" },
    assignee: null,
    requester: { name: "U", username: "u", department: null },
    organization: null,
    ...over,
  };
}

describe("summarize", () => {
  it("aggregates counts, work time and resolution time", () => {
    const tech = { id: "a", name: "Tech", username: "tech" };
    const s = summarize(
      [
        t({ status: "RESOLVED", workMinutes: 30, assignee: tech, resolvedAt: new Date("2026-10-01T12:00:00Z") }),
        t({ status: "CLOSED", workMinutes: 90, assignee: tech, direction: "PROGRAMMING", resolvedAt: new Date("2026-10-01T14:00:00Z"), category: { name: "1С/BAF" } }),
        t({ status: "IN_PROGRESS", priority: "URGENT", assignee: tech }),
        t({ status: "CANCELLED" }),
      ],
      directionLabel,
    );
    expect(s.total).toBe(4);
    expect(s.open).toBe(1);
    expect(s.done).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.workMinutes).toBe(120);
    expect(s.avgResolutionMinutes).toBe(180);
    expect(s.byPriority.URGENT).toBe(1);
    expect(s.byAssignee[0]).toEqual({ key: "a", label: "Tech (tech)", count: 3, done: 2, workMinutes: 120 });
    expect(s.byAssignee[1].label).toBe("Не назначен");
    expect(s.byDirection.find((r) => r.key === "PROGRAMMING")?.workMinutes).toBe(90);
    expect(s.byCategory[0].label).toBe("Windows");
  });

  it("returns null average when nothing resolved", () => {
    expect(summarize([t({})], directionLabel).avgResolutionMinutes).toBeNull();
  });
});

describe("resolveRange", () => {
  it("defaults to current month up to today (inclusive)", () => {
    const now = new Date(2026, 10, 15, 13, 0);
    const r = resolveRange(undefined, undefined, now);
    expect(r.from).toEqual(new Date(2026, 10, 1));
    expect(r.toExclusive).toEqual(new Date(2026, 10, 16));
  });

  it("fixes an inverted range", () => {
    const r = resolveRange("2026-10-10", "2026-10-01");
    expect(r.toExclusive).toEqual(new Date(2026, 9, 11));
  });
});

describe("csv", () => {
  it("quotes separators and neutralises formulas", () => {
    expect(csvCell('a;b"c')).toBe('"a;b""c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", 1]])).toBe("﻿a;1\r\n");
  });
});
