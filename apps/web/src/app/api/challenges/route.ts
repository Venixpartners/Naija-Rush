import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createChallenge } from "@/lib/services/challenges";

export const runtime = "nodejs";

export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`chal:${guestId}`, 40, 600))) throw new HttpError(429, "rate_limited");
  const body = await readJson(req);
  if (typeof body.runId !== "string") throw new HttpError(400, "run_required");
  const result = await createChallenge({ guestId, runId: body.runId, nickname: body.nickname, showNickname: body.showNickname });
  return json(result, 201);
});
