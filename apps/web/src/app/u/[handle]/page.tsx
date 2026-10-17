import { GAMES, isGameSlug } from "@venix/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportButton } from "@/components/account-client";
import { publicProfile } from "@/lib/services/accounts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const p = await publicProfile(handle);
  return p ? { title: `@${p.handle}`, description: `${p.displayName ?? p.handle} on Naija Rush` } : { title: "Player not found", robots: { index: false } };
}

/** Public profile. Only exists when the player turned it on. */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const p = await publicProfile(handle);
  if (!p) notFound();
  return (
    <section className="section">
      <div className="wrap stack" style={{ maxWidth: 640 }}>
        <span className="eyebrow">Player</span>
        <h1 style={{ fontSize: "2.6rem" }}>{p.displayName ?? `@${p.handle}`}</h1>
        <p className="fineprint">@{p.handle}</p>
        <ol className="board">
          {p.bests.length === 0 && <li><span className="name">No verified runs yet.</span></li>}
          {p.bests.map((b) => (
            <li key={b.game}>
              <span className="rank">★</span>
              <span className="name">{isGameSlug(b.game) ? GAMES[b.game].name : b.game} · {b.runs} runs</span>
              <span className="pts">{b.best.toLocaleString("en-NG")}</span>
            </li>
          ))}
        </ol>
        <ReportButton type="profile" handle={p.handle} />
      </div>
    </section>
  );
}
