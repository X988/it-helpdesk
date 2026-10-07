import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { authenticateDomainLogin } from "@/lib/authenticate";
import { loginSchema } from "@/lib/validation";

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 10;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные учётные данные" }, { status: 400 });
  }
  const loginKey = (parsed.data.login || parsed.data.username || parsed.data.email || "").toLowerCase();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(`${ip}:${loginKey}`)) {
    return NextResponse.json({ error: "Неверные учётные данные" }, { status: 429 });
  }

  try {
    const user = await authenticateDomainLogin(parsed.data);
    const token = await createSessionToken({ userId: user.id, role: user.role, email: user.email });
    await setSessionCookie(token);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "INVALID_BODY") {
      return NextResponse.json({ error: "Неверные учётные данные" }, { status: 400 });
    }
    return NextResponse.json({ error: "Неверные учётные данные" }, { status: 401 });
  }
}
