import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json } from "@/lib/http";
import { getMe } from "@/lib/services/accounts";

export const runtime = "nodejs";

export const GET = handle(async () => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  const me = await getMe(guestId);
  return json({ signedIn: Boolean(me.user), handle: me.user?.handle ?? null, displayName: me.user?.displayName ?? null, premium: me.premium, entitlements: me.entitlements });
});
