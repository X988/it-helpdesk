import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function KnowledgeBase({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { q } = await searchParams;
  const query = q?.trim();
  const staff = session.role !== "USER";
  const articles = await db.kbArticle.findMany({
    where: {
      ...(staff ? {} : { status: "PUBLISHED" }),
      ...(query
        ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] }
        : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">БАЗА ЗНАНИЙ</p>
          <h1>Статьи</h1>
        </div>
        <Link className="button secondary" href="/dashboard">К заявкам</Link>
      </header>
      <form className="actionRow">
        <input name="q" defaultValue={query} placeholder="Поиск" aria-label="Поиск по статьям" />
        <button type="submit">Найти</button>
      </form>
      <section className="grid" style={{ marginTop: 16 }}>
        {articles.length === 0 && <p className="muted">Статей пока нет.</p>}
        {articles.map((article) => (
          <Link key={article.id} href={`/kb/${article.slug}`} className="card cardLink">
            <h2>{article.title}</h2>
            <p className="muted">{article.category?.name ?? "Без категории"}{article.status === "DRAFT" ? " · черновик" : ""}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
