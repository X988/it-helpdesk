import { describe, expect, it } from "vitest";
import {
  buildTicketWhere,
  filtersToQuery,
  parseTicketFilters,
  parseTicketNumber,
  OPEN_STATUSES,
} from "../ticket-filters";

const UID = "11111111-2222-3333-4444-555555555555";

describe("parseTicketFilters", () => {
  it("keeps valid values and drops unknown ones", () => {
    const f = parseTicketFilters({
      q: "  принтер ",
      status: "IN_PROGRESS",
      priority: "BOGUS",
      direction: "OTHER",
      categoryId: "not-a-uuid",
      assignee: "me",
      page: "3",
    });
    expect(f).toEqual({
      q: "принтер",
      status: "IN_PROGRESS",
      priority: "",
      direction: "OTHER",
      categoryId: "",
      assignee: "me",
      page: 3,
    });
  });

  it("defaults page to 1 and accepts 'open' status", () => {
    const f = parseTicketFilters({ status: "open", page: "-2", assignee: "x" });
    expect(f.status).toBe("open");
    expect(f.page).toBe(1);
    expect(f.assignee).toBe("");
  });
});

describe("parseTicketNumber", () => {
  it.each([
    ["HD-15", 15],
    ["hd15", 15],
    ["#7", 7],
    ["42", 42],
    ["принтер", null],
    ["0", null],
  ])("%s → %s", (q, n) => expect(parseTicketNumber(q)).toBe(n));
});

describe("buildTicketWhere", () => {
  const base = parseTicketFilters({});

  it("restricts USER to own tickets and ignores staff-only filters", () => {
    const where = buildTicketWhere({ ...base, assignee: "none", direction: "OTHER" }, { userId: UID, isStaff: false });
    expect(where).toEqual({ AND: [{ requesterId: UID }] });
  });

  it("returns empty where for staff without filters", () => {
    expect(buildTicketWhere(base, { userId: UID, isStaff: true })).toEqual({});
  });

  it("expands open status and maps assignee=me", () => {
    const where = buildTicketWhere({ ...base, status: "open", assignee: "me" }, { userId: UID, isStaff: true });
    expect(where).toEqual({ AND: [{ status: { in: OPEN_STATUSES } }, { assigneeId: UID }] });
  });

  it("searches by number when query looks like HD-n", () => {
    const where = buildTicketWhere({ ...base, q: "HD-12" }, { userId: UID, isStaff: true });
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ number: 12 });
    expect(or).toHaveLength(5);
  });
});

describe("filtersToQuery", () => {
  it("omits empty values and page 1", () => {
    expect(filtersToQuery({ q: "", status: "NEW", page: 1 })).toBe("?status=NEW");
    expect(filtersToQuery({})).toBe("");
    expect(filtersToQuery({ q: "a b", page: 2 })).toBe("?q=a+b&page=2");
  });
});
