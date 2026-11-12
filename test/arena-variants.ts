/**
 * The arena reads the board. That makes it a derived value, and derived values
 * flicker.
 *
 * The board re-renders on every unit placement, every gold tick and every
 * phase change. If resolving the arena were order-dependent — or if two
 * equally-strong synergies could resolve differently on two passes — the
 * platform would change colour underneath the player while they were doing
 * something unrelated. That is the failure mode worth testing, and it is not
 * one a screenshot can show: a screenshot of a flickering arena looks correct.
 *
 * So: determinism, order-independence, that only ACTIVE synergies count, and
 * that benched mons are ignored.
 */

import { UNITS } from "../src/game/data/mons";
import { makeInstance } from "../src/game/engine/combine";
import { arenaVariantFor, resolveArena, ARENA_EFFECT, NEUTRAL_ARENA, variantForType } from "../src/game/ui/arena-variants";
import { TYPE_COLOR } from "../src/game/ui";
import type { PokeType, UnitInstance } from "../src/game/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

/** Put a mon on the board (pos !== null) or on the bench (pos === null). */
const at = (defId: string, pos: number | null): UnitInstance =>
  ({ ...makeInstance(defId), pos }) as UnitInstance;

/** N distinct defs of a given primary type, so a synergy can actually reach
 *  its breakpoint — computeTraits counts distinct DEFS, not bodies. */
function defsOfType(type: PokeType, n: number): string[] {
  return UNITS.filter((d) => d.types[0] === type).slice(0, n).map((d) => d.id);
}

console.log("Arena variants\n");

console.log("every type has a theme and an effect:");
{
  const types = Object.keys(ARENA_EFFECT) as PokeType[];
  assert(types.length === 18, `all eighteen types are mapped (${types.length})`);
  const missingColor = types.filter((t) => !TYPE_COLOR[t]);
  assert(missingColor.length === 0, `each has a palette from TYPE_COLOR (${missingColor.length} missing)`);
  const bad = types.filter((t) => variantForType(t).accent === NEUTRAL_ARENA.accent && TYPE_COLOR[t] !== NEUTRAL_ARENA.accent);
  assert(bad.length === 0, "and the accent actually comes from that table");
  // The vocabulary is meant to be small and shared, not one effect per type.
  const kinds = new Set(types.map((t) => ARENA_EFFECT[t]));
  assert(kinds.size >= 6 && kinds.size <= 12,
    `the effect vocabulary stays small and shared (${kinds.size} kinds for 18 types)`);
}

console.log("\nan empty or benched board stays neutral:");
{
  assert(arenaVariantFor([]).key === "neutral", "nothing on the board → the original arena");
  const benched = defsOfType("fire", 6).map((id) => at(id, null));
  assert(arenaVariantFor(benched).key === "neutral",
    "a bench full of Fire does not set the arena alight — only the BOARD counts");
}

console.log("\none stray mon does not theme the arena:");
{
  const fire = defsOfType("fire", 1).map((id, i) => at(id, i));
  assert(fire.length === 1 && arenaVariantFor(fire).key === "neutral",
    "a single Fire mon is below the synergy's breakpoint, so the arena ignores it");
}

console.log("\na committed board does theme it:");
{
  const ids = defsOfType("fire", 6);
  const board = ids.map((id, i) => at(id, i));
  const v = arenaVariantFor(board);
  assert(v.type === "fire", `six Fire defs give the Fire arena (got ${v.key})`);
  assert(v.effect === ARENA_EFFECT.fire, `with its mapped effect (${v.effect})`);
  assert(v.accent === TYPE_COLOR.fire, "tinted with the Fire colour the rest of the UI uses");
}

console.log("\nit does not flicker:");
{
  const board = defsOfType("water", 6).map((id, i) => at(id, i));
  const a = arenaVariantFor(board).key;
  const b = arenaVariantFor(board).key;
  assert(a === b, `the same board resolves the same way twice (${a})`);

  // Order-independence is the real guard: the board array's order changes as
  // units are placed, sold and re-placed, and none of that should repaint the
  // arena.
  const shuffled = [...board].reverse();
  assert(arenaVariantFor(shuffled).key === a,
    "and reversing the board array changes nothing");

  // A genuine tie between two synergies must still be stable, not coin-flipped.
  const tie = [...defsOfType("fire", 4), ...defsOfType("water", 4)].map((id, i) => at(id, i));
  const t1 = arenaVariantFor(tie).key;
  const t2 = arenaVariantFor([...tie].reverse()).key;
  assert(t1 === t2, `a tie between two synergies resolves identically either way (${t1})`);
}

console.log("\nthe player's setting wins:");
{
  const fireBoard = defsOfType("fire", 6).map((id, i) => at(id, i));
  assert(resolveArena(fireBoard, "auto").type === "fire", "'auto' follows the board");
  assert(resolveArena(fireBoard, undefined).type === "fire", "as does an unset preference");
  assert(resolveArena(fireBoard, "ice").type === "ice",
    "a pinned type overrides the board, so the arena stops changing under you");
  assert(resolveArena(fireBoard, "neutral").key === "neutral", "and 'neutral' pins the original");
  assert(resolveArena(fireBoard, "not-a-type").type === "fire",
    "an unknown pin falls back to the board rather than blanking the arena");
}

console.log(
  failures === 0
    ? "\n✅ The arena follows the board, stably, and the player can overrule it"
    : `\n❌ ${failures} arena assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
