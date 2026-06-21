/** Generates an AI board scaled to a level + unit count. Deterministic per seed. */

import type { UnitInstance, PokeType } from "../types";
import { SHOP_ODDS, boardSizeForLevel, roundsInStage, type Cost } from "../config";
import { UNITS, getDef, typesForStar, archetypeOf } from "../data/mons";
import { TRAITS_BY_KEY } from "../data/traits";
import { effectiveness } from "../data/typeChart";
import { EMBLEM_TRAIT } from "../data/items";
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

// Smart positioning: tanks centered on the FRONT line to soak; carries on the BACK line
// pushed to the CORNERS so the opponent's splash/line abilities can't catch two at once.
// Local board coords: row 0 is the FRONT (allyToField maps it to the field row nearest
// the enemy), row 3 is the back edge. Columns center-out for the wall, corners-in for
// the squishies. See hex.ts allyToField.
const FRONT_COLS = [3, 2, 4, 1, 5, 0, 6]; // center-out for the wall
const CARRY_COLS = [0, 6, 1, 5, 2, 4, 3]; // corners-in for the damage dealers
const FRONT_ROWS = [0, 1];
const BACK_ROWS = [3, 2];

/** Effective HP of a unit at its star (hp scaled by its resistances) — the bulk metric
 *  for who anchors the front line. */
function effHp(u: UnitInstance): number {
  const s = getDef(u.defId).stats;
  return s.hp[u.star - 1] * (1 + (s.armor + s.magicResist) / 100);
}

/** Does this unit belong on the FRONT line? A thoughtful player fronts melee bruisers and
 *  tanks (range 1 or naturally bulky) and keeps RANGED carries (range ≥ 2) at the back —
 *  range is the primary signal, tankiness the tiebreak. */
function isFrontline(u: UnitInstance): boolean {
  const def = getDef(u.defId);
  if (def.stats.range >= 2) return false; // ranged → always back, regardless of bulk
  return true;                            // melee (incl. bruisers/tanks) → front
}

/** Place units like a thoughtful player who KNOWS each card's range: melee bruisers + tanks
 *  form a front wall (bulkiest dead-centre), ranged carries spread along the back corners
 *  (anti-splash, out of melee reach). Mutates each unit's `pos`. */
function placeSmart(units: UnitInstance[]): void {
  const used = new Set<string>();
  const claim = (cols: number[], rows: number[]): [number, number] | null => {
    for (const r of rows) for (const c of cols) { const k = `${c},${r}`; if (!used.has(k)) { used.add(k); return [c, r]; } }
    return null;
  };
  let front = units.filter(isFrontline);
  const back = units.filter((u) => !isFrontline(u));
  // All-ranged team → the bulkiest still has to soak as the wall, or melee just walks in.
  if (front.length === 0 && back.length > 0) {
    back.sort((a, b) => effHp(b) - effHp(a));
    front = [back.shift()!];
  }
  // Bulkiest mons anchor the centre of the wall; squishiest carries hug the far corners.
  front.sort((a, b) => effHp(b) - effHp(a));
  back.sort((a, b) => effHp(a) - effHp(b));
  for (const u of front) {
    const pos = claim(FRONT_COLS, FRONT_ROWS) ?? claim(FRONT_COLS, BACK_ROWS) ?? claim(FRONT_COLS, [1, 0, 2, 3]);
    if (pos) u.pos = pos;
  }
  for (const u of back) {
    const pos = claim(CARRY_COLS, BACK_ROWS) ?? claim(CARRY_COLS, FRONT_ROWS) ?? claim(CARRY_COLS, [2, 3, 1, 0]);
    if (pos) u.pos = pos;
  }
}

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

type TierName = "easy" | "medium" | "hard" | "expert" | "ultimate";

/** Per-tier PLAY QUALITY (never stat cheats). Every tier rolls the same real shop and is
 *  capped at the good-player level curve via `lvlOff` (≤ 0 — never ahead of a player). The
 *  rest is pure skill: how many synergies it commits to + actually activates, how it
 *  concentrates star-ups + items, when it Mega-evolves, and how hard it COUNTERS the
 *  opponent's types (`counter`, 0 = doesn't read the foe → 1 = drafts a full type counter).
 *  This is the whole difficulty ladder, smoothly graded from beginner to flawless. */
const TIER_PLAY: Record<TierName, { lvlOff: number; themes: number; starMult: number; itemRate: number; megaStage: number; counter: number; smart: boolean; emblem: boolean }> = {
  easy:     { lvlOff: -2, themes: 0, starMult: 0.4,  itemRate: 0,    megaStage: 99, counter: 0,   smart: false, emblem: false }, // a beginner: small board, no synergy/items
  medium:   { lvlOff: -1, themes: 1, starMult: 0.7,  itemRate: 0.2,  megaStage: 6,  counter: 0,   smart: false, emblem: false }, // casual: one loose synergy
  hard:     { lvlOff: -1, themes: 1, starMult: 0.85, itemRate: 0.5,  megaStage: 5,  counter: 0.4, smart: true,  emblem: false }, // solid: a real synergy + items, light counter
  expert:   { lvlOff: 0,  themes: 2, starMult: 1.0,  itemRate: 0.8,  megaStage: 4,  counter: 0.8, smart: true,  emblem: false }, // strong: two synergies, counters you
  ultimate: { lvlOff: 0,  themes: 3, starMult: 1.1,  itemRate: 1.0,  megaStage: 3,  counter: 1.0, smart: true,  emblem: true  }, // flawless: triple synergy, full counter + an emblem splash
};

/** A board's physical-vs-special damage lean (for tailoring augments + items to it). */
export function boardProfileOf(units: UnitInstance[]): { ad: number; ap: number } {
  let ad = 0, ap = 0;
  for (const u of units) {
    if (!u?.defId) continue;
    const a = archetypeOf(getDef(u.defId));
    if (a === "physical") ad += 1; else if (a === "mage") ap += 1;
  }
  return { ad, ap };
}

/** Tally the opponent board's defensive typing (per-star, so an evolved Charizard counts as
 *  Fire/Flying). Drives counter-drafting. */
function opponentTypeCounts(board?: UnitInstance[]): Map<PokeType, number> {
  const m = new Map<PokeType, number>();
  for (const u of board ?? []) {
    if (!u?.defId) continue;
    for (const t of typesForStar(getDef(u.defId), u.star)) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/** How effective MY type's attacks are against the opponent's spread (>1 = super-effective
 *  on average, <1 = resisted). A theme of this type → units whose moves hit their weakness. */
function counterScore(myType: PokeType, oppCounts: Map<PokeType, number>): number {
  let s = 0, n = 0;
  for (const [ot, c] of oppCounts) { s += effectiveness(myType, [ot]) * c; n += c; }
  return n ? s / n : 1;
}

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

/** The single entry for every AI board. ALL difficulties run through one economy-accurate
 *  generator (buildBotBoard) — capped at the good-player curve, rolling the real shop, no
 *  stat cheats. The ONLY thing that changes between tiers is play skill (TIER_PLAY): how
 *  many synergies it activates, how it concentrates upgrades/items, and how hard it counters
 *  the opponent's types. `opponentBoard` (the human it's about to fight) lets it adapt.
 *  Deterministic per seed (host-generated + persisted; clients just replay it). */
export function generatePlayerLikeBoard(stage: number, round: number, difficulty: BotLevel | undefined, seed: number, allowedIds?: string[], enabledItems?: string[], opponentBoard?: UnitInstance[], brain?: BotBrain): UnitInstance[] {
  const tier: TierName = difficulty && difficulty in TIER_PLAY ? (difficulty as TierName) : "medium";
  return buildBotBoard(stage, round, tier, seed, allowedIds, enabledItems, opponentBoard, brain);
}

/** Adaptive "learning" signals fed into a bot's draft — all OPTIONAL and host-supplied, so
 *  the generator stays a pure function of its inputs (determinism intact; clients replay the
 *  persisted board). None of these grant stats — they only make the bot DRAFT smarter:
 *   · metaWeights     — global type strength learned from real game placements (meta-learning)
 *   · counterAffinity — the human opponent's HABITUAL types, from their history (personalized)
 *   · defendTypes     — types that beat THIS bot earlier this game (in-game self-correction)
 *  counterAffinity + defendTypes act as extra "virtual opponent" presence so the bot
 *  counter-drafts types super-effective against them. */
export type BotBrain = {
  metaWeights?: Record<string, number>;
  counterAffinity?: Record<string, number>;
  defendTypes?: Record<string, number>;
  /** Mega Madness: a smart player builds AROUND megas (every round hands out a Mega Stone),
   *  so the bot drafts mega-capable carries and stones every capable mon. Off = drafts normally. */
  preferMega?: boolean;
};

// ── Expert AI: synergy-aware drafting + item builds ──────────────────────────

/** Special-attacking types lean on Ability Power; everything else is a physical
 *  auto-attacker. Used to hand the right carry item to each bot unit. */
const SPECIAL_TYPES = new Set<PokeType>(["fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy", "ghost", "poison"]);
/** Naturally bulky types — the bot frontlines these and feeds them defensive items. */
const TANK_TYPES = new Set<PokeType>(["rock", "steel", "ground"]);

// Item preferences by carry archetype (best first). Intersected with the room's
// enabled items so the bot never fields an item the player couldn't also build.
const AP_ITEMS = ["jeweled-lens", "archmage", "choice-specs", "mystic-surge", "burn-charm", "sage-ward"];
// Casters value MANA (more casts) — lead an AP carry's build with a mana item.
const AP_CARRY_ITEMS = ["archmage", "spirit-orb", "jeweled-lens", "mystic-surge", "choice-specs"];
const AD_ITEMS = ["sniper-scope", "choice-band", "adamant-edge", "berserker", "titan-fist", "spellblade"];
const TANK_ITEMS = ["aegis", "bulwark", "titan-heart", "vampire-fang", "edge-night"];
// Defensive builds matched to the THREAT: armour vs a physical foe, magic resist vs casters.
const ARMOR_ITEMS = ["aegis", "bulwark", "steadfast", "edge-night", "titan-heart"];
const MR_ITEMS = ["sage-ward", "mana-veil", "aegis", "bulwark", "titan-heart"];

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

/** Legacy intensity tag (base/strong/elite). Kept so existing callers/tests keep working;
 *  maps to the hard/expert/ultimate tiers. */
export type ExpertIntensity = "base" | "strong" | "elite";
const INTENSITY_TIER: Record<ExpertIntensity, TierName> = { base: "hard", strong: "expert", elite: "ultimate" };

/** Thin compatibility wrapper — prefer generatePlayerLikeBoard(difficulty, …). */
export function generateExpertBoard(stage: number, round: number, seed: number, allowedIds?: string[], enabledItems?: string[], intensity: ExpertIntensity = "base", opponentBoard?: UnitInstance[]): UnitInstance[] {
  return buildBotBoard(stage, round, INTENSITY_TIER[intensity], seed, allowedIds, enabledItems, opponentBoard);
}

/** The one AI board generator for every tier. PLAY QUALITY only, never stat cheats: the
 *  board is hard-capped at a good player's level/size/shop for this round (realisticLevel +
 *  TIER_PLAY), rolls the SAME SHOP_ODDS a player of that level rolls, and never exceeds the
 *  achievable star/item economy. Tier changes how WELL it plays; `opponentBoard` lets the
 *  skilled tiers COUNTER-DRAFT — committing to synergies whose types are super-effective
 *  against the opponent's spread. Deterministic per seed. */
function buildBotBoard(stage: number, round: number, tier: TierName, seed: number, allowedIds?: string[], enabledItems?: string[], opponentBoard?: UnitInstance[], brain?: BotBrain): UnitInstance[] {
  const rng: Rng = makeRng(seed >>> 0);
  const cfg = TIER_PLAY[tier];
  const byCost = byCostFrom(allowedIds);
  const allow = allowedIds && allowedIds.length ? new Set(allowedIds) : null;

  // Capped at a good player's reality: level → board size, and SHOP_ODDS[level] is the exact
  // shop that level rolls (so 5-costs only appear at high level, etc.). NO stat buff.
  const level = Math.max(1, Math.min(10, realisticLevel(stage, round) + cfg.lvlOff));
  const size = Math.max(1, Math.min(boardSizeForLevel(level), MAX_BOARD));
  const odds = SHOP_ODDS[level];
  // Star-up reality of a GOOD player: by mid-game most of your low-cost board is 2★ and a
  // carry 3★ arrives stage 6-7. The old curve was far too shallow (~40% 2★ at stage 5), so
  // skilled bots fielded half-1★ boards that hit like wet noodles. Steeper now, but still
  // capped below a flawless board and applied ONLY to ≤3-cost (2★) / ≤2-cost (3★) — a 4/5-cost
  // never auto-stars, so this stays inside legitimate economy. starMult sets the tier spread.
  const twoStarChance = Math.min(0.9, Math.max(0, (stage - 1) * 0.18)) * cfg.starMult;
  const threeStarChance = stage >= 4 ? Math.min(0.3, (stage - 3) * 0.08) * cfg.starMult : 0;

  // Only a unit the bot's level can actually ROLL is legal (SHOP_ODDS[cost] > 0).
  const legalCost = (id: string) => odds[getDef(id).cost - 1] > 0;

  // COUNTER-DRAFT: read the opponent's typing so we commit to synergies that hit their
  // weakness. A type whose attacks are super-effective vs their spread gets weighted up.
  // The learning signals add "virtual opponent" presence: the human's HABITUAL types
  // (personalized counter) and the types that BEAT this bot earlier (in-game memory), so a
  // skilled bot also pre-counters who you usually play and adjusts to what just beat it.
  const oppCounts = opponentTypeCounts(opponentBoard);
  if (cfg.counter > 0) {
    for (const [t, w] of Object.entries(brain?.counterAffinity ?? {})) oppCounts.set(t as PokeType, (oppCounts.get(t as PokeType) ?? 0) + w);
    for (const [t, w] of Object.entries(brain?.defendTypes ?? {})) oppCounts.set(t as PokeType, (oppCounts.get(t as PokeType) ?? 0) + w);
  }
  const useCounter = cfg.counter > 0 && oppCounts.size > 0;

  // Pick `cfg.themes` synergy types, weighted by ROSTER DEPTH (≥4 legal-cost carriers) AND
  // counter advantage — a strong player commits to synergies they can fill that also punish
  // the foe.
  const typeUnits = new Map<PokeType, string[]>();
  for (const u of UNITS) {
    if (allow && !allow.has(u.id)) continue;
    for (const t of u.types) { const arr = typeUnits.get(t) ?? (typeUnits.set(t, []).get(t)!); arr.push(u.id); }
  }
  // metaWeights (>1 = a synergy that places well across real games) tilts the draft toward
  // the proven-strong comps — the bot population "advances" as the live meta is discovered.
  const meta = brain?.metaWeights;
  const pickable = [...typeUnits.entries()]
    .filter(([, ids]) => ids.filter(legalCost).length >= 4)
    .map(([k, ids]) => ({ k, w: Math.max(0.05, ids.filter(legalCost).length
      * (useCounter ? 1 + (counterScore(k, oppCounts) - 1) * cfg.counter * 1.6 : 1)
      * (meta?.[k] ?? 1)) }));
  const themeList: PokeType[] = [];
  for (let i = 0; i < cfg.themes && pickable.length; i++) {
    const idx = weightedPick(rng, pickable.map((p) => p.w));
    themeList.push(pickable[idx].k); pickable.splice(idx, 1);
  }

  const chosen: string[] = [];
  const taken = new Set<string>();
  // Per-theme unit budget: the primary synergy gets the lion's share, secondary less, the
  // rest minimal — then each is snapped DOWN to a real breakpoint so the trait ACTIVATES.
  const themeBudget = (i: number) => (i === 0 ? Math.ceil(size * 0.6) : i === 1 ? Math.ceil(size * 0.4) : 2);
  for (let ti = 0; ti < themeList.length && chosen.length < size; ti++) {
    const theme = themeList[ti];
    const avail = (typeUnits.get(theme) ?? []).filter((id) => !taken.has(id) && legalCost(id));
    const cap = Math.min(themeBudget(ti), avail.length, size - chosen.length);
    const bps = TRAITS_BY_KEY[theme]?.breakpoints ?? [];
    let target = 0; for (const bp of bps) if (bp <= cap) target = bp; // largest breakpoint that fits
    if (!target) {
      // Can't reach even the smallest breakpoint with the room left → drafting orphan
      // units of this type activates NOTHING. A good player wouldn't; skip the theme and
      // leave the slots for the other synergies / themed fills.
      if (bps.length) continue;
      target = cap; // a breakpoint-less role trait (shouldn't happen for types) → cluster
    }
    // Draft the cheapest theme carriers (what a player rolls first), with light variety.
    const cheap = [...avail].sort((a, b) => getDef(a).cost - getDef(b).cost);
    for (let k = 0; k < target && chosen.length < size; k++) {
      const floorCost = getDef(cheap.find((id) => !taken.has(id))!).cost;
      const band = cheap.filter((id) => !taken.has(id) && getDef(id).cost <= floorCost + 1);
      // Mega Madness: within the affordable band, reach for mega-capable carriers first.
      const megaBand = brain?.preferMega ? band.filter((id) => canMega(id)) : [];
      const fromBand = megaBand.length ? megaBand : band;
      const pick = fromBand.length ? fromBand[randInt(rng, fromBand.length)] : cheap.find((id) => !taken.has(id));
      if (!pick) break;
      chosen.push(pick); taken.add(pick);
    }
  }
  // Double down: a strong player deepens their PRIMARY synergy toward its NEXT breakpoint
  // when slots remain, rather than leaving it at the minimum activation. Cheapest carriers
  // first (what you actually roll), so the deepen stays economy-honest.
  if (themeList.length) {
    const theme = themeList[0];
    const curr = chosen.filter((id) => getDef(id).types.includes(theme)).length;
    const bps = TRAITS_BY_KEY[theme]?.breakpoints ?? [];
    const next = bps.find((bp) => bp > curr);
    if (next) {
      const avail = (typeUnits.get(theme) ?? [])
        .filter((id) => !taken.has(id) && legalCost(id))
        .sort((a, b) => getDef(a).cost - getDef(b).cost);
      for (let c = curr; c < next && chosen.length < size; c++) {
        const pick = avail.find((id) => !taken.has(id));
        if (!pick) break;
        chosen.push(pick); taken.add(pick);
      }
    }
  }

  // Fill remaining slots with real-shop rolls (cost by SHOP_ODDS), preferring theme units.
  const themes = new Set(themeList);
  let fillGuard = 0;
  while (chosen.length < size && fillGuard++ < 200) {
    let cost = (weightedPick(rng, odds) + 1) as Cost;
    let t = 0;
    while (byCost[cost].filter((id) => !taken.has(id)).length === 0 && t++ < 6) cost = ((cost % 5) + 1) as Cost;
    const pool = byCost[cost].filter((id) => !taken.has(id));
    if (!pool.length) break;
    const themed = pool.filter((id) => getDef(id).types.some((ty) => themes.has(ty)));
    // Mega Madness: a mega-capable mon (ideally also on-theme) wins the slot most of the time.
    const megaPool = brain?.preferMega ? pool.filter((id) => canMega(id)) : [];
    const megaThemed = megaPool.filter((id) => getDef(id).types.some((ty) => themes.has(ty)));
    const pick = (megaPool.length && rng() < 0.7) ? (megaThemed.length ? megaThemed : megaPool)[randInt(rng, (megaThemed.length ? megaThemed : megaPool).length)]
      : (themed.length && rng() < 0.7) ? themed[randInt(rng, themed.length)]
      : pool[randInt(rng, pool.length)];
    chosen.push(pick); taken.add(pick);
  }

  // Order: tanks first (front), carries last (back).
  chosen.sort((a, b) => Number(isTank(b)) - Number(isTank(a)));

  const board: UnitInstance[] = chosen.map((defId, i) => {
    const def = getDef(defId);
    let star: 1 | 2 | 3 = 1;
    if (def.cost <= 2 && rng() < threeStarChance) star = 3;
    else if (def.cost <= 3 && rng() < twoStarChance) star = 2;
    const col = COL_ORDER[i % COL_ORDER.length];
    const row = ROW_ORDER[Math.floor(i / COL_ORDER.length) % ROW_ORDER.length];
    return { iid: `x${seed}_${i}`, defId, star, pos: [col, row] as [number, number], items: [] as string[] };
  });
  // Skilled tiers position like a thoughtful player: tanks front-centre, carries to the back
  // corners (anti-splash). Lower tiers keep the naive center-out layout above.
  if (cfg.smart) placeSmart(board);

  // Concentrate the rolled star-ups onto the best CARRIES (a good player upgrades their
  // damage dealers first). This re-allocates the SAME number of 2★/3★ (no extra — stays
  // legal: 3★ only on ≤2-cost, 2★ only on ≤3-cost), just onto higher-priority units.
  if (cfg.smart && board.length) {
    const prio = (u: UnitInstance) => (isTank(u.defId) ? 0 : 3) + getDef(u.defId).cost;
    const threes = board.filter((u) => u.star === 3).length;
    const twos = board.filter((u) => u.star === 2).length;
    for (const u of board) u.star = 1;
    const c2 = board.filter((u) => getDef(u.defId).cost <= 2).sort((a, b) => prio(b) - prio(a));
    for (let i = 0; i < threes && i < c2.length; i++) c2[i].star = 3;
    const c3 = board.filter((u) => getDef(u.defId).cost <= 3 && u.star < 3).sort((a, b) => prio(b) - prio(a));
    for (let i = 0; i < twos && i < c3.length; i++) c3[i].star = 2;
  }

  // Items: a REALISTIC count — a player nets ~1 completed item per stage from carousels +
  // PvE drops (capped at 6), so only that many here, scaled by the tier's discipline. No
  // stat buffs. Carry gets the offensive build, a frontliner gets defense, the rest spare.
  const enabled = enabledItems && enabledItems.length ? new Set(enabledItems) : null;
  const usedItems = new Set<string>();
  // Itemize to COUNTER the foe: stack the defense their damage type actually cares about.
  const oppLean = (() => { const p = boardProfileOf(opponentBoard ?? []); return p.ap > p.ad ? "ap" : p.ad > p.ap ? "ad" : "none"; })();
  const tankPref = oppLean === "ap" ? MR_ITEMS : oppLean === "ad" ? ARMOR_ITEMS : TANK_ITEMS;
  let budget = Math.round(Math.max(0, Math.min(stage - 1, 6)) * cfg.itemRate);
  if (budget > 0 && board.length) {
    const ranked = [...board].sort((a, b) => (getDef(b.defId).cost - getDef(a.defId).cost) || (b.star - a.star));
    const carry = ranked.find((u) => !isTank(u.defId)) ?? ranked[0];
    // Casters lead with a mana item (faster ults); attackers with raw damage items.
    const carryItems = pickItems(isSpecial(carry.defId) ? AP_CARRY_ITEMS : AD_ITEMS, enabled, Math.min(3, budget), usedItems);
    carry.items = [...carryItems];
    budget -= carryItems.length;
    // A Mega Stone (a player would have one from a carousel by now) on a mega-capable unit.
    // In Mega Madness the stones are handed out every round, so stone EVERY capable mon.
    if (stage >= cfg.megaStage) {
      if (brain?.preferMega) {
        for (const u of board) if (canMega(u.defId) && u.items.length < 3 && !u.items.includes(MEGA_STONE)) u.items = [...u.items, MEGA_STONE];
      } else {
        const megaTarget = canMega(carry.defId) ? carry : board.find((u) => canMega(u.defId));
        if (megaTarget && megaTarget.items.length < 3) megaTarget.items = [...megaTarget.items, MEGA_STONE];
      }
    }
    for (const u of ranked) {
      if (budget <= 0) break;
      if (u === carry) continue;
      const pref = isTank(u.defId) ? tankPref : isSpecial(u.defId) ? AP_ITEMS : AD_ITEMS;
      const give = pickItems(pref, enabled, Math.min(2, budget), usedItems);
      u.items = [...u.items, ...give];
      budget -= give.length;
    }
  }

  // Trait emblem splash (ultimate, like a player with a Spatula): an emblem of the PRIMARY
  // synergy on a frontline unit that doesn't already carry that type — pushing the trait up
  // a breakpoint for a bigger active bonus.
  if (cfg.emblem && themeList.length) {
    const emblemId = `emblem-${themeList[0]}`;
    if (EMBLEM_TRAIT[emblemId]) {
      // Only worth it on a unit that does NOT already carry the type (so it adds +1 to the
      // count toward the next breakpoint) — prefer a sturdy frontliner.
      const noType = board.filter((u) => (u.items?.length ?? 0) < 3 && !typesForStar(getDef(u.defId), u.star).includes(themeList[0]));
      const target = noType.find((u) => isTank(u.defId)) ?? noType[0];
      if (target) target.items = [...(target.items ?? []), emblemId];
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
