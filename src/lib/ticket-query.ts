import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { parseInput } from "@/lib/http";
const schema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(160).default(""), status: z.enum(["", "NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "CANCELLED"]).default(""), priority: z.enum(["", "LOW", "NORMAL", "HIGH", "URGENT"]).default(""), assignment: z.enum(["", "mine", "unassigned"]).default("") });
export function ticketQuery(input: unknown, session: Session) {
  const filters = parseInput(schema, input);
  const where: Prisma.TicketWhereInput = session.role === "USER" ? { requesterId: session.userId } : {};
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.q) where.OR = [{ subject: { contains: filters.q, mode: "insensitive" } }, { description: { contains: filters.q, mode: "insensitive" } }];
  if (session.role !== "USER" && filters.assignment) where.assigneeId = filters.assignment === "mine" ? session.userId : null;
  return { filters, where, take: 20, skip: (filters.page - 1) * 20 };
}
