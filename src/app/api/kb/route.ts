import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { kbSchema } from "@/lib/validation";

function slugify(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "article";
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const categoryId = url.searchParams.get("categoryId");
    const staff = session.role !== "USER";
    const articles = await db.kbArticle.findMany({
      where: {
        ...(staff ? {} : { status: "PUBLISHED" }),
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { body: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, title: true, slug: true, status: true, categoryId: true, tags: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(STAFF_ROLES);
    const parsed = kbSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    const base = slugify(parsed.data.title);
    let slug = base;
    for (let i = 2; i < 20; i++) {
      const exists = await db.kbArticle.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) break;
      slug = `${base}-${i}`;
    }
    const status = parsed.data.status ?? "DRAFT";
    const article = await db.kbArticle.create({
      data: {
        title: parsed.data.title,
        slug,
        body: parsed.data.body,
        categoryId: parsed.data.categoryId ?? null,
        tags: parsed.data.tags ?? [],
        status,
        authorId: session.userId,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}
