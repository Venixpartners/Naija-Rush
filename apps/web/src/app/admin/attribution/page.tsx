import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Attribution", robots: { index: false } };

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#00E0B0",
  instagram: "#FF3D8B",
  tiktok: "#00C2FF",
  snapchat: "#FFC400",
  native: "#B44DFF",
  copy: "#FF7A00",
  x: "#FFFFFF",
  direct: "#7BE000",
  other: "#9C8DB8",
};

type Row = Record<string, unknown>;
async function q<T extends Row>(query: ReturnType<typeof sql>) {
  return (await db().execute<T>(query)) as unknown as T[];
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

/**
 * Referral loop by channel. Every number here is measured, never estimated:
 * arrivals are human visits to challenge links (crawlers excluded), and a
 * share counts as published only when a platform API confirms it, which none
 * do yet, so the publish column is intentionally absent.
 */
export default async function AttributionPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: raw } = await searchParams;
  const days = [7, 30, 90].includes(Number(raw)) ? Number(raw) : 7;
  const since = sql`now() - make_interval(days => ${days})`;

  const [funnel, trend, byGame, loop, intent] = await Promise.all([
    q<{ channel: string; arrivals: number; visitors: number; started: number; finished: number; beat: number; created: number }>(sql`
      with arrivals as (
        select r.channel, r.challenge_id, r.guest_session_id
        from naijarush.referral_clicks r
        where not r.is_bot and r.landed_at > ${since}
      ),
      visitors as (
        select channel, guest_session_id, min(challenge_id::text)::uuid as challenge_id
        from arrivals where guest_session_id is not null group by channel, guest_session_id
      )
      select a.channel,
        (select count(*)::int from arrivals x where x.channel = a.channel) as arrivals,
        count(distinct v.guest_session_id)::int as visitors,
        count(distinct ca.guest_session_id)::int as started,
        count(distinct gs.guest_session_id) filter (where gs.status in ('valid', 'flagged'))::int as finished,
        count(distinct gs.guest_session_id) filter (where cr.outcome = 'beaten')::int as beat,
        count(distinct ch.creator_guest_id)::int as created
      from (select distinct channel from arrivals) a
      left join visitors v on v.channel = a.channel
      left join naijarush.challenge_attempts ca on ca.guest_session_id = v.guest_session_id and ca.created_at > ${since}
      left join naijarush.game_sessions gs on gs.id = ca.game_session_id
      left join naijarush.challenge_results cr on cr.game_session_id = gs.id
      left join naijarush.challenges ch on ch.creator_guest_id = v.guest_session_id and ch.created_at > ${since}
      group by a.channel
      order by arrivals desc`),
    q<{ day: string; channel: string; n: number }>(sql`
      select to_char((landed_at at time zone 'Africa/Lagos')::date, 'YYYY-MM-DD') as day, channel, count(*)::int as n
      from naijarush.referral_clicks
      where not is_bot and landed_at > now() - interval '14 days'
      group by 1, 2 order by 1`),
    q<{ game_slug: string; starts: number; finishes: number; challenges: number; accepted: number }>(sql`
      select g.slug as game_slug,
        (select count(*)::int from naijarush.game_sessions s where s.game_slug = g.slug and s.issued_at > ${since}) as starts,
        (select count(*)::int from naijarush.game_sessions s where s.game_slug = g.slug and s.status in ('valid','flagged') and s.submitted_at > ${since}) as finishes,
        (select count(*)::int from naijarush.challenges c where c.game_slug = g.slug and c.created_at > ${since}) as challenges,
        (select count(*)::int from naijarush.challenge_attempts a join naijarush.challenges c on c.id = a.challenge_id where c.game_slug = g.slug and a.created_at > ${since}) as accepted
      from naijarush.games g order by g.slug`),
    q<{ creators: number; new_players: number }>(sql`
      select
        (select count(distinct creator_guest_id)::int from naijarush.challenges where created_at > ${since}) as creators,
        (select count(*)::int from naijarush.guest_sessions where first_challenge_id is not null and created_at > ${since}
           and exists (select 1 from naijarush.game_sessions s where s.guest_session_id = guest_sessions.id)) as new_players`),
    q<{ channel: string; selected: number; handoff: number }>(sql`
      select coalesce(channel, 'unspecified') as channel,
        count(*) filter (where event = 'share_target_selected')::int as selected,
        count(*) filter (where event = 'share_handoff_attempted')::int as handoff
      from naijarush.share_events where created_at > ${since}
      group by 1 order by handoff desc`),
  ]);

  const k = loop[0] && loop[0].creators ? (loop[0].new_players / loop[0].creators).toFixed(2) : "–";

  // 14 day stacked bars (inline SVG, no chart library)
  const dayKeys = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + 3_600_000 - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const channels = [...new Set(trend.map((t) => t.channel))];
  const totals = dayKeys.map((d) => trend.filter((t) => t.day === d).reduce((a, t) => a + t.n, 0));
  const max = Math.max(1, ...totals);

  return (
    <section className="section admin">
      <div className="wrap stack" style={{ gap: 26 }}>
        <div>
          <Link href="/admin" className="fineprint">← Operations</Link>
          <h1 style={{ fontSize: "2.2rem", margin: "6px 0 10px" }}>Attribution</h1>
          <nav className="tabs" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/attribution?days=${d}`} aria-current={d === days ? "page" : undefined}>
                {d} days
              </Link>
            ))}
          </nav>
          <div className="kpis">
            <div className="kpi"><b>{funnel.reduce((a, f) => a + f.arrivals, 0)}</b><span className="fineprint">Human arrivals from challenge links</span></div>
            <div className="kpi"><b>{loop[0]?.new_players ?? 0}</b><span className="fineprint">New players who arrived via a challenge</span></div>
            <div className="kpi"><b>{k}</b><span className="fineprint">New players per challenge creator</span></div>
          </div>
        </div>

        <div>
          <h2>Referral loop by channel</h2>
          <table>
            <thead>
              <tr><th>Channel</th><th>Arrivals</th><th>Unique visitors</th><th>Started</th><th>Finished</th><th>Beat target</th><th>Sent own challenge</th><th>Visit to play</th></tr>
            </thead>
            <tbody>
              {funnel.map((f) => (
                <tr key={f.channel}>
                  <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: CHANNEL_COLORS[f.channel] ?? "#999", marginRight: 6 }} />{f.channel}</td>
                  <td>{f.arrivals}</td><td>{f.visitors}</td><td>{f.started}</td><td>{f.finished}</td><td>{f.beat}</td><td>{f.created}</td><td>{pct(f.started, f.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {funnel.length === 0 && <p className="fineprint">No challenge link arrivals in this period yet.</p>}
        </div>

        <div>
          <h2>Arrivals, last 14 days</h2>
          <svg viewBox="0 0 700 220" width="100%" role="img" aria-label="Daily human arrivals by channel">
            {dayKeys.map((d, i) => {
              let y = 190;
              return (
                <g key={d}>
                  {channels.map((c) => {
                    const n = trend.find((t) => t.day === d && t.channel === c)?.n ?? 0;
                    const h = (n / max) * 170;
                    y -= h;
                    return n ? <rect key={c} x={14 + i * 49} y={y} width={36} height={h} rx={4} fill={CHANNEL_COLORS[c] ?? "#999"}><title>{`${d} ${c}: ${n}`}</title></rect> : null;
                  })}
                  <text x={32 + i * 49} y={210} fontSize="10" fill="currentColor" textAnchor="middle" opacity={0.7}>{d.slice(8)}</text>
                </g>
              );
            })}
          </svg>
          <p className="fineprint">{channels.map((c) => <span key={c} style={{ marginRight: 12 }}><span style={{ color: CHANNEL_COLORS[c] }}>■</span> {c}</span>)}</p>
        </div>

        <div>
          <h2>By game</h2>
          <table>
            <thead><tr><th>Game</th><th>Starts</th><th>Finishes</th><th>Completion</th><th>Challenges made</th><th>Per 100 finishes</th><th>Challenges accepted</th></tr></thead>
            <tbody>
              {byGame.map((g) => (
                <tr key={g.game_slug}>
                  <td>{g.game_slug}</td><td>{g.starts}</td><td>{g.finishes}</td><td>{pct(g.finishes, g.starts)}</td><td>{g.challenges}</td>
                  <td>{g.finishes ? Math.round((g.challenges / g.finishes) * 100) : "–"}</td><td>{g.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Share intent</h2>
          <table>
            <thead><tr><th>Channel</th><th>Button tapped</th><th>Handed to app</th></tr></thead>
            <tbody>{intent.map((i) => <tr key={i.channel}><td>{i.channel}</td><td>{i.selected}</td><td>{i.handoff}</td></tr>)}</tbody>
          </table>
          <p className="fineprint">
            Limits: arrivals are attributed by the link tag (?s=), so a link copied from WhatsApp and pasted into Instagram counts as WhatsApp. People who
            block cookies appear as new visitors each time. No platform confirms publication yet, so nothing here counts posts.
          </p>
        </div>
      </div>
    </section>
  );
}
