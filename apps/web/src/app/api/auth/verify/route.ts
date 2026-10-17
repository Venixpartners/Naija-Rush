import { ensureGuest, setGuestCookie } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyLoginLink } from "@/lib/services/accounts";

export const runtime = "nodejs";

/** POST only: email scanners that prefetch GET links cannot burn the token. */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`verify:${guestId}`, 10, 900))) throw new HttpError(429, "rate_limited");
  const body = await readJson(req, 2_000);
  const result = await verifyLoginLink({ token: body.token, guestId });
  await setGuestCookie(result.sessionToken);
  return json({ ok: true, isNew: result.isNew });
});
