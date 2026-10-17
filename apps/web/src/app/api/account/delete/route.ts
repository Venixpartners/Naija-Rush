import { ensureGuest, setGuestCookie } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { deleteEverything, getMe } from "@/lib/services/accounts";

export const runtime = "nodejs";

/** Permanently delete this player (account and every linked device) or just this guest. */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  const body = await readJson(req, 1_000);
  if (body.confirm !== "DELETE") throw new HttpError(400, "confirmation_required", "Type DELETE to confirm.");
  const me = await getMe(guestId);
  await deleteEverything(guestId, me.user?.id ?? null);
  await setGuestCookie(null);
  return json({ ok: true });
});
