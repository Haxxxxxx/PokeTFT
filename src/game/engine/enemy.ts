/** Generates an AI board scaled to a level + unit count. Deterministic per seed. */

import type { UnitInstance, PokeType } from "../types";
import { SHOP_ODDS, boardSizeForLevel, cumulativeRound, type Cost } from "../config";
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
  // Difficulty ladder (shifted up a notch — the old tiers all play harder now):
  //   hard     → synergy+item bot  (old "expert")
  //   expert   → cheat boss         (old "ultimate")
  //   ultimate → ELITE: stat-buffed boss above the old ultimate
  // easy/medium fall through to the economy-realistic board below (medium = old "hard").
  if (difficulty === "ultimate") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "elite");
  if (difficulty === "expert") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "strong");
  if (difficulty === "hard") return generateExpertBoard(stage, round, seed, allowedIds, enabledItems, "base");
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
  // "medium" now plays like the old "hard" (the whole ladder moved up).
  else { size += 1; twoStarChance = Math.min(0.6, twoStarChance + 0.12); threeStarChance += 0.04; costCap = Math.min(5, costCap + 1); }
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

/** A synergy+item bot board: commits to type synergies (drafted to real breakpoints),
 *  fronts its tanks, back-lines its carries, and equips item builds + Mega Stones.
 *  Intensity ramps the threat: "base" tracks a believable curve; "strong" is a cheat boss
 *  (bigger board, more star-ups, a second synergy, ahead-of-curve cost, fat items); "elite"
 *  goes a step further still (third synergy, even more 3★, the richest items, the earliest
 *  Megas) AND a flat stat buff so it's genuinely hard to out-scale. Deterministic per seed. */
export function generateExpertBoard(stage: number, round: number, seed: number, allowedIds?: string[], enabledItems?: string[], intensity: ExpertIntensity = "base"): UnitInstance[] {
  const rng: Rng = makeRng(seed >>> 0);
  const strong = intensity !== "base";   // strong OR elite → the cheat-boss behaviours
  const elite = intensity === "elite";   // elite → the extra step above
  const cr = cumulativeRound(stage, round);
  const byCost = byCostFrom(allowedIds);
  const allow = allowedIds && allowedIds.length ? new Set(allowedIds) : null;

  // Board size / cost-cap / star-up odds ramp with intensity.
  let size = Math.round((elite ? 5 : strong ? 4 : 3) + cr * (elite ? 0.32 : strong ? 0.3 : 0.26));
  const costCap = Math.min(stage + (elite ? 2 : strong ? 1 : 0), 5);
  const twoStarChance = stage >= 2 ? Math.min(elite ? 0.95 : strong ? 0.85 : 0.65, (stage - (strong ? 1 : 2)) * (elite ? 0.28 : strong ? 0.24 : 0.2)) : 0;
  const threeStarChance = stage >= (elite ? 3 : strong ? 4 : 5) ? (stage - (elite ? 2 : strong ? 3 : 4)) * (elite ? 0.14 : strong ? 0.1 : 0.07) : 0;
  size = Math.max(1, Math.min(size, Math.min(boardSizeForLevel(strong ? 10 : 9), MAX_BOARD)));
  // Elite fields a flat stat advantage on every unit (like a mild boss) so it can't simply
  // be out-economied — this is the lever that makes the top tier actually punishing. Tuned
  // down from 1.23→1.38: now ~1.15 (stage 2) → ~1.27 (stage 8).
  const statScale = elite ? 1.12 + Math.min(stage, 8) * 0.018 : undefined;

  // Tally every type in the legal roster, then pick a theme that actually has the
  // depth to reach a breakpoint (≥4 units), weighted toward the more populous types.
  const typeUnits = new Map<PokeType, string[]>();
  for (const u of UNITS) {
    if (allow && !allow.has(u.id)) continue;
    if (u.cost > costCap) continue;
    for (const t of u.types) {
      if (!typeUnits.has(t)) typeUnits.set(t, []);
      typeUnits.get(t)!.push(u.id);
    }
  }
  const viable = [...typeUnits.entries()].filter(([, ids]) => ids.length >= 4);
  const theme: PokeType | null = viable.length ? viable[randInt(rng, viable.length)][0] : null;
  const themeTarget = theme ? Math.min(size >= 8 ? 6 : 4, size, typeUnits.get(theme)!.length) : 0;
  // Strong/elite run a SECOND synergy alongside the first; elite adds a THIRD (all distinct).
  const others = theme ? viable.filter(([k]) => k !== theme) : [];
  const theme2: PokeType | null = strong && theme && others.length ? (others[randInt(rng, others.length)]?.[0] ?? null) : null;
  const theme2Target = theme2 ? Math.min(4, typeUnits.get(theme2)!.length) : 0;
  const others3 = theme2 ? others.filter(([k]) => k !== theme2) : [];
  const theme3: PokeType | null = elite && theme2 && others3.length ? (others3[randInt(rng, others3.length)]?.[0] ?? null) : null;
  const theme3Target = theme3 ? Math.min(3, typeUnits.get(theme3)!.length) : 0;

  // Draft distinct defIds: theme units first (toward the breakpoint), then best-cost
  // fillers. Cheaper units dominate, exactly like a real shop climb.
  const chosen: string[] = [];
  const taken = new Set<string>();
  const draftFrom = (ids: string[]) => {
    // Weight by cost (capped), favouring cheaper but allowing the odd premium unit.
    const pool = ids.filter((id) => !taken.has(id) && getDef(id).cost <= costCap);
    if (!pool.length) return false;
    const weights = pool.map((id) => Math.pow(0.6, getDef(id).cost - 1));
    const idx = weightedPick(rng, weights);
    chosen.push(pool[idx]); taken.add(pool[idx]);
    return true;
  };
  if (theme) for (let i = 0; i < themeTarget && chosen.length < size; i++) draftFrom(typeUnits.get(theme)!);
  if (theme2) for (let i = 0; i < theme2Target && chosen.length < size; i++) draftFrom(typeUnits.get(theme2)!);
  if (theme3) for (let i = 0; i < theme3Target && chosen.length < size; i++) draftFrom(typeUnits.get(theme3)!);
  let guard = 0;
  while (chosen.length < size && guard++ < 100) {
    let cost = (weightedPick(rng, [1, 1, 1, 1, 1].map((_, c) => (c + 1 <= costCap ? Math.pow(0.55, c) : 0))) + 1) as Cost;
    while (byCost[cost].length === 0) cost = (((cost % 5)) + 1) as Cost;
    if (!draftFrom(byCost[cost])) break;
  }

  // Order: tanks to the front, carries to the back (so item-laden carries sit safe).
  chosen.sort((a, b) => Number(isTank(b)) - Number(isTank(a)));

  const board: UnitInstance[] = chosen.map((defId, i) => {
    let star: 1 | 2 | 3 = 1;
    const def = getDef(defId);
    if (def.cost <= 2 && rng() < threeStarChance) star = 3;
    else if (def.cost <= 3 && rng() < twoStarChance) star = 2;
    const col = COL_ORDER[i % COL_ORDER.length];
    const row = ROW_ORDER[Math.floor(i / COL_ORDER.length) % ROW_ORDER.length];
    const u: UnitInstance = { iid: `x${seed}_${i}`, defId, star, pos: [col, row], items: [] as string[] };
    if (statScale) u.statScale = statScale; // elite stat advantage
    return u;
  });

  // Item builds: scale a budget by stage onto the strongest units (highest cost, then
  // star). Carries get up to 2–3 offensive items matched to their damage type; the
  // sturdiest frontliner gets defensive items. A Mega Stone lands on a mega-capable
  // unit from stage 4 on.
  const enabled = enabledItems && enabledItems.length ? new Set(enabledItems) : null;
  const usedItems = new Set<string>();
  let budget = elite ? Math.max(3, Math.min(stage + 3, 9)) : strong ? Math.max(2, Math.min(stage + 1, 9)) : Math.max(0, Math.min(stage - 1, 6));
  if (budget > 0 && board.length) {
    const ranked = [...board].sort((a, b) => (getDef(b.defId).cost - getDef(a.defId).cost) || (b.star - a.star));
    // Primary carry (back-line damage dealer) gets the richest build.
    const carry = ranked.find((u) => !isTank(u.defId)) ?? ranked[0];
    const carryItems = pickItems(isSpecial(carry.defId) ? AP_ITEMS : AD_ITEMS, enabled, Math.min(3, budget), usedItems);
    carry.items = [...carryItems];
    budget -= carryItems.length;
    // Mega Stone on a mega-capable unit (prefer the carry). Higher tiers Mega earlier.
    if (stage >= (elite ? 2 : strong ? 3 : 4)) {
      const megaTarget = (canMega(carry.defId) ? carry : board.find((u) => canMega(u.defId)));
      if (megaTarget && megaTarget.items.length < 3) megaTarget.items = [...megaTarget.items, MEGA_STONE];
    }
    // Spend the rest on a tank, then any remaining strong unit.
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
