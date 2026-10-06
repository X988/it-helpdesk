export type Mail = { to: string; subject: string; text: string };

/** Delivery failures must not roll back ticket mutations. SMTP is optional. */
export async function sendMail(mail: Mail) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV !== "production") console.info("[mail]", mail.subject, mail.to);
    return { delivered: false as const, mode: "log" as const };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASSWORD || "";
  const from = process.env.SMTP_FROM || user || "helpdesk@localhost";
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
    return { delivered: true as const, mode: "smtp" as const };
  } catch (error) {
    console.error("smtp failed", error instanceof Error ? error.message : error);
    return { delivered: false as const, mode: "smtp" as const };
  }
}
