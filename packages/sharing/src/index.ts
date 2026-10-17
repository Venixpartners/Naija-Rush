/**
 * ShareChallenge: platform aware share links, copy and guidance.
 *
 * Every channel is player authorised. Nothing here posts on anyone's behalf;
 * it prepares links, text and media so the player can hand off to the app of
 * their choice. Verified capabilities per platform live in INTEGRATIONS.md.
 */

export const SHARE_CHANNELS = ["whatsapp", "instagram", "tiktok", "snapchat", "native", "copy", "x"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** Short attribution tokens appended as ?s= so links stay compact. */
export const CHANNEL_TOKENS: Record<ShareChannel, string> = {
  whatsapp: "wa",
  instagram: "ig",
  tiktok: "tt",
  snapchat: "sc",
  native: "nt",
  copy: "cp",
  x: "x",
};

const TOKEN_TO_CHANNEL = Object.fromEntries(
  Object.entries(CHANNEL_TOKENS).map(([k, v]) => [v, k]),
) as Record<string, ShareChannel>;

export const isShareChannel = (v: unknown): v is ShareChannel =>
  typeof v === "string" && (SHARE_CHANNELS as readonly string[]).includes(v);

/** Map an inbound ?s= token to a channel; unknown or missing becomes direct/other. */
export function channelFromToken(token: string | null | undefined): ShareChannel | "direct" | "other" {
  if (!token) return "direct";
  return TOKEN_TO_CHANNEL[token] ?? "other";
}

export interface ShareContext {
  baseUrl: string;
  code: string;
  gameName: string;
  score: number;
  displayName?: string | null;
}

export function challengeUrl(ctx: Pick<ShareContext, "baseUrl" | "code">, channel?: ShareChannel): string {
  const url = new URL(`/c/${ctx.code}`, ctx.baseUrl);
  if (channel) url.searchParams.set("s", CHANNEL_TOKENS[channel]);
  return url.toString();
}

export function shareText(ctx: ShareContext, channel: ShareChannel): string {
  const who = ctx.displayName ? `${ctx.displayName} scored` : "I scored";
  const lead = `${who} ${ctx.score.toLocaleString("en-NG")} on ${ctx.gameName}.`;
  const dare = "Think you can survive Lagos better? No download, play in your browser.";
  const url = challengeUrl(ctx, channel);
  switch (channel) {
    case "tiktok":
    case "instagram":
      // Caption links are often not clickable on these apps; the link is
      // included for copy, and guidance tells players to use a link sticker,
      // bio link or DM.
      return `${lead} ${dare} #NaijaRush #SurviveLagos\n${url}`;
    default:
      return `${lead} ${dare}\n${url}`;
  }
}

/** WhatsApp click to chat with prefilled text. The player picks the chat and taps send. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export interface ChannelGuide {
  channel: ShareChannel;
  label: string;
  steps: string[];
  linkClickable: "yes" | "sticker_or_bio" | "varies";
}

export const CHANNEL_GUIDES: Record<"instagram" | "tiktok" | "snapchat" | "whatsapp", ChannelGuide> = {
  whatsapp: {
    channel: "whatsapp",
    label: "WhatsApp",
    linkClickable: "yes",
    steps: ["Edit the message if you like.", "Tap Send to WhatsApp and pick a chat, group or your Status.", "Your friends open the link and play straight away."],
  },
  instagram: {
    channel: "instagram",
    label: "Instagram",
    linkClickable: "sticker_or_bio",
    steps: [
      "Share or save your video clip or story card.",
      "Add it to your Story or a Reel.",
      "Tap the sticker icon, choose Link, and paste your challenge link (already copied).",
      "Feed captions do not make links clickable, so use the Story link sticker, your bio or a DM.",
    ],
  },
  tiktok: {
    channel: "tiktok",
    label: "TikTok",
    linkClickable: "varies",
    steps: [
      "Share or save your video clip (or the story card if your phone cannot record video).",
      "Post it on TikTok and paste the caption we copied for you.",
      "Links in captions are not clickable, so put the link in your bio if your account allows it, or send it by DM.",
    ],
  },
  snapchat: {
    channel: "snapchat",
    label: "Snapchat",
    linkClickable: "yes",
    steps: [
      "Tap the Snapchat button to open Snapchat with your challenge link attached.",
      "Or share your video clip or story card and attach the link with the paperclip tool when you post your Snap.",
    ],
  },
};
