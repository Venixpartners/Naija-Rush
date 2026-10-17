import type { Metadata } from "next";
import { NrPlayClient } from "@/components/nr-play-client";
import { loadActiveChallenge } from "@/lib/services/challenges";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Run", robots: { index: false } };

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ challenge?: string; mode?: string; campaign?: string }> }) {
  const sp = await searchParams;
  let challenge = null;
  let challengeError: string | null = null;
  if (sp.challenge) {
    const c = await loadActiveChallenge(sp.challenge);
    if (c) challenge = { code: c.code, targetScore: c.targetScore, displayName: c.displayName };
    else challengeError = "That challenge has expired or was removed, but you can still run a fresh street.";
  }
  const mode = challenge ? "standard" : sp.mode === "daily" ? "daily" : sp.mode === "endless" ? "endless" : "standard";
  return <NrPlayClient campaign={typeof sp.campaign === "string" && !challenge ? sp.campaign : null} mode={mode} challenge={challenge} challengeError={challengeError} snapEnabled={process.env.NEXT_PUBLIC_SNAP_KIT_DISABLED !== "1"} />;
}
