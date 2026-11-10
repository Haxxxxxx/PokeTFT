/**
 * Pension (Day Care) lifecycle.
 *
 * A matured mon used to come home ONLY when the player clicked Collect, and if
 * the bench happened to be full that click did nothing but raise a "Bench full"
 * toast. The pension then stayed occupied for the rest of the match with no
 * indication anything was wrong — the mon was neither returned, nor sold, nor
 * recoverable, and a whole mechanic silently left the game.
 *
 * So what is worth testing is the lifecycle, not the arithmetic:
 *   - a matured mon returns on its own when there is room;
 *   - when there is NOT room it is held, and the player is told how long they
 *     have;
 *   - the hold is BOUNDED — after PENSION_OVERDUE_LIMIT further rounds the mon
 *     is sold, the gold is paid, and the slot is freed;
 *   - and pool scarcity stays honest through all three paths, since a mon that
 *     is returned, held or sold must never mint or destroy copies.
 */

import {
  useGame,
  BENCH_SIZE,
  PENSION_ROUNDS,
  PENSION_OVERDUE_LIMIT,
} from "../src/game/store/gameStore";
import { makeInstance } from "../src/game/engine/combine";
import { sellValue } from "../src/game/engine/economy";
import type { UnitInstance } from "../src/game/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const DEPOSITED = "pikachu";

/** Fill the bench with `n` mons that cannot combine with the pension species. */
function benchFillers(n: number): UnitInstance[] {
  // Distinct species, one copy each, so applyCombines cannot merge them away and
  // shrink the bench behind the test's back.
  const fillers = ["bulbasaur", "charmander", "squirtle", "caterpie", "weedle",
                   "pidgey", "rattata", "spearow", "ekans", "sandshrew"];
  return fillers.slice(0, n).map((id) => ({ ...makeInstance(id), pos: null }));
}

/** A fresh game with a pension holding a mon that matures on the next round. */
function withMaturingPension(benchCount: number) {
  useGame.getState().newGame();
  useGame.setState({
    units: benchFillers(benchCount),
    gold: 0,
    // roundsLeft 1 → the next netRound ticks it to 0, i.e. it matures now.
    pension: { defId: DEPOSITED, star: 1, roundsLeft: 1 },
  });
}

function advance(round = 2) {
  useGame.getState().netRound(1, round, 0, false, undefined);
}

console.log("Pension lifecycle\n");

console.log(`a matured mon comes home by itself (bench has room):`);
{
  withMaturingPension(0);
  const poolBefore = { ...useGame.getState().pool };
  advance();
  const s = useGame.getState();
  assert(s.pension === null, "the pension slot is freed");
  const back = s.units.filter((u) => u.defId === DEPOSITED);
  assert(back.length > 0, "the mon is on the bench without anyone clicking Collect");
  // Deposited mon + its bred copy, which may have combined into a 2★.
  const copies = back.reduce((n, u) => n + (u.star === 1 ? 1 : u.star === 2 ? 3 : 9), 0);
  assert(copies === 2, "it comes back with exactly one bred copy (2 copies of the species)");
  assert(
    poolBefore[DEPOSITED] !== undefined ? s.pool[DEPOSITED] === poolBefore[DEPOSITED] - 1 : true,
    "only the NEW copy is drawn from the pool",
  );
}

console.log(`\na full bench holds the mon instead of losing it:`);
{
  withMaturingPension(BENCH_SIZE);
  advance();
  const s = useGame.getState();
  assert(s.pension !== null, "the mon is still in the pension, not discarded");
  assert(s.pension?.roundsLeft === 0, "it is matured and ready to collect");
  assert((s.pension?.overdue ?? 0) === 1, "and the overdue counter has started, so the UI can warn");
}

console.log(`\nthe hold is bounded — it does not occupy the pension forever:`);
{
  withMaturingPension(BENCH_SIZE);
  const goldBefore = useGame.getState().gold;
  advance(2); // matures, bench full → overdue 1
  for (let i = 0; i < PENSION_OVERDUE_LIMIT; i++) advance(3 + i);
  const s = useGame.getState();
  assert(s.pension === null, `the slot is freed after ${PENSION_OVERDUE_LIMIT} further rounds`);
  const paid = s.gold - goldBefore;
  assert(paid >= sellValue(DEPOSITED, 1), "the player is paid the sell value, not robbed");
  assert(
    s.units.filter((u) => u.defId === DEPOSITED).length === 0,
    "and the mon is gone rather than silently duplicated onto a full bench",
  );
}

console.log(`\nmaking room before the deadline still gets the mon back:`);
{
  withMaturingPension(BENCH_SIZE);
  advance(2); // held, overdue 1
  assert(useGame.getState().pension !== null, "held, as set up");
  // The player sells something to make space, then collects.
  useGame.setState({ units: benchFillers(BENCH_SIZE - 2) });
  useGame.getState().collectPension();
  const s = useGame.getState();
  assert(s.pension === null, "the pension is emptied by the manual collect");
  assert(s.units.some((u) => u.defId === DEPOSITED), "and the mon is on the bench");
}

console.log(`\na mon still training is left alone:`);
{
  useGame.getState().newGame();
  useGame.setState({ units: [], pension: { defId: DEPOSITED, star: 1, roundsLeft: PENSION_ROUNDS } });
  advance();
  const s = useGame.getState();
  assert(s.pension?.roundsLeft === PENSION_ROUNDS - 1, "it just ticks one round closer");
  assert((s.pension?.overdue ?? 0) === 0, "and is not treated as overdue");
  assert(!s.units.some((u) => u.defId === DEPOSITED), "it has not come home early");
}

console.log(
  failures === 0
    ? "\n✅ Pension lifecycle verified"
    : `\n❌ ${failures} pension assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
