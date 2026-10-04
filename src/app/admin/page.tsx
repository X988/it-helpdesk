import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userSelect } from "@/lib/admin";
import AdminPanel from "./AdminPanel";
export default async function Admin({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession(); if (!session) redirect("/login"); if (session.role !== "ADMIN") redirect("/dashboard");
  const rawPage = Number((await searchParams).page ?? 1); const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const [users, total, categories, pending, failed] = await Promise.all([
    db.user.findMany({ select: userSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }), db.user.count(), db.category.findMany({ orderBy: { name: "asc" } }),
    db.notification.count({ where: { text: { not: null }, deliveredAt: null, attempts: { lt: 8 } } }), db.notification.count({ where: { deliveredAt: null, attempts: { gte: 8 } } }),
  ]);
  return <AdminPanel users={users.map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }))} total={total} page={page} categories={categories.map(category => ({ id: category.id, name: category.name, isActive: category.isActive }))} pending={pending} failed={failed} />;
}
