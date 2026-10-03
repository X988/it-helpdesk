import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { telegramConfigured } from "@/lib/telegram";
import { roleLabels } from "@/lib/labels";
import TelegramSettings from "./TelegramSettings";
export default async function Profile() {
  const session = await getSession(); if (!session) redirect("/login");
  const connection = await db.telegramConnection.findUnique({ where: { userId: session.userId }, select: { id: true } });
  return <main id="content" className="shell"><section className="card formCard"><h1>Мой аккаунт</h1><p><b>{session.name}</b></p><p>{session.email} · {roleLabels[session.role]}</p><TelegramSettings configured={telegramConfigured()} linked={Boolean(connection)} /></section></main>;
}
