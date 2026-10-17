import { isChallengeCode } from "@venix/core";
import { schema } from "@venix/database";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureGuest } from "@/lib/guest";
import { HttpError, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { HANDLE } from "@/lib/services/accounts";

export const runtime = "nodejs";

const REASONS = ["offensive_name", "harassment", "cheating", "impersonation", "other"];

/** Players report a challenge (nickname) or a public profile for review. */
export const POST = handle(async (req: Request) => {
  const guestId = await ensureGuest();
  if (!guestId) throw new HttpError(401, "no_session");
  if (!(await rateLimit(`report:${guestId}`, 10, 3600))) throw new HttpError(429, "rate_limited");
  const body = await readJson(req, 2_000);
  const reason = REASONS.includes(String(body.reason)) ? String(body.reason) : null;
  if (!reason) throw new HttpError(400, "bad_reason");
  let targetType: "challenge" | "profile";
  let targetId: string | undefined;
  if (body.type === "challenge" && typeof body.code === "string" && isChallengeCode(body.code)) {
    targetType = "challenge";
    targetId = (await db().select({ id: schema.challenges.id }).from(schema.challenges).where(eq(schema.challenges.code, body.code)))[0]?.id;
  } else if (body.type === "profile" && typeof body.handle === "string" && HANDLE.test(body.handle.toLowerCase())) {
    targetType = "profile";
    targetId = (await db().select({ id: schema.userProfiles.userId }).from(schema.userProfiles).where(sql`lower(${schema.userProfiles.handle}) = ${body.handle.toLowerCase()}`))[0]?.id;
  } else throw new HttpError(400, "bad_target");
  if (!targetId) throw new HttpError(404, "not_found");
  await db().insert(schema.moderationReports).values({ targetType, targetId, reason, reporterGuestId: guestId });
  return json({ ok: true }, 201);
});
