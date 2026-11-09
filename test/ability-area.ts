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

import { abilityCells, simulate } from "../src/game/engine/combat";
import { FIELD, neighbors, hexKey } from "../src/game/engine/hex";
import { UNITS, castEffectOf } from "../src/game/data/mons";
import type { UnitInstance } from "../src/game/types";

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

console.log("\nA blast cast reports itself as a blast:");
{
  /*
   * castAbility() checks castEffect === "blast" BEFORE it ever looks at the
   * move's shape, and that branch hits EVERY living enemy on the board. The
   * cast event used to carry the move's nominal shape regardless, so a blast
   * caster with a "single" move told the renderer to light one hex while the
   * engine nuked the whole enemy side. The event has to name the branch that
   * actually ran, or the indicator is lying about real damage.
   */
  const blasters = UNITS.filter((u) => castEffectOf(u) === "blast");
  assert(blasters.length > 0, `roster has blast casters to test (${blasters.length})`);

  const mk = (defId: string, iid: string, pos: [number, number]): UnitInstance =>
    ({ iid, defId, star: 1, pos, items: [] }) as UnitInstance;

  // Combatant ids are `${team}-${iid}`, so sides are told apart by that prefix.
  const isAlly = (id: string) => id.startsWith("ally-");

  // Three blasters a side-width apart vs three non-blast foes: enough bodies that
  // the casters live to reach full mana, and spread enough that a shape-based
  // indicator would visibly disagree with who actually takes damage.
  const blaster = blasters[0];
  const foe = UNITS.find((u) => castEffectOf(u) !== "blast")!;
  const allies = [mk(blaster.id, "A1", [1, 3]), mk(blaster.id, "A2", [3, 3]), mk(blaster.id, "A3", [5, 3])];
  const enemies = [mk(foe.id, "E1", [1, 0]), mk(foe.id, "E2", [5, 0]), mk(foe.id, "E3", [3, 1])];

  const res = simulate(allies, enemies);
  const casts = res.frames.flatMap((f) => f.events).filter((e) => e.kind === "cast");
  const mine = casts.filter((e) => e.kind === "cast" && isAlly(e.from));
  const theirs = casts.filter((e) => e.kind === "cast" && !isAlly(e.from));

  assert(mine.length > 0, `the blast casters actually cast during the fight (${mine.length}x)`);
  assert(
    mine.every((e) => e.kind === "cast" && e.shape === "blast"),
    "every cast from a blast caster carries shape 'blast', not the move's nominal shape",
  );

  // And the converse: non-blast casters must NOT claim to be blasts, or the
  // renderer would light the whole enemy team for a single-target hit.
  assert(theirs.length > 0, `the non-blast side also cast, so the converse is really exercised (${theirs.length}x)`);
  assert(
    theirs.every((e) => e.kind === "cast" && e.shape !== "blast"),
    "non-blast casters never report 'blast'",
  );
}

if (failures) {
  console.error(`\n❌ ${failures} ability-area assertion(s) failed`);
  process.exit(1);
}
console.log("\n✅ Ability areas verified");
