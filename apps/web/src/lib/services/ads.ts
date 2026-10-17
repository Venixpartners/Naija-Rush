import { schema } from "@venix/database";
import { eq, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { track } from "../analytics";
import { db } from "../db";

/**
 * Rewarded ads, provider neutral. The browser never grants a reward: the ad
 * network calls our server (server side verification) with a signed
 * payload, the same pattern AdMob and most networks use. Rewards are
 * cosmetic only (24 hours of the Neon Tunde outfit) and capped at one per day.
 *
 * Disabled until an ad network is chosen, ADS_CALLBACK_SECRET is set and the
 * rewarded_ads flag is on. Child appropriate ad settings must be enabled at
 * the network for under 18 audiences.
 */
export const REWARD_PRODUCT = "skin_neon_tunde";
const REWARD_HOURS = 24;

export async function adsEnabled(): Promise<boolean> {
  if (!process.env.ADS_CALLBACK_SECRET) return false;
  const [flag] = await db().select().from(schema.featureFlags).where(eq(schema.featureFlags.key, "rewarded_ads"));
  return Boolean(flag?.enabled);
}

/** Canonical string the network signs: userId|nonce|timestamp. */
export const rewardPayload = (userId: string, nonce: string, ts: number) => `${userId}|${nonce}|${ts}`;

export function verifyRewardSignature(payload: string, signature: string, secret = process.env.ADS_CALLBACK_SECRET ?? ""): boolean {
  if (!secret || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export async function grantAdReward(input: { userId: string; nonce: string; ts: number; signature: string }): Promise<{ granted: boolean; reason?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.userId) || !/^[A-Za-z0-9_-]{8,64}$/.test(input.nonce)) return { granted: false, reason: "bad_input" };
  if (Math.abs(Date.now() - input.ts) > 10 * 60_000) return { granted: false, reason: "stale" };
  if (!verifyRewardSignature(rewardPayload(input.userId, input.nonce, input.ts), input.signature)) return { granted: false, reason: "bad_signature" };

  // Exactly once per nonce.
  const fresh = await db()
    .insert(schema.paymentEvents)
    .values({ provider: "ads", dedupeKey: input.nonce, eventType: "reward", payload: { userId: input.userId, ts: input.ts }, signatureValid: true })
    .onConflictDoNothing()
    .returning({ id: schema.paymentEvents.id });
  if (!fresh.length) return { granted: false, reason: "duplicate" };

  const [recent] = await db().execute<{ n: number }>(sql`
    select count(*)::int as n from naijarush.entitlements
    where user_id = ${input.userId} and source = 'ad_reward' and starts_at > now() - interval '24 hours'`);
  if (Number(recent?.n) > 0) return { granted: false, reason: "daily_cap" };

  await db().insert(schema.entitlements).values({ userId: input.userId, productId: REWARD_PRODUCT, source: "ad_reward", startsAt: new Date(), endsAt: new Date(Date.now() + REWARD_HOURS * 3_600_000) });
  await track("ad_reward_granted", { userId: input.userId });
  return { granted: true };
}
