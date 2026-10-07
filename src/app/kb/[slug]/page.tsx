import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { slug } = await params;
  const article = await db.kbArticle.findUnique({
    where: { slug },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!article) notFound();
  if (article.status !== "PUBLISHED" && session.role === "USER") notFound();
  if (article.status === "PUBLISHED") {
    await db.kbArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
  }
  const createHref = article.category
    ? `/tickets/new?categoryId=${article.category.id}`
    : "/tickets/new";
  return (
    <main className="shell">
      <Link href="/kb" className="muted">← База знаний</Link>
      <article className="card" style={{ marginTop: 16 }}>
        <p className="muted">{article.category?.name ?? "Без категории"}</p>
        <h1>{article.title}</h1>
        <p className="pre">{article.body}</p>
        <Link className="button" href={createHref}>Это не помогло — создать заявку</Link>
      </article>
    </main>
  );
}
