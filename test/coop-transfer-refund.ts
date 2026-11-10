/**
 * A co-op transfer that fails to send must not destroy what it was sending.
 *
 * Double Up lets a player hand gold or a bench mon to their partner. The
 * economy is private per-uid, so a transfer cannot be written into the
 * partner's state directly — the sender takes it from themselves first, then
 * posts it to a mailbox the partner reads.
 *
 * That ordering is fine, but it only works if a failed post gives it back. The
 * call sites ended in `.catch(() => {})`: the gold was already deducted, or the
 * mon already off the bench, and a push that never landed simply destroyed it.
 * No error, no toast, nothing in either player's state — the resource left the
 * game silently, which is the worst way for a co-op mechanic to fail.
 *
 * The refund path is only as good as its round-trip, so that is what this
 * checks: take-then-give-back must land exactly where it started, including the
 * cases most likely to drift (a 2-star mon, held items, a clamped overspend).
 */

import { useGame } from "../src/game/store/gameStore";
import { makeInstance } from "../src/game/engine/combine";
import { readFileSync } from "node:fs";
import type { UnitInstance } from "../src/game/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const bench = (u: Partial<UnitInstance> & { defId: string }): UnitInstance =>
  ({ ...makeInstance(u.defId), ...u, pos: null }) as UnitInstance;

console.log("Co-op transfer refunds\n");

console.log("gold survives a failed send:");
{
  useGame.getState().newGame();
  useGame.setState({ gold: 30 });
  const spent = useGame.getState().coopSpendGold(10);
  assert(spent === 10, "the send takes exactly what was asked for");
  assert(useGame.getState().gold === 20, "and the sender is debited");
  useGame.getState().coopReceiveGold(spent);
  assert(useGame.getState().gold === 30, "the refund restores the exact amount");
}

console.log("\nan overspend is clamped, and refunding the clamped amount is still exact:");
{
  useGame.getState().newGame();
  useGame.setState({ gold: 3 });
  const spent = useGame.getState().coopSpendGold(999);
  assert(spent === 3, "you cannot send more than you hold");
  assert(useGame.getState().gold === 0, "the sender is emptied, not driven negative");
  useGame.getState().coopReceiveGold(spent);
  assert(useGame.getState().gold === 3, "and the refund is the clamped amount, not the request");
}

console.log("\na mon survives a failed send, with its star and items:");
{
  useGame.getState().newGame();
  const u = bench({ defId: "pikachu", star: 2, items: ["c-ad", "c-hp"] });
  useGame.setState({ units: [u] });

  const snap = useGame.getState().coopRemoveUnit(u.iid);
  assert(snap !== null, "the send produces a portable snapshot");
  assert(useGame.getState().units.length === 0, "and the mon leaves the sender's bench");

  if (snap) {
    useGame.getState().coopReceiveUnit(snap);
    const back = useGame.getState().units.filter((x) => x.defId === "pikachu");
    assert(back.length === 1, "the refund puts exactly one mon back");
    assert(back[0]?.star === 2, "at the same star — a 2★ must not come back as a 1★");
    assert(
      (back[0]?.items ?? []).length === 2,
      "still holding its items, which would otherwise be destroyed with it",
    );
    assert(back[0]?.pos === null, "and on the bench, not the board");
  }
}

console.log("\nthe failure path actually refunds (it used to swallow):");
{
  const raw = readFileSync(new URL("../src/components/game/CoopPanel.tsx", import.meta.url), "utf8");
  // Comments stripped first: this file DESCRIBES the old `.catch(() => {})` in
  // its own documentation, and matching that would fail for the wrong reason.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(
    !/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(src),
    "no empty catch remains on a transfer send",
  );
  assert(src.includes("coopReceiveGold"), "a failed gold send refunds the gold");
  assert(src.includes("coopReceiveUnit"), "a failed unit send puts the mon back");
}

console.log(
  failures === 0
    ? "\n✅ A failed co-op transfer gives back exactly what it took"
    : `\n❌ ${failures} co-op refund assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
