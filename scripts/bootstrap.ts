import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { emailSchema, passwordSchema } from "../src/lib/validation";
import { defaultCategories } from "../prisma/categories";

async function main() {
  const email = emailSchema.parse(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = passwordSchema.parse(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!name || name.length > 120) throw new Error("Set BOOTSTRAP_ADMIN_NAME (1-120 characters)");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(734315022)`;
    if (await tx.user.count({ where: { role: "ADMIN", isActive: true } })) throw new Error("An active administrator already exists; use the admin interface");
    for (const category of defaultCategories) await tx.category.upsert({ where: { name: category }, update: {}, create: { name: category } });
    const user = await tx.user.create({ data: { email, name, passwordHash, role: "ADMIN" } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "BOOTSTRAP_ADMIN_CREATED", entityType: "User", entityId: user.id } });
  });
  console.log("First administrator and categories created. Remove BOOTSTRAP_ADMIN_* variables.");
}
main().catch(error => { console.error(error instanceof Error && !(error.name.startsWith("Prisma")) ? error.message : "Bootstrap failed; check database and existing email"); process.exitCode = 1; }).finally(() => db.$disconnect());
