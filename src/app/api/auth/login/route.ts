import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { apiError, requireSameOrigin, readJson, parseInput, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
const dummyHash = bcrypt.hashSync("timing-only-placeholder", 12);
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const data = parseInput(loginSchema, await readJson(request));
    await rateLimit("login-global", "all", 100, 60_000);
    await rateLimit("login-account", data.email, 10, 15 * 60_000);
    const user = await db.user.findUnique({ where: { email: data.email } });
    const matches = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
    if (!user || !user.isActive || !matches) throw new HttpError(401, "INVALID_CREDENTIALS");
    await setSessionCookie(await createSessionToken(user.id));
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { return apiError(error); }
}
