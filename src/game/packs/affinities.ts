/**
 * The flagship roster's affinity system — original, and the first concrete
 * piece of the pack plan in `Project Management/PACK-STRATEGY.md`.
 *
 * WHY NOT REUSE THE 18-TYPE CHART
 *
 * The Pokémon chart was designed for a 1996 turn-based RPG, and it carries
 * problems an auto-battler makes worse:
 *   · Dead entries — Normal is super-effective against nothing at all.
 *   · Immunities (0x) — fine when you can switch out, brutally swingy when a
 *     board auto-resolves and a carry simply cannot damage its target.
 *   · Wildly uneven spread — some types have one weakness, others have five, so
 *     the "right" comp is partly decided before you draft.
 *
 * WHAT THIS DOES INSTEAD
 *
 * Twelve affinities on a circle, where each is strong against the next two and
 * therefore weak to the previous two. That construction guarantees, by
 * definition rather than by playtesting:
 *   · every affinity has EXACTLY two strengths and two weaknesses
 *   · every strength is mirrored by the opposing weakness
 *   · no dead affinities, no immunities, no double-weaknesses
 *
 * Multipliers are 2x / 1x / 0.5x only. A 0x would mean a carry that cannot
 * contribute at all for the whole fight, which is not a counter — it's a
 * coin flip decided at draft.
 *
 * The ORDER around the circle is hand-chosen so the forced pairings also read
 * intuitively: Tide douses Ember, Ember melts Iron, Iron cuts Bloom, Bloom
 * splits Stone, and so on the whole way round. Names are placeholders for the
 * flagship's theme — the structure is the part that matters and survives a
 * rename.
 */

export type Affinity =
  | "tide" | "ember" | "iron" | "bloom" | "venom" | "stone"
  | "mind" | "spark" | "umbra" | "gale" | "lumen" | "frost";

/**
 * The dominance circle. Each affinity is strong against the NEXT two entries
 * and weak to the previous two. Reordering this changes the whole chart, so the
 * sequence is the design — not the list.
 */
export const AFFINITY_CIRCLE: Affinity[] = [
  "tide",   // → ember (douses), iron (rusts)
  "ember",  // → iron (melts), bloom (burns)
  "iron",   // → bloom (cuts), venom (inert to it)
  "bloom",  // → venom (filters), stone (roots split)
  "venom",  // → stone (corrodes), mind (clouds it)
  "stone",  // → mind (dull matter resists), spark (grounds)
  "mind",   // → spark (redirects), umbra (clarity)
  "spark",  // → umbra (floods with light), gale (ionises)
  "umbra",  // → gale (smothers), lumen (eclipses)
  "gale",   // → lumen (scatters), frost (disperses)
  "lumen",  // → frost (thaws), tide (evaporates)
  "frost",  // → tide (freezes), ember (smothers)
];

/** How many places ahead on the circle an affinity dominates. */
const REACH = 2;

export const SUPER_EFFECTIVE = 2;
export const NOT_VERY_EFFECTIVE = 0.5;
export const NEUTRAL = 1;

export type AffinityMeta = { key: Affinity; label: string; color: string };

/** Display metadata. Colours are spaced around the wheel so neighbours on the
 *  dominance circle never read as the same hue on the board. */
export const AFFINITY_META: Record<Affinity, AffinityMeta> = {
  tide:  { key: "tide",  label: "Tide",  color: "#3f8fd4" },
  ember: { key: "ember", label: "Ember", color: "#ff7a3d" },
  iron:  { key: "iron",  label: "Iron",  color: "#93a7bd" },
  bloom: { key: "bloom", label: "Bloom", color: "#5fbb5a" },
  venom: { key: "venom", label: "Venom", color: "#a86ac8" },
  stone: { key: "stone", label: "Stone", color: "#c0a479" },
  mind:  { key: "mind",  label: "Mind",  color: "#f06e9a" },
  spark: { key: "spark", label: "Spark", color: "#f2cf3c" },
  umbra: { key: "umbra", label: "Umbra", color: "#6a5f8f" },
  gale:  { key: "gale",  label: "Gale",  color: "#8fb8dd" },
  lumen: { key: "lumen", label: "Lumen", color: "#ffe9a8" },
  frost: { key: "frost", label: "Frost", color: "#74d0ce" },
};

const INDEX = new Map<Affinity, number>(AFFINITY_CIRCLE.map((a, i) => [a, i]));

/** Forward distance from `a` to `b` around the circle (0..n-1). */
function forward(a: Affinity, b: Affinity): number {
  const n = AFFINITY_CIRCLE.length;
  const ia = INDEX.get(a)!;
  const ib = INDEX.get(b)!;
  return (ib - ia + n) % n;
}

/**
 * Damage multiplier for `attack` hitting `defend`.
 *
 * Note this takes a SINGLE defending affinity, unlike the Pokémon chart which
 * multiplies across a unit's types. Stacking multipliers is what produces 4x
 * spikes, and those are exactly the swings this system exists to avoid — a
 * flagship unit's affinities are resolved to the single best match instead.
 */
export function effectiveness(attack: Affinity, defend: Affinity): number {
  const d = forward(attack, defend);
  if (d >= 1 && d <= REACH) return SUPER_EFFECTIVE;
  const back = forward(defend, attack);
  if (back >= 1 && back <= REACH) return NOT_VERY_EFFECTIVE;
  return NEUTRAL;
}

/** The two affinities this one beats. */
export function strongAgainst(a: Affinity): Affinity[] {
  const n = AFFINITY_CIRCLE.length;
  const i = INDEX.get(a)!;
  return Array.from({ length: REACH }, (_, k) => AFFINITY_CIRCLE[(i + k + 1) % n]);
}

/** The two affinities that beat this one. */
export function weakAgainst(a: Affinity): Affinity[] {
  const n = AFFINITY_CIRCLE.length;
  const i = INDEX.get(a)!;
  return Array.from({ length: REACH }, (_, k) => AFFINITY_CIRCLE[(i - k - 1 + n) % n]);
}

/** Full NxN chart, rows = attacker, in AFFINITY_CIRCLE order. Handy for a pack
 *  manifest, which carries the chart as data rather than as code. */
export function buildChart(): number[][] {
  return AFFINITY_CIRCLE.map((atk) => AFFINITY_CIRCLE.map((def) => effectiveness(atk, def)));
}
