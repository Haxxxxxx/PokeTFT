/** Deterministic, seedable PRNG (mulberry32). Reproducible shops & combats. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit uint. Folds stable identifiers (game code, uid)
 *  into deterministic-but-varied seeds. Single source of truth — the host
 *  (match.ts) and every client must hash identically or the shared roster/
 *  carousel draw desyncs. */
export function hashStr(s: string | undefined): number {
  let h = 2166136261 >>> 0;
  const str = s ?? "";
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** Weighted pick: returns the index chosen from `weights` (sum > 0 assumed). */
export function weightedPick(rng: Rng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
