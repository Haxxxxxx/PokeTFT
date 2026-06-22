/** One-off sanity check for the AI positioning + difficulty pass.
 *  Run: npx tsx test/ai-strength-check.ts
 *   1. Positioning: count ranged-carry-in-front-line violations across tiers.
 *   2. Composition: avg 2★ count + how often a 2★ 4/5-cost carry shows up (the new lever).
 *   3. Strength:    head-to-head win-rate ladder (easy<medium<hard<expert<ultimate). */
import { generatePlayerLikeBoard, type BotLevel } from "../src/game/engine/enemy";
import { simulate } from "../src/game/engine/combat";
import { getDef } from "../src/game/data/mons";
import type { UnitInstance } from "../src/game/types";

const TIERS: BotLevel[] = ["easy", "medium", "hard", "expert", "ultimate"];
const STAGES = [3, 4, 5, 6, 7];

// allyToField: local row 0 = FRONT (nearest enemy). Ranged = range >= 2.
function frontRowViolations(b: UnitInstance[]): { ranged: number; total: number } {
  let ranged = 0, total = 0;
  for (const u of b) {
    if (!u.pos) continue;
    const def = getDef(u.defId);
    const isRanged = def.stats.range >= 2;
    const inFront = u.pos[1] <= 1; // local rows 0/1 = front line
    if (isRanged) { total++; if (inFront) ranged++; }
  }
  return { ranged, total };
}

console.log("── Positioning: ranged carries stuck in the front line ──");
for (const tier of TIERS) {
  let bad = 0, tot = 0;
  for (const stage of STAGES) for (let s = 0; s < 200; s++) {
    const b = generatePlayerLikeBoard(stage, 5, tier, s * 31 + stage, undefined);
    const v = frontRowViolations(b);
    bad += v.ranged; tot += v.total;
  }
  console.log(`  ${tier.padEnd(9)} ${bad}/${tot} ranged units in front (${tot ? ((100 * bad) / tot).toFixed(1) : "0"}%)`);
}

console.log("\n── Composition at stage 6 (board avg) ──");
for (const tier of TIERS) {
  let two = 0, three = 0, big = 0, n = 0, boards = 0;
  for (let s = 0; s < 300; s++) {
    const b = generatePlayerLikeBoard(6, 5, tier, s * 97 + 13, undefined);
    boards++; n += b.length;
    for (const u of b) {
      if (u.star === 2) two++; if (u.star === 3) three++;
      if (u.star >= 2 && getDef(u.defId).cost >= 4) big++;
    }
  }
  console.log(`  ${tier.padEnd(9)} units ${(n / boards).toFixed(1)} | 2★ ${(two / boards).toFixed(1)} | 3★ ${(three / boards).toFixed(2)} | 2★ 4/5-cost carries ${(big / boards).toFixed(2)}/board`);
}

console.log("\n── Head-to-head win-rate (row tier vs col tier, stage 6) ──");
function winRate(a: BotLevel, b: BotLevel): number {
  let aw = 0, games = 0;
  for (let s = 0; s < 400; s++) {
    const ba = generatePlayerLikeBoard(6, 5, a, s * 31 + 1, undefined);
    const bb = generatePlayerLikeBoard(6, 5, b, s * 53 + 7, undefined);
    if (!ba.length || !bb.length) continue;
    const r = simulate(ba, bb);
    if (r.winner === "ally") aw++; games++;
  }
  return games ? aw / games : 0;
}
process.stdout.write("           " + TIERS.map((t) => t.slice(0, 5).padStart(7)).join("") + "\n");
for (const a of TIERS) {
  const row = TIERS.map((b) => (a === b ? "    -  " : (100 * winRate(a, b)).toFixed(0).padStart(6) + "%"));
  console.log(`  ${a.padEnd(9)}${row.join("")}`);
}
