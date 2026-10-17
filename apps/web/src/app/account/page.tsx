import { GAMES, isGameSlug } from "@venix/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyActions, ProfileForm, SignInForm } from "@/components/account-client";
import { ensureGuest } from "@/lib/guest";
import { mailProvider } from "@/lib/mailer";
import { getMe, recentRuns } from "@/lib/services/accounts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const guestId = await ensureGuest();
  const me = guestId ? await getMe(guestId) : null;
  const runs = guestId ? await recentRuns(me?.user?.id ?? null, guestId) : [];

  return (
    <section className="section">
      <div className="wrap stack" style={{ maxWidth: 640, gap: 22 }}>
        <div>
          <span className="eyebrow">{me?.user ? "Signed in" : "Playing as a guest"}</span>
          <h1 style={{ fontSize: "2.4rem", margin: "8px 0" }}>{me?.user ? `@${me.user.handle}` : "Your account"}</h1>
          {welcome && <p className="notice">Welcome! Your scores from this device are now part of your account.</p>}
          {me?.premium && <span className="chip chip-live">● Premium</span>}
        </div>

        {me?.user ? (
          <div className="panel" style={{ maxWidth: "none" }}>
            <h2 style={{ fontSize: "1.4rem" }}>Profile</h2>
            <ProfileForm handle={me.user.handle} displayName={me.user.displayName} isPublic={me.user.isPublic} />
            {me.user.isPublic && <p className="fineprint" style={{ marginBottom: 0 }}>Public page: <Link href={`/u/${me.user.handle}`}>/u/{me.user.handle}</Link></p>}
          </div>
        ) : (
          <div className="panel" style={{ maxWidth: "none" }}>
            <h2 style={{ fontSize: "1.4rem" }}>Sign in (optional)</h2>
            <SignInForm available={Boolean(mailProvider())} />
          </div>
        )}

        <div>
          <div className="section-head"><h2>Recent runs</h2></div>
          {runs.length === 0 ? (
            <div className="board empty">No runs yet. <Link href="/play">Play one</Link>.</div>
          ) : (
            <ol className="board">
              {runs.map((r) => (
                <li key={r.id}>
                  <span className="rank">{r.status === "valid" ? "✓" : r.status === "flagged" ? "?" : "×"}</span>
                  <span className="name">{isGameSlug(r.game) ? GAMES[r.game].name : r.game} · {r.mode} · {r.at ? new Date(r.at).toISOString().slice(0, 10) : ""}</span>
                  <span className="pts">{(r.score ?? 0).toLocaleString("en-NG")}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <div className="section-head"><h2>Premium</h2></div>
          <p className="fineprint">{me?.premium ? "Thank you for supporting Naija Rush." : "Premium adds runner outfits. It never changes speed, hitboxes or scores."} <Link href="/premium">See premium</Link></p>
        </div>

        <div>
          <div className="section-head"><h2>Privacy</h2></div>
          <PrivacyActions signedIn={Boolean(me?.user)} />
        </div>
      </div>
    </section>
  );
}
