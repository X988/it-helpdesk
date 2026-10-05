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
  console.log("Development seed completed. Domain logins: energo\\admin, energo\\tech, energo\\user (password from SEED_PASSWORD). Org: КП (energo).");
}

main().finally(() => db.$disconnect());
