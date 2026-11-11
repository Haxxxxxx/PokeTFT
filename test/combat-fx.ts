/**
 * Combat feedback must keep its proportion to the board.
 *
 * Every blast, ring, beam and damage number was a fixed pixel count — a 220px
 * shockwave, a 120px core, a 46px impact, an 18px rise, 13/18/25px numerals —
 * while the tile runs from about 35px on a phone in landscape to about 95px on
 * a desktop. So the same spell read as a screen-filling flash on one device and
 * a modest ring on another, and damage numbers swamped a small board while
 * getting lost on a large one.
 *
 * Same shape of test as the dock metrics, for the same reason: assert the
 * RATIO, never a pixel value. A fixed size passes a pixel assertion at whatever
 * density the author happened to be working at, which is exactly how this
 * survived.
 */

import { computeGameLayout } from "../src/game/ui/layout";
import { combatFxMetrics } from "../src/game/ui/combat-fx";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const VIEWPORTS = [[844, 390], [1024, 768], [1280, 800], [1920, 1080], [2560, 1440]] as const;
const tiles = VIEWPORTS.map(([w, h]) => computeGameLayout(w, h).tile.w);

console.log("Combat FX metrics\n");
console.log(`tiles across the range: ${tiles.map((t) => Math.round(t)).join(", ")}px\n`);

console.log("effects hold their size relative to a tile:");
{
  for (const key of ["blastRing", "blastCore", "splashRing", "splashCore", "single", "supRing"] as const) {
    const ratios = tiles.map((t) => (combatFxMetrics(t)[key] as number) / t);
    const spread = Math.max(...ratios) - Math.min(...ratios);
    assert(spread < 0.01, `${key} is a constant multiple of the tile (${ratios[0].toFixed(2)}x)`);
  }
}

console.log("\nwhich is the bug this replaces:");
{
  // The old constants, measured the same way.
  const oldRatios = tiles.map((t) => 220 / t);
  const spread = Math.max(...oldRatios) - Math.min(...oldRatios);
  assert(spread > 1,
    `a fixed 220px blast swung from ${Math.max(...oldRatios).toFixed(1)}x to ${Math.min(...oldRatios).toFixed(1)}x the tile (${spread.toFixed(1)}x spread)`);
}

console.log("\ndamage numbers stay readable at the smallest board:");
{
  const small = combatFxMetrics(Math.min(...tiles));
  assert(small.dmgFont >= 9, `the base numeral does not drop below 9px (${small.dmgFont.toFixed(1)}px)`);
  assert(small.dmgFontCrit >= small.dmgFontSup, "a crit is never smaller than a super-effective hit");
  assert(small.dmgFontSup >= small.dmgFont, "and a super-effective hit is never smaller than a normal one");
  assert(small.beamThickness >= 3, `a beam stays visible (${small.beamThickness.toFixed(1)}px)`);
  assert(small.stroke >= 1 && small.strokeThin >= 1, "ring strokes never round away to nothing");
}

console.log("\nand do not balloon on the largest:");
{
  const large = combatFxMetrics(Math.max(...tiles));
  const tile = Math.max(...tiles);
  assert(large.dmgFontCrit < tile, `a crit numeral still fits inside a tile (${large.dmgFontCrit.toFixed(0)} < ${Math.round(tile)})`);
  assert(large.single < tile * 1.2, "a single-target burst stays near one tile");
}

console.log("\nthe ordering that makes a blast read as bigger than a poke:");
{
  const m = combatFxMetrics(100);
  assert(m.blastRing > m.splashRing, "a blast is wider than a splash");
  assert(m.splashRing > m.single, "and a splash is wider than a single hit");
}

console.log(
  failures === 0
    ? "\n✅ Combat feedback scales with the board"
    : `\n❌ ${failures} combat-fx assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
