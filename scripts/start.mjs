import { spawn } from "node:child_process";
function validate() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgresql:", "postgres:"].includes(database.protocol)) throw new Error("DATABASE_URL must be PostgreSQL");
  const url = new URL(process.env.APP_URL ?? "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("APP_URL must be the public site origin");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && process.env.ALLOW_INSECURE_HTTP !== "true") throw new Error("Production requires HTTPS; local testing can explicitly set ALLOW_INSECURE_HTTP=true");
  const keys = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const count = keys.filter(key => process.env[key]).length;
  if (count !== 0 && count !== keys.length) throw new Error("Configure all S3 variables or leave all empty");
  const telegram = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"];
  const telegramCount = telegram.filter(key => process.env[key]).length;
  if (telegramCount !== 0 && telegramCount !== telegram.length) throw new Error("Configure all Telegram variables or leave all empty");
  if (process.env.TELEGRAM_BOT_USERNAME && !/^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME)) throw new Error("Invalid TELEGRAM_BOT_USERNAME");
  if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) throw new Error("CRON_SECRET must have 32+ characters");
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  return port;
}
try {
  const port = validate();
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", String(port)], { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Next.js could not start"); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
