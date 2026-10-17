import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { adminFromHeader, can } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { schema } from "@venix/database";
import { desc } from "drizzle-orm";
import { campaignReport } from "@/lib/services/campaigns";
import { createCampaignAction, setCampaignStatusAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaigns", robots: { index: false } };

export default async function CampaignsAdmin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const who = adminFromHeader((await headers()).get("authorization"));
  const allowed = can(who, "campaigns");
  const rows = await db().select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt)).limit(50);
  const reports = await Promise.all(rows.map((r) => campaignReport(r.id)));
  return (
    <section className="section admin">
      <div className="wrap stack" style={{ gap: 24 }}>
        <Link href="/admin" className="fineprint">← Operations</Link>
        <h1 style={{ fontSize: "2.2rem" }}>Campaigns</h1>
        {error && <p className="error">{error}</p>}
        <div>
          <table>
            <thead><tr><th>Event</th><th>Status</th><th>Dates</th><th>Players</th><th>Runs</th><th>Challenges</th><th>Arrivals</th><th /></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td><a href={`/events/${c.slug}`}>{c.name}</a></td>
                  <td>{c.status}</td>
                  <td className="fineprint">{c.startsAt.toISOString().slice(0, 16)} → {c.endsAt.toISOString().slice(0, 16)}</td>
                  <td>{reports[i]!.participants}</td>
                  <td>{reports[i]!.valid_runs}/{reports[i]!.runs}</td>
                  <td>{reports[i]!.challenges}</td>
                  <td>{reports[i]!.arrivals}</td>
                  <td>
                    {allowed && (["draft", "live", "ended"] as const).filter((s) => s !== c.status).map((s) => (
                      <form key={s} action={setCampaignStatusAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value={s} /><button>{s}</button></form>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allowed ? (
          <form action={createCampaignAction} className="panel stack" style={{ maxWidth: 640 }}>
            <h2 style={{ fontSize: "1.3rem" }}>New campaign (saved as draft)</h2>
            <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" className="input" required maxLength={80} /></div>
            <div className="field"><label htmlFor="slug">Link slug</label><input id="slug" name="slug" className="input" required pattern="[a-z0-9][a-z0-9-]{2,40}" placeholder="survive-december" /></div>
            <div className="field"><label htmlFor="sponsor">Sponsor (optional)</label><input id="sponsor" name="sponsor" className="input" maxLength={80} /></div>
            <div className="field"><label htmlFor="kind">Type</label><select id="kind" name="kind" className="input"><option value="sponsored">Sponsored</option><option value="creator">Creator</option></select></div>
            <div className="field"><label htmlFor="starts">Starts (Lagos time)</label><input id="starts" name="starts" type="datetime-local" className="input" required /></div>
            <div className="field"><label htmlFor="ends">Ends (Lagos time)</label><input id="ends" name="ends" type="datetime-local" className="input" required /></div>
            <div className="field"><label htmlFor="rules">Rules (shown to players)</label><textarea id="rules" name="rules" className="input" required minLength={40} /></div>
            <div className="field"><label htmlFor="elig">Eligibility</label><input id="elig" name="eligibility" className="input" required placeholder="Open to players in Nigeria aged 13 and over" /></div>
            <p className="fineprint">Any prize needs legal review before launch (FCCPC, and NLRC rules for promotions). Paid entry and chance based prizes are not supported.</p>
            <button className="btn">Save draft</button>
          </form>
        ) : (
          <p className="fineprint">Your role can view campaigns but not change them.</p>
        )}
      </div>
    </section>
  );
}
