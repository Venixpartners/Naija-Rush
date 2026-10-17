import { GAME, type PeriodKey } from "@venix/core";
import type { Metadata } from "next";
import Link from "next/link";
import { LeaderboardList } from "@/components/leaderboard-list";
import { peekGuest } from "@/lib/guest";
import { getLeaderboard, isPeriod } from "@/lib/services/leaderboards";

export const dynamic = "force-dynamic";

const LABELS: Record<PeriodKey, string> = { daily: "Today", weekly: "This week", all: "All time" };

export const metadata: Metadata = { title: "Rankings" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const slug = GAME.slug;
  const { period: raw } = await searchParams;
  const period: PeriodKey = isPeriod(raw) ? raw : "daily";
  const rows = await getLeaderboard(slug, period, 50, await peekGuest());

  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow">Rankings</span>
        <h1 style={{ fontSize: "2.4rem", margin: "8px 0 16px" }}>{GAME.name}</h1>
        <nav className="tabs" aria-label="Period">
          {(Object.keys(LABELS) as PeriodKey[]).map((p) => (
            <Link key={p} href={`/leaderboards?period=${p}`} aria-current={p === period ? "page" : undefined}>
              {LABELS[p]}
            </Link>
          ))}
        </nav>
        <LeaderboardList rows={rows} emptyText="No verified scores in this period yet." />
        <p className="fineprint" style={{ marginTop: 14 }}>
          Best verified score per player. Days and weeks follow Lagos time. Runs under review are not shown. Ties go to
          whoever got there first.
        </p>
        
          <Link className="btn btn-lg" href="/play">
            Run now
          </Link>
        
      </div>
    </section>
  );
}
