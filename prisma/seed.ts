import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { passwordSchema } from "../src/lib/validation";
import { defaultCategories } from "./categories";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
  const passwordHash = await bcrypt.hash(passwordSchema.parse(process.env.SEED_PASSWORD), 12);
  for (const name of defaultCategories) await db.category.upsert({ where: { name }, update: {}, create: { name } });
  const users = [
    { email: "admin@example.local", name: "Demo Admin", role: "ADMIN" as const },
    { email: "tech@example.local", name: "Demo Technician", role: "TECHNICIAN" as const },
    { email: "user@example.local", name: "Demo User", role: "USER" as const },
  ];
  for (const user of users) await db.user.upsert({ where: { email: user.email }, update: {}, create: { ...user, passwordHash } });
  console.log("Development seed completed. Existing accounts and passwords were not modified.");
}
main().catch(error => { console.error(error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Seed failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
