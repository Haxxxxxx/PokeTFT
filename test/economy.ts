/**
 * Unit tests for economy config: interest, streakGold, boardSizeForLevel,
 * advanceRound, cumulativeRound, roundKind.
 * Run: npx tsx test/economy.ts
 */
import { interest }            from "../src/game/engine/economy";
import {
  streakGold,
  boardSizeForLevel,
  advanceRound,
  cumulativeRound,
  roundKind,
  ECONOMY,
} from "../src/game/config";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

// ── interest ──────────────────────────────────────────────────────────────────
console.log("interest");
assert(interest(0)  === 0, "interest(0) = 0");
assert(interest(9)  === 0, "interest(9) = 0 (below first threshold)");
assert(interest(10) === 1, "interest(10) = 1");
assert(interest(29) === 2, "interest(29) = 2");
assert(interest(50) === ECONOMY.interestCap, `interest(50) = cap (${ECONOMY.interestCap})`);
assert(interest(100) === ECONOMY.interestCap, "interest(100) still capped");

// ── streakGold ────────────────────────────────────────────────────────────────
console.log("\nstreakGold");
assert(streakGold(0)  === 0, "streak 0 → 0 bonus");
assert(streakGold(1)  === 0, "streak 1 → 0 bonus");
assert(streakGold(2)  === 1, "streak 2 → 1 bonus");
assert(streakGold(3)  === 1, "streak 3 → 1 bonus");
assert(streakGold(4)  === 2, "streak 4 → 2 bonus");
assert(streakGold(5)  === 3, "streak 5 → 3 bonus");
assert(streakGold(10) === 3, "streak 10 → 3 bonus (capped)");
// Negative streaks (loss streaks) mirror positive streaks
assert(streakGold(-2) === 1, "streak -2 → 1 bonus (loss streak counts)");
assert(streakGold(-5) === 3, "streak -5 → 3 bonus");

// ── boardSizeForLevel ─────────────────────────────────────────────────────────
console.log("\nboardSizeForLevel");
assert(boardSizeForLevel(1) === 1, "level 1 → 1 unit");
assert(boardSizeForLevel(5) === 5, "level 5 → 5 units");
assert(boardSizeForLevel(9) === 9, "level 9 → 9 units");

// ── advanceRound ──────────────────────────────────────────────────────────────
console.log("\nadvanceRound");
// Stage 1 has 4 rounds
assert(advanceRound(1, 1).round === 2 && advanceRound(1, 1).stage === 1, "1-1 → 1-2");
assert(advanceRound(1, 3).round === 4 && advanceRound(1, 3).stage === 1, "1-3 → 1-4");
// End of stage 1 wraps to stage 2
const wrap1 = advanceRound(1, 4);
assert(wrap1.stage === 2 && wrap1.round === 1, "1-4 (end of stage 1) → 2-1");
// Stage 2 has 7 rounds
assert(advanceRound(2, 6).round === 7 && advanceRound(2, 6).stage === 2, "2-6 → 2-7");
const wrap2 = advanceRound(2, 7);
assert(wrap2.stage === 3 && wrap2.round === 1, "2-7 (end of stage 2) → 3-1");
// Stage cap at 50
const atCap = advanceRound(50, 7);
assert(atCap.stage === 50, "stage 50 doesn't overflow beyond 50");

// ── cumulativeRound ───────────────────────────────────────────────────────────
console.log("\ncumulativeRound");
assert(cumulativeRound(1, 1) === 1, "1-1 → round 1 cumulative");
assert(cumulativeRound(1, 4) === 4, "1-4 → round 4 cumulative");
// Stage 2 starts at round 5 (after 4 rounds in stage 1)
assert(cumulativeRound(2, 1) === 5, "2-1 → round 5 cumulative");
assert(cumulativeRound(2, 7) === 11, "2-7 → round 11 cumulative");
assert(cumulativeRound(3, 1) === 12, "3-1 → round 12 cumulative");

// ── roundKind ─────────────────────────────────────────────────────────────────
console.log("\nroundKind");
// Stage 1: all PvE except round 4 carousel
assert(roundKind(1, 1) === "pve",      "1-1 → pve");
assert(roundKind(1, 3) === "pve",      "1-3 → pve");
assert(roundKind(1, 4) === "carousel", "1-4 → carousel");
// Stage 2+: round 4 carousel, round 7 pve, rest pvp
assert(roundKind(2, 1) === "pvp",      "2-1 → pvp");
assert(roundKind(2, 4) === "carousel", "2-4 → carousel");
assert(roundKind(2, 7) === "pve",      "2-7 → pve");
assert(roundKind(3, 2) === "pvp",      "3-2 → pvp");

console.log(`\n${failures === 0 ? "✅ All economy tests passed" : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
