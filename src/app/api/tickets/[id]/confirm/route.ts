import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { applyRequesterDecision } from "@/lib/ticket-workflow";

const bodySchema = z.object({ decision: z.enum(["fixed", "reopen"]) });

/** Requester confirms ("fixed") or rejects ("reopen") a resolved ticket. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    const status = await applyRequesterDecision(id, session.userId, parsed.data.decision);
    if (!status) return NextResponse.json({ error: "Ticket is not awaiting your confirmation" }, { status: 409 });
    return NextResponse.json({ status });
  } catch (error) {
    return apiError(error);
  }
}
