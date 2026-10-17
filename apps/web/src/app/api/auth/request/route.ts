import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { mailProvider } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { requestLoginLink } from "@/lib/services/accounts";

export const runtime = "nodejs";

/** Email a single use sign in link. Accounts are optional; guests can always play. */
export const POST = handle(async (req: Request) => {
  if (!mailProvider()) throw new HttpError(503, "accounts_unavailable", "Accounts are coming soon. You can keep playing as a guest.");
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  const body = await readJson(req, 2_000);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!(await rateLimit(`login:${guestId}`, 5, 900)) || !(await rateLimit(`login:${email}`, 3, 900))) {
    throw new HttpError(429, "rate_limited", "Too many sign in emails. Please wait a few minutes.");
  }
  const result = await requestLoginLink({ email: body.email, guestId, ageConfirmed: body.ageConfirmed });
  return json(result);
});
