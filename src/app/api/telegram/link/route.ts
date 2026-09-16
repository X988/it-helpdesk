import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export async function POST() {
  try {
    const session = await requireSession(); const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex"); const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.telegramLinkToken.create({ data: { userId: session.userId, tokenHash, expiresAt } });
    const username = process.env.TELEGRAM_BOT_USERNAME; if (!username) throw new Error("TELEGRAM_BOT_USERNAME is required");
    return NextResponse.json({ url: `https://t.me/${username}?start=${raw}`, expiresAt });
  } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
}
