export interface MailAttachment {
  filename: string;
  content: string; // text content
  type: string;
}

export interface Mail {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

export type MailResult = "sent" | "skipped" | "failed";

/**
 * Sends one email. SendGrid (SENDGRID_API_KEY) or any SMTP server (SMTP_HOST,
 * SMTP_USER, SMTP_PASSWORD) can be used; with neither set nothing is sent and
 * "skipped" comes back. Never throws, and never logs the message or the keys.
 */
export async function sendMail(
  mail: Mail,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<MailResult> {
  const from = env.MAIL_FROM;
  if (!from || mail.to.length === 0) return "skipped";

  try {
    if (env.SENDGRID_API_KEY) {
      const person = (e: string) => ({ email: e });
      const cc = (mail.cc ?? []).filter((e) => !mail.to.includes(e));
      const res = await fetchFn("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: mail.to.map(person), ...(cc.length ? { cc: cc.map(person) } : {}) }],
          from: person(from),
          subject: mail.subject,
          content: [{ type: "text/plain", value: mail.text }],
          attachments: (mail.attachments ?? []).map((a) => ({
            content: Buffer.from(a.content, "utf8").toString("base64"),
            filename: a.filename,
            type: a.type,
            disposition: "attachment",
          })),
        }),
      });
      if (!res.ok) {
        console.error(`Email provider answered ${res.status}`);
        return "failed";
      }
      return "sent";
    }

    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
      const nodemailer = await import("nodemailer");
      const port = Number(env.SMTP_PORT || 587);
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      });
      await transport.sendMail({
        from,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        attachments: (mail.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.type })),
      });
      return "sent";
    }
  } catch (e) {
    console.error("Could not send email:", (e as Error)?.message ?? "unknown error");
    return "failed";
  }
  return "skipped";
}
