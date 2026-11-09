/**
 * Ability-area checks.
 *
 * `abilityCells` is now the single source of truth for BOTH damage resolution
 * and the renderer's area indicator. That's the whole point of it — an
 * indicator that lights hexes the ability doesn't actually hit teaches the
 * player something false, which is worse than having no indicator.
 *
 * So the thing worth testing is the contract itself: that each shape covers
 * exactly the cells it should, and that nothing silently widens or narrows it.
 */

import { abilityCells } from "../src/game/engine/combat";
import { FIELD, neighbors, hexKey } from "../src/game/engine/hex";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const key = hexKey;
const mid = { c: 3, r: 4 };
const corner = { c: 0, r: 0 };

console.log("Ability areas\n");

console.log("single:");
{
  const cells = abilityCells(mid, "single");
  assert(cells.length === 1, "covers exactly one cell");
  assert(key(cells[0]) === key(mid), "and it is the target");
}

console.log("\nsplash:");
{
  const cells = abilityCells(mid, "splash");
  const set = new Set(cells.map(key));
  assert(set.has(key(mid)), "includes the target itself");
  const ring = neighbors(mid);
  assert(ring.every((n) => set.has(key(n))), `includes all ${ring.length} neighbours`);
  assert(set.size === ring.length + 1, "and nothing beyond the ring");

  // At a corner the ring is clipped by the board, so the area must shrink
  // rather than spill off-grid.
  const cCells = abilityCells(corner, "splash");
  const cSet = new Set(cCells.map(key));
  assert(cSet.size === neighbors(corner).length + 1, "clips at the board edge instead of spilling");
  assert(
    cCells.every((x) => x.c >= 0 && x.c < FIELD.cols && x.r >= 0 && x.r < FIELD.rows),
    "every cell stays on the board",
  );
}

console.log("\nline:");
{
  const cells = abilityCells(mid, "line");
  assert(cells.length === FIELD.rows, `covers the full column (${FIELD.rows} rows)`);
  assert(cells.every((x) => x.c === mid.c), "every cell shares the target's column");
  assert(new Set(cells.map((x) => x.r)).size === FIELD.rows, "one cell per row, no duplicates");
  assert(new Set(cells.map(key)).has(key(mid)), "includes the target");
}

console.log("\nEvery shape stays on the board, from every cell:");
{
  let ok = true;
  let widest = 0;
  for (const shape of ["single", "splash", "line"] as const) {
    for (let r = 0; r < FIELD.rows; r++) {
      for (let c = 0; c < FIELD.cols; c++) {
        const cells = abilityCells({ c, r }, shape);
        widest = Math.max(widest, cells.length);
        if (cells.some((x) => x.c < 0 || x.c >= FIELD.cols || x.r < 0 || x.r >= FIELD.rows)) ok = false;
        if (new Set(cells.map(key)).size !== cells.length) ok = false; // no dupes
      }
    }
  }
  assert(ok, "no off-board or duplicated cells anywhere on the grid");
  assert(widest <= FIELD.rows, `widest area is ${widest} cells — bounded, so an indicator can't flood the board`);
}

if (failures) {
  console.error(`\n❌ ${failures} ability-area assertion(s) failed`);
  process.exit(1);
}
console.log("\n✅ Ability areas verified");
