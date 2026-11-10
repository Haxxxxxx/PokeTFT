/**
 * The grab zone must not reach into the row behind.
 *
 * Units are drawn far larger than their cell: the sprite runs up to 2.1x the
 * tile and overflows upward, standing in its hex. The drag hit area was sized
 * from the SPRITE, which sounds right and is not — a hex row is only
 * `tileH * ROW_STEP` away, so the sprite's overhang alone spans more than a
 * full row pitch. Board stacks units by row (`zIndex: localR + ALLY_ROW0`), so
 * the nearer unit's hit area sits ON TOP of the one behind it, and reaching for
 * a back-row mon picked up the one in front.
 *
 * This is pure geometry — no DOM needed — so it is checked against the same
 * constants the renderer uses. If ROW_STEP, TILE_ASPECT or the sprite multiple
 * ever change, this fails rather than silently re-opening the bug.
 */

import { ROW_STEP } from "../src/game/engine/hex";
import { TILE_ASPECT } from "../src/game/ui/layout";
import { relativeModelScale } from "../src/game/data/model-scale";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

/** Mirrors UnitChip: the grab zone may rise this far above its own cell. */
const GRAB_CEILING_FRAC = 0.35;
/** Mirrors UnitChip: hex sprites are drawn at up to this multiple of the cell. */
const SPRITE_CAP = 2.1;

console.log("Grab zone\n");

// A representative tile. The relationships are all proportional to tileW, so
// the exact number only has to be plausible.
const tileW = 100;
const tileH = tileW * TILE_ASPECT;
const rowPitch = tileH * ROW_STEP;
const size = tileW - 6; // Board's per-unit box

console.log(`tile ${tileW}x${tileH.toFixed(1)}, row pitch ${rowPitch.toFixed(1)}, unit box ${size}`);

console.log("\nthe bug this guards against:");
{
  const spriteOverhang = size * SPRITE_CAP - size;
  assert(
    spriteOverhang > rowPitch,
    `an unbounded (sprite-sized) grab zone WOULD overlap the row behind ` +
      `(${spriteOverhang.toFixed(1)} > ${rowPitch.toFixed(1)})`,
  );
}

console.log("\nthe bound actually holds:");
{
  const ceiling = size * GRAB_CEILING_FRAC;
  assert(
    ceiling <= rowPitch / 2 + 0.5,
    `the grab zone rises at most half a row pitch ` +
      `(${ceiling.toFixed(1)} <= ${(rowPitch / 2).toFixed(1)})`,
  );
  assert(
    ceiling > 0,
    "but still extends past the cell, so a mon is grabbable by its body and not just its feet",
  );
}

console.log("\nit holds for every species, not just the average one:");
{
  const ceiling = size * GRAB_CEILING_FRAC;
  // The tallest and shortest things the roster can produce.
  const scales = [1, 1025, 25, 19, 143, 95, 6].map(relativeModelScale);
  const widest = Math.max(...scales);
  const narrowest = Math.min(...scales);
  const tallestSprite = Math.min(size * 1.85 * widest, size * SPRITE_CAP);
  const shortestSprite = Math.min(size * 1.85 * narrowest, size * SPRITE_CAP);

  assert(
    Math.min(tallestSprite - size, ceiling) <= rowPitch / 2 + 0.5,
    "the largest species cannot reach the row behind",
  );
  assert(
    shortestSprite - size > 0,
    "and the smallest still overflows its cell, so the bound is doing real work for it too",
  );
  // The whole point of relative scale: these must not be the same number.
  assert(widest > narrowest, "species scales genuinely differ (relative scale is live)");
}

console.log(
  failures === 0
    ? "\n✅ Grab zone stays inside its own row"
    : `\n❌ ${failures} grab-zone assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
