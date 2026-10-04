import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ticketCreateSchema } from "@/lib/validation";
import { apiError, requireSameOrigin, readJson, parseInput } from "@/lib/http";
import { createTicket } from "@/lib/tickets";
import { ticketQuery } from "@/lib/ticket-query";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { filters, where, take, skip } = ticketQuery(Object.fromEntries(new URL(request.url).searchParams), session);
    const [tickets, total] = await db.$transaction([
      db.ticket.findMany({ where, select: { id: true, number: true, subject: true, priority: true, status: true, createdAt: true, category: { select: { name: true } }, requester: { select: { name: true } }, assignee: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip }),
      db.ticket.count({ where }),
    ]);
    return NextResponse.json({ tickets, total, page: filters.page, pageSize: take });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const data = parseInput(ticketCreateSchema, await readJson(request));
    await rateLimit("tickets", session.userId, 30, 60_000);
    return NextResponse.json({ ticket: await createTicket(session, data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
