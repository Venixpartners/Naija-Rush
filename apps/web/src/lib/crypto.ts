import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const hashIp = (ip: string | null) => (ip ? sha256(`${env.ipHashSalt}:${ip}`).slice(0, 32) : "unknown");

export const randomSeed = () => randomBytes(12).toString("base64url");

interface RunTokenPayload {
  rid: string;
  gid: string;
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", env.runTokenSecret).update(body).digest("base64url");

/** Short lived token binding a run to the guest who started it. */
export function signRunToken(runId: string, guestId: string, ttlMs = 20 * 60_000): string {
  const body = b64(JSON.stringify({ rid: runId, gid: guestId, exp: Date.now() + ttlMs } satisfies RunTokenPayload));
  return `${body}.${sign(body)}`;
}

export function verifyRunToken(token: unknown): RunTokenPayload | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as RunTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
