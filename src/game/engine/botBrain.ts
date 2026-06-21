/**
 * Bot "brain" — the adaptive-learning layer that makes AI opponents improve over time
 * WITHOUT any stat cheats. Everything here is pure data math; the host (match.ts) does the
 * RTDB I/O and feeds the results into the deterministic board generator (enemy.ts BotBrain).
 *
 * Four signals:
 *   1. Meta-learning   — global type strength learned from real game placements.
 *   2. Adaptive diff   — bot tier rubber-bands to how the human is doing this game.
 *   3. Personalized    — counter the human opponent's HABITUAL types (their history).
 *   4. In-game memory  — a bot remembers what beat it and pre-counters it next round.
 */
import type { UnitInstance } from "../types";
import { computeTraits } from "./synergies";

// ── Meta-learning store (RTDB: meta_learn/comp/{type} = { n, s }) ─────────────
/** One synergy type's running record: n games sampled, s = summed placement value. */
export type CompStat = { n: number; s: number };
export type CompStats = Record<string, CompStat>;

/** Placement → value in [-1, +1]: 1st place = +1, last = -1, linear between. A solo board
 *  (total 1) counts as a neutral-positive +1. Used to score each comp's contribution. */
export function placementValue(place: number, total: number): number {
  if (total <= 1) return 1;
  const p = Math.min(Math.max(place, 1), total);
  return 1 - (2 * (p - 1)) / (total - 1);
}

/** The active synergy TYPES a finished board ran (tier ≥ 1) — what we credit/blame for the
 *  placement. Role traits (starter/evolver/…) are types too but only PokeTypes matter for the
 *  draft weighting; computeTraits returns trait keys and we keep whatever the drafter keys on. */
export function activeTraitKeys(board: UnitInstance[]): string[] {
  return computeTraits(board.filter((u) => u.pos)).filter((t) => t.tier > 0).map((t) => t.key);
}

/** Fold one finished comp into the stats (pure — returns the patch to merge). Each active
 *  synergy gets credited the placement value, with light decay so the meta can SHIFT over
 *  time rather than ossifying around early data. */
export function accrueComp(prev: CompStats, types: string[], place: number, total: number): CompStats {
  const v = placementValue(place, total);
  const out: CompStats = {};
  const DECAY = 0.995; // ~halves the weight of old data over ~140 games — meta stays current
  for (const t of types) {
    const c = prev[t] ?? { n: 0, s: 0 };
    out[t] = { n: c.n * DECAY + 1, s: c.s * DECAY + v };
  }
  return out;
}

/** Convert the learned stats into draft multipliers (>1 favours a type). Needs a minimum
 *  sample before it trusts a type; clamps so the meta nudges the draft, never dictates it. */
export function metaWeights(stats: CompStats | null | undefined, minSamples = 8): Record<string, number> {
  const out: Record<string, number> = {};
  if (!stats) return out;
  for (const [t, c] of Object.entries(stats)) {
    if (!c || c.n < minSamples) continue;
    const strength = c.s / c.n;                       // avg placement value ∈ [-1, 1]
    out[t] = Math.min(1.5, Math.max(0.6, 1 + 0.4 * strength));
  }
  return out;
}

// ── Personalized counter (RTDB: users/{uid}/typeAff/{type} = count) ──────────
export type TypeAffinity = Record<string, number>;

/** Fold a player's finished comp into their habitual-type tally (decayed, recency-biased). */
export function accrueAffinity(prev: TypeAffinity | null | undefined, types: string[]): TypeAffinity {
  const out: TypeAffinity = { ...(prev ?? {}) };
  const DECAY = 0.9; // recent games matter most — a player's comp taste drifts
  for (const k of Object.keys(out)) out[k] *= DECAY;
  for (const t of types) out[t] = (out[t] ?? 0) + 1;
  return out;
}

/** Turn a player's affinity into "virtual opponent presence" the bot counter-drafts against.
 *  Capped per type so a one-trick player doesn't make the bot mono-counter, and scaled DOWN
 *  vs the live board (history is a hint, the board in front of you is the truth). */
export function counterAffinity(aff: TypeAffinity | null | undefined, scale = 1.5, cap = 2): Record<string, number> {
  const out: Record<string, number> = {};
  if (!aff) return out;
  const total = Object.values(aff).reduce((a, b) => a + b, 0);
  if (total <= 0) return out;
  for (const [t, c] of Object.entries(aff)) {
    const share = c / total;                          // 0..1 of their games
    if (share < 0.15) continue;                        // ignore noise — only real mains
    out[t] = Math.min(cap, share * scale * 4);
  }
  return out;
}

// ── In-game memory (RTDB: games/{code}/players/{botUid}/botMem/{type} = weight) ─
export type BotMemory = Record<string, number>;

/** The bot just lost to `winnerTypes`: remember them (decaying old memory first) so next
 *  round it counter-drafts the recurring threat. Bounded so it can't snowball. */
export function rememberLoss(prev: BotMemory | null | undefined, winnerTypes: string[]): BotMemory {
  const out: BotMemory = {};
  const DECAY = 0.5; // a beating two rounds ago matters half as much as the last one
  for (const [t, w] of Object.entries(prev ?? {})) { const d = w * DECAY; if (d > 0.1) out[t] = d; }
  for (const t of winnerTypes) out[t] = Math.min(2, (out[t] ?? 0) + 1);
  return out;
}
