import type { EventName } from "@venix/analytics";
import { schema } from "@venix/database";
import { db } from "./db";

export interface TrackInput {
  guestId?: string | null;
  userId?: string | null;
  gameSlug?: string | null;
  challengeId?: string | null;
  channel?: string | null;
  props?: Record<string, unknown>;
}

/**
 * First party event log. Analytics must never break gameplay, so failures are
 * swallowed and logged. A PostHog forwarder can read from this table later.
 */
export async function track(name: EventName, input: TrackInput = {}) {
  try {
    await db()
      .insert(schema.analyticsEvents)
      .values({
        name,
        guestSessionId: input.guestId ?? null,
        userId: input.userId ?? null,
        gameSlug: input.gameSlug ?? null,
        challengeId: input.challengeId ?? null,
        channel: input.channel ?? null,
        props: input.props ?? null,
      });
  } catch (err) {
    console.error("[analytics] failed to record", name, err);
  }
}
