"use server";

import { schema } from "@venix/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Server actions run on the /admin route, which middleware protects with
 * basic auth. We re-check the header here as defence in depth.
 */
async function actor(): Promise<string> {
  const auth = (await headers()).get("authorization") ?? "";
  const user = process.env.ADMIN_USER;
  if (!user || !auth.startsWith("Basic ")) throw new Error("unauthorised");
  const [u] = atob(auth.slice(6)).split(":");
  if (u !== user) throw new Error("unauthorised");
  return u;
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
