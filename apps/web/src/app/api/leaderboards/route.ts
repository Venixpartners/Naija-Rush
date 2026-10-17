import { GAME } from "@venix/core";
import { peekGuest } from "@/lib/guest";
import { HttpError, handle, json } from "@/lib/http";
import { getLeaderboard, isPeriod } from "@/lib/services/leaderboards";

export const runtime = "nodejs";

export const GET = handle(async (req: Request) => {
  const slug = GAME.slug;
  const period = new URL(req.url).searchParams.get("period") ?? "daily";
  if (!isPeriod(period)) throw new HttpError(400, "bad_period");
  const rows = await getLeaderboard(slug, period, 50, await peekGuest());
  return json({ game: slug, period, rows });
});
