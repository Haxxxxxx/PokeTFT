/**
 * Unit tests for pure rating math.
 * Run: npx tsx test/rating.ts
 */
import {
  ratingDelta,
  weightedRatingDelta,
  rankOf,
  START_RATING,
  APEX_RATING,
  RATING_PER_DIV,
  BOT_LP_WEIGHT,
} from "../src/game/rating";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

// ── ratingDelta ───────────────────────────────────────────────────────────────
console.log("ratingDelta");
assert(ratingDelta(1, 8) > 0,  "1st of 8 → positive delta");
assert(ratingDelta(8, 8) < 0,  "8th of 8 → negative delta");
assert(Math.abs(ratingDelta(4, 8)) <= 8, "4th of 8 ≈ 0 (within ±1 step)");
assert(ratingDelta(1, 8) > ratingDelta(4, 8), "1st earns more than 4th");
assert(ratingDelta(4, 8) > ratingDelta(8, 8), "4th loses less than 8th");
// Symmetry: 1st gain ≈ −(8th loss)
assert(ratingDelta(1, 8) === -ratingDelta(8, 8), "first-place gain mirrors last-place loss");

// ── weightedRatingDelta ───────────────────────────────────────────────────────
console.log("\nweightedRatingDelta");
const rawFirst = ratingDelta(1, 8);
const allHuman  = weightedRatingDelta(1, 8, 7, 0);
const allBot    = weightedRatingDelta(1, 8, 0, 7);
assert(allHuman === rawFirst, "all-human lobby: same as ratingDelta");
assert(allBot < allHuman,    "all-bot lobby: smaller delta than all-human");
// BOT_LP_WEIGHT is 0.35 — expect the all-bot result to be near 35% of all-human
assert(Math.abs(allBot - Math.round(rawFirst * BOT_LP_WEIGHT)) <= 1, "all-bot delta ≈ raw × BOT_LP_WEIGHT");
// Zero opponents → no change
assert(weightedRatingDelta(1, 1, 0, 0) === 0, "no opponents → 0 delta");
// Mixed: 4 humans + 3 bots
const mixed = weightedRatingDelta(1, 8, 4, 3);
assert(mixed > allBot && mixed < allHuman, "mixed lobby delta between all-bot and all-human");

// ── rankOf ───────────────────────────────────────────────────────────────────
console.log("\nrankOf");
const startRank = rankOf(START_RATING);   // 1000 → band 10 → tier 2 = Silver, div = 4-(10%4) = 2
assert(startRank.tier === "Silver",   `START_RATING tier is Silver (got ${startRank.tier})`);
assert(!startRank.apex,               "START_RATING is not apex");
assert(startRank.lp >= 0 && startRank.lp < RATING_PER_DIV, "START_RATING LP in [0,100)");

const apexRank = rankOf(APEX_RATING);
assert(apexRank.apex,                 "APEX_RATING → apex");
assert(apexRank.tier === "Master",    `APEX_RATING tier is Master (got ${apexRank.tier})`);
assert(apexRank.lp === 0,             "exact APEX_RATING → 0 LP above threshold");

const aboveApex = rankOf(APEX_RATING + 150);
assert(aboveApex.apex && aboveApex.lp === 150, "APEX+150 → Master with 150 LP");

// Iron IV is the floor (rating 0)
const ironRank = rankOf(0);
assert(ironRank.tier === "Iron",      `rating 0 → Iron (got ${ironRank.tier})`);
assert(ironRank.division === 4,       "rating 0 → Iron IV");

// Boundary: exactly 100 → Iron III (band 1 → div 3)
const ironIII = rankOf(RATING_PER_DIV);
assert(ironIII.tier === "Iron" && ironIII.division === 3, "100 LP → Iron III");

// ── Clamping: rating can't go below 0 after consecutive losses ────────────────
console.log("\nrating floor / clamping");
let rating = 50;
for (let i = 0; i < 10; i++) rating = Math.max(0, rating + ratingDelta(8, 8));
assert(rating >= 0, "rating floored at 0 after repeated last-place finishes");
const floorRank = rankOf(rating);
assert(floorRank.tier === "Iron", "floored rating still maps to a valid Iron rank");

console.log(`\n${failures === 0 ? "✅ All rating tests passed" : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
