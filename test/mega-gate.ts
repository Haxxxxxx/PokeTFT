/**
 * The bots must play by the same Mega Stone rule as the player.
 *
 * The rule was written out at three call sites and one of them disagreed. The
 * player's UI and the equip action both required a mega-capable mon at its
 * FINAL form (3 stars). The bot drafter checked only canMega() and happily
 * stoned 1- and 2-star mons — so the AI was fielding Mega evolutions the
 * player was forbidden to build.
 *
 * That is the worst shape of imbalance: invisible from the player's side, and
 * when it is noticed it looks like the game cheating. So the test is not
 * "canHoldMegaStone returns false for 2 stars" — it is that the BOT DRAFTER's
 * output obeys it, because the drafter is where the rule actually broke.
 */

import { canMega, canHoldMegaStone, MEGA_STONE } from "../src/game/data/mega";
import { generatePlayerLikeBoard } from "../src/game/engine/enemy";
import { UNITS } from "../src/game/data/mons";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Mega Stone gate\n");

console.log("the rule itself:");
{
  const capable = (UNITS as Array<{ id: string }>).find((u) => canMega(u.id));
  assert(capable !== undefined, "the roster has a mega-capable species to test with");
  if (capable) {
    assert(!canHoldMegaStone(capable.id, 1), "a 1★ mega-capable mon cannot hold a stone");
    assert(!canHoldMegaStone(capable.id, 2), "nor a 2★ one");
    assert(canHoldMegaStone(capable.id, 3), "a 3★ one can");
  }
  const incapable = (UNITS as Array<{ id: string }>).find((u) => !canMega(u.id));
  if (incapable) assert(!canHoldMegaStone(incapable.id, 3), "and a non-mega species cannot, at any star");
}

console.log("\nthe bots obey it — across difficulties, stages and seeds:");
{
  let boards = 0;
  let stonesSeen = 0;
  const offenders: string[] = [];
  for (const difficulty of ["medium", "hard", "expert", "ultimate"] as const) {
    for (let stage = 3; stage <= 9; stage++) {
      for (let seed = 0; seed < 6; seed++) {
        // Also exercise the Mega Madness brain, which is the path that stones
        // EVERY capable mon rather than just the carry — the wider of the two.
        const board = generatePlayerLikeBoard(
          stage, 5, difficulty, stage * 1000 + seed * 31,
          undefined, undefined, undefined,
          seed % 2 === 0 ? { preferMega: true } : undefined,
        );
        boards++;
        for (const u of board) {
          if ((u.items ?? []).includes(MEGA_STONE)) stonesSeen++;
          if ((u.items ?? []).includes(MEGA_STONE) && !canHoldMegaStone(u.defId, u.star)) {
            offenders.push(`${difficulty} s${stage}: ${u.defId} ${u.star}★`);
          }
        }
      }
    }
  }
  assert(boards > 100, `generated ${boards} bot boards to check`);
  // Without this the suite would pass if bots simply never equipped a stone,
  // which proves nothing at all about the rule.
  assert(stonesSeen > 0, `and they actually hold ${stonesSeen} stones, so the check is not vacuous`);
  assert(
    offenders.length === 0,
    offenders.length === 0
      ? "no bot ever holds a stone it would be refused"
      : `${offenders.length} illegal stones, e.g. ${offenders.slice(0, 3).join(", ")}`,
  );
}

console.log(
  failures === 0
    ? "\n✅ Player and bots share one Mega Stone rule"
    : `\n❌ ${failures} mega-gate assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
