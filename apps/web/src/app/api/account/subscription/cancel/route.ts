import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json } from "@/lib/http";
import { getMe } from "@/lib/services/accounts";
import { cancelSubscription } from "@/lib/services/billing";

export const runtime = "nodejs";

export const POST = handle(async () => {
  const guestId = await ensureGuest();
  const me = guestId ? await getMe(guestId) : null;
  if (!me?.user) throw new HttpError(401, "sign_in_required");
  return json(await cancelSubscription(me.user.id));
});
