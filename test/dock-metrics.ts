/**
 * The pension dock and the shop's controls must hold their proportions as the
 * board resizes.
 *
 * Both were pinned to fixed pixels while everything around them scaled. The
 * layout engine solves the board against the viewport and publishes a density
 * tier — the bench slot runs 35px on a phone in landscape to 94px on a desktop
 * — and the pension dock was a flat `w-[76px]` regardless. That makes it 2.17x
 * a bench slot on a phone and 0.81x on a desktop: a 2.7x swing in how large it
 * looks next to its own neighbours. The shop's control column was the same
 * flat 150px, and `font` was published but read by nothing.
 *
 * This is a hard class of bug to notice, because at whatever size the author
 * happens to be working, it looks right. So the test asserts the RATIO rather
 * than any pixel value — a fixed size passes a pixel assertion at one density
 * and fails the player at every other.
 *
 * The dock has since moved off the board and into the right rail, under the
 * trainers ladder, so its neighbour is the rail rather than the bench. The
 * measurement is the same measurement; only what it is taken against changed.
 */

import { computeGameLayout } from "../src/game/ui/layout";
import { pensionRailMetrics, shopControlMetrics } from "../src/game/ui/dock-metrics";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const VIEWPORTS = [[844, 390], [1024, 768], [1280, 800], [1920, 1080], [2560, 1440]] as const;

console.log("Dock + shop metrics\n");

console.log("the pension dock keeps its proportion to the rail it sits in:");
{
  // Measured against the CONTENT width, not the rail's outer width. Padding
  // has a 4px floor, and on the compact rail (48px) that floor binds -- it is
  // 8% of the rail there and 5% at full width, so an outer-width ratio drifts
  // by that difference and the assertion would be measuring the floor rather
  // than the thing it is meant to pin down. The floor is asserted separately
  // just below, which is the honest way to have both.
  const ratios: number[] = [];
  for (const [w, h] of VIEWPORTS) {
    const L = computeGameLayout(w, h);
    const M = pensionRailMetrics(L.rightRail, L.font);
    ratios.push(M.art / M.inner);
  }
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert(spread < 0.01,
    `its art well is a constant fraction of the dock's content width at every density (${ratios.map((r) => r.toFixed(3)).join(", ")})`);

  // And the padding never eats the panel: it is a floor on a narrow rail, not
  // a share of it that grows without limit.
  for (const [w, h] of VIEWPORTS) {
    const L = computeGameLayout(w, h);
    const M = pensionRailMetrics(L.rightRail, L.font);
    assert(M.pad >= 4 && M.pad * 2 < M.w * 0.25,
      `${w}x${h}: padding holds its 4px floor without eating the panel (${M.pad}px of ${M.w}px)`);
  }

  // The number the fix exists to kill: the old flat 76px, measured against the
  // bench slot it used to sit beside.
  const oldRatios = VIEWPORTS.map(([w, h]) => 76 / computeGameLayout(w, h).benchSlot);
  const oldSpread = Math.max(...oldRatios) - Math.min(...oldRatios);
  assert(oldSpread > 1,
    `whereas a fixed 76px swung by ${oldSpread.toFixed(2)}x across the same range`);
}

console.log("\nand stays legible at the smallest board:");
{
  const L = computeGameLayout(844, 390);
  const M = pensionRailMetrics(L.rightRail, L.font);
  assert(M.label >= 7, `the section label does not shrink below 7px (${M.label}px)`);
  assert(M.button >= 8, `nor does the collect button (${M.button}px)`);
  assert(M.preview > 0 && M.preview < M.w, "the sprite fits inside the dock");
  assert(M.art <= M.inner, "as does the art well, inside the panel's padding");
}

console.log("\nand its text does not become a headline on a wide rail:");
{
  // The ceiling half of the clamp. The rail grows to 214px on a desktop, and
  // type scaled linearly to that width reads as a heading inside what is meant
  // to be chrome -- the opposite failure from the one above, same cause.
  const L = computeGameLayout(2560, 1440);
  const M = pensionRailMetrics(L.rightRail, L.font);
  assert(M.label <= 13, `the section label is capped (${M.label}px)`);
  assert(M.body <= 15, `so is the mon name and countdown (${M.body}px)`);
  assert(M.button <= 16, `and the collect button (${M.button}px)`);
}

console.log("\nthe shop controls give space back on a small board:");
{
  const small = shopControlMetrics(computeGameLayout(844, 390).font);
  const large = shopControlMetrics(computeGameLayout(1920, 1080).font);
  assert(small.w < large.w, `the control column narrows on a phone (${small.w} < ${large.w})`);
  assert(small.gold < large.gold, `so does the gold readout (${small.gold} < ${large.gold})`);
  // It must give space back without collapsing — the controls still have to fit.
  assert(small.w >= 100, `but stays usable rather than collapsing (${small.w}px)`);
}

console.log("\nevery density produces sane numbers:");
{
  for (const [w, h] of VIEWPORTS) {
    const L = computeGameLayout(w, h);
    const M = pensionRailMetrics(L.rightRail, L.font);
    const ok = [M.w, M.art, M.preview, M.icon, M.label, M.body, M.button, M.pad, M.inner].every(
      (n) => Number.isFinite(n) && n > 0,
    );
    assert(ok, `${w}x${h}: all dock metrics are positive and finite (w=${M.w})`);
  }
}

console.log(
  failures === 0
    ? "\n✅ Both panels scale with the board instead of against it"
    : `\n❌ ${failures} dock-metric assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
