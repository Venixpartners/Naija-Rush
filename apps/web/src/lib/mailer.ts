import { env } from "./env";

/**
 * Transactional email. Provider is chosen by MAIL_PROVIDER:
 *  - "resend": sends through Resend (RESEND_API_KEY, MAIL_FROM)
 *  - "log":    prints the message to the server log (local development)
 * With no provider configured, sending fails clearly instead of pretending.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function mailProvider(): "resend" | "log" | null {
  const p = process.env.MAIL_PROVIDER;
  if (p === "resend" && process.env.RESEND_API_KEY) return "resend";
  if (p === "log") return "log";
  return null;
}

/** Only on a localhost deployment may a dev link be echoed back to the browser. */
export const devLinksAllowed = () => mailProvider() === "log" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.siteUrl);

export async function sendMail(mail: Mail): Promise<void> {
  const provider = mailProvider();
  if (provider === "log") {
    console.info(`[mail:log] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM ?? "Naija Rush <play@venixpartners.com>", to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
    return;
  }
  throw new Error("Email is not configured. Set MAIL_PROVIDER (see ENVIRONMENT.md).");
}
