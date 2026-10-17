"use server";

import { schema } from "@venix/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { adminFromHeader, can } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { createCampaign, setCampaignStatus } from "@/lib/services/campaigns";
import { confirmCallback } from "@/lib/services/billing";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Server actions run on the /admin route, which middleware protects with
 * basic auth. We re-check the header here as defence in depth.
 */
async function actor(area: "moderation" | "campaigns" | "finance" = "moderation"): Promise<string> {
  const who = adminFromHeader((await headers()).get("authorization"));
  if (!can(who, area)) throw new Error("forbidden");
  return `${who!.user} (${who!.role})`;
}

async function audit(who: string, action: string, targetType: string, targetId: string, details?: unknown) {
  await db().insert(schema.adminAuditLogs).values({ actor: who, action, targetType, targetId, details: details ?? null });
}

export async function approveRun(form: FormData) {
  const who = await actor();
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await db().update(schema.gameSessions).set({ status: "valid" }).where(eq(schema.gameSessions.id, id));
  await audit(who, "run.approve", "run", id);
  revalidatePath("/admin");
}

export async function hideRun(form: FormData) {
  const who = await actor();
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await db().update(schema.gameSessions).set({ hidden: true, status: "rejected" }).where(eq(schema.gameSessions.id, id));
  await audit(who, "run.reject", "run", id);
  revalidatePath("/admin");
}

export async function revokeChallenge(form: FormData) {
  const who = await actor();
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await db().update(schema.challenges).set({ status: "revoked" }).where(eq(schema.challenges.id, id));
  await audit(who, "challenge.revoke", "challenge", id);
  revalidatePath("/admin");
}

export async function clearNickname(form: FormData) {
  const who = await actor();
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await db().update(schema.challenges).set({ displayName: null }).where(eq(schema.challenges.id, id));
  await audit(who, "challenge.clear_nickname", "challenge", id);
  revalidatePath("/admin");
}

/** Datetime local input in Lagos time to a Date. */
const lagos = (v: FormDataEntryValue | null) => new Date(`${String(v)}:00+01:00`);

export async function createCampaignAction(form: FormData) {
  const who = await actor("campaigns");
  let error: string | null = null;
  try {
    const c = await createCampaign({
      slug: String(form.get("slug") ?? ""),
      name: String(form.get("name") ?? ""),
      sponsorName: String(form.get("sponsor") ?? ""),
      gameSlug: "naija-rush",
      kind: String(form.get("kind") ?? "sponsored"),
      startsAt: lagos(form.get("starts")),
      endsAt: lagos(form.get("ends")),
      rulesMd: String(form.get("rules") ?? ""),
      eligibility: String(form.get("eligibility") ?? ""),
    });
    await audit(who, "campaign.create", "campaign", c.id, { slug: c.slug });
  } catch (e) {
    error = (e as Error).message;
  }
  revalidatePath("/admin/campaigns");
  if (error) redirect(`/admin/campaigns?error=${encodeURIComponent(error)}`);
}

export async function setCampaignStatusAction(form: FormData) {
  const who = await actor("campaigns");
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  if (!UUID.test(id) || !["draft", "live", "ended"].includes(status)) return;
  await setCampaignStatus(id, status as "draft" | "live" | "ended");
  await audit(who, `campaign.${status}`, "campaign", id);
  revalidatePath("/admin/campaigns");
}

export async function reverifyPaymentAction(form: FormData) {
  const who = await actor("finance");
  const reference = String(form.get("reference"));
  const result = await confirmCallback(reference);
  await audit(who, "payment.reverify", "payment", reference, result);
  revalidatePath("/admin/payments");
}

/* ───────── moderation ───────── */

async function resolveReport(id: string, who: string, status: "actioned" | "dismissed") {
  await db().update(schema.moderationReports).set({ status, resolvedBy: who, resolvedAt: new Date() }).where(eq(schema.moderationReports.id, id));
}

export async function dismissReport(form: FormData) {
  const who = await actor("moderation");
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await resolveReport(id, who, "dismissed");
  await audit(who, "report.dismiss", "report", id);
  revalidatePath("/admin");
}

export async function actOnReport(form: FormData) {
  const who = await actor("moderation");
  const id = String(form.get("id"));
  const action = String(form.get("action"));
  if (!UUID.test(id)) return;
  const [r] = await db().select().from(schema.moderationReports).where(eq(schema.moderationReports.id, id));
  if (!r) return;
  if (r.targetType === "challenge" && action === "clear_name") {
    await db().update(schema.challenges).set({ displayName: null }).where(eq(schema.challenges.id, r.targetId));
  } else if (r.targetType === "profile" && action === "hide_profile") {
    await db().update(schema.userProfiles).set({ isPublic: false, displayName: null }).where(eq(schema.userProfiles.userId, r.targetId));
  } else if (r.targetType === "profile" && action === "ban") {
    await db().update(schema.users).set({ status: "banned" }).where(eq(schema.users.id, r.targetId));
  } else return;
  await resolveReport(id, who, "actioned");
  await audit(who, `report.${action}`, r.targetType, r.targetId, { report: id });
  revalidatePath("/admin");
}
