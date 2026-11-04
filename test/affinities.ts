/**
 * Flagship affinity-chart checks.
 *
 * The whole claim of this chart is that it's balanced BY CONSTRUCTION rather
 * than by playtesting, so the construction is what gets tested: equal spread,
 * mirrored relationships, no dead affinities, no immunities. If someone
 * reorders the circle or widens REACH, these fail loudly instead of quietly
 * producing another lopsided chart.
 *
 * It also contrasts against the Pokémon chart the flagship is replacing, so the
 * improvement is a measurement and not an opinion.
 */

import {
  AFFINITY_CIRCLE,
  AFFINITY_META,
  buildChart,
  effectiveness,
  strongAgainst,
  weakAgainst,
  SUPER_EFFECTIVE,
  NOT_VERY_EFFECTIVE,
  NEUTRAL,
  type Affinity,
} from "../src/game/packs/affinities";
import { TYPES, effectiveness as pokeEffectiveness } from "../src/game/data/typeChart";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Flagship affinity chart\n");

const N = AFFINITY_CIRCLE.length;

console.log("Shape:");
assert(N === 12, `twelve affinities (${N})`);
assert(new Set(AFFINITY_CIRCLE).size === N, "no duplicates on the dominance circle");
assert(
  AFFINITY_CIRCLE.every((a) => !!AFFINITY_META[a]),
  "every affinity has display metadata",
);
assert(
  new Set(AFFINITY_CIRCLE.map((a) => AFFINITY_META[a].color)).size === N,
  "every affinity has a distinct colour",
);
assert(
  AFFINITY_CIRCLE.every((a) => /^#[0-9a-f]{6}$/i.test(AFFINITY_META[a].color)),
  "every colour is a valid 6-digit hex",
);

console.log("\nEvery affinity is equally served:");
for (const a of AFFINITY_CIRCLE) {
  const strong = strongAgainst(a);
  const weak = weakAgainst(a);
  assert(strong.length === 2 && weak.length === 2, `${a} — 2 strengths, 2 weaknesses`);
  assert(
    !strong.includes(a) && !weak.includes(a),
    `${a} — is neither strong nor weak against itself`,
  );
}

console.log("\nRelationships mirror:");
{
  let ok = true;
  for (const atk of AFFINITY_CIRCLE) {
    for (const def of AFFINITY_CIRCLE) {
      const f = effectiveness(atk, def);
      const back = effectiveness(def, atk);
      if (f === SUPER_EFFECTIVE && back !== NOT_VERY_EFFECTIVE) ok = false;
      if (f === NOT_VERY_EFFECTIVE && back !== SUPER_EFFECTIVE) ok = false;
      if (f === NEUTRAL && back !== NEUTRAL) ok = false;
    }
  }
  assert(ok, "if A beats B then B is weak to A, and neutral is symmetric");
}

console.log("\nNo immunities and no spikes:");
{
  const chart = buildChart();
  const values = new Set(chart.flat());
  assert(
    [...values].every((v) => v === SUPER_EFFECTIVE || v === NOT_VERY_EFFECTIVE || v === NEUTRAL),
    `only 2x / 1x / 0.5x appear (${[...values].sort().join(", ")})`,
  );
  assert(!values.has(0), "no 0x immunity — a carry can always contribute");
  assert(chart.length === N && chart.every((row) => row.length === N), "chart is NxN");
  assert(
    chart.every((row, i) => row[i] === NEUTRAL),
    "an affinity is neutral against itself",
  );
}

console.log("\nMeasured against the 18-type chart it replaces:");
{
  /** Count how many types each type is super-effective against / weak to. */
  const pokeStrong = new Map<string, number>();
  const pokeWeak = new Map<string, number>();
  for (const atk of TYPES) {
    for (const def of TYPES) {
      const e = pokeEffectiveness(atk, [def]);
      if (e > 1) pokeStrong.set(atk, (pokeStrong.get(atk) ?? 0) + 1);
      if (e < 1 && e > 0) pokeWeak.set(def, (pokeWeak.get(def) ?? 0) + 1);
    }
  }
  const dead = TYPES.filter((t) => (pokeStrong.get(t) ?? 0) === 0);
  const strongCounts = TYPES.map((t) => pokeStrong.get(t) ?? 0);
  const pokeSpread = Math.max(...strongCounts) - Math.min(...strongCounts);

  console.log(`    (18-type: ${dead.length} dead type(s) [${dead.join(", ") || "none"}], offence spread ${pokeSpread})`);

  const ourCounts = AFFINITY_CIRCLE.map((a) => strongAgainst(a).length);
  const ourSpread = Math.max(...ourCounts) - Math.min(...ourCounts);
  assert(ourSpread === 0, `offence spread is 0 — every affinity threatens the same number (18-type: ${pokeSpread})`);
  assert(
    AFFINITY_CIRCLE.every((a) => strongAgainst(a).length > 0),
    `no dead affinities (18-type has ${dead.length})`,
  );
}

console.log("\nThe circle reads as a cycle:");
{
  // Following "beats" one step at a time must walk the whole circle and return
  // home — that's what makes it a true cycle with no terminal best affinity.
  const seen = new Set<Affinity>();
  let cur: Affinity = AFFINITY_CIRCLE[0];
  for (let i = 0; i < N; i++) {
    seen.add(cur);
    cur = strongAgainst(cur)[0];
  }
  assert(seen.size === N, `walking "beats" visits all ${N} affinities`);
  assert(cur === AFFINITY_CIRCLE[0], "and returns to the start — no dominant affinity");
}

if (failures) {
  console.error(`\n❌ ${failures} affinity assertion(s) failed`);
  process.exit(1);
}
console.log("\n✅ Flagship affinity chart verified");
