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
      "Accounts are optional and for players aged 13 and over. Purchases need someone aged 18 or over, or a parent or guardian's permission.",
      "Premium and outfits change looks only. They never change speed, hitboxes, scores or rankings. Premium renews monthly until you cancel; you keep it until the end of the month you paid for.",
      "Payments are processed by Paystack. If something you bought does not work, contact us within 14 days for a refund. Refunds remove the item or premium period they paid for.",
      "Events show their rules, dates and eligibility before you play. Any prize event will publish full terms approved for Nigerian promotions law before it opens.",
    ],
  },
  privacy: {
    title: "Privacy Notice",
    body: [
      "We set one cookie that identifies your browser as an anonymous player so you can keep your scores. We store only a scrambled (hashed) version of it.",
      "We record gameplay events (starts, finishes, taps for score checking) and share actions you take (for example, choosing WhatsApp). We do not read your contacts, followers or social accounts.",
      "If you choose a public nickname, it appears on your challenge link and story card. Leave it off to stay anonymous.",
      "Input logs used for score checks are deleted after 90 days.",
      "If you create an account we store your email address to send sign in links, and your optional handle and display name. We never store passwords.",
      "If you buy something, Paystack handles your card details; we keep the payment reference, amount and status for our accounts, as the law requires.",
      "Video clips of your runs are made and kept on your own device. We do not upload them.",
      "You can download everything we hold about you, or delete it, from your account page at any time. Questions: privacy@venixpartners.com (placeholder).",
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
