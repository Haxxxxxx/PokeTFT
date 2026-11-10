/**
 * Guards two silent sprite-rendering failures.
 *
 * 1. THE CLAMP. Units are meant to be drawn at up to 1.85x their tile and
 *    overflow it, standing in their hex. They were not. Tailwind's Preflight
 *    sets `img { max-width: 100% }`, which clamped every unit sprite to its
 *    container — measured live, a combat sprite asking for 192px rendered at
 *    108px, exactly its cell width. Nothing errored; the mons were simply
 *    smaller than designed, and every offset derived from the intended size
 *    (star badges, HP bars) was computed from a number the browser had thrown
 *    away. `max-width: none` is therefore load-bearing, and its absence is
 *    invisible in code review.
 *
 * 2. THE PADDING. Sprite frames are mostly transparent. Anchoring UI to the
 *    sprite's BOX rather than its ART puts it a different distance from the mon
 *    for every species.
 *
 * Both are checked at the source level, in the spirit of test/db-adapter.ts:
 * reproducing them needs a browser, a running match and a real layout pass,
 * while the failure mode is purely visual and silent.
 */

import { readFileSync } from "node:fs";
import { SPRITE_TRIM } from "../src/game/data/sprite-trim";
import { spriteArt } from "../src/game/ui/sprite-art";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

console.log("Sprite rendering\n");

console.log("unit sprites are not clamped by Preflight:");
{
  for (const file of [
    "src/components/game/UnitChip.tsx",
    "src/components/game/CombatStage.tsx",
  ]) {
    assert(
      /maxWidth:\s*"none"/.test(read(file)),
      `${file} sets maxWidth:"none" so the oversized sprite actually renders`,
    );
  }
}

console.log("\nUI is anchored to the ART, not the sprite box:");
{
  for (const file of [
    "src/components/game/UnitChip.tsx",
    "src/components/game/CombatStage.tsx",
  ]) {
    assert(read(file).includes("spriteArt("), `${file} positions from spriteArt()`);
  }
}

console.log("\nthe trim table is real data, not placeholders:");
{
  const entries = Object.entries(SPRITE_TRIM);
  assert(entries.length > 1000, `covers the roster (${entries.length} sprites)`);

  const bad = entries.filter(([, v]) => !(v[0] < v[2] && v[1] < v[3]));
  assert(bad.length === 0, "every box is well-formed (x0<x1, y0<y1)");

  const outOfRange = entries.filter(([, v]) => v.some((n) => n < 0 || n > 1));
  assert(outOfRange.length === 0, "every bound is a fraction inside [0,1]");

  // If this were all zeros the table would be useless but still "valid".
  const tops = entries.map(([, v]) => v[1]);
  const mean = tops.reduce((a, b) => a + b, 0) / tops.length;
  assert(mean > 0.05, `sprites really do carry top padding (mean ${mean.toFixed(3)})`);
  assert(
    Math.max(...tops) - Math.min(...tops) > 0.2,
    "and it varies enough per species that one fixed offset cannot serve them all",
  );
}

console.log("\nspriteArt() converts that into usable offsets:");
{
  const a = spriteArt(1, 200);
  assert(a.top > 0 && a.top < 200, "art top is inside the frame");
  assert(a.height > 0 && a.height <= 200, "art height is positive and bounded");
  // An unknown dex must degrade to the whole frame rather than to zero, or a
  // missing entry would collapse a badge onto the mon.
  const miss = spriteArt(999999, 200);
  assert(miss.top === 0 && miss.height === 200, "an unknown dex falls back to the full frame");
}

console.log(
  failures === 0
    ? "\n✅ Sprites render at full size and UI anchors to the art"
    : `\n❌ ${failures} sprite-render assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
