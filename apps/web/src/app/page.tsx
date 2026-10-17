import { GAME } from "@venix/core";
import type { Metadata } from "next";
import Link from "next/link";
import { DanfoArt } from "@/components/brand";
import { LeaderboardList } from "@/components/leaderboard-list";
import { peekGuest } from "@/lib/guest";
import { getLeaderboard } from "@/lib/services/leaderboards";

export const dynamic = "force-dynamic";
const game = GAME;

export const metadata: Metadata = {
  title: { absolute: "Naija Rush: Survive Lagos" },
  description: `${game.tagline} A free 3D runner you play in your browser.`,
};

export default async function Home() {
  const rows = await getLeaderboard(game.slug, "daily", 10, await peekGuest()).catch(() => []);
  return (
    <>
      <div className="stripe" />
      <section className="hero">
        <div className="wrap" style={{ position: "relative" }}>
          <div className="hero-danfo" aria-hidden="true">
            <DanfoArt />
          </div>
          <span className="eyebrow">3D runner · 60 seconds · No download</span>
          <h1>
            Naija Rush:
            <br />
            <span className="hl">Survive Lagos</span>
          </h1>
          <p className="lede">
            {game.tagline} Dodge danfos, keke and food carts, jump potholes and flooded puddles, slide under market
            canopies, and grab every coin on the way.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-lg" href="/play">
              Run now
            </Link>
            <Link className="btn btn-lg btn-ghost" href="/play?mode=daily">
              Today’s route
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="steps">
            <div className="step">
              <h3>Swipe</h3>
              <p>Left and right to switch lanes. Up to jump, down to slide. Buttons are there if you prefer.</p>
            </div>
            <div className="step">
              <h3>Survive</h3>
              <p>Last the full sixty seconds for a 150 point bonus. Near misses with traffic are worth 10 each.</p>
            </div>
            <div className="step">
              <h3>Send it</h3>
              <p>Your friends run the exact same street, same traffic. Endless mode is there when you just want to vibe.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Today’s survivors</h2>
            <Link href="/leaderboards">All rankings</Link>
          </div>
          <LeaderboardList rows={rows} emptyText="Nobody has survived Lagos today. Yet." />
        </div>
      </section>
    </>
  );
}
