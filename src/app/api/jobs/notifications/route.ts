import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverNotifications } from "@/lib/notifications";
import { apiError, HttpError } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET; const supplied = request.headers.get("authorization"); const expected = "Bearer " + secret;
    if (!secret || secret.length < 32 || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new HttpError(403, "FORBIDDEN");
    return NextResponse.json(await deliverNotifications());
  } catch (error) { return apiError(error); }
}
