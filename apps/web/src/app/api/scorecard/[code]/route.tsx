import { ImageResponse } from "next/og";
import { env } from "@/lib/env";
import { CARD_SIZES, Scorecard, cardFonts, type CardFormat } from "@/lib/scorecard";
import { loadActiveChallenge } from "@/lib/services/challenges";

export const runtime = "nodejs";

/**
 * Server generated score card. story = 1080x1920 (Instagram/Snapchat/TikTok
 * vertical), square = 1080x1080 (WhatsApp Status, feeds).
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const challenge = await loadActiveChallenge(code);
  if (!challenge) return new Response("Challenge not found", { status: 404 });
  const url = new URL(req.url);
  const format: CardFormat = url.searchParams.get("format") === "square" ? "square" : "story";
  const host = new URL(env.siteUrl).host;
  const image = new ImageResponse(<Scorecard challenge={challenge} format={format} host={host} />, {
    ...CARD_SIZES[format],
    fonts: await cardFonts(),
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
  if (url.searchParams.get("download") === "1") {
    image.headers.set("content-disposition", `attachment; filename="venix-clash-${challenge.code}-${format}.png"`);
  }
  return image;
}
