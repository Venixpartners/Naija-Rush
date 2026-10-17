import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { actOnReport, approveRun, clearNickname, dismissReport, hideRun, revokeChallenge } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

type Row = Record<string, unknown>;

async function q<T extends Row>(query: ReturnType<typeof sql>) {
  return (await db().execute<T>(query)) as unknown as T[];
}

/**
 * Operations console (Phase 1 scope): funnel metrics, share and referral
 * attribution by channel, run review queue and challenge moderation.
 * Every action is written to admin_audit_logs.
 */
export default async function AdminPage() {
  const reports = await q<{ id: string; target_type: string; reason: string; created_at: Date; label: string | null; n: number }>(sql`
    select r.id, r.target_type, r.reason, r.created_at,
      coalesce((select c.display_name || ' (' || c.code || ')' from naijarush.challenges c where c.id = r.target_id),
               (select '@' || p.handle from naijarush.user_profiles p where p.user_id = r.target_id)) as label,
      (select count(*)::int from naijarush.moderation_reports x where x.target_id = r.target_id and x.status = 'open') as n
    from naijarush.moderation_reports r where r.status = 'open' order by r.created_at desc limit 30`);
  const [funnel, shares, referrals, flagged, challenges, audit] = await Promise.all([
    q<{ name: string; n: number }>(sql`
      select name, count(*)::int as n from naijarush.analytics_events
      where created_at > now() - interval '7 days' group by name order by name`),
    q<{ channel: string; opened: number; selected: number; handoff: number }>(sql`
      select coalesce(channel, 'unspecified') as channel,
        count(*) filter (where event = 'share_sheet_opened')::int as opened,
        count(*) filter (where event = 'share_target_selected')::int as selected,
        count(*) filter (where event = 'share_handoff_attempted')::int as handoff
      from naijarush.share_events where created_at > now() - interval '7 days'
      group by 1 order by handoff desc`),
    q<{ channel: string; arrivals: number; players: number }>(sql`
      select r.channel, count(*)::int as arrivals,
        count(distinct a.guest_session_id)::int as players
      from naijarush.referral_clicks r
      left join naijarush.challenge_attempts a on a.challenge_id = r.challenge_id and a.guest_session_id = r.guest_session_id
      where not r.is_bot and r.landed_at > now() - interval '7 days'
      group by r.channel order by arrivals desc`),
    q<{ id: string; score: number; flags: string[]; stats: Row; submitted_at: Date }>(sql`
      select id, score, flags, stats, submitted_at from naijarush.game_sessions
      where status = 'flagged' and not hidden order by submitted_at desc limit 30`),
    q<{ id: string; code: string; display_name: string | null; target_score: number; status: string; created_at: Date; attempts: number }>(sql`
      select c.id, c.code, c.display_name, c.target_score, c.status, c.created_at,
        (select count(*)::int from naijarush.challenge_results r where r.challenge_id = c.id) as attempts
      from naijarush.challenges c order by c.created_at desc limit 30`),
    q<{ actor: string; action: string; target_id: string; created_at: Date }>(sql`
      select actor, action, target_id, created_at from naijarush.admin_audit_logs order by created_at desc limit 15`),
  ]);

  const count = (n: string) => funnel.find((f) => f.name === n)?.n ?? 0;
  const kpis: [string, number | string][] = [
    ["Game starts", count("game_start")],
    ["Finishes", count("game_finish")],
    ["Completion", count("game_start") ? `${Math.round((count("game_finish") / count("game_start")) * 100)}%` : "–"],
    ["Challenges made", count("challenge_created")],
    ["Share hand offs", count("share_handoff_attempted")],
    ["Referral arrivals", count("referral_landed")],
    ["Challenges accepted", count("challenge_accepted")],
    ["Referral to play", count("referral_landed") ? `${Math.round((count("challenge_accepted") / count("referral_landed")) * 100)}%` : "–"],
  ];

  return (
    <section className="section admin">
      <div className="wrap stack" style={{ gap: 28 }}>
        <div>
          <span className="eyebrow">Last 7 days · <a href="/admin/attribution">Attribution</a> · <a href="/admin/campaigns">Campaigns</a> · <a href="/admin/payments">Payments</a></span>
          <h1 style={{ fontSize: "2.2rem", margin: "6px 0 14px" }}>Operations</h1>
          <div className="kpis">
            {kpis.map(([label, value]) => (
              <div className="kpi" key={label}>
                <b>{value}</b>
                <span className="fineprint">{label}</span>
              </div>
            ))}
          </div>
          <p className="fineprint">Share hand offs are intent only. A post counts as published only when a platform API confirms it, and none are connected yet.</p>
        </div>

        <div>
          <h2>Sharing by channel</h2>
          <table>
            <thead>
              <tr><th>Channel</th><th>Sheet opened</th><th>Selected</th><th>Handed off</th></tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.channel}><td>{s.channel}</td><td>{s.opened}</td><td>{s.selected}</td><td>{s.handoff}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Referral arrivals (humans only)</h2>
          <table>
            <thead>
              <tr><th>Channel</th><th>Arrivals</th><th>Went on to play</th></tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.channel}><td>{r.channel}</td><td>{r.arrivals}</td><td>{r.players}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Reports</h2>
          {reports.length === 0 ? <p className="fineprint">No open reports.</p> : (
            <table>
              <thead><tr><th>Target</th><th>Reason</th><th>Reports</th><th /></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.target_type}: {r.label ?? "(removed)"}</td><td>{r.reason}</td><td>{r.n}</td>
                    <td>
                      {r.target_type === "challenge" && <form action={actOnReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="clear_name" /><button>Clear name</button></form>}
                      {r.target_type === "profile" && <><form action={actOnReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="hide_profile" /><button>Hide profile</button></form>{" "}<form action={actOnReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="ban" /><button>Ban</button></form></>}{" "}
                      <form action={dismissReport}><input type="hidden" name="id" value={r.id} /><button>Dismiss</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2>Runs awaiting review</h2>
          {flagged.length === 0 ? <p className="fineprint">Queue is clear.</p> : (
            <table>
              <thead><tr><th>Score</th><th>Flags</th><th>Stats</th><th /></tr></thead>
              <tbody>
                {flagged.map((r) => (
                  <tr key={r.id}>
                    <td>{r.score}</td>
                    <td>{r.flags.join(", ")}</td>
                    <td className="fineprint">{JSON.stringify(r.stats)}</td>
                    <td>
                      <form action={approveRun}><input type="hidden" name="id" value={r.id} /><button>Approve</button></form>{" "}
                      <form action={hideRun}><input type="hidden" name="id" value={r.id} /><button>Reject</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2>Recent challenges</h2>
          <table>
            <thead><tr><th>Code</th><th>Nickname</th><th>Target</th><th>Attempts</th><th>Status</th><th /></tr></thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td><a href={`/c/${c.code}`}>{c.code}</a></td>
                  <td>{c.display_name ?? "–"}</td>
                  <td>{c.target_score}</td>
                  <td>{c.attempts}</td>
                  <td>{c.status}</td>
                  <td>
                    {c.display_name && <form action={clearNickname}><input type="hidden" name="id" value={c.id} /><button>Clear name</button></form>}{" "}
                    {c.status === "active" && <form action={revokeChallenge}><input type="hidden" name="id" value={c.id} /><button>Revoke</button></form>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Audit log</h2>
          <table>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}><td>{new Date(a.created_at).toISOString().slice(0, 16)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.target_id}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
