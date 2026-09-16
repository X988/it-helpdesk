function token() { const v = process.env.TELEGRAM_BOT_TOKEN; if (!v) throw new Error("TELEGRAM_BOT_TOKEN is required"); return v; }
export async function telegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  const data = await response.json(); if (!response.ok || !data.ok) throw new Error("Telegram API request failed"); return data.result;
}
export async function sendTelegram(chatId: string, text: string, reply_markup?: unknown) { return telegram("sendMessage", { chat_id: chatId, text, reply_markup }); }
