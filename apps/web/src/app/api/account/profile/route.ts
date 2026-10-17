import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { getMe, updateProfile } from "@/lib/services/accounts";

export const runtime = "nodejs";

export const PATCH = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  const me = guestId ? await getMe(guestId) : null;
  if (!me?.user) throw new HttpError(401, "sign_in_required");
  const body = await readJson(req, 2_000);
  await updateProfile(me.user.id, { handle: body.handle, displayName: body.displayName, isPublic: body.isPublic });
  return json({ ok: true });
});
