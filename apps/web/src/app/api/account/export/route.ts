import { ensureGuest } from "@/lib/guest";
import { HttpError, handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { exportData, getMe } from "@/lib/services/accounts";

export const runtime = "nodejs";

/** Download everything held about this player as JSON. */
export const GET = handle(async () => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`export:${guestId}`, 5, 3600))) throw new HttpError(429, "rate_limited");
  const me = await getMe(guestId);
  const data = await exportData(guestId, me.user?.id ?? null);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="naija-rush-my-data.json"`,
      "cache-control": "no-store",
    },
  });
});
