import { channelFromToken } from "@venix/sharing";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { ReportButton } from "@/components/account-client";
import { ensureGuest } from "@/lib/guest";
import { isBotUserAgent, loadActiveChallenge, recordReferral } from "@/lib/services/challenges";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ s?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const c = await loadActiveChallenge(code);
  if (!c) return { title: "Challenge expired", robots: { index: false } };
  const who = c.displayName ?? "A friend";
  const title = `${who} scored ${c.targetScore.toLocaleString("en-NG")} on ${c.gameName}. Can you beat it?`;
  const description = "Same Lagos street, sixty seconds, no download. Tap to take the challenge on Naija Rush.";
  return {
    title,
    description,
    alternates: { canonical: `/c/${c.code}` },
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `/c/${c.code}`, siteName: "Naija Rush", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    // Snapchat Creative Kit reads og:title and og:site_name; a sticker image
    // is generated from these tags when snapchat:sticker is absent.
  };
}

/**
 * Public challenge landing page. Fully server rendered so the preview, target
 * score and primary button work before any JavaScript loads.
 */
export default async function ChallengePage({ params, searchParams }: Props) {
  const { code } = await params;
  const { s } = await searchParams;
  const c = await loadActiveChallenge(code);

  if (!c) {
    return (
      <div className="wrap challenge">
        <div>
          <span className="eyebrow">Challenge</span>
          <h1 style={{ fontSize: "2.4rem", margin: "10px 0" }}>This challenge has ended.</h1>
          <p className="lede">Links last a couple of weeks. Run a fresh street and send your own.</p>
          <Link className="btn btn-lg" href="/play">
            Play now
          </Link>
        </div>
      </div>
    );
  }

  const ua = (await headers()).get("user-agent");
  const channel = channelFromToken(s);
  // Link preview crawlers must not create sessions or inflate attribution.
  const guestId = isBotUserAgent(ua) ? null : await ensureGuest();
  after(() => recordReferral(c.id, channel, guestId, ua).catch((e) => console.error("[referral]", e)));

  const who = c.displayName ?? "A friend";
  return (
    <>
      <div className="stripe" />
      <div className="wrap challenge">
        <div>
          <span className="eyebrow">{c.gameName} · Challenge</span>
          <p className="lede" style={{ marginBottom: 6 }}>
            <b style={{ color: "var(--cream)" }}>{who}</b> scored
          </p>
          <div className="target">{c.targetScore.toLocaleString("en-NG")}</div>
          <p className="lede">
            Same street, same traffic, sixty seconds. No download, no sign up.
            {c.attempts > 0 && ` ${c.attempts} ${c.attempts === 1 ? "person has" : "people have"} tried, ${c.beaten} beat it.`}
          </p>
          <Link className="btn btn-lg btn-block" href={`/play?challenge=${c.code}`} style={{ maxWidth: 420 }}>
            Beat this score
          </Link>
          <p className="fineprint" style={{ marginTop: 14 }}>
            By playing you agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy notice</Link>. Naija Rush is free to play.
          </p>
          {c.displayName && <ReportButton type="challenge" code={c.code} />}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="challenge-card-img" src={`/api/scorecard/${c.code}?format=story`} alt={`${who} scored ${c.targetScore} on ${c.gameName}`} width={360} height={640} />
      </div>
    </>
  );
}
