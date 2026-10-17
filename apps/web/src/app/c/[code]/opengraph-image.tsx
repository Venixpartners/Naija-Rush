import { ImageResponse } from "next/og";
import { env } from "@/lib/env";
import { CARD_SIZES, Scorecard, cardFonts } from "@/lib/scorecard";
import { loadActiveChallenge } from "@/lib/services/challenges";

export const runtime = "nodejs";
export const alt = "Naija Rush challenge";
export const size = CARD_SIZES.og;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const challenge = await loadActiveChallenge(code);
  const fonts = await cardFonts();
  if (!challenge) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#120D09", color: "#FFC800", fontSize: 90, fontFamily: "Bricolage", fontWeight: 800 }}>
          NAIJA RUSH
        </div>
      ),
      { ...size, fonts },
    );
  }
  return new ImageResponse(<Scorecard challenge={challenge} format="og" host={new URL(env.siteUrl).host} />, { ...size, fonts });
}
