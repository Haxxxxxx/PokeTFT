/** National dex range [start, end] (inclusive) for each generation. */
export const GEN_DEX_RANGES: Record<number, [number, number]> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};

export const GEN_LABELS: Record<number, string> = {
  1: "Gen I — Kanto",
  2: "Gen II — Johto",
  3: "Gen III — Hoenn",
  4: "Gen IV — Sinnoh",
  5: "Gen V — Unova",
  6: "Gen VI — Kalos",
  7: "Gen VII — Alola",
  8: "Gen VIII — Galar",
  9: "Gen IX — Paldea",
};

/** All gen numbers in order. */
export const ALL_GENS = Object.keys(GEN_DEX_RANGES).map(Number);

/** Total Pokémon count for a list of generations. */
export function totalPokemonCount(gens: number[]): number {
  return gens.reduce((sum, g) => {
    const [s, e] = GEN_DEX_RANGES[g] ?? [0, 0];
    return sum + (e - s + 1);
  }, 0);
}
