import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/crypto";
import { startRun } from "@/lib/services/runs";

export const runtime = "nodejs";

/** Issue a run: seed, version and a signed token. Play happens client side. */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session", "Please enable cookies to play.");
  if (!(await rateLimit(`run:${guestId}`, 30, 600)) || !(await rateLimit(`runip:${hashIp(clientIp(req.headers))}`, 120, 600))) {
    throw new HttpError(429, "rate_limited", "Slow down a little and try again shortly.");
  }
  const body = await readJson(req);
  const result = await startRun({
    guestId,
    gameSlug: "naija-rush",
    mode: typeof body.mode === "string" ? body.mode : undefined,
    challengeCode: typeof body.challenge === "string" ? body.challenge : null,
  });
  const { seed, runId, token, mode, version, challenge } = result;
  return json({
    runId,
    token,
    seed,
    mode,
    version,
    challenge: challenge && { code: challenge.code, targetScore: challenge.targetScore, displayName: challenge.displayName },
  });
});
