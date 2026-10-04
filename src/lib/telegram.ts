import { HttpError } from "@/lib/http";
export function telegramConfigured() { return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_WEBHOOK_SECRET); }
export async function telegram(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new HttpError(503, "TELEGRAM_NOT_CONFIGURED");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const data: { ok?: boolean; result?: unknown } = await response.json();
  if (!response.ok || !data.ok) throw new Error("Telegram API request failed");
  return data.result;
}
export async function sendTelegram(chatId: string, text: string, reply_markup?: unknown) { return telegram("sendMessage", { chat_id: chatId, text, reply_markup }); }
