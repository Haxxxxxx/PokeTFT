import type { PokeType } from "../types";

/**
 * Pokémon type-effectiveness multipliers: TYPE_CHART[attack][defend].
 * 2 = super effective, 0.5 = not very effective, 0 = immune, 1 = neutral.
 * This is the signature PokéTFT combat layer — it sits on top of armor/MR.
 */
const T = 1;
const S = 2; // super effective
const N = 0.5; // not very effective
const Z = 0; // immune

// Ordered list of all 18 types for compact table rows.
export const TYPES: PokeType[] = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

// Each row = attacking type, columns in TYPES order = defending type.
// prettier-ignore
const CHART: Record<PokeType, number[]> = {
  //          nor fir wat ele gra ice fig poi gro fly psy bug roc gho dra dar ste fai
  normal:   [  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  N,  Z,  T,  T,  N,  T ],
  fire:     [  T,  N,  N,  T,  S,  S,  T,  T,  T,  T,  T,  S,  N,  T,  N,  T,  S,  T ],
  water:    [  T,  S,  N,  T,  N,  T,  T,  T,  S,  T,  T,  T,  S,  T,  N,  T,  T,  T ],
  electric: [  T,  T,  S,  N,  N,  T,  T,  T,  Z,  S,  T,  T,  T,  T,  N,  T,  T,  T ],
  grass:    [  T,  N,  S,  T,  N,  T,  T,  N,  S,  N,  T,  N,  S,  T,  N,  T,  N,  T ],
  ice:      [  T,  N,  N,  T,  S,  N,  T,  T,  S,  S,  T,  T,  T,  T,  S,  T,  N,  T ],
  fighting: [  S,  T,  T,  T,  T,  S,  T,  N,  T,  N,  N,  N,  S,  Z,  T,  S,  S,  N ],
  poison:   [  T,  T,  T,  T,  S,  T,  T,  N,  N,  T,  T,  T,  N,  N,  T,  T,  Z,  S ],
  ground:   [  T,  S,  T,  S,  N,  T,  T,  S,  T,  Z,  T,  N,  S,  T,  T,  T,  S,  T ],
  flying:   [  T,  T,  T,  N,  S,  T,  S,  T,  T,  T,  T,  S,  N,  T,  T,  T,  N,  T ],
  psychic:  [  T,  T,  T,  T,  T,  T,  S,  S,  T,  T,  N,  T,  T,  T,  T,  Z,  N,  T ],
  bug:      [  T,  N,  T,  T,  S,  T,  N,  N,  T,  N,  S,  T,  T,  N,  T,  S,  N,  N ],
  rock:     [  T,  S,  T,  T,  T,  S,  N,  T,  N,  S,  T,  S,  T,  T,  T,  T,  N,  T ],
  ghost:    [  Z,  T,  T,  T,  T,  T,  T,  T,  T,  T,  S,  T,  T,  S,  T,  N,  T,  T ],
  dragon:   [  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  T,  S,  T,  N,  Z ],
  dark:     [  T,  T,  T,  T,  T,  T,  N,  T,  T,  T,  S,  T,  T,  S,  T,  N,  T,  N ],
  steel:    [  T,  N,  N,  N,  T,  S,  T,  T,  T,  T,  T,  T,  S,  T,  T,  T,  N,  S ],
  fairy:    [  T,  N,  T,  T,  T,  T,  S,  N,  T,  T,  T,  T,  T,  T,  S,  S,  N,  T ],
};

const INDEX: Record<PokeType, number> = Object.fromEntries(
  TYPES.map((t, i) => [t, i]),
) as Record<PokeType, number>;

/** Effectiveness of one attack type against a (possibly dual-type) defender. */
export function effectiveness(attack: PokeType, defendTypes: PokeType[]): number {
  return defendTypes.reduce((mult, d) => mult * CHART[attack][INDEX[d]], 1);
}
