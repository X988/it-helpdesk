import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const categories = ["Windows","Linux","1С/BAF","M.E.Doc","RDP/RemoteApp","Network","MikroTik","VPN","Printers","Email","Hardware","Accounts","Other"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_PASSWORD (12+ chars) before running the development seed");
  const passwordHash = await bcrypt.hash(password, 12);

  const org = await db.organization.upsert({
    where: { name_domain: { name: "КП", domain: "energo" } },
    update: { isActive: true },
    create: { name: "КП", domain: "energo" },
  });

  for (const name of categories) await db.category.upsert({ where: { name }, update: {}, create: { name } });
  const users: Array<[string, string, string, Role]> = [
    ["admin@example.local", "admin", "Help Desk Admin", Role.ADMIN],
    ["tech@example.local", "tech", "IT Technician", Role.TECHNICIAN],
    ["user@example.local", "user", "Demo User", Role.USER],
  ];
  for (const [email, username, name, role] of users) {
    await db.user.upsert({
      where: { email },
      update: { name, role, username, passwordHash, organizationId: org.id, department: "IT" },
      create: { email, username, name, role, passwordHash, organizationId: org.id, department: "IT" },
    });
  }

  const departments = ["IT-поддержка", "Бухгалтерия", "Офис"];
  for (const name of departments) {
    const existing = await db.department.findFirst({ where: { name } });
    if (!existing) await db.department.create({ data: { name, source: "MANUAL" } });
  }
  const it = await db.department.findFirst({ where: { name: "IT-поддержка" } });
  const office = await db.department.findFirst({ where: { name: "Офис" } });
  const baseCategories = [
    "Сеть и VPN",
    "Рабочие места",
    "Программное обеспечение",
    "Доступы и учётные записи",
    "Почта",
    "Оргтехника",
    "Другое",
  ];
  for (const [index, name] of baseCategories.entries()) {
    await db.category.upsert({
      where: { name },
      update: { ownerDepartmentId: it?.id, sortOrder: index },
      create: { name, ownerDepartmentId: it?.id, sortOrder: index },
    });
  }
  const policies = [
    { priority: "LOW" as const, responseMinutes: 480, resolveMinutes: 2700, calendarMode: "BUSINESS_TIME" as const },
    { priority: "NORMAL" as const, responseMinutes: 240, resolveMinutes: 1080, calendarMode: "BUSINESS_TIME" as const },
    { priority: "HIGH" as const, responseMinutes: 60, resolveMinutes: 480, calendarMode: "BUSINESS_TIME" as const },
    { priority: "URGENT" as const, responseMinutes: 15, resolveMinutes: 240, calendarMode: "CALENDAR_TIME" as const },
  ];
  for (const policy of policies) {
    await db.slaPolicy.upsert({
      where: { priority: policy.priority },
      update: policy,
      create: policy,
    });
  }
  const admin = await db.user.findUnique({ where: { email: "admin@example.local" } });
  const tech = await db.user.findUnique({ where: { email: "tech@example.local" } });
  const user = await db.user.findUnique({ where: { email: "user@example.local" } });
  if (it && tech) await db.user.update({ where: { id: tech.id }, data: { departmentId: it.id, department: it.name } });
  if (office && user) await db.user.update({ where: { id: user.id }, data: { departmentId: office.id, department: office.name } });
  if (admin && it) await db.user.update({ where: { id: admin.id }, data: { departmentId: it.id, department: it.name } });

  if (admin) {
    const canned = [
      ["Принято в работу", "Заявку взял в работу, вернусь с результатом."],
      ["Нужен скриншот", "Пришлите, пожалуйста, скриншот ошибки и время, когда она появилась."],
      ["VPN", "Проверьте, что клиент VPN запущен и выбран рабочий профиль."],
      ["Пароль", "Сброс пароля выполню после подтверждения личности."],
      ["Принтер", "Укажите кабинет и модель принтера."],
      ["Почта", "Проверьте, что Outlook в сети и ящик не переполнен."],
      ["Доступ", "Доступ запрошу у владельца системы и напишу сюда."],
      ["Удалёнка", "Перезапустите сеанс RDP и напишите, повторяется ли ошибка."],
      ["Решено", "Сделал. Напишите, если проблема осталась — заявку можно вернуть в работу."],
      ["Закрытие", "Если всё в порядке, заявку можно подтвердить и закрыть."],
    ];
    for (const [title, body] of canned) {
      await db.cannedResponse.upsert({
        where: { title },
        update: { body, isActive: true },
        create: { title, body, createdBy: admin.id },
      });
    }
    const articles = [
      ["Не подключается VPN", "vpn-ne-podklyuchaetsya", "Проверьте сеть, профиль и сертификат. Если ошибка остаётся — создайте заявку категории «Сеть и VPN»."],
      ["Сброс пароля", "sbros-parolya", "Пароль доменной учётной записи сбрасывает IT. Подготовьте логин."],
      ["Не печатает принтер", "printer", "Проверьте питание, бумагу и выбранный принтер по умолчанию."],
      ["Outlook не отправляет", "outlook", "Проверьте квоту ящика и подключение к сети."],
      ["Нет доступа к папке", "folder-access", "Укажите путь к папке и нужный уровень доступа."],
      ["1С не открывается", "1c", "Закройте сеанс и откройте базу заново. Напишите текст ошибки."],
      ["Медленный компьютер", "slow-pc", "Сообщите, когда началось и что именно тормозит."],
      ["Почта на телефоне", "mail-phone", "Используйте Outlook или рекомендованный клиент, не включайте IMAP без согласования."],
      ["RDP обрывается", "rdp", "Проверьте VPN и переподключитесь. Напишите код ошибки."],
      ["Новый сотрудник", "new-user", "Для новой учётной записи укажите ФИО, отдел и какие системы нужны."],
      ["Замена картриджа", "cartridge", "Укажите модель принтера и кабинет."],
      ["Wi-Fi в офисе", "wifi", "Используйте корпоративную сеть. Гостевая сеть не пускает к внутренним системам."],
    ];
    for (const [title, slug, body] of articles) {
      await db.kbArticle.upsert({
        where: { slug },
        update: { title, body, status: "PUBLISHED", publishedAt: new Date() },
        create: { title, slug, body, status: "PUBLISHED", authorId: admin.id, publishedAt: new Date() },
      });
    }
  }

  const ticketCount = await db.ticket.count();
  if (ticketCount === 0 && user && tech && admin) {
    const cats = await db.category.findMany({ take: 7 });
    const statuses = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "CANCELLED"] as const;
    for (let i = 0; i < 24; i++) {
      const category = cats[i % cats.length];
      const status = statuses[i % statuses.length];
      const breached = i < 6;
      await db.ticket.create({
        data: {
          subject: `Демо заявка ${i + 1}: ${category?.name ?? "IT"}`,
          description: "Тестовое обращение для проверки очереди, SLA и переписки.",
          categoryId: category?.id ?? cats[0].id,
          priority: i % 4 === 0 ? "URGENT" : i % 3 === 0 ? "HIGH" : "NORMAL",
          direction: "OTHER",
          requesterId: user.id,
          assigneeId: status === "NEW" ? null : tech.id,
          departmentId: it?.id,
          organizationId: org.id,
          status,
          resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null,
          closedAt: status === "CLOSED" ? new Date() : null,
          breachedResponseAt: breached ? new Date() : null,
          slaResponseDue: breached ? new Date(Date.now() - 3600_000) : new Date(Date.now() + 3600_000),
          slaResolveDue: breached ? new Date(Date.now() - 3600_000) : new Date(Date.now() + 86400_000),
          slaResponseMinutes: 60,
          slaResolveMinutes: 480,
          slaCalendarMode: "BUSINESS_TIME",
          slaPolicyVersion: 1,
          messages: {
            create: [
              { authorId: user.id, body: "Публичное сообщение пользователя", visibility: "PUBLIC" },
              { authorId: tech.id, body: "Внутренняя заметка специалиста", visibility: "INTERNAL" },
            ],
          },
        },
      });
    }
  }

  console.log("Development seed completed. Domain logins: energo\\admin, energo\\tech, energo\\user (password from SEED_PASSWORD). Org: КП (energo).");
}

main().finally(() => db.$disconnect());
