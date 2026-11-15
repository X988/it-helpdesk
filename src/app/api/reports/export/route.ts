import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { loadReportTickets } from "@/lib/report-query";
import { formatDay, resolveRange, toCsv } from "@/lib/reports";
import { directionLabel, formatOrganization, formatPerson, priorityLabel, statusLabel } from "@/lib/labels";

/** CSV export of tickets created in ?from=YYYY-MM-DD&to=YYYY-MM-DD (staff only). */
export async function GET(request: Request) {
  try {
    await requireRole(["ADMIN", "TECHNICIAN"]);
    const sp = new URL(request.url).searchParams;
    const { from, toDay, toExclusive } = resolveRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
    const tickets = await loadReportTickets(from, toExclusive);
    const dt = (d: Date | null) => (d ? d.toLocaleString("uk-UA") : "");
    const rows: unknown[][] = [
      [
        "Номер",
        "Тема",
        "Статус",
        "Приоритет",
        "Направление",
        "Категория",
        "Автор",
        "Отдел",
        "Организация",
        "Специалист",
        "Создана",
        "Решена",
        "Закрыта",
        "Затрачено, мин",
      ],
      ...tickets.map((t) => [
        `HD-${t.number}`,
        t.subject,
        statusLabel[t.status],
        priorityLabel[t.priority],
        directionLabel[t.direction],
        t.category.name,
        formatPerson(t.requester.name, t.requester.username),
        t.requester.department ?? "",
        t.organization ? formatOrganization(t.organization.name, t.organization.domain) : "",
        t.assignee ? formatPerson(t.assignee.name, t.assignee.username) : "",
        dt(t.createdAt),
        dt(t.resolvedAt),
        dt(t.closedAt),
        t.workMinutes ?? "",
      ]),
    ];
    const filename = `helpdesk_${formatDay(from)}_${formatDay(toDay)}.csv`;
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
