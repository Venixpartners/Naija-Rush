/**
 * Deterministic pseudo random generation. The same seed must produce the same
 * sequence on every browser and on the server, because the server replays a
 * run to recompute its score. Only integer and IEEE 754 double operations are
 * used, which behave identically across JavaScript engines.
 */

/** xmur3 string hash, returns a 32 bit seed generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick one element. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: string): Rng {
  let a = xmur3(seed)();
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
  };
}

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** Cryptographically random, unguessable code (no ambiguous characters). */
export function randomCode(length = 10): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  // Rejection sampling avoids modulo bias.
  let i = 0;
  while (out.length < length) {
    const b = bytes[i++];
    if (b === undefined) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
      continue;
    }
    if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

export function isValidCode(code: string, length = 10): boolean {
  if (code.length !== length) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}
