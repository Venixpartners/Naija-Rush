import { schema } from "@venix/database";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { sha256 } from "./crypto";
import { db } from "./db";

export const GUEST_COOKIE = "nr_gid";

/**
 * Returns the guest session id for this browser, creating the row on first
 * use. The middleware guarantees the cookie exists; we only store its hash,
 * so a database leak cannot be used to hijack sessions.
 */
export async function ensureGuest(): Promise<string | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 64) return null;
  return guestIdForToken(token);
}

export async function guestIdForToken(token: string): Promise<string> {
  const [row] = await db()
    .insert(schema.guestSessions)
    .values({ tokenHash: sha256(token) })
    .onConflictDoUpdate({ target: schema.guestSessions.tokenHash, set: { lastSeenAt: sql`now()` } })
    .returning({ id: schema.guestSessions.id });
  return row!.id;
}

/** Read only lookup that never creates a row (for crawlers and previews). */
export async function peekGuest(): Promise<string | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()
    .select({ id: schema.guestSessions.id })
    .from(schema.guestSessions)
    .where(sql`${schema.guestSessions.tokenHash} = ${sha256(token)}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Replace this browser's session cookie (used after sign in and sign out). */
export async function setGuestCookie(token: string | null) {
  const jar = await cookies();
  if (!token) {
    jar.delete(GUEST_COOKIE);
    return;
  }
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
