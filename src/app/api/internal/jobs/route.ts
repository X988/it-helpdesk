import { NextResponse } from "next/server";
import { runMaintenance } from "@/lib/jobs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (!secret || header !== secret) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const result = await runMaintenance();
    return NextResponse.json(result);
  } catch (error) {
    console.error("jobs failed", error);
    return NextResponse.json({ error: "JOB_FAILED" }, { status: 500 });
  }
}
