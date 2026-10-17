/**
 * Payment and subscription state machines. Transitions not listed here are
 * refused, so a late or replayed webhook can never move a refunded payment
 * back to success, for example.
 */
export type PaymentStatus = "initialized" | "success" | "failed" | "reversed" | "refunded";
export type SubscriptionStatus = "active" | "non_renewing" | "past_due" | "cancelled";

const PAYMENT_NEXT: Record<PaymentStatus, PaymentStatus[]> = {
  initialized: ["success", "failed"],
  success: ["refunded", "reversed"],
  failed: [],
  reversed: [],
  refunded: [],
};

const SUBSCRIPTION_NEXT: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  active: ["non_renewing", "past_due", "cancelled"],
  non_renewing: ["cancelled", "active"],
  past_due: ["active", "cancelled"],
  cancelled: [],
};

export const canMovePayment = (from: PaymentStatus, to: PaymentStatus) => from === to || PAYMENT_NEXT[from].includes(to);
export const canMoveSubscription = (from: SubscriptionStatus, to: SubscriptionStatus) => from === to || SUBSCRIPTION_NEXT[from].includes(to);

/** Naira to kobo and back, integers only. */
export const nairaLabel = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
