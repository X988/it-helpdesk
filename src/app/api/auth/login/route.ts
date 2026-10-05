import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { authenticateDomainLogin } from "@/lib/authenticate";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
