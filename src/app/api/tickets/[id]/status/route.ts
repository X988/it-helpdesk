import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin, validId, readJson, parseInput } from "@/lib/http";
import { transitionTicket } from "@/lib/tickets";
import { statusSchema } from "@/lib/validation";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const id = validId((await context.params).id);
    const data = parseInput(statusSchema, await readJson(request));
    return NextResponse.json({ ticket: await transitionTicket(session, id, data.status) });
  } catch (error) { return apiError(error); }
}
