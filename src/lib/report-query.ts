import { db } from "@/lib/db";
import type { ReportTicket } from "@/lib/reports";

/** Tickets created within [from, toExclusive), shaped for reports and CSV export. */
export async function loadReportTickets(from: Date, toExclusive: Date): Promise<ReportTicket[]> {
  return db.ticket.findMany({
    where: { createdAt: { gte: from, lt: toExclusive } },
    select: {
      number: true,
      subject: true,
      status: true,
      priority: true,
      direction: true,
      workMinutes: true,
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
      category: { select: { name: true } },
      assignee: { select: { id: true, name: true, username: true } },
      requester: { select: { name: true, username: true, department: true } },
      organization: { select: { name: true, domain: true } },
    },
    orderBy: { number: "asc" },
    take: 50000,
  });
}
