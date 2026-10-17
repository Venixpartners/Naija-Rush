import { notFound } from "next/navigation";
import type { Metadata } from "next";

/**
 * DRAFT legal copy. Every page here is a placeholder awaiting review by
 * Nigerian counsel (NDPA 2023 / NDPC, FCCPC, ARCON for advertising, NLRC for
 * any promotion with prizes). Do not launch publicly with this text.
 */
const DOCS: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms of Service",
    body: [
      "Naija Rush is operated by Venix Partners Limited, Lagos, Nigeria. The game is free to play.",
      "You may play as a guest. You agree not to use bots, scripts or modified clients. We replay and check every score and may remove runs, challenges or nicknames that break these terms.",
      "Challenge links you create are public to anyone you share them with. Do not use offensive nicknames or impersonate others.",
      "There are no paid entry competitions, wagers or chance based paid rewards on Naija Rush.",
    ],
  },
  privacy: {
    title: "Privacy Notice",
    body: [
      "We set one cookie that identifies your browser as an anonymous player so you can keep your scores. We store only a scrambled (hashed) version of it.",
      "We record gameplay events (starts, finishes, taps for score checking) and share actions you take (for example, choosing WhatsApp). We do not read your contacts, followers or social accounts.",
      "If you choose a public nickname, it appears on your challenge link and story card. Leave it off to stay anonymous.",
      "Tap logs used for score checks are deleted after 90 days. To request access to or deletion of your data, contact privacy@venixpartners.com (placeholder).",
    ],
  },
  community: {
    title: "Community Rules",
    body: [
      "Play fair. No bots, no scripts, no exploiting bugs.",
      "Keep nicknames clean. No hate, harassment, sexual content or impersonation.",
      "Share links only with people who want them. No spam in groups or DMs.",
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc]?.title ?? "Legal", robots: { index: false } };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const page = DOCS[doc];
  if (!page) notFound();
  return (
    <section className="section">
      <div className="wrap prose">
        <p className="notice">Draft for legal review. Not final.</p>
        <h1>{page.title}</h1>
        {page.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </section>
  );
}
