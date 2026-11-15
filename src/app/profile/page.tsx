import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import UserNav from "@/components/UserNav";
import { formatOrganization, formatPerson, roleLabel } from "@/lib/labels";
import TelegramLink from "./TelegramLink";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const me = await db.user.findUnique({
    where: { id: s.userId },
    select: {
      name: true,
      username: true,
      email: true,
      role: true,
      department: true,
      organization: { select: { name: true, domain: true } },
      telegram: { select: { linkedAt: true } },
    },
  });
  if (!me) redirect("/login");
  const botConfigured = Boolean(process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_BOT_TOKEN);

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="muted">IT HELP DESK</p>
          <h1>Профиль</h1>
        </div>
        <UserNav userId={s.userId} role={s.role} />
      </header>
      <div className="ticketLayout">
        <section className="card">
          <h2>Учётная запись</h2>
          <p>
            <b>Пользователь:</b> {formatPerson(me.name, me.username)}
          </p>
          <p>
            <b>Email:</b> {me.email}
          </p>
          <p>
            <b>Роль:</b> {roleLabel[me.role]}
          </p>
          <p>
            <b>Организация:</b> {formatOrganization(me.organization?.name, me.organization?.domain)}
          </p>
          <p>
            <b>Отдел:</b> {me.department || "—"}
          </p>
          <p className="muted">Данные берутся из Active Directory. Роль назначает администратор Help Desk.</p>
        </section>
        <aside className="card">
          <h2>Telegram</h2>
          <p className="muted">
            Получайте уведомления о заявках в Telegram.
            {s.role !== "USER" && " Специалисты могут брать заявки в работу прямо из чата с ботом."}
          </p>
          <TelegramLink
            linkedAt={me.telegram?.linkedAt ? me.telegram.linkedAt.toLocaleString("uk-UA") : null}
            botConfigured={botConfigured}
          />
        </aside>
      </div>
    </main>
  );
}
