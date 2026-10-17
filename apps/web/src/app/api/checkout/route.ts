import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getMe } from "@/lib/services/accounts";
import { startCheckout } from "@/lib/services/billing";

export const runtime = "nodejs";

/** Server creates the Paystack transaction; the browser is only redirected. */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  const me = guestId ? await getMe(guestId) : null;
  if (!me?.user) throw new HttpError(401, "sign_in_required", "Sign in first so your purchase is saved to your account.");
  if (!(await rateLimit(`checkout:${me.user.id}`, 10, 3600))) throw new HttpError(429, "rate_limited");
  const body = await readJson(req, 1_000);
  const result = await startCheckout({ userId: me.user.id, email: me.user.email, productId: String(body.productId ?? ""), adultConfirmed: body.adultConfirmed });
  return json(result);
});
