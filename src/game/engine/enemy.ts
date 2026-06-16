/** Generates an AI board scaled to a level + unit count. Deterministic per seed. */

import type { UnitInstance } from "../types";
import { SHOP_ODDS, boardSizeForLevel, cumulativeRound, type Cost } from "../config";
import { UNITS } from "../data/mons";
import { makeRng, weightedPick, randInt, type Rng } from "./rng";

const BY_COST: Record<Cost, string[]> = (() => {
  const m = { 1: [], 2: [], 3: [], 4: [], 5: [] } as Record<Cost, string[]>;
  for (const u of UNITS) m[u.cost].push(u.id);
  return m;
})();

/** Cost buckets restricted to the room's selected roster (its generations), so
 *  AI opponents, creeps and carousel picks only ever use mons from the SAME pool
 *  the player can roll — no out-of-region mons leaking into the game. Falls back
 *  to the full roster when no allow-list is given. */
function byCostFrom(allowedIds?: string[]): Record<Cost, string[]> {
  if (!allowedIds || allowedIds.length === 0) return BY_COST;
  const allow = new Set(allowedIds);
  const m = { 1: [], 2: [], 3: [], 4: [], 5: [] } as Record<Cost, string[]>;
  for (const u of UNITS) if (allow.has(u.id)) m[u.cost].push(u.id);
  // If a whole cost tier is empty in this roster, keep the global one so picks
  // never deadlock.
  for (const c of [1, 2, 3, 4, 5] as Cost[]) if (m[c].length === 0) m[c] = BY_COST[c];
  return m;
}

// Center-out columns, front row first so small teams meet in the middle.
const COL_ORDER = [3, 2, 4, 1, 5, 0, 6];
const ROW_ORDER = [1, 0, 2, 3];

const MAX_BOARD = COL_ORDER.length * ROW_ORDER.length;

/** Build a board of `count` mons at shop-`level` quality. Exported for the test
 *  harnesses; in-app it's wrapped by generateCreepBoard / generatePlayerLikeBoard. */
export function generateBoard(level: number, count: number, seed: number, allowedIds?: string[]): UnitInstance[] {
  const rng: Rng = makeRng(seed >>> 0);
  const odds = SHOP_ODDS[Math.min(Math.max(level, 1), 10)];
  const n = Math.min(count, MAX_BOARD); // never overflow the grid (would stack units)
  const byCost = byCostFrom(allowedIds);

  const board: UnitInstance[] = [];
  for (let i = 0; i < n; i++) {
    let cost = (weightedPick(rng, odds) + 1) as Cost;
    while (byCost[cost].length === 0) cost = ((cost % 5) + 1) as Cost;
    const defId = byCost[cost][randInt(rng, byCost[cost].length)];

    // Higher level → better odds of upgraded mons (cheap units star up first).
    let star: 1 | 2 | 3 = 1;
    const upChance = Math.max(0, (level - 3) * 0.12);
    if (cost <= 2 && rng() < upChance) star = rng() < 0.3 ? 3 : 2;
    else if (cost <= 3 && rng() < upChance * 0.6) star = 2;

    const col = COL_ORDER[i % COL_ORDER.length];
    const row = ROW_ORDER[Math.floor(i / COL_ORDER.length) % ROW_ORDER.length];
    board.push({ iid: `g${seed}_${i}`, defId, star, pos: [col, row], items: [] });
  }
  return board;
}

/** An economy-realistic AI board: what a real player could actually field at this
 *  point in the game. Board size, unit cost, and star level all track a believable
 *  gold/level curve (no 4-cost 2-stars in the first PvP). Deterministic per seed. */
export function generatePlayerLikeBoard(stage: number, round: number, difficulty: "easy" | "medium" | "hard" | undefined, seed: number, allowedIds?: string[]): UnitInstance[] {
  const rng: Rng = makeRng(seed >>> 0);
  const cr = cumulativeRound(stage, round);
  const byCost = byCostFrom(allowedIds);

  // Board size ≈ a real player's level (which lags the cap a little).
  let size = Math.round(2 + cr * 0.25); // 2-1≈3, 3-1≈5, 4-1≈7, 5-1≈8
  let costCap = Math.min(stage, 5);      // stage 2 → cost ≤2, ramps to 5
  // Star-ups only appear once a player could realistically have them.
  let twoStarChance = stage >= 3 ? Math.min(0.5, (stage - 2) * 0.18) : 0;
  let threeStarChance = stage >= 5 ? (stage - 4) * 0.06 : 0;

  if (difficulty === "easy") { size -= 1; twoStarChance *= 0.4; threeStarChance = 0; costCap = Math.max(1, costCap - 1); }
  else if (difficulty === "hard") { size += 1; twoStarChance = Math.min(0.6, twoStarChance + 0.12); threeStarChance += 0.04; costCap = Math.min(5, costCap + 1); }
  size = Math.max(1, Math.min(size, Math.min(boardSizeForLevel(9), MAX_BOARD)));

  // Cost weights favour cheap units, hard-capped at costCap (cheaper than the cap
  // is far more common — mirrors a real shop where 1-cost units dominate).
  const weights: number[] = [];
  for (let c = 1; c <= 5; c++) weights.push(c <= costCap ? Math.pow(0.55, c - 1) : 0);

  const board: UnitInstance[] = [];
  for (let i = 0; i < size; i++) {
    let cost = (weightedPick(rng, weights) + 1) as Cost;
    while (byCost[cost].length === 0) cost = (((cost % 5)) + 1) as Cost;
    const defId = byCost[cost][randInt(rng, byCost[cost].length)];
    let star: 1 | 2 | 3 = 1;
    // Cheaper units star up first, exactly like a real player's roster.
    if (cost <= 2 && rng() < threeStarChance) star = 3;
    else if (cost <= 3 && rng() < twoStarChance) star = 2;
    const col = COL_ORDER[i % COL_ORDER.length];
    const row = ROW_ORDER[Math.floor(i / COL_ORDER.length) % ROW_ORDER.length];
    board.push({ iid: `g${seed}_${i}`, defId, star, pos: [col, row], items: [] });
  }
  return board;
}

/** A wild/creep board for PvE rounds — weak in the opening, ramping by stage.
 *  Stage 1 should be comfortably winnable so the player can build economy. */
export function generateCreepBoard(stage: number, round: number, seed: number, allowedIds?: string[]): UnitInstance[] {
  // Stage 1 stays deliberately soft so newcomers win the opening PvE and build
  // economy: one weak creep at 1-1, ramping by round. Later stages scale up.
  if (stage === 1) {
    // The opening 3 PvE rounds are deliberately soft so a fresh board (a single
    // starter + a couple of shop buys) wins them comfortably: 1-1 → 1 creep,
    // 1-2 → 1, 1-3 → 2, all weakest-tier 1-cost 1-stars, at HALF stats.
    const count = round >= 3 ? 2 : 1;
    return weaken(generateBoard(1, count, seed * 13 + 101, allowedIds), 0.5);
  }
  const level = Math.min(1 + Math.floor(stage / 2), 6);
  const count = Math.min(stage + 1, 6);
  // Stages 2–3 PvE stay easier than a real board so they remain a build breather.
  const scale = stage === 2 ? 0.7 : stage === 3 ? 0.85 : 1;
  return weaken(generateBoard(level, count, seed * 13 + 101, allowedIds), scale);
}

/** Apply a deterministic stat-scale to every creep on a board (no-op at >=1). */
function weaken(board: UnitInstance[], scale: number): UnitInstance[] {
  return scale >= 1 ? board : board.map((u) => ({ ...u, statScale: scale }));
}

/** Free unit choices offered on a carousel round. */
export function pickCarouselOptions(stage: number, seed: number, n = 5, allowedIds?: string[]): string[] {
  const rng: Rng = makeRng((seed * 277 + stage * 51) >>> 0);
  const level = Math.min(3 + stage, 9);
  const odds = SHOP_ODDS[Math.min(Math.max(level, 1), 10)];
  const byCost = byCostFrom(allowedIds);
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 100) {
    let cost = (weightedPick(rng, odds) + 1) as Cost;
    while (byCost[cost].length === 0) cost = ((cost % 5) + 1) as Cost;
    const id = byCost[cost][randInt(rng, byCost[cost].length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
