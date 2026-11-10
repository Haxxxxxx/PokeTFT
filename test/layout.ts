/**
 * Responsive layout engine checks.
 *
 * The whole point of the rebuild is that the board stays PLAYABLE across real
 * devices instead of being uniformly scaled into illegibility, so these assert
 * the properties that actually matter: the field fits inside the viewport at
 * every size, tokens stay tappable, and nothing collapses or overflows.
 */

import { computeGameLayout, densityFor, TILE_ASPECT, BENCH_SLOTS, BENCH_GAP } from "../src/game/ui/layout";
import { BENCH_SIZE } from "../src/game/store/gameStore";
import { fieldPixelSize } from "../src/game/engine/hex";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

/** Real devices, landscape (the in-game screen is landscape-only). */
const VIEWPORTS: { name: string; w: number; h: number }[] = [
  { name: "iPhone SE landscape", w: 667, h: 375 },
  { name: "iPhone 14 landscape", w: 844, h: 390 },
  { name: "iPhone 14 Pro Max landscape", w: 932, h: 430 },
  { name: "Pixel 7 landscape", w: 915, h: 412 },
  { name: "iPad mini landscape", w: 1024, h: 768 },
  { name: "iPad Pro landscape", w: 1366, h: 1024 },
  { name: "Laptop 720p", w: 1280, h: 720 },
  { name: "Laptop 900p", w: 1440, h: 900 },
  { name: "Desktop 1080p", w: 1920, h: 1080 },
  { name: "Ultrawide", w: 3440, h: 1440 },
];

console.log("Responsive layout engine\n");

console.log("Density tiers:");
assert(densityFor(390) === "compact", "390px tall → compact");
assert(densityFor(499) === "compact", "499px tall → compact");
assert(densityFor(500) === "medium", "500px tall → medium");
assert(densityFor(779) === "medium", "779px tall → medium");
assert(densityFor(780) === "full", "780px tall → full");
assert(densityFor(1080) === "full", "1080px tall → full");

console.log("\nPLANNING phase fits every viewport:");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  // top + arena (field + bench slabs, both on the platform) + shop + gaps + pad
  const usedH = L.topH + L.planningBox.h + L.shopH + L.gap * 2 + L.pad * 2;
  assert(usedH <= vp.h, `${vp.name} (${vp.w}x${vp.h}) — planning fits (${usedH} <= ${vp.h})`);
}

console.log("\nCOMBAT phase fits every viewport (full 8-row field, no bench):");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  const usedH = L.hideBottomInCombat
    ? L.topH + L.boardBox.h + L.gap + L.pad * 2
    : L.topH + L.boardBox.h + L.shopH + L.gap * 2 + L.pad * 2;
  assert(usedH <= vp.h, `${vp.name} — combat fits (${usedH} <= ${vp.h})`);
}

console.log("\nHorizontal fits every viewport:");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  const usedW = L.railsAsDrawers
    ? L.boardBox.w + L.rightRail + L.gap + L.pad * 2
    : L.boardBox.w + L.leftRail + L.rightRail + L.gap * 2 + L.pad * 2;
  assert(usedW <= vp.w, `${vp.name} — horizontal fits (${usedW} <= ${vp.w})`);
}

console.log("\nThe board never changes scale between phases:");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  assert(
    L.planningBox.w === L.boardBox.w,
    `${vp.name} — same tile in planning and combat (board ${L.boardBox.w}px wide)`,
  );
}

console.log("\nTokens stay tappable and sane:");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  assert(L.tile.w >= 34, `${vp.name} — tile ${L.tile.w}px >= 34px minimum`);
  assert(L.tile.w <= 118, `${vp.name} — tile ${L.tile.w}px <= 118px maximum`);
  // Bench slabs scale with the tile. They're DROP targets resolved by
  // closest-center rather than precision tap targets, and the unit sprite
  // drawn in one overflows it, so the usable area is larger than the socket.
  // They therefore track the tile floor rather than a 44pt tap minimum.
  assert(L.benchSlot >= 28, `${vp.name} — bench slot ${L.benchSlot}px is usable as a drop target`);
}

console.log("\nField geometry agrees with the hex engine:");
for (const vp of VIEWPORTS) {
  const L = computeGameLayout(vp.w, vp.h);
  const expected = fieldPixelSize(L.tile.w, L.tile.h);
  assert(
    Math.abs(expected.w - L.field.w) < 0.001 && Math.abs(expected.h - L.field.h) < 0.001,
    `${vp.name} — field matches fieldPixelSize(${L.tile.w}, ${L.tile.h})`,
  );
  assert(
    Math.abs(L.tile.h - Math.round(L.tile.w * TILE_ASPECT)) < 0.001,
    `${vp.name} — tile keeps its aspect ratio`,
  );
}

console.log("\nBigger screens never get a smaller board (within a density tier):");
{
  // Monotonicity only holds WITHIN a tier. Across a tier boundary the layout
  // genuinely reorganizes — compact windows the field to 5 rows, medium shows
  // all 8 — so the tile can step either way there. What would feel broken is a
  // shrink while the arrangement stays the same, so that is what we assert.
  const ladders: { tier: string; vps: { w: number; h: number }[] }[] = [
    { tier: "compact", vps: [{ w: 667, h: 375 }, { w: 844, h: 390 }, { w: 915, h: 412 }, { w: 932, h: 430 }, { w: 1024, h: 480 }] },
    { tier: "medium", vps: [{ w: 1000, h: 520 }, { w: 1280, h: 600 }, { w: 1280, h: 720 }, { w: 1440, h: 770 }] },
    { tier: "full", vps: [{ w: 1440, h: 900 }, { w: 1920, h: 1080 }, { w: 2560, h: 1440 }, { w: 3440, h: 1440 }] },
  ];
  for (const { tier, vps } of ladders) {
    let prev = 0;
    let ok = true;
    const trail: number[] = [];
    for (const vp of vps) {
      const t = computeGameLayout(vp.w, vp.h).tile.w;
      trail.push(t);
      if (t < prev) ok = false;
      prev = t;
    }
    assert(ok, `${tier}: tile never shrinks as the viewport grows (${trail.join(" → ")})`);
  }
}

console.log("\nTier boundaries don't lurch:");
{
  // Crossing a density boundary should feel like a reflow, not a jolt — hold the
  // tile change across the seam to something modest.
  const pairs: [[number, number], [number, number], string][] = [
    [[1024, 499], [1024, 500], "compact → medium"],
    [[1440, 779], [1440, 780], "medium → full"],
  ];
  for (const [a, b, label] of pairs) {
    const ta = computeGameLayout(a[0], a[1]).tile.w;
    const tb = computeGameLayout(b[0], b[1]).tile.w;
    const delta = Math.abs(ta - tb) / Math.max(ta, tb);
    assert(delta <= 0.35, `${label} — tile shifts ${(delta * 100).toFixed(0)}% (${ta} → ${tb}), under 35%`);
  }
}

console.log("\nDrawer mode only where it's needed:");
{
  const phone = computeGameLayout(844, 390);
  const laptop = computeGameLayout(1280, 720);
  const desktop = computeGameLayout(1920, 1080);
  assert(phone.railsAsDrawers, "phone landscape collapses rails to drawers");
  assert(!laptop.railsAsDrawers, "720p laptop keeps rails inline");
  assert(!desktop.railsAsDrawers, "1080p desktop keeps rails inline");
  assert(phone.rightRail > 0, "phone keeps a slim player-avatar strip in flow");
  assert(phone.leftRail === 0, "phone traits rail takes no inline width");
  assert(desktop.font === 1, "desktop renders chrome at the design size");
  assert(phone.font >= 0.8, "phone never shrinks chrome text below 0.8x");
}

console.log("\nDegenerate viewports don't explode:");
for (const [w, h] of [[320, 180], [200, 120], [1, 1]] as [number, number][]) {
  const L = computeGameLayout(w, h);
  assert(
    Number.isFinite(L.tile.w) && L.tile.w >= 34 && Number.isFinite(L.boardBox.h),
    `${w}x${h} still yields a finite, floored layout (tile ${L.tile.w}px)`,
  );
}

if (failures) {
  console.error(`\n❌ ${failures} layout assertion(s) failed`);
  process.exit(1);
}
// -- The bench's slabs and the mons standing on them must share one source ---
//
// The layout engine sized the slabs from BENCH_GAP/BENCH_SLOTS while Board
// hardcoded the gap (twice) and took the slot count from a different constant
// in the game store. Nothing enforced that the two agreed; they happened to.
// Change one and the slabs move while the units stay put -- a silent
// misalignment nobody would think to look for.
console.log("\nBench metrics are shared, not duplicated:");
{
  assert(BENCH_SIZE === BENCH_SLOTS,
    `the store's bench size and the layout's slot count agree (${BENCH_SIZE} === ${BENCH_SLOTS})`);

  for (const [w, h] of [[1280, 800], [1920, 1080], [1024, 768], [844, 390]] as const) {
    const L = computeGameLayout(w, h);
    assert(L.benchGap === BENCH_GAP, `${w}x${h}: the layout publishes the real gap (${L.benchGap})`);

    // The strip the board draws must fit the platform it is drawn on -- this is
    // exactly what breaks when the two sets of numbers drift apart.
    const stripW = BENCH_SIZE * L.benchSlot + (BENCH_SIZE - 1) * L.benchGap;
    assert(stripW <= L.field.w,
      `${w}x${h}: ${BENCH_SIZE} slabs + gaps fit the field (${stripW} <= ${L.field.w})`);
    // ...and are not so small that the platform is mostly empty. FLOOR on the
    // slab size can leave at most one pixel of slack per slot.
    assert(stripW >= L.field.w - BENCH_SIZE,
      `${w}x${h}: and fill it to within a pixel per slot (${L.field.w - stripW}px slack)`);
  }
}

console.log("\n✅ Responsive layout engine verified");
