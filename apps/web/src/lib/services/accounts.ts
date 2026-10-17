import { checkNickname } from "@venix/core";
import { schema } from "@venix/database";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { track } from "../analytics";
import { sha256 } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { HttpError } from "../http";
import { devLinksAllowed, sendMail } from "../mailer";
import { POLICY_VERSION } from "./challenges";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const LINK_TTL_MS = 20 * 60_000;
export const HANDLE = /^[a-z0-9_]{3,20}$/;

export const newSessionToken = () => randomBytes(32).toString("base64url");

/* ───────── sign in ───────── */

export async function requestLoginLink(input: { email: unknown; guestId: string; ageConfirmed: unknown }) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(422, "invalid_email", "Please enter a valid email address.");
  if (input.ageConfirmed !== true) throw new HttpError(422, "age_required", "Accounts are for players aged 13 and over. You can keep playing as a guest.");

  const token = randomBytes(32).toString("base64url");
  await db().insert(schema.loginTokens).values({ email, tokenHash: sha256(token), guestSessionId: input.guestId, expiresAt: new Date(Date.now() + LINK_TTL_MS) });
  await db().insert(schema.consents).values({ guestSessionId: input.guestId, kind: "age_13_plus", granted: true, policyVersion: POLICY_VERSION });

  const link = `${env.siteUrl}/auth/verify?token=${token}`;
  await sendMail({
    to: email,
    subject: "Your Naija Rush sign in link",
    text: `Tap to sign in to Naija Rush:\n${link}\n\nThe link works once and expires in 20 minutes. If you did not ask for it, ignore this email.`,
    html: `<p>Tap to sign in to Naija Rush:</p><p><a href="${link}">Sign in</a></p><p>The link works once and expires in 20 minutes. If you did not ask for it, ignore this email.</p>`,
  });
  return { sent: true, devLink: devLinksAllowed() ? link : undefined };
}

/**
 * Consume a sign in link. The current guest's progress is attached to the
 * account, and the guest's cookie token is rotated so a session identifier
 * known before sign in can never be used after it.
 */
export async function verifyLoginLink(input: { token: unknown; guestId: string }) {
  if (typeof input.token !== "string" || input.token.length < 32 || input.token.length > 100) throw new HttpError(400, "invalid_link");
  const [row] = await db()
    .update(schema.loginTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(schema.loginTokens.tokenHash, sha256(input.token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, sql`now()`)))
    .returning();
  if (!row) throw new HttpError(410, "link_expired", "That link has expired or was already used. Ask for a new one.");

  let isNew = false;
  let [user] = await db().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${row.email}`);
  if (user && user.status !== "active") throw new HttpError(403, "account_unavailable", "This account is not available.");
  if (!user) {
    isNew = true;
    [user] = await db().insert(schema.users).values({ email: row.email }).returning();
    await db().insert(schema.authIdentities).values({ userId: user!.id, provider: "email", providerSubject: row.email }).onConflictDoNothing();
    const base = row.email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "player";
    for (let i = 0; i < 5; i++) {
      const handle = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const inserted = await db().insert(schema.userProfiles).values({ userId: user!.id, handle, ageBand: "13_plus" }).onConflictDoNothing().returning();
      if (inserted.length) break;
    }
    await db().insert(schema.consents).values({ userId: user!.id, kind: "age_13_plus", granted: true, policyVersion: POLICY_VERSION });
    await track("account_created", { guestId: input.guestId, userId: user!.id });
  }

  const newToken = newSessionToken();
  await db().update(schema.guestSessions).set({ userId: user!.id, tokenHash: sha256(newToken), lastSeenAt: sql`now()` }).where(eq(schema.guestSessions.id, input.guestId));
  // Guest progress becomes account progress.
  await db().execute(sql`update naijarush.game_sessions set user_id = ${user!.id} where guest_session_id = ${input.guestId} and user_id is null`);
  await db().execute(sql`update naijarush.challenges set creator_user_id = ${user!.id} where creator_guest_id = ${input.guestId} and creator_user_id is null`);
  return { userId: user!.id, isNew, sessionToken: newToken };
}

/** Sign out: unlink this browser and kill its old token. */
export async function signOut(guestId: string) {
  await db().update(schema.guestSessions).set({ tokenHash: sha256(newSessionToken()) }).where(eq(schema.guestSessions.id, guestId));
}

/* ───────── who am I ───────── */

export interface Me {
  guestId: string;
  user: null | { id: string; email: string; handle: string; displayName: string | null; isPublic: boolean; role: string };
  entitlements: string[];
  premium: boolean;
}

export async function getMe(guestId: string): Promise<Me> {
  const [g] = await db().select({ userId: schema.guestSessions.userId }).from(schema.guestSessions).where(eq(schema.guestSessions.id, guestId));
  if (!g?.userId) return { guestId, user: null, entitlements: [], premium: false };
  const [u] = await db()
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, status: schema.users.status, handle: schema.userProfiles.handle, displayName: schema.userProfiles.displayName, isPublic: schema.userProfiles.isPublic })
    .from(schema.users)
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
    .where(eq(schema.users.id, g.userId));
  if (!u || u.status !== "active") return { guestId, user: null, entitlements: [], premium: false };
  const ents = await activeEntitlements(u.id);
  return {
    guestId,
    user: { id: u.id, email: u.email ?? "", handle: u.handle ?? "", displayName: u.displayName, isPublic: u.isPublic ?? false, role: u.role },
    entitlements: ents,
    premium: ents.includes("premium_monthly"),
  };
}

export async function activeEntitlements(userId: string): Promise<string[]> {
  const rows = await db().execute<{ product_id: string }>(sql`
    select distinct product_id from naijarush.entitlements
    where user_id = ${userId} and revoked_at is null and starts_at <= now() and (ends_at is null or ends_at > now())`);
  const ids = rows.map((r) => r.product_id);
  // Premium includes every cosmetic.
  if (ids.includes("premium_monthly")) ids.push("skin_owambe_ada", "skin_neon_tunde");
  return [...new Set(ids)];
}

/* ───────── profile ───────── */

export async function updateProfile(userId: string, input: { handle?: unknown; displayName?: unknown; isPublic?: unknown }) {
  const patch: Partial<typeof schema.userProfiles.$inferInsert> = { updatedAt: new Date() };
  if (input.handle !== undefined) {
    const handle = String(input.handle).trim().toLowerCase();
    if (!HANDLE.test(handle)) throw new HttpError(422, "invalid_handle", "Handles are 3 to 20 letters, numbers or underscores.");
    if (!checkNickname(handle).ok) throw new HttpError(422, "handle_blocked", "Please choose a different handle.");
    const taken = await db().select({ id: schema.userProfiles.userId }).from(schema.userProfiles).where(sql`lower(${schema.userProfiles.handle}) = ${handle} and ${schema.userProfiles.userId} <> ${userId}`);
    if (taken.length) throw new HttpError(409, "handle_taken", "That handle is taken.");
    patch.handle = handle;
  }
  if (input.displayName !== undefined) {
    const raw = String(input.displayName ?? "").trim();
    if (raw) {
      const c = checkNickname(raw);
      if (!c.ok) throw new HttpError(422, `nickname_${c.reason}`, "Please choose a different display name.");
      patch.displayName = c.value;
    } else patch.displayName = null;
  }
  if (input.isPublic !== undefined) {
    patch.isPublic = input.isPublic === true;
    await db().insert(schema.consents).values({ userId, kind: "public_profile", granted: patch.isPublic, policyVersion: POLICY_VERSION });
  }
  await db().update(schema.userProfiles).set(patch).where(eq(schema.userProfiles.userId, userId));
}

export async function publicProfile(handle: string) {
  if (!HANDLE.test(handle)) return null;
  const [p] = await db()
    .select({ userId: schema.userProfiles.userId, handle: schema.userProfiles.handle, displayName: schema.userProfiles.displayName, isPublic: schema.userProfiles.isPublic, status: schema.users.status })
    .from(schema.userProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.userProfiles.userId))
    .where(sql`lower(${schema.userProfiles.handle}) = ${handle.toLowerCase()}`);
  if (!p || !p.isPublic || p.status !== "active") return null;
  const bests = await db().execute<{ game_slug: string; best: number; runs: number }>(sql`
    select game_slug, max(score)::int as best, count(*)::int as runs from naijarush.game_sessions
    where user_id = ${p.userId} and status = 'valid' and not hidden and mode <> 'endless' group by game_slug`);
  return { handle: p.handle, displayName: p.displayName, bests: bests.map((b) => ({ game: b.game_slug, best: Number(b.best), runs: Number(b.runs) })) };
}

export async function recentRuns(userId: string | null, guestId: string, limit = 15) {
  return db()
    .select({ id: schema.gameSessions.id, game: schema.gameSessions.gameSlug, mode: schema.gameSessions.mode, score: schema.gameSessions.score, status: schema.gameSessions.status, at: schema.gameSessions.submittedAt })
    .from(schema.gameSessions)
    .where(and(userId ? eq(schema.gameSessions.userId, userId) : eq(schema.gameSessions.guestSessionId, guestId), sql`${schema.gameSessions.submittedAt} is not null`))
    .orderBy(desc(schema.gameSessions.submittedAt))
    .limit(limit);
}

/* ───────── privacy ───────── */

/** Everything we hold about this player, as JSON. */
export async function exportData(guestId: string, userId: string | null) {
  const guestIds = userId
    ? (await db().select({ id: schema.guestSessions.id }).from(schema.guestSessions).where(eq(schema.guestSessions.userId, userId))).map((r) => r.id)
    : [guestId];
  const inGuests = sql.join(guestIds.map((g) => sql`${g}`), sql`, `);
  const q = async (query: ReturnType<typeof sql>) => (await db().execute(query)) as unknown as Record<string, unknown>[];
  return {
    exportedAt: new Date().toISOString(),
    account: userId ? (await q(sql`select u.id, u.email, u.created_at, p.handle, p.display_name, p.is_public, p.age_band from naijarush.users u left join naijarush.user_profiles p on p.user_id = u.id where u.id = ${userId}`))[0] : null,
    sessions: await q(sql`select id, created_at, last_seen_at, first_channel from naijarush.guest_sessions where id in (${inGuests})`),
    runs: await q(sql`select id, game_slug, mode, status, score, stats, issued_at, submitted_at from naijarush.game_sessions where guest_session_id in (${inGuests}) order by issued_at`),
    challenges: await q(sql`select code, game_slug, target_score, display_name, status, created_at, expires_at from naijarush.challenges where creator_guest_id in (${inGuests})`),
    consents: await q(sql`select kind, granted, policy_version, created_at from naijarush.consents where guest_session_id in (${inGuests}) ${userId ? sql`or user_id = ${userId}` : sql``}`),
    payments: userId ? await q(sql`select reference, product_id, amount_kobo, currency, status, created_at from naijarush.payments where user_id = ${userId}`) : [],
    entitlements: userId ? await q(sql`select product_id, source, starts_at, ends_at, revoked_at from naijarush.entitlements where user_id = ${userId}`) : [],
  };
}

/**
 * Delete a player. Removes guest sessions (and with them runs, challenges,
 * attempts and referral links), the account, profile, identities, consents
 * and entitlements. Payment records are kept for statutory accounting but
 * detached from the person.
 */
export async function deleteEverything(guestId: string, userId: string | null) {
  const guestIds = userId
    ? (await db().select({ id: schema.guestSessions.id }).from(schema.guestSessions).where(eq(schema.guestSessions.userId, userId))).map((r) => r.id)
    : [];
  for (const id of new Set([guestId, ...guestIds])) {
    await db().delete(schema.analyticsEvents).where(eq(schema.analyticsEvents.guestSessionId, id));
  }
  if (userId) {
    await db().delete(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, userId));
    await db().update(schema.payments).set({ userId: null }).where(eq(schema.payments.userId, userId));
    await db().delete(schema.guestSessions).where(eq(schema.guestSessions.userId, userId));
    await db().delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
    await db().delete(schema.users).where(eq(schema.users.id, userId));
  }
  await db().delete(schema.guestSessions).where(eq(schema.guestSessions.id, guestId));
  await db().insert(schema.adminAuditLogs).values({ actor: "self_service", action: userId ? "account.deleted" : "guest.deleted", targetType: userId ? "user" : "guest", targetId: userId ?? guestId });
}
