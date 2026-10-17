/**
 * Canonical analytics vocabulary. Every event the product records must be in
 * this list; the ingestion endpoint drops anything else.
 *
 * Attribution rule: a share is never counted as published unless a platform
 * API confirms it ("publish_confirmed"). Sheet opens, target selections and
 * hand offs are intent signals only.
 */
export const EVENT_NAMES = [
  "landing_view",
  "game_start",
  "game_finish",
  "challenge_created",
  "share_sheet_opened",
  "share_target_selected",
  "share_handoff_attempted",
  "referral_landed",
  "challenge_accepted",
  "account_created",
  "return_visit",
  "ad_reward_granted",
  "checkout_started",
  "payment_verified",
  "subscription_renewed",
  "purchase_refunded",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Events a browser is allowed to report. The rest are written server side. */
export const CLIENT_EVENTS: readonly EventName[] = [
  "landing_view",
  "share_sheet_opened",
  "share_target_selected",
  "share_handoff_attempted",
  "return_visit",
];

export const isEventName = (v: unknown): v is EventName =>
  typeof v === "string" && (EVENT_NAMES as readonly string[]).includes(v);

export const isClientEvent = (v: unknown): v is EventName =>
  typeof v === "string" && (CLIENT_EVENTS as readonly string[]).includes(v);
