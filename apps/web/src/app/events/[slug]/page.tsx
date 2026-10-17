import { GAMES, isGameSlug } from "@venix/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeaderboardList } from "@/components/leaderboard-list";
import { campaignBoard, getCampaign, isOpen } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCampaign(slug);
  return c && c.status !== "draft" ? { title: c.name, description: `${c.sponsorName ? `${c.sponsorName} presents ` : ""}${c.name} on Naija Rush.` } : { title: "Event not found", robots: { index: false } };
}

const fmt = (d: Date) => d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "full", timeStyle: "short" });

/** Rules, eligibility and dates are always shown before anyone plays. */
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCampaign(slug);
  if (!c || c.status === "draft") notFound();
  const open = isOpen(c);
  const board = await campaignBoard(c.id);
  const game = isGameSlug(c.gameSlug) ? GAMES[c.gameSlug] : null;
  return (
    <>
      <div className="stripe" />
      <section className="hero">
        <div className="wrap stack" style={{ maxWidth: 720 }}>
          <span className="eyebrow">{c.kind === "creator" ? "Creator challenge" : "Sponsored event"}{c.sponsorName ? ` · ${c.sponsorName}` : ""}</span>
          <h1>{c.name}</h1>
          <p className="lede">
            {game?.name ?? c.gameSlug} · {fmt(c.startsAt)} to {fmt(c.endsAt)} (Lagos time)
          </p>
          {open ? (
            <Link className="btn btn-lg" href={`/play?campaign=${c.slug}`} style={{ alignSelf: "flex-start" }}>
              Play in this event
            </Link>
          ) : (
            <p className="notice">{c.startsAt > new Date() ? "This event has not started yet." : "This event has ended. Final standings below."}</p>
          )}
          {c.kind === "sponsored" && <p className="fineprint">Sponsored content. {c.sponsorName ?? "The sponsor"} supports this event.</p>}
        </div>
      </section>
      <section className="section">
        <div className="wrap stack" style={{ maxWidth: 720 }}>
          <div className="panel" style={{ maxWidth: "none" }}>
            <h2 style={{ fontSize: "1.4rem" }}>Rules</h2>
            <div className="prose" style={{ whiteSpace: "pre-wrap" }}>{c.rulesMd}</div>
            <h2 style={{ fontSize: "1.2rem", marginTop: 16 }}>Who can take part</h2>
            <p className="prose">{c.eligibility}</p>
            <p className="fineprint">Free to enter. No purchase necessary. Only verified runs count, and the organisers may remove runs that break the rules.</p>
          </div>
          <div className="section-head"><h2>Standings</h2></div>
          <LeaderboardList rows={board} emptyText="No verified runs in this event yet." />
        </div>
      </section>
    </>
  );
}
