import type { Metadata } from "next";
import Link from "next/link";
import { isOpen, publicCampaigns } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events" };

const fmt = (d: Date) => d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });

export default async function EventsPage() {
  const events = await publicCampaigns();
  return (
    <section className="section">
      <div className="wrap stack" style={{ gap: 18 }}>
        <span className="eyebrow">Events</span>
        <h1 style={{ fontSize: "2.6rem" }}>Sponsored and creator challenges</h1>
        {events.length === 0 && <div className="board empty">No events right now. Check back soon.</div>}
        <div className="games">
          {events.map((e) => (
            <Link key={e.id} className="game-card" href={`/events/${e.slug}`}>
              <span className={`chip ${isOpen(e) ? "chip-live" : ""}`}>{isOpen(e) ? "● Live now" : e.startsAt > new Date() ? "Starting soon" : "Ended"}</span>
              <h3>{e.name}</h3>
              <p>{e.sponsorName ? `With ${e.sponsorName}. ` : ""}{fmt(e.startsAt)} to {fmt(e.endsAt)} (Lagos time)</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
