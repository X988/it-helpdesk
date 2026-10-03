import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { apiError, requireSameOrigin, validId } from "@/lib/http";
import { claimTicket } from "@/lib/tickets";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const id = validId((await context.params).id);
    
    return NextResponse.json({ ticket: await claimTicket(session, id) });
  } catch (error) { return apiError(error); }
}
