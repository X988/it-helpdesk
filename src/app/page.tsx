import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { db } from "@/lib/db";
import { formatPerson } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const me = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true, username: true, role: true },
      })
    : null;
  const isStaff = session && (session.role === "ADMIN" || session.role === "TECHNICIAN");
  const isUser = session?.role === "USER";

  const cards: { href: string; title: string; text: string }[] = [];
  if (!session) {
    cards.push(
      { href: "/login", title: "Войти", text: "Войдите доменной учётной записью, чтобы создать заявку или посмотреть статус." },
      { href: "/login", title: "Новая заявка", text: "После входа опишите проблему и приложите скриншоты." },
    );
  } else if (isUser) {
    cards.push(
      { href: "/tickets/new", title: "Новая заявка", text: "Опишите проблему, выберите категорию и приложите скриншоты." },
      { href: "/dashboard", title: "Мои заявки", text: "Статус ваших заявок, специалист и чат с поддержкой." },
    );
  } else if (isStaff) {
    cards.push(
      { href: "/tickets/new", title: "Новая заявка", text: "Создать заявку от своего имени." },
      { href: "/dashboard", title: "Панель специалиста", text: "Очередь всех заявок, назначение и статусы." },
      { href: "/dashboard", title: "IT очередь", text: "Рабочее место специалистов поддержки." },
    );
    if (session.role === "ADMIN") {
      cards.push({
        href: "/admin/organizations",
        title: "Организации",
        text: "Добавление и правка организаций (например КП (energo)).",
      });
    }
  }

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
              {isStaff ? "Открыть панель" : "Мои заявки"}
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <Link className="button" href="/login">
            Войти
          </Link>
        )}
      </header>
      <p className="muted">
        {isUser
          ? "Ваши заявки в IT-поддержку: создание, статус и переписка со специалистом."
          : isStaff
            ? "Расширенная панель IT: очередь заявок, назначение, организации и коммуникация."
            : "Заявки, коммуникация и контроль работы IT-поддержки в одном интерфейсе."}
      </p>
      <section className="grid" style={{ marginTop: 28 }}>
        {cards.map((card) => (
          <Link key={`${card.href}-${card.title}`} href={card.href} className="card cardLink">
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
