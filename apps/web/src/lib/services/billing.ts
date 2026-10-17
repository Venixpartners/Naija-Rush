import { canMovePayment, canMoveSubscription, type PaymentStatus, type SubscriptionStatus } from "@venix/core";
import { schema } from "@venix/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { track } from "../analytics";
import { db } from "../db";
import { env } from "../env";
import { HttpError } from "../http";
import { paymentProvider, type PaymentProvider, type VerifiedTransaction } from "../payments/paystack";
import { POLICY_VERSION } from "./challenges";

const PREMIUM = "premium_monthly";
const PREMIUM_DAYS = 31;

/** Payments run only when the flag is on and a Paystack key is configured. */
export async function paymentsEnabled(provider = paymentProvider()): Promise<boolean> {
  if (!provider) return false;
  const [flag] = await db().select().from(schema.featureFlags).where(eq(schema.featureFlags.key, "payments"));
  return Boolean(flag?.enabled);
}

export async function listProducts() {
  return db().select().from(schema.products).where(eq(schema.products.active, true));
}

/* ───────── checkout ───────── */

export async function startCheckout(input: { userId: string; email: string; productId: string; adultConfirmed: unknown }, provider = paymentProvider()) {
  if (!provider || !(await paymentsEnabled(provider))) throw new HttpError(503, "payments_unavailable", "Payments are not open yet.");
  if (input.adultConfirmed !== true) {
    throw new HttpError(422, "adult_required", "Purchases need someone aged 18 or over. Ask a parent or guardian to buy for you.");
  }
  const [product] = await db().select().from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.active, true)));
  if (!product) throw new HttpError(404, "product_not_found");
  const owned = await db().execute<{ n: number }>(sql`
    select count(*)::int as n from naijarush.entitlements
    where user_id = ${input.userId} and product_id = ${product.id} and revoked_at is null and (ends_at is null or ends_at > now())`);
  if (Number(owned[0]?.n) > 0) throw new HttpError(409, "already_owned", "You already have this.");

  const reference = `nr_${randomBytes(12).toString("hex")}`;
  await db().insert(schema.payments).values({ userId: input.userId, productId: product.id, provider: provider.name, reference, amountKobo: product.priceKobo, currency: product.currency });
  await db().insert(schema.consents).values({ userId: input.userId, kind: "adult_purchase", granted: true, policyVersion: POLICY_VERSION });
  const { authorizationUrl } = await provider.initialize({
    email: input.email,
    amountKobo: product.priceKobo,
    reference,
    callbackUrl: `${env.siteUrl}/api/payments/callback`,
    planCode: product.kind === "subscription" ? product.providerPlanCode : null,
    metadata: { userId: input.userId, productId: product.id, reference },
  });
  await track("checkout_started", { userId: input.userId, props: { productId: product.id, amountKobo: product.priceKobo } });
  return { authorizationUrl, reference };
}

/* ───────── verified charges ───────── */

async function movePayment(id: string, from: PaymentStatus, to: PaymentStatus) {
  if (!canMovePayment(from, to)) return false;
  const rows = await db()
    .update(schema.payments)
    .set({ status: to, ...(to === "success" ? { verifiedAt: new Date() } : {}) })
    .where(and(eq(schema.payments.id, id), eq(schema.payments.status, from)))
    .returning({ id: schema.payments.id });
  return rows.length > 0;
}

/** Grant the product for a verified payment. Idempotent per payment. */
async function grantFor(payment: typeof schema.payments.$inferSelect) {
  if (!payment.userId) return;
  const existing = await db().select({ id: schema.entitlements.id }).from(schema.entitlements).where(eq(schema.entitlements.sourceId, payment.id));
  if (existing.length) return;
  if (payment.productId === PREMIUM) {
    // Extend from the later of now or the current premium end.
    const [cur] = await db().execute<{ ends: Date | null }>(sql`
      select max(ends_at) as ends from naijarush.entitlements
      where user_id = ${payment.userId} and product_id = ${PREMIUM} and revoked_at is null and ends_at > now()`);
    const from = cur?.ends ? new Date(cur.ends) : new Date();
    await db().insert(schema.entitlements).values({ userId: payment.userId, productId: PREMIUM, source: "subscription", sourceId: payment.id, startsAt: new Date(), endsAt: new Date(from.getTime() + PREMIUM_DAYS * 86_400_000) });
  } else {
    await db().insert(schema.entitlements).values({ userId: payment.userId, productId: payment.productId, source: "purchase", sourceId: payment.id });
  }
}

/**
 * Apply a transaction that has been verified with Paystack's API. Never
 * called with data from the browser.
 */
export async function applyVerifiedTransaction(tx: VerifiedTransaction) {
  const [payment] = await db().select().from(schema.payments).where(eq(schema.payments.reference, tx.reference));
  if (!payment) return { status: "unknown_reference" as const };
  if (tx.status !== "success") {
    if (tx.status === "failed" || tx.status === "abandoned") await movePayment(payment.id, payment.status as PaymentStatus, "failed");
    return { status: tx.status };
  }
  if (tx.amountKobo !== payment.amountKobo || tx.currency !== payment.currency || (tx.metadata.userId && tx.metadata.userId !== payment.userId)) {
    await db().insert(schema.adminAuditLogs).values({ actor: "billing", action: "payment.mismatch", targetType: "payment", targetId: payment.id, details: { tx } });
    return { status: "mismatch" as const };
  }
  await movePayment(payment.id, payment.status as PaymentStatus, "success");
  const [fresh] = await db().select().from(schema.payments).where(eq(schema.payments.id, payment.id));
  if (fresh?.status === "success") {
    await grantFor(fresh);
    await track("payment_verified", { userId: fresh.userId, props: { productId: fresh.productId, amountKobo: fresh.amountKobo } });
  }
  return { status: fresh?.status ?? "unknown" };
}

/** Browser returns from Paystack: we ask Paystack ourselves, never trust the URL. */
export async function confirmCallback(reference: string, provider = paymentProvider()) {
  if (!provider || !/^nr_[0-9a-f]{24}$/.test(reference)) return { status: "invalid" };
  return applyVerifiedTransaction(await provider.verify(reference));
}

/* ───────── webhooks ───────── */

interface PaystackEvent {
  event: string;
  data: Record<string, unknown> & {
    id?: number | string;
    reference?: string;
    transaction_reference?: string;
    transaction?: { reference?: string };
    subscription_code?: string;
    email_token?: string;
    next_payment_date?: string;
    customer?: { email?: string; customer_code?: string };
    plan?: { plan_code?: string };
    subscription?: { subscription_code?: string };
  };
}

async function userByEmail(email: string | undefined) {
  if (!email) return null;
  const [u] = await db().select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
  return u?.id ?? null;
}

async function moveSubscription(code: string, to: SubscriptionStatus, patch: Partial<typeof schema.subscriptions.$inferInsert> = {}) {
  const [sub] = await db().select().from(schema.subscriptions).where(eq(schema.subscriptions.providerSubscriptionCode, code));
  if (!sub || !canMoveSubscription(sub.status as SubscriptionStatus, to)) return;
  await db().update(schema.subscriptions).set({ status: to, updatedAt: new Date(), ...patch }).where(eq(schema.subscriptions.id, sub.id));
}

/**
 * Handle a Paystack webhook. Signature first, then exactly once processing
 * keyed on the event, then state machine guarded updates.
 */
export async function handlePaystackWebhook(rawBody: string, signature: string | null, provider = paymentProvider()): Promise<{ status: number; result: string }> {
  if (!provider) return { status: 503, result: "payments_not_configured" };
  const valid = provider.verifySignature(rawBody, signature);
  let evt: PaystackEvent;
  try {
    evt = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return { status: 400, result: "bad_json" };
  }
  const d = evt.data ?? {};
  const dedupeKey = `${evt.event}:${d.id ?? d.reference ?? d.subscription_code ?? d.transaction_reference ?? rawBody.length}`;
  if (!valid) {
    await db().insert(schema.paymentEvents).values({ provider: provider.name, dedupeKey: `invalid:${Date.now()}:${dedupeKey}`, eventType: evt.event ?? "unknown", payload: evt, signatureValid: false });
    return { status: 401, result: "bad_signature" };
  }
  const inserted = await db()
    .insert(schema.paymentEvents)
    .values({ provider: provider.name, dedupeKey, eventType: evt.event, payload: evt, signatureValid: true })
    .onConflictDoNothing()
    .returning({ id: schema.paymentEvents.id });
  if (!inserted.length) return { status: 200, result: "duplicate_ignored" };

  switch (evt.event) {
    case "charge.success": {
      const reference = String(d.reference ?? "");
      const [known] = await db().select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.reference, reference));
      if (known) {
        await applyVerifiedTransaction(await provider.verify(reference));
      } else if (d.plan?.plan_code) {
        // Subscription renewal charged by Paystack: record and extend premium.
        const tx = await provider.verify(reference);
        const userId = await userByEmail(d.customer?.email);
        if (userId && tx.status === "success") {
          const [p] = await db()
            .insert(schema.payments)
            .values({ userId, productId: PREMIUM, provider: provider.name, reference, amountKobo: tx.amountKobo, currency: tx.currency, status: "success", verifiedAt: new Date() })
            .onConflictDoNothing()
            .returning();
          if (p) {
            await grantFor(p);
            await track("subscription_renewed", { userId, props: { amountKobo: tx.amountKobo } });
          }
        }
      }
      break;
    }
    case "subscription.create": {
      const userId = await userByEmail(d.customer?.email);
      if (userId && d.subscription_code) {
        await db()
          .insert(schema.subscriptions)
          .values({
            userId,
            productId: PREMIUM,
            provider: provider.name,
            providerSubscriptionCode: d.subscription_code,
            providerEmailToken: d.email_token ?? null,
            providerCustomerCode: d.customer?.customer_code ?? null,
            status: "active",
            currentPeriodEnd: d.next_payment_date ? new Date(d.next_payment_date) : null,
          })
          .onConflictDoNothing();
      }
      break;
    }
    case "subscription.not_renew":
      if (d.subscription_code) await moveSubscription(d.subscription_code, "non_renewing");
      break;
    case "subscription.disable":
      if (d.subscription_code) await moveSubscription(d.subscription_code, "cancelled");
      break;
    case "invoice.payment_failed": {
      const code = d.subscription?.subscription_code ?? d.subscription_code;
      if (code) await moveSubscription(code, "past_due");
      break;
    }
    case "refund.processed": {
      const reference = d.transaction_reference ?? d.transaction?.reference;
      const [payment] = reference ? await db().select().from(schema.payments).where(eq(schema.payments.reference, reference)) : [];
      if (payment && (await movePayment(payment.id, payment.status as PaymentStatus, "refunded"))) {
        await db().insert(schema.refunds).values({ paymentId: payment.id, amountKobo: Number(d.amount ?? payment.amountKobo), status: "processed", reason: "paystack_refund" });
        await db().update(schema.entitlements).set({ revokedAt: new Date() }).where(and(eq(schema.entitlements.sourceId, payment.id), isNull(schema.entitlements.revokedAt)));
        await track("purchase_refunded", { userId: payment.userId, props: { productId: payment.productId } });
      }
      break;
    }
    default:
      break;
  }
  await db().update(schema.paymentEvents).set({ processedAt: new Date() }).where(eq(schema.paymentEvents.id, inserted[0]!.id));
  return { status: 200, result: "processed" };
}

/** Stop renewing. Access continues to the end of the paid period. */
export async function cancelSubscription(userId: string, provider = paymentProvider()) {
  if (!provider) throw new HttpError(503, "payments_unavailable");
  const [sub] = await db().select().from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "active")));
  if (!sub?.providerSubscriptionCode || !sub.providerEmailToken) throw new HttpError(404, "no_active_subscription");
  await provider.disableSubscription(sub.providerSubscriptionCode, sub.providerEmailToken);
  await moveSubscription(sub.providerSubscriptionCode, "non_renewing");
  return { ok: true };
}
