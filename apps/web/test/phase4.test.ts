/**
 * Phase 4 integration tests against real Postgres: accounts, privacy,
 * Paystack billing (Paystack's HTTP API is replaced by a local stand in;
 * signatures are real HMAC SHA512), rewarded ads, campaigns, admin roles.
 */
import { playWithBot } from "../../../packages/core/src/naija-rush-bot";
import { closeDb, getDb, schema } from "@venix/database";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/naija_rush_test";
process.env.MAIL_PROVIDER = "log";
process.env.ADS_CALLBACK_SECRET = "ads-secret-for-tests-0123456789abcdef";
process.env.ADMIN_USERS = "ada:ada-password-123:admin,tunde:tunde-password-123:finance,kemi:kemi-password-123:moderator";

const { startRun, finishRun } = await import("@/lib/services/runs");
const { createChallenge } = await import("@/lib/services/challenges");
const { getLeaderboard } = await import("@/lib/services/leaderboards");
const { guestIdForToken } = await import("@/lib/guest");
const { sha256 } = await import("@/lib/crypto");
const accounts = await import("@/lib/services/accounts");
const billing = await import("@/lib/services/billing");
const { PaystackProvider } = await import("@/lib/payments/paystack");
const ads = await import("@/lib/services/ads");
const campaigns = await import("@/lib/services/campaigns");
const { adminFromHeader, can } = await import("@/lib/admin-auth");

const SECRET = "sk_test_naijarush_0123456789";

/** Local stand in for api.paystack.co */
const verified = new Map<string, { status: string; amount: number; currency: string; metadata: Record<string, string> }>();
const disabled: string[] = [];
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  const ok = (data: unknown) => new Response(JSON.stringify({ status: true, message: "ok", data }), { status: 200 });
  if (u.endsWith("/transaction/initialize")) {
    const body = JSON.parse(String(init?.body));
    return ok({ authorization_url: `https://checkout.paystack.com/${body.reference}`, reference: body.reference });
  }
  const m = u.match(/\/transaction\/verify\/(.+)$/);
  if (m) {
    const v = verified.get(decodeURIComponent(m[1]!)) ?? { status: "abandoned", amount: 0, currency: "NGN", metadata: {} };
    return ok({ reference: decodeURIComponent(m[1]!), status: v.status, amount: v.amount, currency: v.currency, customer: { email: "ada@example.com" }, metadata: v.metadata });
  }
  if (u.endsWith("/subscription/disable")) {
    disabled.push(JSON.parse(String(init?.body)).code);
    return ok({});
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;
const provider = new PaystackProvider(SECRET, fakeFetch);
const sign = (body: string) => createHmac("sha512", SECRET).update(body).digest("hex");
const hook = (evt: unknown) => {
  const raw = JSON.stringify(evt);
  return billing.handlePaystackWebhook(raw, sign(raw), provider);
};

async function playOnce(guestId: string, opts: { campaignSlug?: string } = {}) {
  const run = await startRun({ guestId, gameSlug: "naija-rush", campaignSlug: opts.campaignSlug });
  const bot = playWithBot(run.seed, "short", { delayTicks: 3 });
  const seconds = Math.ceil(bot.engine.state.tick / 60) + 3;
  await getDb().execute(sql`update naijarush.game_sessions set issued_at = now() - make_interval(secs => ${seconds}) where id = ${run.runId}`);
  return finishRun({ guestId, runId: run.runId, token: run.token, log: { inputs: bot.inputs, endTick: bot.engine.state.tick }, claimedScore: bot.score });
}

const linkToken = (devLink: string | undefined) => new URL(devLink!).searchParams.get("token")!;

let phone: string;
let laptop: string;
let userId: string;
const phoneToken = "phone-token-0123456789-0123456789-abcdefgh";

beforeAll(async () => {
  await getDb().execute(sql`truncate naijarush.users, naijarush.guest_sessions, naijarush.payments, naijarush.payment_events, naijarush.entitlements, naijarush.subscriptions, naijarush.refunds, naijarush.campaigns, naijarush.sponsors, naijarush.login_tokens, naijarush.moderation_reports, naijarush.rate_limits cascade`);
  await getDb().execute(sql`update naijarush.products set active = true where id in ('premium_monthly', 'skin_owambe_ada', 'skin_neon_tunde')`);
  await getDb().execute(sql`update naijarush.feature_flags set enabled = true where key in ('payments', 'rewarded_ads')`);
  phone = await guestIdForToken(phoneToken);
  laptop = await guestIdForToken("laptop-token-0123456789-0123456789-abcdefg");
});

afterAll(async () => {
  await getDb().execute(sql`update naijarush.products set active = false`);
  await getDb().execute(sql`update naijarush.feature_flags set enabled = false where key in ('payments', 'rewarded_ads')`);
  await closeDb();
});

describe("accounts", () => {
  it("requires the 13 plus confirmation and a valid email", async () => {
    await expect(accounts.requestLoginLink({ email: "ada@example.com", guestId: phone, ageConfirmed: false })).rejects.toMatchObject({ code: "age_required" });
    await expect(accounts.requestLoginLink({ email: "not-an-email", guestId: phone, ageConfirmed: true })).rejects.toMatchObject({ code: "invalid_email" });
  });

  it("signs in by link, keeps guest progress and rotates the session token", async () => {
    const first = await playOnce(phone);
    const { devLink } = await accounts.requestLoginLink({ email: "Ada@Example.com", guestId: phone, ageConfirmed: true });
    const result = await accounts.verifyLoginLink({ token: linkToken(devLink), guestId: phone });
    expect(result.isNew).toBe(true);
    userId = result.userId;
    const [g] = await getDb().select().from(schema.guestSessions).where(eq(schema.guestSessions.id, phone));
    expect(g!.userId).toBe(userId);
    expect(g!.tokenHash).not.toBe(sha256(phoneToken)); // old cookie is dead
    expect(g!.tokenHash).toBe(sha256(result.sessionToken));
    const [run] = await getDb().select().from(schema.gameSessions).where(eq(schema.gameSessions.id, first.runId));
    expect(run!.userId).toBe(userId);
  });

  it("refuses to reuse a link", async () => {
    const { devLink } = await accounts.requestLoginLink({ email: "ada@example.com", guestId: laptop, ageConfirmed: true });
    const token = linkToken(devLink);
    await accounts.verifyLoginLink({ token, guestId: laptop });
    await expect(accounts.verifyLoginLink({ token, guestId: laptop })).rejects.toMatchObject({ code: "link_expired" });
  });

  it("counts one person once on the rankings across two devices", async () => {
    await playOnce(laptop);
    const board = await getLeaderboard("naija-rush", "daily", 50, phone);
    const mine = board.filter((r) => r.isYou);
    expect(mine).toHaveLength(1);
  });

  it("validates and saves the profile, and shows it publicly only when allowed", async () => {
    await expect(accounts.updateProfile(userId, { handle: "a" })).rejects.toMatchObject({ code: "invalid_handle" });
    await accounts.updateProfile(userId, { handle: "ada_lagos", displayName: "Ada", isPublic: false });
    expect(await accounts.publicProfile("ada_lagos")).toBeNull();
    await accounts.updateProfile(userId, { isPublic: true });
    const p = await accounts.publicProfile("ada_lagos");
    expect(p?.displayName).toBe("Ada");
    expect(p?.bests[0]?.runs).toBeGreaterThanOrEqual(2);
  });

  it("exports everything held about the player", async () => {
    const data = await accounts.exportData(phone, userId);
    expect((data.account as { email: string }).email).toBe("ada@example.com");
    expect(data.runs.length).toBeGreaterThanOrEqual(2);
    expect(data.sessions.length).toBe(2);
  });
});

describe("billing", () => {
  let reference = "";

  it("starts a checkout only for an adult, through the server", async () => {
    await expect(billing.startCheckout({ userId, email: "ada@example.com", productId: "premium_monthly", adultConfirmed: false }, provider)).rejects.toMatchObject({ code: "adult_required" });
    const r = await billing.startCheckout({ userId, email: "ada@example.com", productId: "premium_monthly", adultConfirmed: true }, provider);
    expect(r.authorizationUrl).toContain("checkout.paystack.com");
    reference = r.reference;
    const [p] = await getDb().select().from(schema.payments).where(eq(schema.payments.reference, reference));
    expect(p!.status).toBe("initialized");
    expect(p!.amountKobo).toBe(100_000);
  });

  it("ignores a webhook with a bad signature", async () => {
    verified.set(reference, { status: "success", amount: 100_000, currency: "NGN", metadata: { userId } });
    const raw = JSON.stringify({ event: "charge.success", data: { id: 1, reference } });
    const res = await billing.handlePaystackWebhook(raw, "0".repeat(128), provider);
    expect(res.status).toBe(401);
    expect((await accounts.getMe(phone)).premium).toBe(false);
  });

  it("grants premium on a verified charge, exactly once", async () => {
    const evt = { event: "charge.success", data: { id: 1001, reference } };
    expect((await hook(evt)).result).toBe("processed");
    expect((await hook(evt)).result).toBe("duplicate_ignored");
    expect((await accounts.getMe(phone)).premium).toBe(true);
    const ents = await getDb().select().from(schema.entitlements).where(eq(schema.entitlements.userId, userId));
    expect(ents.filter((e) => e.productId === "premium_monthly")).toHaveLength(1);
    // A late callback for the same payment changes nothing.
    await billing.confirmCallback(reference, provider);
    expect((await getDb().select().from(schema.entitlements).where(eq(schema.entitlements.userId, userId))).length).toBe(1);
  });

  it("refuses to grant when the amount does not match", async () => {
    const r = await billing.startCheckout({ userId, email: "ada@example.com", productId: "skin_owambe_ada", adultConfirmed: true }, provider);
    verified.set(r.reference, { status: "success", amount: 100, currency: "NGN", metadata: { userId } });
    expect((await billing.confirmCallback(r.reference, provider)).status).toBe("mismatch");
    // Check the purchase itself was not granted.
    const own = await getDb().select().from(schema.entitlements).where(eq(schema.entitlements.productId, "skin_owambe_ada"));
    expect(own).toHaveLength(0);
  });

  it("tracks the subscription and cancels renewal without cutting access", async () => {
    await hook({ event: "subscription.create", data: { id: 2001, subscription_code: "SUB_abc", email_token: "tok_1", next_payment_date: new Date(Date.now() + 30 * 86_400_000).toISOString(), customer: { email: "ada@example.com", customer_code: "CUS_1" }, plan: { plan_code: "PLN_1" } } });
    await billing.cancelSubscription(userId, provider);
    expect(disabled).toContain("SUB_abc");
    const [s] = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
    expect(s!.status).toBe("non_renewing");
    expect((await accounts.getMe(phone)).premium).toBe(true);
  });

  it("revokes access on refund and never moves a refunded payment back", async () => {
    await hook({ event: "refund.processed", data: { id: 3001, transaction_reference: reference, amount: 100_000 } });
    expect((await accounts.getMe(phone)).premium).toBe(false);
    await hook({ event: "charge.success", data: { id: 3002, reference } });
    const [p] = await getDb().select().from(schema.payments).where(eq(schema.payments.reference, reference));
    expect(p!.status).toBe("refunded");
    expect((await accounts.getMe(phone)).premium).toBe(false);
  });
});

describe("rewarded ads", () => {
  const signReward = (u: string, n: string, ts: number) => createHmac("sha256", process.env.ADS_CALLBACK_SECRET!).update(ads.rewardPayload(u, n, ts)).digest("hex");

  it("grants only on a valid server signature, once per nonce and once a day", async () => {
    const ts = Date.now();
    expect((await ads.grantAdReward({ userId, nonce: "nonce_aaaaaaaa", ts, signature: "f".repeat(64) })).reason).toBe("bad_signature");
    expect((await ads.grantAdReward({ userId, nonce: "nonce_aaaaaaaa", ts, signature: signReward(userId, "nonce_aaaaaaaa", ts) })).granted).toBe(true);
    expect((await ads.grantAdReward({ userId, nonce: "nonce_aaaaaaaa", ts, signature: signReward(userId, "nonce_aaaaaaaa", ts) })).reason).toBe("duplicate");
    expect((await ads.grantAdReward({ userId, nonce: "nonce_bbbbbbbb", ts, signature: signReward(userId, "nonce_bbbbbbbb", ts) })).reason).toBe("daily_cap");
    expect((await accounts.getMe(phone)).entitlements).toContain("skin_neon_tunde");
  });
});

describe("campaigns", () => {
  it("validates, only counts runs inside the window, and reports", async () => {
    await expect(campaigns.createCampaign({ slug: "x", name: "X", sponsorName: "", gameSlug: "naija-rush", kind: "sponsored", startsAt: new Date(), endsAt: new Date(Date.now() + 1), rulesMd: "too short", eligibility: "all" })).rejects.toThrow();
    const c = await campaigns.createCampaign({
      slug: "survive-december",
      name: "Survive December",
      sponsorName: "Acme Drinks",
      gameSlug: "naija-rush",
      kind: "sponsored",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
      rulesMd: "Best verified score between the dates wins bragging rights. One account per person.",
      eligibility: "Open to players in Nigeria aged 13 and over",
    });
    await expect(startRun({ guestId: phone, gameSlug: "naija-rush", campaignSlug: c.slug })).rejects.toMatchObject({ code: "campaign_closed" }); // still a draft
    await campaigns.setCampaignStatus(c.id, "live");
    const result = await playOnce(phone, { campaignSlug: c.slug });
    const [run] = await getDb().select().from(schema.gameSessions).where(eq(schema.gameSessions.id, result.runId));
    expect(run!.campaignId).toBe(c.id);
    const ch = await createChallenge({ guestId: phone, runId: result.runId });
    const [chRow] = await getDb().select().from(schema.challenges).where(eq(schema.challenges.code, ch.code));
    expect(chRow!.campaignId).toBe(c.id);
    expect((await campaigns.campaignBoard(c.id))).toHaveLength(1);
    const report = await campaigns.campaignReport(c.id);
    expect(report.participants).toBe(1);
    expect(report.challenges).toBe(1);
  });
});

describe("admin roles", () => {
  const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
  it("separates finance, moderation and admin", () => {
    const fin = adminFromHeader(basic("tunde", "tunde-password-123"));
    const mod = adminFromHeader(basic("kemi", "kemi-password-123"));
    const adm = adminFromHeader(basic("ada", "ada-password-123"));
    expect(adminFromHeader(basic("tunde", "wrong-password-xx"))).toBeNull();
    expect(can(fin, "finance")).toBe(true);
    expect(can(fin, "moderation")).toBe(false);
    expect(can(mod, "moderation")).toBe(true);
    expect(can(mod, "finance")).toBe(false);
    expect(can(adm, "finance") && can(adm, "campaigns")).toBe(true);
  });
});

describe("deletion", () => {
  it("removes the account and every linked device, keeping payments detached", async () => {
    await accounts.deleteEverything(phone, userId);
    expect(await getDb().select().from(schema.users).where(eq(schema.users.id, userId))).toHaveLength(0);
    expect(await getDb().select().from(schema.guestSessions).where(eq(schema.guestSessions.userId, userId))).toHaveLength(0);
    expect(await getDb().select().from(schema.gameSessions).where(eq(schema.gameSessions.guestSessionId, laptop))).toHaveLength(0);
    const pays = await getDb().select().from(schema.payments);
    expect(pays.length).toBeGreaterThan(0);
    expect(pays.every((p) => p.userId === null)).toBe(true);
  });
});
