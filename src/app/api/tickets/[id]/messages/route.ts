import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin, validId, readJson, parseInput } from "@/lib/http";
import { addMessage } from "@/lib/tickets";
import { messageCreateSchema } from "@/lib/validation";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const id = validId((await context.params).id);
    const data = parseInput(messageCreateSchema, await readJson(request));
    return NextResponse.json({ message: await addMessage(session, id, data) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
