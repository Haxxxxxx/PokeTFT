/**
 * Bot-brain self-play trainer ("train it forward") — PER GAME MODE.
 *
 * The meta-learning store is cold on day one and is keyed by game mode (each mode locks a
 * different roster/rules, so different comps win). This harness warms EVERY mode: for each
 * mode it self-plays many late-game lobbies drafted from that mode's roster, ranks each lobby
 * by ACTUAL combat, and credits every board's synergies by placement — exactly the signal the
 * live game records. The result is a mature per-mode meta the bots launch with.
 *
 * On-policy: each lobby is drafted with that mode's CURRENT (evolving) meta fed back in.
 *
 * Run:   npx tsx test/train-brain.ts [gamesPerMode] [fleet]
 * Writes meta-seed.json = { [modeId]: CompStats } to seed RTDB meta_learn/byMode/{mode}/comp.
 *
 * Deterministic: no Date.now()/Math.random — seeds derive from loop indices.
 */
import { writeFileSync } from "node:fs";
import { generatePlayerLikeBoard } from "../src/game/engine/enemy";
import { simulate } from "../src/game/engine/combat";
import { accrueComp, metaWeights, activeTraitKeys, type CompStats } from "../src/game/engine/botBrain";
import { MODES, rosterForRoom } from "../src/game/data/gameModes";
import type { UnitInstance } from "../src/game/types";

const GAMES = Number(process.argv[2] ?? 2500);  // lobbies per mode
const FLEET = Number(process.argv[3] ?? 8);     // lobby size
const STAGES = [4, 5, 6, 6];                     // rotate stages; weight late game

/** Round-robin a lobby and rank by (wins, then survivors) → placement 1..FLEET. */
function rankLobby(boards: UnitInstance[][]): number[] {
  const wins = boards.map(() => 0);
  const surv = boards.map(() => 0);
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const r = simulate(boards[i], boards[j]);
      if (r.winner === "ally") { wins[i]++; surv[i] += r.survivors ?? 0; }
      else if (r.winner === "enemy") { wins[j]++; surv[j] += r.survivors ?? 0; }
    }
  }
  const order = boards.map((_, i) => i).sort((a, b) => (wins[b] - wins[a]) || (surv[b] - surv[a]));
  const place: number[] = new Array(boards.length);
  order.forEach((idx, rank) => { place[idx] = rank + 1; });
  return place;
}

/** Train one mode's meta from self-play over its own roster. */
function trainMode(mode: typeof MODES[number]): CompStats {
  let stats: CompStats = {};
  const baseRules = { mode: mode.id, ...(mode.rulesPatch ?? {}) };
  for (let g = 0; g < GAMES; g++) {
    const meta = metaWeights(stats);          // on-policy
    const stage = STAGES[g % STAGES.length];
    // Mode roster varies by seed for mono-type (the forced type is seed-picked) — rotate it.
    const roster = rosterForRoom(baseRules, (g * 2654435761) >>> 0);
    if (!roster.length) break;                // mode produced no roster — skip
    const boards: UnitInstance[][] = [];
    for (let f = 0; f < FLEET; f++) {
      const seed = (g * 7919 + f * 104729 + 1) >>> 0;
      boards.push(generatePlayerLikeBoard(stage, 5, "ultimate", seed, roster, undefined, undefined, { metaWeights: meta }));
    }
    const valid = boards.filter((b) => b.length);
    if (valid.length < 2) continue;
    const place = rankLobby(valid);
    for (let f = 0; f < valid.length; f++) {
      const types = activeTraitKeys(valid[f]);
      if (types.length) stats = { ...stats, ...accrueComp(stats, types, place[f], valid.length) };
    }
  }
  return stats;
}

const seed: Record<string, CompStats> = {};
for (const mode of MODES) {
  const stats = trainMode(mode);
  if (!Object.keys(stats).length) { console.log(`  ${mode.id.padEnd(12)} — no roster, skipped`); continue; }
  const w = metaWeights(stats);
  const ranked = Object.entries(w).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3).map(([t, x]) => `${t} ${x.toFixed(2)}`).join(", ");
  const bot = ranked.slice(-2).map(([t, x]) => `${t} ${x.toFixed(2)}`).join(", ");
  console.log(`  ${mode.id.padEnd(12)} top: ${top.padEnd(40)} | weak: ${bot}`);
  // Round so the JSON stays tidy.
  const tidy: CompStats = {};
  for (const [t, c] of Object.entries(stats)) tidy[t] = { n: Math.round(c.n * 100) / 100, s: Math.round(c.s * 100) / 100 };
  seed[mode.id] = tidy;
}

writeFileSync("meta-seed.json", JSON.stringify(seed));
console.log(`\nWrote meta-seed.json — ${Object.keys(seed).length} modes, ${GAMES} lobbies each (fleet ${FLEET}).`);
console.log("Seed each to RTDB at meta_learn/byMode/{mode}/comp.");
