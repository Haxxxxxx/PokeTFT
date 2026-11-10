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
 */

import { computeGameLayout } from "../src/game/ui/layout";
import { pensionDockMetrics, shopControlMetrics } from "../src/game/ui/dock-metrics";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const VIEWPORTS = [[844, 390], [1024, 768], [1280, 800], [1920, 1080], [2560, 1440]] as const;

console.log("Dock + shop metrics\n");

console.log("the pension dock keeps its proportion to the bench:");
{
  const ratios: number[] = [];
  for (const [w, h] of VIEWPORTS) {
    const L = computeGameLayout(w, h);
    const M = pensionDockMetrics(L.benchSlot, L.font);
    ratios.push(M.w / L.benchSlot);
  }
  const spread = Math.max(...ratios) - Math.min(...ratios);
  assert(spread < 0.01,
    `its width is a constant multiple of the bench slot across every density (${ratios.map((r) => r.toFixed(2)).join(", ")})`);

  // The number the fix exists to kill: the old flat 76px, measured the same way.
  const oldRatios = VIEWPORTS.map(([w, h]) => 76 / computeGameLayout(w, h).benchSlot);
  const oldSpread = Math.max(...oldRatios) - Math.min(...oldRatios);
  assert(oldSpread > 1,
    `whereas a fixed 76px swung by ${oldSpread.toFixed(2)}x across the same range`);
}

console.log("\nand stays legible at the smallest board:");
{
  const L = computeGameLayout(844, 390);
  const M = pensionDockMetrics(L.benchSlot, L.font);
  assert(M.label >= 7, `the section label does not shrink below 7px (${M.label}px)`);
  assert(M.button >= 8, `nor does the collect button (${M.button}px)`);
  assert(M.preview > 0 && M.preview < M.w, "the sprite fits inside the dock");
  assert(M.art <= M.w, "as does the art well");
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
    const M = pensionDockMetrics(L.benchSlot, L.font);
    const ok = [M.w, M.art, M.preview, M.icon, M.label, M.button, M.inset].every(
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
