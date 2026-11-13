/**
 * The opening draft replaces the free starter; it does not add a second one.
 *
 * newGame already auto-places one free cost-1 mon on the front row, so the
 * opening PvE round is never an empty board. The draft exists to make that mon
 * a CHOICE. Writing it as "add the picked mon" instead would hand every player
 * two free units and silently double the opening tempo of the whole game —
 * uniform across players, so nothing would look wrong, and the only symptom
 * would be that the early rounds stopped mattering.
 *
 * The other two ways this corrupts a match quietly:
 *
 *   - Not debiting the shared pool. Copies are finite and that scarcity is
 *     what makes three-starring a decision. A starter that skips the debit
 *     inflates everyone's odds on that mon for the rest of the game.
 *   - Not returning the replaced mon's copy, which leaks a copy of a unit
 *     nobody ends up owning.
 *
 * Plus the once-only latch, which has to live in the store: a double click or
 * a re-render landing between click and write both reach it before any gate
 * upstream has re-evaluated.
 */

import { useGame } from "../src/game/store/gameStore";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const g = () => useGame.getState();
const poolOf = (defId: string) => (g().pool as Record<string, number>)[defId] ?? 0;
/** A pickable id that is NOT the one newGame happened to seed. */
const otherThan = (defId: string) => Object.keys(g().pool).find((id) => id !== defId)!;

console.log("Opening draft\n");

console.log("a fresh game seeds one free starter, undrafted:");
{
  g().newGame();
  assert(g().drafted === false, "drafted starts false");
  assert(g().units.length === 1, `one auto-starter is placed (${g().units.length})`);
  assert(g().autoStarterIid === g().units[0]?.iid, "and it is tracked, so the draft can replace it");
  assert(g().units[0]?.pos !== null, "on the board, not the bench");
}

console.log("\ndrafting REPLACES that starter rather than adding to it:");
{
  g().newGame();
  const auto = g().units[0]!;
  const autoPos = auto.pos;
  const pick = otherThan(auto.defId);
  const autoBefore = poolOf(auto.defId);
  const pickBefore = poolOf(pick);

  g().draftPick(pick);

  assert(g().units.length === 1, `still exactly one free mon (${g().units.length})`);
  assert(g().units[0]?.defId === pick, "and it is the drafted one");
  assert(JSON.stringify(g().units[0]?.pos) === JSON.stringify(autoPos),
    "standing where the auto-starter stood, so the board still opens occupied");
  assert(poolOf(pick) === pickBefore - 1,
    `the chosen mon is debited from the shared pool (${pickBefore} → ${poolOf(pick)})`);
  assert(poolOf(auto.defId) === autoBefore + 1,
    `and the replaced mon's copy goes BACK (${autoBefore} → ${poolOf(auto.defId)})`);
  assert(g().drafted === true, "the draft latches as taken");
  assert(g().autoStarterIid === null, "and the auto-starter is no longer tracked");
  assert(g().gold === 4, `it is free — gold untouched (${g().gold})`);
}

console.log("\nit cannot be taken twice:");
{
  g().newGame();
  const a = otherThan(g().units[0]!.defId);
  g().draftPick(a);
  const b = otherThan(a);
  const poolB = poolOf(b);
  g().draftPick(b); // the double-click case
  assert(g().units.length === 1, `a second pick is refused (${g().units.length} unit)`);
  assert(g().units[0]?.defId === a, "the first pick stands");
  assert(poolOf(b) === poolB, "and nothing is debited for a mon never given");
}

console.log("\nan unknown mon is refused rather than becoming a phantom:");
{
  // getDef never returns undefined — it hands back a placeholderDef — so the
  // guard has to be hasDef. With getDef this added a unit with no real stats.
  g().newGame();
  const before = g().units.length;
  g().draftPick("not-a-real-mon");
  assert(g().units.length === before, `no phantom unit is created (${g().units.length})`);
  assert(g().drafted === false, "and the draft is NOT burned — the player still gets their pick");
}

console.log("\nit survives the save round-trip:");
{
  g().newGame();
  g().draftPick(otherThan(g().units[0]!.defId));
  const save = g().exportSave();
  assert(save.drafted === true, "the save carries the latch");

  // RTDB strips `false`, so a save written before anyone drafted comes back
  // with the field missing — that must read as "not yet", or a reconnecting
  // player silently loses their pick.
  g().newGame();
  g().importSave({ ...save, drafted: undefined });
  assert(g().drafted === false, "a missing flag means not yet drafted");

  g().newGame();
  g().importSave(save);
  assert(g().drafted === true, "and a true flag is restored, so no second pick");
}

console.log(
  failures === 0
    ? "\n✅ The draft makes the free starter a choice — one mon, costed against the pool, given once"
    : `\n❌ ${failures} draft assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
