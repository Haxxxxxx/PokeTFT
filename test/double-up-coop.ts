/**
 * Double Up Phase 2 co-op transfer verification — the client-side gold/unit hand-off in
 * gameStore (coopSpendGold / coopRemoveUnit on the sender, coopReceiveGold / coopReceiveUnit
 * on the recipient). Pure store logic, no network. Run: npx tsx test/double-up-coop.ts
 */
import { useGame } from "../src/game/store/gameStore";
import { rosterForGenerations } from "../src/game/data/mons";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
};

const g = () => useGame.getState();
const benchCount = () => g().units.filter((u) => u.pos === null).length;

function run() {
  console.log("Double Up co-op transfers\n");
  const roster = rosterForGenerations([1], 60, 1);

  // ── Sender side ──
  g().newGame(roster);
  useGame.setState({ gold: 8 });
  const startBench = benchCount();

  console.log("Sender:");
  const spent = g().coopSpendGold(5);
  assert(spent === 5 && g().gold === 3, "coopSpendGold(5) deducts 5 (8 → 3)");
  const over = g().coopSpendGold(99);
  assert(over === 3 && g().gold === 0, "coopSpendGold caps at available gold (sent 3, now 0)");
  assert(g().coopSpendGold(5) === 0, "coopSpendGold returns 0 when broke (nothing sent)");

  // Add a known bench unit, then hand it off.
  const unitId = roster[0];
  useGame.setState({ units: [...g().units, { iid: "give-me", defId: unitId, star: 1, pos: null, items: ["choice-band"] }] });
  const benchWithExtra = benchCount();
  const snap = g().coopRemoveUnit("give-me");
  assert(!!snap && snap.defId === unitId, "coopRemoveUnit returns the unit snapshot");
  assert(snap?.items?.includes("choice-band") === true, "snapshot carries the held item");
  assert(benchCount() === benchWithExtra - 1, "unit left the sender's bench");
  assert(g().coopRemoveUnit("not-on-bench") === null, "coopRemoveUnit of a board/unknown unit → null");

  // ── Recipient side (fresh game) ──
  console.log("\nRecipient:");
  g().newGame(roster);
  useGame.setState({ gold: 2 });
  g().coopReceiveGold(10);
  assert(g().gold === 12, "coopReceiveGold(10) adds (2 → 12)");
  g().coopReceiveGold(-5);
  assert(g().gold === 12, "coopReceiveGold ignores non-positive amounts");

  const before = benchCount();
  g().coopReceiveUnit({ defId: roster[1], star: 1, items: ["aegis"] });
  assert(benchCount() === before + 1, "coopReceiveUnit places the unit on the bench");
  const received = g().units.find((u) => u.pos === null && u.defId === roster[1]);
  assert(received?.items?.includes("aegis") === true, "received unit keeps its item");

  console.log(`\n${failures === 0 ? "✅ Double Up co-op transfers verified" : `❌ ${failures} assertion(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
