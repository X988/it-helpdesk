import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { db } from "@/lib/db";
import { formatPerson } from "@/lib/labels";

export const dynamic = "force-dynamic";

const cards = [
  { href: "/tickets/new", title: "Новая заявка", text: "Опишите проблему, выберите категорию и приложите скриншоты." },
  { href: "/dashboard", title: "Мои заявки", text: "Следите за статусом и отвечайте специалисту." },
  { href: "/dashboard", title: "IT очередь", text: "Рабочее место специалистов поддержки." },
];

export default async function Home() {
  const session = await getSession();
  const me = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true, username: true },
      })
    : null;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">INTERNAL SERVICE DESK</p>
          <h1>IT Help Desk</h1>
        </div>
        {session ? (
          <div className="actionRow" style={{ marginBottom: 0, alignItems: "center" }}>
            <span className="muted">{formatPerson(me?.name, me?.username)}</span>
            <Link className="button" href="/dashboard">
              Открыть панель
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <Link className="button" href="/login">
            Войти
          </Link>
        )}
      </header>
      <p className="muted">Заявки, коммуникация и контроль работы IT-поддержки в одном интерфейсе.</p>
      <section className="grid" style={{ marginTop: 28 }}>
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="card cardLink">
            <h2>{card.title}</h2>
            <p className="muted">{card.text}</p>
            <span className="cardCta">Перейти →</span>
          </Link>
        ))}
      </section>
      {!session && (
        <p className="muted" style={{ marginTop: 20 }}>
          Для работы с заявками нужно <Link href="/login">войти</Link>.
        </p>
      )}
    </main>
  );
}
