/** Generates an AI board scaled to a level + unit count. Deterministic per seed. */

import type { UnitInstance, PokeType } from "../types";
import { SHOP_ODDS, boardSizeForLevel, roundsInStage, type Cost } from "../config";
import { UNITS, getDef } from "../data/mons";
import { canMega, MEGA_STONE } from "../data/mega";
import { makeRng, weightedPick, randInt, type Rng } from "./rng";

export type BotLevel = "easy" | "medium" | "hard" | "expert" | "ultimate" | "clone";

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

/** The level (== board size) a GOOD player can legitimately reach at a given point — the
 *  ceiling no bot may exceed. Bots are never allowed to field more units, higher-cost
 *  units, or higher stars than this curve permits: difficulty comes from PLAYING WELL
 *  (synergies, economy, items, positioning), never from cheat stats or impossible boards.
 *  Start/end level per stage, interpolated by round. */
const START_LVL = [0, 1, 3, 4, 6, 7, 8, 8, 9];
const END_LVL   = [0, 2, 4, 6, 7, 8, 8, 9, 9];
export function realisticLevel(stage: number, round: number): number {
  const s = Math.min(Math.max(stage, 1), 8);
  const start = START_LVL[s] ?? 9, end = END_LVL[s] ?? 9;
  const frac = Math.min(1, Math.max(0, (round - 1) / roundsInStage(stage)));
  return Math.max(1, Math.min(10, Math.round(start + (end - start) * frac)));
}

/** Per-tier PLAY QUALITY (never stat cheats). lvlOff shifts where the bot sits relative to
 *  the good-player curve (≤ 0 so it's never ahead of what a player could field); the rest
 *  govern how WELL it plays — synergy count, star-up/item discipline, when it slams a Mega.
 *  hard/expert/ultimate map from the synergy generator's "base"/"strong"/"elite". */
const TIER_PLAY = {
  base:   { lvlOff: -1, themes: 1, starMult: 0.85, itemRate: 0.45, megaStage: 5 }, // hard
  strong: { lvlOff: 0,  themes: 2, starMult: 1.0,  itemRate: 0.8,  megaStage: 4 }, // expert
  elite:  { lvlOff: 0,  themes: 3, starMult: 1.1,  itemRate: 1.0,  megaStage: 3 }, // ultimate
} as const;

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
export function generatePlayerLikeBoard(stage: number, round: number, difficulty: BotLevel | undefined, seed: number, allowedIds?: string[], enabledItems?: string[]): UnitInstance[] {
  // The three skilled tiers draft synergies + items (their edge is PLAY, not stats):
  //   hard → "base", expert → "strong", ultimate → "elite". None exceeds the good-player curve.
  if (difficulty === "ultimate") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "elite");
  if (difficulty === "expert") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "strong");
  if (difficulty === "hard") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "base");
  const rng: Rng = makeRng(seed >>> 0);
  const byCost = byCostFrom(allowedIds);

  // easy/medium sit BELOW the good-player curve and roll a REAL shop (SHOP_ODDS by level),
  // so they can never field more, higher-cost, or higher-star units than that level allows.
  const lvlOff = difficulty === "easy" ? -2 : -1; // medium is the default branch
  const starMult = difficulty === "easy" ? 0.4 : 0.7;
  const level = Math.max(1, Math.min(10, realisticLevel(stage, round) + lvlOff));
  const size = Math.max(1, Math.min(boardSizeForLevel(level), MAX_BOARD));
  const odds = SHOP_ODDS[level];
  const twoStarChance = Math.min(0.55, Math.max(0, (stage - 2) * 0.12)) * starMult;
  const threeStarChance = stage >= 5 ? Math.min(0.18, (stage - 4) * 0.05) * starMult : 0;

  const board: UnitInstance[] = [];
  for (let i = 0; i < size; i++) {
    let cost = (weightedPick(rng, odds) + 1) as Cost;
    let t = 0; while (byCost[cost].length === 0 && t++ < 5) cost = ((cost % 5) + 1) as Cost;
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

// ── Expert AI: synergy-aware drafting + item builds ──────────────────────────

/** Special-attacking types lean on Ability Power; everything else is a physical
 *  auto-attacker. Used to hand the right carry item to each bot unit. */
const SPECIAL_TYPES = new Set<PokeType>(["fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy", "ghost", "poison"]);
/** Naturally bulky types — the bot frontlines these and feeds them defensive items. */
const TANK_TYPES = new Set<PokeType>(["rock", "steel", "ground"]);

// Item preferences by carry archetype (best first). Intersected with the room's
// enabled items so the bot never fields an item the player couldn't also build.
const AP_ITEMS = ["jeweled-lens", "archmage", "choice-specs", "mystic-surge", "burn-charm", "sage-ward"];
const AD_ITEMS = ["sniper-scope", "choice-band", "adamant-edge", "berserker", "titan-fist", "spellblade"];
const TANK_ITEMS = ["aegis", "bulwark", "titan-heart", "vampire-fang", "edge-night"];

function isSpecial(defId: string): boolean {
  const def = getDef(defId);
  return SPECIAL_TYPES.has(def.move.type) || def.types.some((t) => SPECIAL_TYPES.has(t) && t === def.move.type);
}
function isTank(defId: string): boolean {
  const def = getDef(defId);
  return def.types.some((t) => TANK_TYPES.has(t)) || def.stats.armor >= 40;
}

/** Pick `n` distinct items for an archetype, restricted to the enabled pool. */
function pickItems(pref: string[], enabled: Set<string> | null, n: number, used: Set<string>): string[] {
  const out: string[] = [];
  for (const id of pref) {
    if (out.length >= n) break;
    if (enabled && !enabled.has(id)) continue;
    if (used.has(id)) continue;
    out.push(id);
    used.add(id);
  }
  return out;
}

/** Drafting intensity for the synergy/item bot. Mapped from difficulty after the ladder
 *  shift: hard→"base", expert→"strong", ultimate→"elite". */
export type ExpertIntensity = "base" | "strong" | "elite";

/** A synergy+item bot board. Its threat is PLAY QUALITY, never cheat stats: the board is
 *  hard-capped at a good player's level/size/shop for this round (realisticLevel + TIER_PLAY),
 *  rolls the SAME SHOP_ODDS a player of that level rolls, and never exceeds the achievable
 *  star/item economy. Intensity only changes how WELL it plays — synergy count, star/item
 *  discipline, Mega timing: "base"=hard, "strong"=expert, "elite"=ultimate (a flawless
 *  player, not a buffed one). Deterministic per seed. */
export function generateExpertBoard(stage: number, round: number, seed: number, allowedIds?: string[], enabledItems?: string[], intensity: ExpertIntensity = "base"): UnitInstance[] {
  const rng: Rng = makeRng(seed >>> 0);
  const cfg = TIER_PLAY[intensity];
  const byCost = byCostFrom(allowedIds);
  const allow = allowedIds && allowedIds.length ? new Set(allowedIds) : null;

  // Capped at a good player's reality: level → board size, and SHOP_ODDS[level] is the exact
  // shop that level rolls (so 5-costs only appear at high level, etc.). NO stat buff.
  const level = Math.max(1, Math.min(10, realisticLevel(stage, round) + cfg.lvlOff));
  const size = Math.max(1, Math.min(boardSizeForLevel(level), MAX_BOARD));
  const odds = SHOP_ODDS[level];
  const twoStarChance = Math.min(0.55, Math.max(0, (stage - 2) * 0.12)) * cfg.starMult;
  const threeStarChance = stage >= 5 ? Math.min(0.18, (stage - 4) * 0.05) * cfg.starMult : 0;

  // Pick up to `cfg.themes` distinct viable synergy types (≥4 carriers) to cluster around —
  // this is the legit skill: hitting real breakpoints.
  const typeUnits = new Map<PokeType, string[]>();
  for (const u of UNITS) {
    if (allow && !allow.has(u.id)) continue;
    for (const t of u.types) { const arr = typeUnits.get(t) ?? (typeUnits.set(t, []).get(t)!); arr.push(u.id); }
  }
  const viable = [...typeUnits.entries()].filter(([, ids]) => ids.length >= 4).map(([k]) => k);
  const themes = new Set<PokeType>();
  for (let i = 0; i < cfg.themes; i++) {
    const pool = viable.filter((t) => !themes.has(t));
    if (!pool.length) break;
    themes.add(pool[randInt(rng, pool.length)]);
  }

  // Draft a real shop: roll a COST the level can afford (SHOP_ODDS), then PREFER a theme unit
  // of that cost (synergy) over a random one. Distinct defIds, like a player's roster.
  const chosen: string[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < size; i++) {
    let cost = (weightedPick(rng, odds) + 1) as Cost;
    let t = 0;
    while (byCost[cost].filter((id) => !taken.has(id)).length === 0 && t++ < 6) cost = ((cost % 5) + 1) as Cost;
    const pool = byCost[cost].filter((id) => !taken.has(id));
    if (!pool.length) break;
    const themed = themes.size ? pool.filter((id) => getDef(id).types.some((ty) => themes.has(ty))) : [];
    const pick = (themed.length && rng() < 0.85) ? themed[randInt(rng, themed.length)] : pool[randInt(rng, pool.length)];
    chosen.push(pick); taken.add(pick);
  }

  // Order: tanks to the front, carries to the back (so item-laden carries sit safe).
  chosen.sort((a, b) => Number(isTank(b)) - Number(isTank(a)));

  const board: UnitInstance[] = chosen.map((defId, i) => {
    const def = getDef(defId);
    let star: 1 | 2 | 3 = 1;
    if (def.cost <= 2 && rng() < threeStarChance) star = 3;
    else if (def.cost <= 3 && rng() < twoStarChance) star = 2;
    const col = COL_ORDER[i % COL_ORDER.length];
    const row = ROW_ORDER[Math.floor(i / COL_ORDER.length) % ROW_ORDER.length];
    return { iid: `x${seed}_${i}`, defId, star, pos: [col, row], items: [] as string[] };
  });

  // Items: a REALISTIC count — a player nets ~1 completed item per stage from carousels +
  // PvE drops (capped at 6), so only that many here, scaled by the tier's discipline. No
  // stat buffs. Carry gets the offensive build, a frontliner gets defense, the rest spare.
  const enabled = enabledItems && enabledItems.length ? new Set(enabledItems) : null;
  const usedItems = new Set<string>();
  let budget = Math.round(Math.max(0, Math.min(stage - 1, 6)) * cfg.itemRate);
  if (budget > 0 && board.length) {
    const ranked = [...board].sort((a, b) => (getDef(b.defId).cost - getDef(a.defId).cost) || (b.star - a.star));
    const carry = ranked.find((u) => !isTank(u.defId)) ?? ranked[0];
    const carryItems = pickItems(isSpecial(carry.defId) ? AP_ITEMS : AD_ITEMS, enabled, Math.min(3, budget), usedItems);
    carry.items = [...carryItems];
    budget -= carryItems.length;
    // A Mega Stone (a player would have one from a carousel by now) on a mega-capable unit.
    if (stage >= cfg.megaStage) {
      const megaTarget = canMega(carry.defId) ? carry : board.find((u) => canMega(u.defId));
      if (megaTarget && megaTarget.items.length < 3) megaTarget.items = [...megaTarget.items, MEGA_STONE];
    }
    for (const u of ranked) {
      if (budget <= 0) break;
      if (u === carry) continue;
      const pref = isTank(u.defId) ? TANK_ITEMS : isSpecial(u.defId) ? AP_ITEMS : AD_ITEMS;
      const give = pickItems(pref, enabled, Math.min(2, budget), usedItems);
      u.items = [...u.items, ...give];
      budget -= give.length;
    }
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

/** A region BOSS encounter for PvE rounds in Region Clash modes: the region's signature
 *  legendary at ★★★, hugely buffed (statScale ramps with stage), flanked by a few escort
 *  creeps so it's a real fight. Deterministic per seed. Beatable with a developed board,
 *  threatening to a weak one — and it drops the usual PvE loot on a win. */
export function generateBossBoard(bossId: string, stage: number, round: number, seed: number, allowedIds?: string[]): UnitInstance[] {
  // Boss power ramps with stage: ~2.2x at stage 2 up to ~4x late, so it stays a wall you
  // must out-scale rather than a free win.
  const bossScale = 2.0 + Math.min(stage, 8) * 0.28;
  const boss: UnitInstance = { iid: `boss${seed}`, defId: bossId, star: 3, pos: [3, 1], items: [], statScale: bossScale };
  // Escorts: a couple of region creeps, mildly buffed, so the boss isn't alone (and the
  // player's AoE has targets). Count + strength ramp with stage.
  const escorts = Math.min(1 + Math.floor(stage / 2), 5);
  const guard = generateBoard(Math.min(2 + Math.floor(stage / 2), 6), escorts, seed * 17 + 53, allowedIds)
    .map((u, i) => ({ ...u, iid: `bguard${seed}_${i}`, statScale: 1.2 }));
  // Keep the boss off the escorts' hexes.
  return [boss, ...guard.filter((u) => !(u.pos?.[0] === 3 && u.pos?.[1] === 1))];
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
