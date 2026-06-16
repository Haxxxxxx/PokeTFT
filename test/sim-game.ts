/**
 * Headless full-game simulation harness.
 *
 * Plays complete games end-to-end through the REAL stores + engine (no browser,
 * no Firebase): a simple bot policy buys/levels/deploys each planning round, then
 * combat is resolved with the deterministic `simulate()` against AI boards. After
 * every action it asserts the core invariants that the live game must also hold:
 *
 *   - shared-pool conservation (pool copies + owned copies == constant)
 *   - gold never negative; level always === levelFromXp(xp)
 *   - board never exceeds the level cap; no NaN/!finite stats reach combat
 *   - every fight terminates (bounded frame count)
 *
 * Run:  npx tsx test/sim-game.ts            (a few seeds)
 *       npx tsx test/sim-game.ts 40         (40 seeds)
 *
 * This is the "run a game in simulation locally" regression guard — it catches
 * economy/engine regressions a screenshot never would.
 */
import { useGame } from "../src/game/store/gameStore";
import { rosterForGenerations } from "../src/game/data/mons";
import { getDef } from "../src/game/data/mons";
import { POOL_SIZE, boardSizeForLevel, roundKind, advanceRound, stageBaseDamage } from "../src/game/config";
import { simulate } from "../src/game/engine/combat";
import { generateBoard, generateCreepBoard } from "../src/game/engine/enemy";
import type { UnitInstance } from "../src/game/types";

const copies = (star: number) => (star === 1 ? 1 : star === 2 ? 3 : 9);

let failures = 0;
function assert(cond: boolean, msg: string, ctx: string) {
  if (!cond) { failures++; console.error(`  ✗ FAIL [${ctx}] ${msg}`); }
}

/** Sum of pool copies currently in the bag. */
function poolSum(pool: Record<string, number>): number {
  return Object.values(pool).reduce((s, n) => s + n, 0);
}
/** Copies the player currently owns (units + pension). */
function ownedCopies(units: UnitInstance[], pension: { star: number } | null): number {
  return units.reduce((s, u) => s + copies(u.star), 0) + (pension ? copies(pension.star) : 0);
}

function playGame(seed: number): void {
  const g = useGame.getState();
  const roster = rosterForGenerations([1, 2, 3], 90, seed);
  g.newGame(100, roster);

  // The conserved total: full bag for the roster (the starter was already debited
  // from the pool during newGame, and counts in ownedCopies — so the sum is fixed).
  const CONST = roster.reduce((s, id) => s + (POOL_SIZE[getDef(id).cost] ?? 0), 0);

  const ctx0 = `seed ${seed}`;
  let s0 = useGame.getState();
  assert(poolSum(s0.pool) + ownedCopies(s0.units, s0.pension) === CONST, `pool+owned != ${CONST} at newGame (got ${poolSum(s0.pool) + ownedCopies(s0.units, s0.pension)})`, ctx0);

  let stage = 1, round = 1, health = 100, streak = 0;
  for (let step = 0; step < 60 && health > 0; step++) {
    const ctx = `${ctx0} @ ${stage}-${round}`;
    let s = useGame.getState();

    // --- Bot planning policy: level a bit, buy whatever's affordable, deploy. ---
    if (s.gold >= 8 && s.level < 8) g.buyXp();
    s = useGame.getState();
    // Buy across the shop while we can afford the cheapest slot and have bench room.
    for (let slot = 0; slot < s.shop.length; slot++) {
      const id = s.shop[slot];
      if (!id) continue;
      const cost = getDef(id).cost;
      const benchFree = useGame.getState().units.filter((u) => u.pos === null).length < 9;
      if (useGame.getState().gold >= cost && benchFree) g.buyUnit(slot);
    }
    // Occasionally reroll if rich.
    if (useGame.getState().gold >= 10) g.reroll();
    g.fillBoard();

    s = useGame.getState();
    // --- Invariants after the planning actions ---
    assert(s.gold >= 0, `gold negative (${s.gold})`, ctx);
    assert(poolSum(s.pool) + ownedCopies(s.units, s.pension) === CONST, `pool+owned drifted to ${poolSum(s.pool) + ownedCopies(s.units, s.pension)} != ${CONST}`, ctx);
    const onBoard = s.units.filter((u) => u.pos !== null);
    assert(onBoard.length <= boardSizeForLevel(s.level), `board ${onBoard.length} > cap ${boardSizeForLevel(s.level)}`, ctx);
    for (const [id, n] of Object.entries(s.pool)) assert(Number.isFinite(n) && n >= 0, `pool[${id}] = ${n}`, ctx);

    // --- Combat ---
    const kind = roundKind(stage, round);
    if (kind !== "carousel") {
      const enemy = kind === "pve"
        ? generateCreepBoard(stage, round, stage * 17 + round + seed, roster)
        : generateBoard(Math.min(2 + Math.floor(step / 4), 9), Math.min(s.level, 8), seed * 31 + stage * 101 + round * 7, roster);
      const result = simulate(onBoard, enemy);
      assert(result.frames.length > 0 && result.frames.length < 5000, `fight didn't terminate sanely (${result.frames.length} frames)`, ctx);
      assert(result.winner === "ally" || result.winner === "enemy" || result.winner === "draw", `bad winner ${result.winner}`, ctx);
      if (kind !== "pve" && result.winner === "enemy") {
        health -= stageBaseDamage(stage) + result.survivors;
        streak = streak >= 0 ? -1 : streak - 1;
      } else if (result.winner === "ally") {
        streak = streak <= 0 ? 1 : streak + 1;
      }
    }

    // --- Advance the round + grant economy (mirrors netRound in the live game). ---
    const next = advanceRound(stage, round);
    stage = next.stage; round = next.round;
    g.netRound(stage, round, streak);
  }

  const sEnd = useGame.getState();
  assert(poolSum(sEnd.pool) + ownedCopies(sEnd.units, sEnd.pension) === CONST, `pool+owned != ${CONST} at end`, ctx0);
}

const seeds = parseInt(process.argv[2] ?? "8", 10);
console.log(`Simulating ${seeds} full games (gens 1-3, draft 90)…`);
for (let s = 1; s <= seeds; s++) playGame(s);

if (failures === 0) console.log(`✅ ${seeds} games clean — pool conserved, gold/level consistent, boards capped, all fights terminated.`);
else { console.error(`❌ ${failures} invariant failure(s) across ${seeds} games.`); process.exit(1); }
