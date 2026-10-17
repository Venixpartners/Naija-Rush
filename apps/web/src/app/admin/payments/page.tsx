import { nairaLabel } from "@venix/core";
import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { adminFromHeader, can } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { isTestMode, paymentProvider } from "@/lib/payments/paystack";
import { paymentsEnabled } from "@/lib/services/billing";
import { reverifyPaymentAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments", robots: { index: false } };

type Row = Record<string, unknown>;
const q = async <T extends Row>(query: ReturnType<typeof sql>) => (await db().execute<T>(query)) as unknown as T[];

/** Finance view. Only the finance and admin roles can open it. */
export default async function PaymentsAdmin() {
  const who = adminFromHeader((await headers()).get("authorization"));
  if (!can(who, "finance")) {
    return (
      <section className="section admin"><div className="wrap"><p className="notice">Finance access only.</p><Link href="/admin">← Operations</Link></div></section>
    );
  }
  const [totals, payments, subs, events] = await Promise.all([
    q<{ status: string; n: number; kobo: number }>(sql`select status, count(*)::int as n, coalesce(sum(amount_kobo), 0)::bigint as kobo from naijarush.payments where created_at > now() - interval '30 days' group by status`),
    q<{ id: string; reference: string; product_id: string; amount_kobo: number; status: string; created_at: Date; verified_at: Date | null }>(sql`
      select id, reference, product_id, amount_kobo, status, created_at, verified_at from naijarush.payments order by created_at desc limit 40`),
    q<{ status: string; n: number }>(sql`select status, count(*)::int as n from naijarush.subscriptions group by status`),
    q<{ event_type: string; valid: boolean; n: number; unprocessed: number }>(sql`
      select event_type, signature_valid as valid, count(*)::int as n, count(*) filter (where processed_at is null and signature_valid)::int as unprocessed
      from naijarush.payment_events where provider = 'paystack' and received_at > now() - interval '30 days' group by 1, 2 order by 3 desc`),
  ]);
  const enabled = await paymentsEnabled();
  return (
    <section className="section admin">
      <div className="wrap stack" style={{ gap: 24 }}>
        <Link href="/admin" className="fineprint">← Operations</Link>
        <h1 style={{ fontSize: "2.2rem" }}>Payments</h1>
        <p className="notice">
          {!paymentProvider() ? "Paystack is not configured (PAYSTACK_SECRET_KEY)." : isTestMode() ? "Paystack TEST mode." : "Paystack LIVE mode."} Payments flag: {enabled ? "on" : "off"}. Refunds are issued in the Paystack dashboard; the webhook revokes access automatically.
        </p>
        <div className="kpis">
          {totals.map((t) => (
            <div className="kpi" key={t.status}><b>{t.n}</b><span className="fineprint">{t.status} · {nairaLabel(Number(t.kobo))} (30 days)</span></div>
          ))}
          {subs.map((s) => (
            <div className="kpi" key={s.status}><b>{s.n}</b><span className="fineprint">subscriptions {s.status}</span></div>
          ))}
        </div>
        <div>
          <h2>Recent payments</h2>
          <table>
            <thead><tr><th>Reference</th><th>Product</th><th>Amount</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.reference}</td><td>{p.product_id}</td><td>{nairaLabel(p.amount_kobo)}</td><td>{p.status}</td>
                  <td className="fineprint">{new Date(p.created_at).toISOString().slice(0, 16)}</td>
                  <td>{p.status === "initialized" && <form action={reverifyPaymentAction}><input type="hidden" name="reference" value={p.reference} /><button>Check with Paystack</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2>Webhooks (30 days)</h2>
          <table>
            <thead><tr><th>Event</th><th>Signature</th><th>Count</th><th>Unprocessed</th></tr></thead>
            <tbody>{events.map((e, i) => <tr key={i}><td>{e.event_type}</td><td>{e.valid ? "valid" : "INVALID"}</td><td>{e.n}</td><td>{e.unprocessed}</td></tr>)}</tbody>
          </table>
          <p className="fineprint">Invalid signatures are recorded and ignored. Unprocessed events mean processing failed; Paystack retries them.</p>
        </div>
      </div>
    </section>
  );
}
