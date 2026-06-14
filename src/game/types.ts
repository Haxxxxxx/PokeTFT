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
  roles: RoleTrait[];
  /** National dex ids for each star tier; reuse the same id if a line is shorter. */
  dex: [number, number, number];
  /** Display names per star (Charmander / Charmeleon / Charizard). */
  stageNames: [string, string, string];
  stats: StatBlock;
  move: Move;
};

/** A live instance of a unit on a board or bench. */
export type UnitInstance = {
  /** Unique instance id. */
  iid: string;
  defId: string;
  star: 1 | 2 | 3;
  /** null while on bench; [col,row] while on board. */
  pos: [number, number] | null;
  items: string[];
};

/** One activation tier of a trait: how many units, and what it grants. */
export type TraitTier = {
  count: number;
  effect: string;
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
