/**
 * An attack has to read as a strike, not as a teleport and back.
 *
 * Two things were wrong with the lunge:
 *
 *   REACH was a flat 13px on a board whose tile runs ~47px (phone landscape)
 *   to ~118px (desktop) — 28% of a tile on one and 11% on the other, so the
 *   same attack lurched on a small board and barely moved on a large one.
 *
 *   SHAPE was binary: full extension for the entire attack frame, then zero.
 *   A unit that is already extended when the frame opens has no moment of
 *   impact in it — there is nothing to see arrive. A CSS transition smoothed
 *   the edges, which turned it into a drift out and a drift back.
 *
 * The curve is what makes it a hit, so that is what these assert: where the
 * peak falls, that it starts and ends at rest, and that it is monotonic on the
 * way in — a step that stuttered mid-thrust would read as a flinch.
 */

import { computeGameLayout } from "../src/game/ui/layout";
import { combatFxMetrics, lungeCurve } from "../src/game/ui/combat-fx";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Lunge motion\n");

console.log("the strike starts and ends at rest:");
{
  assert(lungeCurve(0) === 0, "no displacement as the frame opens");
  assert(Math.abs(lungeCurve(1)) < 1e-9, "and none as it closes — the unit is back on its hex");
  assert(Math.abs(lungeCurve(0.5) - 1) < 1e-9, "with full reach at the midpoint, where the hit lands");
}

console.log("\nit drives in without stuttering:");
{
  let monotonic = true;
  for (let t = 0; t < 0.5; t += 0.02) {
    if (lungeCurve(t + 0.02) < lungeCurve(t) - 1e-9) monotonic = false;
  }
  assert(monotonic, "the approach rises steadily (a stutter would read as a flinch)");

  let recovers = true;
  for (let t = 0.5; t < 1; t += 0.02) {
    if (lungeCurve(t + 0.02) > lungeCurve(t) + 1e-9) recovers = false;
  }
  assert(recovers, "and the recovery falls steadily");
}

console.log("\nit is clamped, so a frame index out of range cannot fling a unit:");
{
  assert(lungeCurve(-1) === 0, "before the frame");
  assert(Math.abs(lungeCurve(2)) < 1e-9, "and after it");
}

console.log("\nreach scales with the board:");
{
  const tiles = [[844, 390], [1280, 800], [1920, 1080]].map(([w, h]) => computeGameLayout(w, h).tile.w);
  const ratios = tiles.map((t) => combatFxMetrics(t).lunge / t);
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert(spread < 0.01, `the step is a constant fraction of a tile (${ratios[0].toFixed(3)}x)`);

  // The bug it replaces, measured the same way.
  const old = tiles.map((t) => 13 / t);
  assert(Math.max(...old) / Math.min(...old) > 2,
    `a flat 13px swung ${(Math.max(...old) / Math.min(...old)).toFixed(1)}x across the same range`);

  // It must be a step, not a relocation: a unit that travels most of a tile
  // reads as having moved hex, which is a different thing entirely.
  for (const t of tiles) {
    const r = combatFxMetrics(t).lunge / t;
    assert(r > 0.05 && r < 0.3, `visible but still a step, not a move (${r.toFixed(2)} of a tile)`);
  }
}

console.log(
  failures === 0
    ? "\n✅ The strike peaks at impact and scales with the board"
    : `\n❌ ${failures} lunge assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
