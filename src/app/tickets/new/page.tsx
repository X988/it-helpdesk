import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { storageConfigured } from "@/lib/storage";
import NewTicketForm from "./NewTicketForm";
export default async function NewTicket() {
  if (!(await getSession())) redirect("/login");
  const categories = await db.category.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <NewTicketForm categories={categories} uploadsEnabled={storageConfigured()} />;
}
