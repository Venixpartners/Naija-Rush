import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { featureFlags, gameModes, games, gameVersions, products } from "./schema";

/** Idempotent reference data. Safe to run on every deploy. */
export async function seedReferenceData(db: Db) {
  await db
    .insert(games)
    .values([{ slug: "naija-rush", name: "Naija Rush: Survive Lagos", status: "live" }])
    .onConflictDoUpdate({ target: games.slug, set: { name: sql`excluded.name`, status: sql`excluded.status` } });

  await db
    .insert(gameVersions)
    .values([
      { id: "nr-1.0.0", gameSlug: "naija-rush", active: true, notes: "Launch rules: 60 second rush and endless" },
    ])
    .onConflictDoNothing();

  await db
    .insert(gameModes)
    .values([
      { gameSlug: "naija-rush", key: "standard", name: "60 second rush" },
      { gameSlug: "naija-rush", key: "daily", name: "Daily route" },
      { gameSlug: "naija-rush", key: "challenge", name: "Friend challenge" },
      { gameSlug: "naija-rush", key: "endless", name: "Endless", competitive: false },
    ])
    .onConflictDoNothing();

  // Commerce is seeded inactive. Activate only after Paystack is configured
  // and pricing has commercial sign off.
  await db
    .insert(products)
    .values([{ id: "premium_monthly", kind: "subscription", name: "Naija Rush Premium", priceKobo: 100_000, active: false }])
    .onConflictDoNothing();

  await db
    .insert(featureFlags)
    .values([
      { key: "payments", enabled: false, description: "Paystack checkout and premium" },
      { key: "rewarded_ads", enabled: false, description: "Opt in rewarded ads" },
      { key: "snap_creative_kit", enabled: true, description: "Snapchat Creative Kit web share button" },
      { key: "video_export", enabled: false, description: "Vertical highlight clip export (Phase 3)" },
    ])
    .onConflictDoNothing();
}
