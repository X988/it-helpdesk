import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

// One atomic counter is shared by all application processes.
export async function rateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const slot = Math.floor(Date.now() / windowMs);
  const key = scope + ":" + createHash("sha256").update(identity).digest("hex") + ":" + slot;
  const expiresAt = new Date((slot + 1) * windowMs);
  const rows = await db.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "hits" = "RateLimitBucket"."hits" + 1 RETURNING "hits"`;
  if (rows[0].hits > limit) throw new HttpError(429, "RATE_LIMITED");
}
