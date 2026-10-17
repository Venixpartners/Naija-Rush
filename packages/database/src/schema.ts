/**
 * Naija Rush relational schema (PostgreSQL, Supabase compatible).
 * Source of truth for migrations: `pnpm --filter @venix/database generate`.
 *
 * Data minimisation notes:
 *  - Guests are identified by a random session id stored in an httpOnly
 *    cookie. We store only a SHA256 hash of the cookie value.
 *  - IP addresses are never stored raw; only a salted hash for abuse limits.
 *  - Raw tap logs (score_submissions.payload) are kept 90 days for audit,
 *    then purged by the retention job (see docs/DATA_RETENTION.md).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** All Naija Rush tables live in their own schema inside the shared Venix Platform project. */
export const naijarush = pgSchema("naijarush");

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────────────────── Identity ───────────────────────── */

export const users = naijarush.table(
  "users",
  {
    id: id(),
    email: text("email"),
    role: text("role").notNull().default("player"), // player | moderator | admin | finance
    status: text("status").notNull().default("active"), // active | banned | deleted
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const guestSessions = naijarush.table(
  "guest_sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firstChannel: text("first_channel"),
    firstChallengeId: uuid("first_challenge_id"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("guest_sessions_token_uq").on(t.tokenHash), index("guest_sessions_user_idx").on(t.userId)],
);

export const userProfiles = naijarush.table(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    avatarKey: text("avatar_key"),
    isPublic: boolean("is_public").notNull().default(false),
    ageBand: text("age_band"), // under_13 | 13_17 | 18_plus (no birth date stored)
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_profiles_handle_uq").on(sql`lower(${t.handle})`)],
);

export const consents = naijarush.table(
  "consents",
  {
    id: id(),
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // public_nickname | analytics | marketing | gameplay_clip
    granted: boolean("granted").notNull(),
    policyVersion: text("policy_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_guest_idx").on(t.guestSessionId), index("consents_user_idx").on(t.userId)],
);

export const authIdentities = naijarush.table(
  "auth_identities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // email | google | apple | tiktok ...
    providerSubject: text("provider_subject").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_identities_provider_uq").on(t.provider, t.providerSubject)],
);

/* ───────────────────────── Games and runs ───────────────────────── */

export const games = naijarush.table("games", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("live"), // live | coming_soon | retired
  createdAt: createdAt(),
});

export const gameVersions = naijarush.table("game_versions", {
  id: text("id").primaryKey(), // e.g. bms-1.0.0
  gameSlug: text("game_slug")
    .notNull()
    .references(() => games.slug),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const gameModes = naijarush.table(
  "game_modes",
  {
    id: serial("id").primaryKey(),
    gameSlug: text("game_slug")
      .notNull()
      .references(() => games.slug),
    key: text("key").notNull(), // standard | daily | challenge | short | endless
    name: text("name").notNull(),
    competitive: boolean("competitive").notNull().default(true),
  },
  (t) => [uniqueIndex("game_modes_uq").on(t.gameSlug, t.key)],
);

/** One row per run. Issued by the server before play; finalised on submit. */
export const gameSessions = naijarush.table(
  "game_sessions",
  {
    id: id(),
    gameSlug: text("game_slug")
      .notNull()
      .references(() => games.slug),
    gameVersion: text("game_version")
      .notNull()
      .references(() => gameVersions.id),
    mode: text("mode").notNull(),
    seed: text("seed").notNull(),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    challengeId: uuid("challenge_id"),
    campaignId: uuid("campaign_id"),
    status: text("status").notNull().default("issued"), // issued | valid | flagged | rejected
    score: integer("score"),
    flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
    stats: jsonb("stats"),
    hidden: boolean("hidden").notNull().default(false),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    submittedAt: ts("submitted_at"),
  },
  (t) => [
    index("game_sessions_board_idx").on(t.gameSlug, t.status, t.submittedAt),
    index("game_sessions_guest_idx").on(t.guestSessionId, t.issuedAt),
    index("game_sessions_challenge_idx").on(t.challengeId),
  ],
);

export const scoreSubmissions = naijarush.table("score_submissions", {
  id: id(),
  gameSessionId: uuid("game_session_id")
    .notNull()
    .unique()
    .references(() => gameSessions.id, { onDelete: "cascade" }),
  payload: jsonb("payload"), // raw tap log, purged after 90 days
  claimedScore: integer("claimed_score"),
  computedScore: integer("computed_score").notNull(),
  status: text("status").notNull(),
  flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
  reason: text("reason"),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

/* ───────────────────────── Challenges and referrals ───────────────────────── */

export const challenges = naijarush.table(
  "challenges",
  {
    id: id(),
    code: text("code").notNull(),
    gameSlug: text("game_slug")
      .notNull()
      .references(() => games.slug),
    gameVersion: text("game_version").notNull(),
    mode: text("mode").notNull(),
    seed: text("seed").notNull(),
    sourceSessionId: uuid("source_session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    creatorGuestId: uuid("creator_guest_id").references(() => guestSessions.id, { onDelete: "set null" }),
    creatorUserId: uuid("creator_user_id").references(() => users.id, { onDelete: "set null" }),
    parentChallengeId: uuid("parent_challenge_id"),
    displayName: text("display_name"), // only set with public_nickname consent
    targetScore: integer("target_score").notNull(),
    campaignId: uuid("campaign_id"),
    visibility: text("visibility").notNull().default("unlisted"), // unlisted | public
    status: text("status").notNull().default("active"), // active | revoked
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("challenges_code_uq").on(t.code),
    uniqueIndex("challenges_source_uq").on(t.sourceSessionId),
    index("challenges_creator_idx").on(t.creatorGuestId),
  ],
);

export const challengeAttempts = naijarush.table(
  "challenge_attempts",
  {
    id: id(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .unique()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("challenge_attempts_challenge_idx").on(t.challengeId)],
);

export const challengeResults = naijarush.table(
  "challenge_results",
  {
    id: id(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    gameSessionId: uuid("game_session_id")
      .notNull()
      .unique()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    targetScore: integer("target_score").notNull(),
    outcome: text("outcome").notNull(), // beaten | tied | lost
    createdAt: createdAt(),
  },
  (t) => [index("challenge_results_challenge_idx").on(t.challengeId)],
);

export const referralClicks = naijarush.table(
  "referral_clicks",
  {
    id: id(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // whatsapp | instagram | tiktok | snapchat | copy | native | direct | other
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "set null" }),
    isBot: boolean("is_bot").notNull().default(false),
    landedAt: ts("landed_at").notNull().defaultNow(),
  },
  (t) => [index("referral_clicks_challenge_idx").on(t.challengeId, t.landedAt), index("referral_clicks_channel_idx").on(t.channel, t.landedAt)],
);

/* ───────────────────────── Leaderboards ───────────────────────── */

export const leaderboards = naijarush.table(
  "leaderboards",
  {
    id: id(),
    gameSlug: text("game_slug")
      .notNull()
      .references(() => games.slug),
    period: text("period").notNull(), // daily | weekly | all | campaign
    campaignId: uuid("campaign_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("leaderboards_uq").on(t.gameSlug, t.period, t.campaignId)],
);

export const leaderboardSeasons = naijarush.table("leaderboard_seasons", {
  id: id(),
  leaderboardId: uuid("leaderboard_id")
    .notNull()
    .references(() => leaderboards.id, { onDelete: "cascade" }),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at"),
  status: text("status").notNull().default("open"), // open | closed
});

/** Snapshot of final standings when a season closes. Live boards are computed. */
export const leaderboardEntries = naijarush.table(
  "leaderboard_entries",
  {
    id: id(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => leaderboardSeasons.id, { onDelete: "cascade" }),
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    gameSessionId: uuid("game_session_id").references(() => gameSessions.id, { onDelete: "set null" }),
    rank: integer("rank").notNull(),
    bestScore: integer("best_score").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("leaderboard_entries_season_idx").on(t.seasonId, t.rank)],
);

/* ───────────────────────── Sharing ───────────────────────── */

export const shareAssets = naijarush.table("share_assets", {
  id: id(),
  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // scorecard_story | scorecard_square | og | clip
  storageKey: text("storage_key"),
  status: text("status").notNull().default("ready"), // queued | ready | failed
  createdAt: createdAt(),
});

export const shareEvents = naijarush.table(
  "share_events",
  {
    id: id(),
    challengeId: uuid("challenge_id").references(() => challenges.id, { onDelete: "cascade" }),
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "set null" }),
    event: text("event").notNull(), // share_sheet_opened | share_target_selected | share_handoff_attempted | publish_confirmed
    channel: text("channel"),
    createdAt: createdAt(),
  },
  (t) => [index("share_events_idx").on(t.event, t.channel, t.createdAt)],
);

export const mediaJobs = naijarush.table("media_jobs", {
  id: id(),
  kind: text("kind").notNull(), // clip_render | scorecard_render
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ───────────────────────── Commerce (disabled until configured) ───────────────────────── */

export const products = naijarush.table("products", {
  id: text("id").primaryKey(), // premium_monthly | cosmetic_*
  kind: text("kind").notNull(), // subscription | cosmetic
  name: text("name").notNull(),
  priceKobo: integer("price_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  providerPlanCode: text("provider_plan_code"),
  active: boolean("active").notNull().default(false),
  createdAt: createdAt(),
});

export const entitlements = naijarush.table(
  "entitlements",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    source: text("source").notNull(), // subscription | purchase | grant
    sourceId: uuid("source_id"),
    startsAt: ts("starts_at").notNull().defaultNow(),
    endsAt: ts("ends_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("entitlements_user_idx").on(t.userId, t.productId)],
);

export const subscriptions = naijarush.table("subscriptions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  provider: text("provider").notNull(), // paystack | carrier (future)
  providerSubscriptionCode: text("provider_subscription_code"),
  status: text("status").notNull(), // active | non_renewing | cancelled | past_due
  currentPeriodEnd: ts("current_period_end"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const payments = naijarush.table("payments", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  provider: text("provider").notNull(),
  reference: text("reference").notNull().unique(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("initialized"), // initialized | success | failed | reversed | refunded
  createdAt: createdAt(),
  verifiedAt: ts("verified_at"),
});

export const paymentEvents = naijarush.table(
  "payment_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("payment_events_dedupe_uq").on(t.provider, t.dedupeKey)],
);

export const refunds = naijarush.table("refunds", {
  id: id(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  amountKobo: integer("amount_kobo").notNull(),
  status: text("status").notNull(), // pending | processed | failed
  reason: text("reason"),
  createdAt: createdAt(),
});

/* ───────────────────────── Sponsors and campaigns ───────────────────────── */

export const sponsors = naijarush.table("sponsors", {
  id: id(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const campaigns = naijarush.table(
  "campaigns",
  {
    id: id(),
    sponsorId: uuid("sponsor_id").references(() => sponsors.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    gameSlug: text("game_slug")
      .notNull()
      .references(() => games.slug),
    kind: text("kind").notNull().default("sponsored"), // sponsored | creator
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    rulesMd: text("rules_md").notNull(),
    eligibility: text("eligibility").notNull(),
    status: text("status").notNull().default("draft"), // draft | live | ended
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("campaigns_slug_uq").on(t.slug)],
);

export const campaignParticipants = naijarush.table(
  "campaign_participants",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    guestSessionId: uuid("guest_session_id")
      .notNull()
      .references(() => guestSessions.id, { onDelete: "cascade" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.guestSessionId] })],
);

export const campaignRules = naijarush.table("campaign_rules", {
  id: id(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
});

/* ───────────────────────── Operations ───────────────────────── */

export const analyticsEvents = naijarush.table(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    guestSessionId: uuid("guest_session_id"),
    userId: uuid("user_id"),
    gameSlug: text("game_slug"),
    challengeId: uuid("challenge_id"),
    channel: text("channel"),
    props: jsonb("props"),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_events_name_idx").on(t.name, t.createdAt), index("analytics_events_guest_idx").on(t.guestSessionId)],
);

export const moderationReports = naijarush.table("moderation_reports", {
  id: id(),
  targetType: text("target_type").notNull(), // challenge | profile | run
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  reporterGuestId: uuid("reporter_guest_id"),
  status: text("status").notNull().default("open"), // open | actioned | dismissed
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
});

export const adminAuditLogs = naijarush.table(
  "admin_audit_logs",
  {
    id: id(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_audit_logs_idx").on(t.createdAt)],
);

export const featureFlags = naijarush.table("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Fixed window rate limiting. Swap for Redis when traffic warrants it. */
export const rateLimits = naijarush.table("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
