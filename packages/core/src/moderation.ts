/**
 * Display name moderation. Public share cards only ever show a nickname the
 * player chose and consented to show. This list is a baseline; extend it from
 * the admin console as reports come in.
 */
/** Blocked anywhere inside the name. */
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "porn", "pussy",
  "whore", "slut", "ashawo", "olosho", "werey", "nazi", "hitler", "venix", "naijarush", "official",
];
/** Blocked only as a whole word, because they occur inside innocent names. */
const BLOCKED_WORDS = ["fag", "rape", "sex", "dick", "mumu", "ode", "kill", "isis", "admin", "support", "yahoo"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

export interface NicknameCheck {
  ok: boolean;
  value: string;
  reason?: "length" | "characters" | "blocked";
}

export function checkNickname(raw: string): NicknameCheck {
  const value = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 20) return { ok: false, value, reason: "length" };
  if (!/^[\p{L}\p{N} _.]+$/u.test(value)) return { ok: false, value, reason: "characters" };
  const lowered = value.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c);
  const folded = lowered.replace(/[^a-z]/g, "");
  const words = lowered.split(/[^a-z]+/).filter(Boolean);
  if (BLOCKED.some((w) => folded.includes(w)) || words.some((w) => BLOCKED_WORDS.includes(w))) {
    return { ok: false, value, reason: "blocked" };
  }
  return { ok: true, value };
}
