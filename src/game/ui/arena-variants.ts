import type { PokeType, UnitInstance } from "../types";
import { computeTraits } from "../engine/synergies";
import { TYPE_COLOR } from "../ui";

/**
 * The arena takes its character from the board standing on it.
 *
 * The platform was one fixed blue stone slab for every match of every comp, so
 * the most-looked-at surface in the game said nothing and never changed. Here
 * it reads the board's strongest ACTIVE synergy and dresses itself to match: a
 * Fire board fights on warm basalt under drifting embers, a Water board on a
 * cold shelf in the rain.
 *
 * Two deliberate choices about where the data comes from:
 *
 * The palette is derived from TYPE_COLOR, the same table the trait chips, the
 * damage numbers and the health bars already use. Eighteen themes therefore
 * exist without anyone hand-picking eighteen sets of gradient stops, and they
 * stay correct if a type's colour is ever retuned. Hand-authored palettes
 * would drift out of step with the rest of the UI the first time that happened.
 *
 * The EFFECT is hand-mapped, because that part genuinely is authorship: there
 * is no formula that derives "embers rise and rain falls" from a hex code. It
 * is drawn from a small vocabulary so a dozen kinds cover all eighteen types,
 * rather than eighteen bespoke effects nobody would finish or maintain.
 */

/** The motion vocabulary. Each is a CSS animation in globals.css. */
export type ArenaEffect =
  | "dust"   // the neutral default — slow motes, barely there
  | "ember"  // rises, warm, fades out near the top
  | "rain"   // falls fast, vertical streaks
  | "snow"   // falls slowly, drifts sideways
  | "spark"  // short, sharp, flickers in place
  | "pollen" // drifts upward and sideways, soft
  | "bubble" // rises, wobbles, pops
  | "wind"   // horizontal streaks across the plane
  | "mote"   // floats, shimmering, no strong direction
  | "wisp";  // slow, dim, vertical — unsettled rather than pretty

/**
 * Type → effect. Grouped by what the type FEELS like in motion, not by
 * element-chart logic: ground and rock both throw dust, ghost and dark both
 * drift as wisps, and that similarity is the point — the palette is what
 * separates them.
 */
export const ARENA_EFFECT: Record<PokeType, ArenaEffect> = {
  fire: "ember",
  dragon: "ember",
  water: "rain",
  ice: "snow",
  electric: "spark",
  steel: "spark",
  grass: "pollen",
  bug: "pollen",
  poison: "bubble",
  flying: "wind",
  fighting: "wind",
  psychic: "mote",
  fairy: "mote",
  ghost: "wisp",
  dark: "wisp",
  ground: "dust",
  rock: "dust",
  normal: "dust",
};

export type ArenaVariant = {
  /** The driving type, or null for the neutral arena. */
  type: PokeType | null;
  /** Stable id for the data-attribute and for tests. */
  key: string;
  /** Accent colour the CSS tints the slab, rim and backdrop with. */
  accent: string;
  effect: ArenaEffect;
};

/** The arena with nothing active: the original blue stone, unchanged. */
export const NEUTRAL_ARENA: ArenaVariant = {
  type: null,
  key: "neutral",
  accent: "#5682d6",
  effect: "dust",
};

const IS_TYPE = new Set<string>(Object.keys(ARENA_EFFECT));

export function variantForType(type: PokeType): ArenaVariant {
  return {
    type,
    key: type,
    accent: TYPE_COLOR[type] ?? NEUTRAL_ARENA.accent,
    effect: ARENA_EFFECT[type] ?? "dust",
  };
}

/**
 * Pick the arena for a board.
 *
 * Driven by the strongest ACTIVE type synergy. Inactive traits are ignored on
 * purpose: one stray Fire mon on an otherwise Water board should not set the
 * whole arena alight, and the threshold that decides "this board is a Fire
 * board" is the one the game already uses for everything else.
 *
 * Determinism matters more than it looks. computeTraits returns a total order
 * (tier, then count, then key), so a board with two equally-strong synergies
 * resolves the same way on every client and on every render — otherwise the
 * arena would flicker between two themes as unrelated state changed.
 */
export function arenaVariantFor(units: UnitInstance[]): ArenaVariant {
  const onBoard = units.filter((u) => u.pos !== null);
  if (onBoard.length === 0) return NEUTRAL_ARENA;
  for (const t of computeTraits(onBoard)) {
    if (t.tier > 0 && IS_TYPE.has(t.key)) return variantForType(t.key as PokeType);
  }
  return NEUTRAL_ARENA;
}

/**
 * Resolve what to actually render, honouring the player's setting.
 *
 * "auto" follows the board. A pinned type always wins — someone who wants
 * their arena to look one way should not have it change because they slotted
 * a different mon.
 */
export function resolveArena(units: UnitInstance[], pin: string | undefined): ArenaVariant {
  if (pin && pin !== "auto") {
    if (pin === "neutral") return NEUTRAL_ARENA;
    if (IS_TYPE.has(pin)) return variantForType(pin as PokeType);
  }
  return arenaVariantFor(units);
}
