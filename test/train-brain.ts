/**
 * Bot-brain self-play trainer ("train it forward").
 *
 * The meta-learning store is cold on day one — bots would draft on synergy depth alone until
 * enough real games accrue. This harness warms it up: it self-plays many late-game lobbies,
 * ranks each lobby by ACTUAL combat performance, and credits every board's synergies by their
 * placement — exactly the signal the live game records. The result is a mature `meta_learn/comp`
 * the bots can launch with, so the very first real games already favour proven-strong comps.
 *
 * On-policy: each lobby is drafted with the CURRENT (evolving) meta fed back in, so training
 * converges toward what wins given the bots' own drafting. Diversity is preserved by the
 * probabilistic theme pick (min weight 0.05) plus the store's recency decay.
 *
 * Run:   npx tsx test/train-brain.ts [games] [fleet]
 * Writes meta-seed.json (the CompStats to seed RTDB meta_learn/comp).
 *
 * Deterministic: no Date.now()/Math.random — all seeds are derived from loop indices.
 */
import { writeFileSync } from "node:fs";
import { generatePlayerLikeBoard } from "../src/game/engine/enemy";
import { simulate } from "../src/game/engine/combat";
import { accrueComp, metaWeights, activeTraitKeys, type CompStats } from "../src/game/engine/botBrain";
import type { UnitInstance } from "../src/game/types";

const GAMES = Number(process.argv[2] ?? 4000);
const FLEET = Number(process.argv[3] ?? 8);   // lobby size
const STAGE = 6;                               // late-game: full boards, synergies matter most

let stats: CompStats = {};

/** Round-robin a lobby and rank by (wins, then survivors) → placement 1..FLEET. */
function rankLobby(boards: UnitInstance[][]): number[] {
  const wins = boards.map(() => 0);
  const surv = boards.map(() => 0);
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const r = simulate(boards[i], boards[j]);
      if (r.winner === "ally") { wins[i]++; surv[i] += r.survivors ?? 0; }
      else if (r.winner === "enemy") { wins[j]++; surv[j] += r.survivors ?? 0; }
      else { surv[i] += 0; surv[j] += 0; }
    }
  }
  // Indices sorted best→worst; placement = rank+1.
  const order = boards.map((_, i) => i).sort((a, b) => (wins[b] - wins[a]) || (surv[b] - surv[a]));
  const place: number[] = new Array(boards.length);
  order.forEach((idx, rank) => { place[idx] = rank + 1; });
  return place;
}

for (let g = 0; g < GAMES; g++) {
  const meta = metaWeights(stats); // on-policy: draft with what we've learned so far
  const boards: UnitInstance[][] = [];
  for (let f = 0; f < FLEET; f++) {
    const seed = (g * 7919 + f * 104729 + 1) >>> 0;
    boards.push(generatePlayerLikeBoard(STAGE, 5, "ultimate", seed, undefined, undefined, undefined, { metaWeights: meta }));
  }
  const place = rankLobby(boards);
  for (let f = 0; f < FLEET; f++) {
    const types = activeTraitKeys(boards[f]);
    if (types.length) stats = { ...stats, ...accrueComp(stats, types, place[f], FLEET) };
  }
  if ((g + 1) % 1000 === 0) console.log(`  trained ${g + 1}/${GAMES} lobbies…`);
}

// Report what the brain learned.
const weights = metaWeights(stats);
const ranked = Object.entries(weights).sort((a, b) => b[1] - a[1]);
console.log(`\n=== Trained on ${GAMES} lobbies × ${FLEET} (stage ${STAGE}) ===`);
console.log("Strongest comps (draft weight >1 → favoured):");
for (const [t, w] of ranked.slice(0, 8)) console.log(`  ${t.padEnd(12)} ${w.toFixed(3)}  (n=${Math.round(stats[t].n)})`);
console.log("Weakest comps (<1 → avoided):");
for (const [t, w] of ranked.slice(-6)) console.log(`  ${t.padEnd(12)} ${w.toFixed(3)}  (n=${Math.round(stats[t].n)})`);

// Emit the seed the live store ingests (rounded so the JSON stays tidy).
const seed: CompStats = {};
for (const [t, c] of Object.entries(stats)) seed[t] = { n: Math.round(c.n * 100) / 100, s: Math.round(c.s * 100) / 100 };
writeFileSync("meta-seed.json", JSON.stringify(seed));
console.log(`\nWrote meta-seed.json (${Object.keys(seed).length} comps) — seed RTDB at meta_learn/comp.`);
