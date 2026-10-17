import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { finishRun } from "@/lib/services/runs";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "run_not_found");
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`finish:${guestId}`, 30, 600))) throw new HttpError(429, "rate_limited");
  const body = await readJson(req, 96_000);
  const result = await finishRun({
    guestId,
    runId: id,
    token: body.token,
    log: body.log,
    claimedScore: body.score,
  });
  return json(result);
});
