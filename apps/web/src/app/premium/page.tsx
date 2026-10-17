import { nairaLabel } from "@venix/core";
import type { Metadata } from "next";
import Link from "next/link";
import { BuyButton, CancelButton } from "@/components/premium-client";
import { ensureGuest } from "@/lib/guest";
import { isTestMode } from "@/lib/payments/paystack";
import { getMe } from "@/lib/services/accounts";
import { listProducts, paymentsEnabled } from "@/lib/services/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Premium" };

const STATUS: Record<string, string> = {
  success: "Payment confirmed. Enjoy!",
  failed: "The payment did not go through. You have not been charged.",
  abandoned: "Payment was cancelled. You have not been charged.",
  pending: "Paystack is still confirming your payment. Refresh in a minute.",
  mismatch: "We could not match that payment. Our team has been alerted.",
};

/** Optional extras. The games are, and stay, free. */
export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const guestId = await ensureGuest();
  const me = guestId ? await getMe(guestId) : null;
  const enabled = await paymentsEnabled();
  const products = enabled ? await listProducts() : [];
  const premium = products.find((p) => p.id === "premium_monthly");
  const cosmetics = products.filter((p) => p.kind === "cosmetic");

  return (
    <section className="section">
      <div className="wrap stack" style={{ maxWidth: 640, gap: 20 }}>
        <span className="eyebrow">Optional extras</span>
        <h1 style={{ fontSize: "2.6rem" }}>Naija Rush Premium</h1>
        {status && <p className="notice">{STATUS[status] ?? "Something went wrong. You have not been charged."}</p>}
        {enabled && isTestMode() && <p className="notice">Test mode: use Paystack test cards. No real money moves.</p>}
        <p className="lede">The games are free forever. Premium is a thank you that unlocks looks, never advantages: scores and rankings are exactly the same for everyone.</p>
        <ul className="legend">
          <li><span className="dot" style={{ background: "#FFC400" }}>★</span>Owambe Ada in gold aso ebi, and Neon Tunde</li>
          <li><span className="dot" style={{ background: "#00E0B0" }}>✓</span>Every future outfit and street style in Naija Rush</li>
          <li><span className="dot" style={{ background: "#FF3D8B", color: "#fff" }}>♥</span>Supports new games made in Lagos</li>
        </ul>

        {!enabled ? (
          <p className="notice">Premium is coming soon.</p>
        ) : !me?.user ? (
          <Link className="btn btn-block btn-lg" href="/account">Sign in to get Premium</Link>
        ) : me.premium ? (
          <div className="panel" style={{ maxWidth: "none" }}>
            <h2 style={{ fontSize: "1.4rem" }}>You are Premium</h2>
            <CancelButton />
          </div>
        ) : (
          <div className="stack">
            {premium && (
              <div className="panel" style={{ maxWidth: "none" }}>
                <h2 style={{ fontSize: "1.4rem" }}>{nairaLabel(premium.priceKobo)} a month</h2>
                <p className="fineprint">Renews monthly through Paystack. Cancel any time from your account; you keep Premium to the end of the month you paid for.</p>
                <BuyButton productId={premium.id} label="Get Premium" />
              </div>
            )}
            {cosmetics.map((c) => (
              <div className="panel" key={c.id} style={{ maxWidth: "none" }}>
                <h2 style={{ fontSize: "1.2rem" }}>{c.name}</h2>
                <p className="fineprint">One off, {nairaLabel(c.priceKobo)}. Looks only.</p>
                <BuyButton productId={c.id} label={`Buy for ${nairaLabel(c.priceKobo)}`} disabled={me.entitlements.includes(c.id)} />
              </div>
            ))}
          </div>
        )}
        <p className="fineprint">Payments are processed by Paystack. Naija Rush never sees your card details. Refunds follow the <Link href="/legal/terms">Terms</Link>.</p>
      </div>
    </section>
  );
}
