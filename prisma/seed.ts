import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const categories = ["Windows","Linux","1С/BAF","M.E.Doc","RDP/RemoteApp","Network","MikroTik","VPN","Printers","Email","Hardware","Accounts","Other"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_PASSWORD (12+ chars) before running the development seed");
  const passwordHash = await bcrypt.hash(password, 12);

  for (const name of categories) await db.category.upsert({ where: { name }, update: {}, create: { name } });
  const users: Array<[string,string,Role]> = [
    ["admin@example.local","Help Desk Admin",Role.ADMIN],
    ["tech@example.local","IT Technician",Role.TECHNICIAN],
    ["user@example.local","Demo User",Role.USER],
  ];
  for (const [email,name,role] of users) await db.user.upsert({ where: { email }, update: { name, role }, create: { email, name, role, passwordHash } });
  console.log("Development seed completed. Password came from SEED_PASSWORD and was not stored in source code.");
}

main().finally(() => db.$disconnect());
