import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin, validId, readJson, parseInput } from "@/lib/http";
import { assignTicket } from "@/lib/tickets";
import { assignSchema } from "@/lib/validation";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const id = validId((await context.params).id);
    const data = parseInput(assignSchema, await readJson(request));
    return NextResponse.json({ ticket: await assignTicket(session, id, data.assigneeId) });
  } catch (error) { return apiError(error); }
}
