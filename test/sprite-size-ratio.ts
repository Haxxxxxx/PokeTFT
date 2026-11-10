/**
 * How big a mon looks must depend on the SPECIES, not on its sprite's padding.
 *
 * Units were sized by a fixed multiple of the padded 96x96 frame. Measured
 * across all 1072 sprites the art fills anywhere from 17.7% to 100% of its
 * frame (median 58%) — so at a fixed frame multiple, a species whose art fills
 * 82% rendered more than twice the size of one filling 38%, for no reason
 * connected to the Pokémon. That is a ~2.1x error, against an intended species
 * range of only 0.7–1.4x, so padding was the dominant term and the real sizes
 * were noise on top of it.
 *
 * Sizing from the art instead makes the VISIBLE height the controlled
 * quantity, so these tests measure rendered art height rather than box size —
 * the box is now an implementation detail and testing it would re-assert the
 * bug.
 */

import { SPRITE_TRIM } from "../src/game/data/sprite-trim";
import { spriteBoxFor, TARGET_ART_HEIGHT } from "../src/game/ui/sprite-art";
import { relativeModelScale } from "../src/game/data/model-scale";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const CELL = 100;
/** The art height a dex actually renders at, in px, for a CELL-sized cell. */
function renderedArt(dex: number): number {
  const box = spriteBoxFor(dex, CELL, relativeModelScale(dex));
  const t = SPRITE_TRIM[dex] ?? [0, 0, 1, 1];
  return box * (t[3] - t[1]);
}

console.log("Sprite size ratio\n");

console.log("padding no longer decides how big a mon looks:");
{
  // Two species of near-identical real height but very different framing.
  const all = Object.keys(SPRITE_TRIM).map(Number);
  const tight = all.filter((d) => { const t = SPRITE_TRIM[d]; return t[3] - t[1] > 0.8; });
  const loose = all.filter((d) => { const t = SPRITE_TRIM[d]; return t[3] - t[1] < 0.4; });
  assert(tight.length > 0 && loose.length > 0,
    `the roster really does contain both framings (${tight.length} tight, ${loose.length} loose)`);

  // Compare like with like: same species scale, different padding.
  const pairs: Array<[number, number]> = [];
  for (const a of tight) {
    const b = loose.find((x) => Math.abs(relativeModelScale(x) - relativeModelScale(a)) < 0.01);
    if (b) pairs.push([a, b]);
    if (pairs.length >= 5) break;
  }
  assert(pairs.length > 0, "found species of equal scale but opposite framing to compare");
  for (const [a, b] of pairs.slice(0, 3)) {
    const ra = renderedArt(a), rb = renderedArt(b);
    // Within 10%, not exact: the MAX_BOX ceiling deliberately trims the most
    // extreme framings rather than inflating them over their neighbours. The
    // property that matters is that padding no longer causes a LARGE
    // difference — it used to cause a 2.1x one.
    assert(
      Math.abs(ra - rb) / Math.max(ra, rb) < 0.1,
      `dex ${a} and ${b} have the same scale, so they render near-identical art height (${ra.toFixed(1)} vs ${rb.toFixed(1)})`,
    );
  }
}

console.log("\nan average species lands on the target:");
{
  // relativeModelScale is 1 at the reference height.
  const ref = Object.keys(SPRITE_TRIM).map(Number).find((d) => Math.abs(relativeModelScale(d) - 1) < 0.01);
  assert(ref !== undefined, "the roster has a reference-height species");
  if (ref !== undefined) {
    const got = renderedArt(ref) / CELL;
    assert(Math.abs(got - TARGET_ART_HEIGHT) < 0.02,
      `it renders at the target fraction of the cell (${got.toFixed(2)} vs ${TARGET_ART_HEIGHT})`);
  }
}

console.log("\nsize now tracks the SPECIES, in the right direction:");
{
  // Charmander 0.6m → Charmeleon 1.1m → Charizard 1.7m.
  const line = [4, 5, 6].map(renderedArt);
  assert(line[0] < line[1] && line[1] < line[2],
    `an evolution line grows (${line.map((n) => n.toFixed(0)).join(" < ")})`);

  const rattata = renderedArt(19), snorlax = renderedArt(143);
  assert(rattata < snorlax, `a Rattata is smaller than a Snorlax (${rattata.toFixed(0)} vs ${snorlax.toFixed(0)})`);
}

console.log("\nnothing is allowed to cover its neighbours:");
{
  const all = Object.keys(SPRITE_TRIM).map(Number);
  const boxes = all.map((d) => spriteBoxFor(d, CELL, relativeModelScale(d)));
  const worst = Math.max(...boxes);
  assert(worst <= CELL * 3.2 + 0.01, `the largest sprite box is bounded (${(worst / CELL).toFixed(2)}x the cell)`);

  const arts = all.map(renderedArt).sort((a, b) => a - b);
  const smallest = arts[0] / CELL, largest = arts[arts.length - 1] / CELL;
  assert(largest <= 1.45, `the tallest rendered mon stays near one cell (${largest.toFixed(2)}x)`);
  assert(smallest >= 0.25, `and the smallest is still legible (${smallest.toFixed(2)}x)`);
  // The whole point: the spread should be the SPECIES range, not the padding range.
  assert(largest / smallest < 4, `total spread is species-sized, not padding-sized (${(largest / smallest).toFixed(1)}x)`);

  // The ceiling must not quietly reintroduce the bug it replaced: check the
  // worst shortfall it causes across the whole roster.
  let worstShortfall = 0;
  for (const d of all) {
    const want = CELL * TARGET_ART_HEIGHT * relativeModelScale(d);
    const got = renderedArt(d);
    if (got < want) worstShortfall = Math.max(worstShortfall, 1 - got / want);
  }
  assert(worstShortfall < 0.15,
    `the box ceiling costs at most ${(worstShortfall * 100).toFixed(1)}% of target height, far below the 2.1x padding error it replaced`);
}

console.log(
  failures === 0
    ? "\n✅ Apparent size tracks the species, not the sprite's padding"
    : `\n❌ ${failures} size-ratio assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
