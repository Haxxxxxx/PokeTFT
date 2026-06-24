import type { Cost } from "./config";

/** The 18 canonical Pokémon types — used as origin traits. */
export type PokeType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

/** Role traits = TFT "classes". A mon can have one or more. */
export type RoleTrait =
  | "starter" | "legendary" | "pseudo-legendary" | "eeveelution"
  | "fossil" | "swarm" | "evolver" | "kanto-mythic" | "mythic";

export type StatBlock = {
  /** Per-star stats: index 0 = ⭐, 1 = ⭐⭐, 2 = ⭐⭐⭐. */
  hp: [number, number, number];
  /** Attack damage per auto-attack, per star. */
  ad: [number, number, number];
  /** Attacks per second. */
  attackSpeed: number;
  armor: number;
  magicResist: number;
  /** 1 = melee (adjacent hex), >1 = ranged in hexes. */
  range: number;
  /** Mana needed to cast the move; starting mana. */
  maxMana: number;
  startMana: number;
  /** Innate crit bonus added on top of the 20% base (items + traits also stack here).
   *  Use for mons whose lore centres on critical hits (e.g. Scyther, Shedinja). */
  critAdd?: number;
};

export type Move = {
  name: string;
  /** Pokémon type of the move — drives type-effectiveness vs the target. */
  type: PokeType;
  /** Base magic damage per star, before effectiveness & MR. */
  power: [number, number, number];
  /** "single" hits the current target; "splash" hits target + neighbours. */
  shape: "single" | "splash" | "line";
};

/**
 * A unit definition (the thing you buy in the shop).
 * Evolution stages double as star levels: dex[0] = ⭐, dex[1] = ⭐⭐, dex[2] = ⭐⭐⭐.
 */
export type UnitDef = {
  id: string;
  name: string;
  cost: Cost;
  types: PokeType[];
  /** Optional per-star typing — index 0 = ★, 1 = ★★, 2 = ★★★. When a line gains/shifts
   *  a type as it evolves (e.g. Charizard gains Flying at ★★★), list it here; absent
   *  stars fall back to `types`. Drives combat type-effectiveness, synergies and the
   *  detail panel's type chips for the unit's current star. */
  typesByStar?: PokeType[][];
  roles: RoleTrait[];
  /** National dex ids for each star tier; reuse the same id if a line is shorter. */
  dex: [number, number, number];
  /** Display names per star (Charmander / Charmeleon / Charizard). */
  stageNames: [string, string, string];
  stats: StatBlock;
  move: Move;
  /** Optional per-mon override for ability flavour. When set, overrides the
   *  archetype-derived default in castEffectOf() so curated mons can have a
   *  unique combat signature without touching the generated pool. */
  castEffect?: CastEffect;
};

/** Ability-cast flavour — how a unit's signature move plays out in combat.
 *   · guard   — tanks heal themselves on cast (sustain frontline)
 *   · heal    — supportive mages mend the most-wounded ally
 *   · blast   — offensive mages hit EVERY enemy for reduced power (team nuke)
 *   · execute — physical carries deal bonus damage to low-HP targets
 *   · nuke    — default single/splash/line typed burst */
export type CastEffect = "nuke" | "guard" | "heal" | "blast" | "execute";

/** A live instance of a unit on a board or bench. */
export type UnitInstance = {
  /** Unique instance id. */
  iid: string;
  defId: string;
  star: 1 | 2 | 3;
  /** null while on bench; [col,row] while on board. */
  pos: [number, number] | null;
  /** Explicit bench slot (0..BENCH_SIZE-1) so mons can sit anywhere with gaps, not
   *  forced to pack from the left. Undefined = auto-placed in the first free slot. */
  benchSlot?: number;
  items: string[];
  /** Deterministic HP/ATK multiplier (<1 weakens). Used to soften early PvE creeps
   *  so the opening rounds are reliably winnable. Undefined = 1 (no scaling). */
  statScale?: number;
};

/** Concrete combat buff a trait tier grants. Applied at combat start. `scope`
 *  "self" = units carrying the trait; "team" = every ally unit. */
export type TraitBuff = {
  scope?: "self" | "team";
  hpMult?: number;
  adMult?: number;
  apMult?: number;
  asMult?: number;
  armorAdd?: number;
  mrAdd?: number;
  regenPerSec?: number;
  shieldPct?: number;
  manaAdd?: number;
  // Signature combat effects (Phase 1 depth).
  critAdd?: number;        // +crit chance
  lifeSteal?: number;      // heal a fraction of damage dealt
  armorPen?: number;       // ignore a fraction of target armor
  burnDps?: number;        // abilities burn for this fraction of victim maxHp/sec
  stunChance?: number;     // chance to stun a victim on ability hit
  freezeChance?: number;   // chance to freeze a victim on ability hit
  statusImmune?: boolean;  // immune to burn/stun/freeze
  manaStart?: number;      // bonus mana at combat start (additive with manaAdd)
  manaPerAttack?: number;  // extra mana gained per auto-attack
};

/** One activation tier of a trait: how many units, what it grants (text + buff). */
export type TraitTier = {
  count: number;
  effect: string;
  buff?: TraitBuff;
};

/** A trait synergy, e.g. Fire 2/4/6, with a concrete effect at each tier. */
export type TraitDef = {
  key: PokeType | RoleTrait;
  label: string;
  /** One-line identity of the trait. */
  description: string;
  /** Activation tiers, ascending by count. */
  tiers: TraitTier[];
  /** Derived: the thresholds (tiers.map(t => t.count)). */
  breakpoints: number[];
};
