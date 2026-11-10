/**
 * A species' render scale must track how big it LOOKS, not one number from a
 * data sheet.
 *
 * Scaling by height alone was wrong in a specific, reported way: PokéAPI
 * measures a serpentine species along its LENGTH, so Ekans ("2.0 m" of snake)
 * scored 1.30 and rendered larger than a Doduo. Coiled on a hex it is not that
 * big.
 *
 * Mass alone is wrong in the opposite direction — a gas or balloon species
 * weighs almost nothing, and Gastly (0.1 kg) would shrink to the floor despite
 * being a perfectly visible cloud.
 *
 * So the scale is the geometric mean of the two, and these tests check the
 * cases where the two measures DISAGREE. Anything else would pass under either
 * signal and prove nothing.
 */

import { relativeModelScale } from "../src/game/data/model-scale";
import { MON_HEIGHT_M } from "../src/game/data/mon-heights";
import { MON_WEIGHT_KG } from "../src/game/data/mon-weights";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const EKANS = 23, DODUO = 84, GASTLY = 92, SNORLAX = 143, PIDGEY = 16, ONIX = 95;

console.log("Species scale\n");

console.log("the reported case: a long thin snake is not a big unit:");
{
  const ekans = relativeModelScale(EKANS);
  const doduo = relativeModelScale(DODUO);
  assert(MON_HEIGHT_M[EKANS] > MON_HEIGHT_M[DODUO],
    `Ekans is "taller" on paper (${MON_HEIGHT_M[EKANS]}m vs ${MON_HEIGHT_M[DODUO]}m) — that is the trap`);
  assert(MON_WEIGHT_KG[EKANS] < MON_WEIGHT_KG[DODUO],
    `but much lighter (${MON_WEIGHT_KG[EKANS]}kg vs ${MON_WEIGHT_KG[DODUO]}kg)`);
  assert(ekans < doduo, `so it renders smaller than a Doduo (${ekans.toFixed(2)} vs ${doduo.toFixed(2)})`);
}

console.log("\nand the opposite trap: something light is not automatically tiny:");
{
  const gastly = relativeModelScale(GASTLY);
  assert(MON_WEIGHT_KG[GASTLY] < 1, `Gastly weighs almost nothing (${MON_WEIGHT_KG[GASTLY]}kg)`);
  assert(gastly > 0.7, `yet is not pinned to the floor (${gastly.toFixed(2)})`);
  assert(gastly < relativeModelScale(SNORLAX), "while still ranking below something genuinely massive");
}

console.log("\nboth signals are actually used:");
{
  // If only height mattered, Ekans (2.0m) would beat Snorlax (2.1m) narrowly
  // and Doduo (1.4m) clearly. If only mass mattered, Gastly would floor.
  const byHeightOnly = MON_HEIGHT_M[EKANS] > MON_HEIGHT_M[DODUO];
  const byScale = relativeModelScale(EKANS) > relativeModelScale(DODUO);
  assert(byHeightOnly && !byScale, "the height ordering is deliberately NOT the render ordering");
  assert(relativeModelScale(GASTLY) > relativeModelScale(PIDGEY),
    "and a light-but-large species still outranks a small solid one");
}

console.log("\nthe things that were already right stay right:");
{
  const line = [4, 5, 6].map(relativeModelScale);
  assert(line[0] < line[1] && line[1] < line[2],
    `an evolution line still grows (${line.map((n) => n.toFixed(2)).join(" < ")})`);
  assert(relativeModelScale(SNORLAX) > relativeModelScale(PIDGEY), "Snorlax still dwarfs a Pidgey");
  assert(relativeModelScale(ONIX) <= 1.4, "and the ceiling still holds for the extremes");
}

console.log("\nevery species gets a usable number:");
{
  let bad = 0;
  for (let dex = 1; dex <= 1025; dex++) {
    const s = relativeModelScale(dex);
    if (!Number.isFinite(s) || s < 0.7 - 1e-9 || s > 1.4 + 1e-9) bad++;
  }
  assert(bad === 0, "all 1025 species land inside the clamp with a finite value");
  assert(relativeModelScale(999999) === 1, "and an unknown dex degrades to 1 rather than vanishing");
  assert(relativeModelScale("fox") === 1, "as do the lab's non-species debug models");
}

console.log(
  failures === 0
    ? "\n✅ Render scale blends height and mass, and the disagreements resolve sensibly"
    : `\n❌ ${failures} species-scale assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
