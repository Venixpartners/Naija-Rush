import { ensureGuest, setGuestCookie } from "@/lib/guest";
import { handle, json } from "@/lib/http";
import { signOut } from "@/lib/services/accounts";

export const runtime = "nodejs";

export const POST = handle(async () => {
  const guestId = await ensureGuest();
  if (guestId) await signOut(guestId);
  await setGuestCookie(null);
  return json({ ok: true });
});
