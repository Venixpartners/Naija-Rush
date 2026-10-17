import { isClientEvent } from "@venix/analytics";
import { isShareChannel } from "@venix/sharing";
import { schema } from "@venix/database";
import { isChallengeCode } from "@venix/core";
import { eq } from "drizzle-orm";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SHARE_EVENTS = new Set(["share_sheet_opened", "share_target_selected", "share_handoff_attempted"]);

/**
 * Browser reported intent events. Only a whitelisted vocabulary is accepted.
 * These are intent signals: none of them means a post was published.
 */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`evt:${guestId}`, 120, 600))) return json({ ok: true, dropped: true });
  const body = await readJson(req, 4_000);
  if (!isClientEvent(body.name)) throw new HttpError(400, "unknown_event");
  const channel = isShareChannel(body.channel) ? body.channel : null;

  let challengeId: string | null = null;
  if (typeof body.challenge === "string" && isChallengeCode(body.challenge)) {
    const [c] = await db().select({ id: schema.challenges.id }).from(schema.challenges).where(eq(schema.challenges.code, body.challenge));
    challengeId = c?.id ?? null;
  }

  if (SHARE_EVENTS.has(body.name)) {
    await db().insert(schema.shareEvents).values({ challengeId, guestSessionId: guestId, event: body.name, channel });
  }
  await track(body.name, { guestId, challengeId, channel, gameSlug: typeof body.game === "string" ? body.game.slice(0, 40) : null });
  return json({ ok: true });
});
