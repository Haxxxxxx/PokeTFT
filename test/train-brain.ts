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
import { simulate, type TeamBuff } from "../src/game/engine/combat";
import { accrueComp, metaWeights, activeTraitKeys, type CompStats } from "../src/game/engine/botBrain";
import { MODES, rosterForRoom, modeStartItems, modeTeamBuff, modeLootScale } from "../src/game/data/gameModes";
import { MEGA_STONE } from "../src/game/data/mega";
import { EMBLEM_TRAIT } from "../src/game/data/items";
import { getDef, typesForStar } from "../src/game/data/mons";
import type { UnitInstance } from "../src/game/types";

type Mode = typeof MODES[number];

/** Apply a mode's GIMMICK EFFECTS to a freshly-drafted board so training reflects how the
 *  mode actually plays — not just its roster. Mutates items in place; returns the mode's
 *  team-wide combat buff (region modifier) to feed into simulate(). Mirrors the live game:
 *   · Mega Madness — every mega-capable mon holds a Mega Stone (simulate megas it).
 *   · Region       — the signature Emblem lands on a mon lacking the type (lifts the synergy),
 *                    the signature item on a carry, and the region modifier buffs every fight.
 *   · Treasure     — extra completed items (the mode pours out ~2.5× loot). */
function applyModeEffects(board: UnitInstance[], mode: Mode, rules: Record<string, unknown>): TeamBuff | undefined {
  const room = (n: number) => board.filter((u) => (u.items?.length ?? 0) < 3).slice(0, n);
  const addItem = (u: UnitInstance, id: string) => { u.items = [...(u.items ?? []), id]; };

  // Mega Madness stones are applied during DRAFT now (preferMega in the generator), so we
  // only handle region/treasure loot here.
  // Region signature emblem + item (modeStartItems): place the emblem where it adds a NEW type.
  for (const id of modeStartItems(rules)) {
    if (id === MEGA_STONE) continue; // handled above
    if (id in EMBLEM_TRAIT) {
      const t = EMBLEM_TRAIT[id];
      const tgt = board.find((u) => (u.items?.length ?? 0) < 3 && !typesForStar(getDef(u.defId), u.star).includes(t as never));
      if (tgt) addItem(tgt, id);
    } else {
      const tgt = room(1)[0]; if (tgt) addItem(tgt, id);
    }
  }
  // Treasure loot is handled during DRAFT now (itemBudgetMult in the generator).
  return modeTeamBuff(rules);
}

const GAMES = Number(process.argv[2] ?? 2500);  // lobbies per mode
const FLEET = Number(process.argv[3] ?? 8);     // lobby size
const STAGES = [4, 5, 6, 6];                     // rotate stages; weight late game

/** Round-robin a lobby and rank by (wins, then survivors) → placement 1..FLEET. Both teams
 *  in a lobby share the mode's team buff (same modifier applies to everyone). */
function rankLobby(boards: UnitInstance[][], buff?: TeamBuff): number[] {
  const wins = boards.map(() => 0);
  const surv = boards.map(() => 0);
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const r = simulate(boards[i], boards[j], buff, buff);
      if (r.winner === "ally") { wins[i]++; surv[i] += r.survivors ?? 0; }
      else if (r.winner === "enemy") { wins[j]++; surv[j] += r.survivors ?? 0; }
    }
  }
  const order = boards.map((_, i) => i).sort((a, b) => (wins[b] - wins[a]) || (surv[b] - surv[a]));
  const place: number[] = new Array(boards.length);
  order.forEach((idx, rank) => { place[idx] = rank + 1; });
  return place;
}

/** Train one mode's meta from self-play over its own roster + gimmick effects. */
function trainMode(mode: Mode): CompStats {
  let stats: CompStats = {};
  const baseRules = { mode: mode.id, ...(mode.rulesPatch ?? {}) };
  for (let g = 0; g < GAMES; g++) {
    const meta = metaWeights(stats);          // on-policy
    const stage = STAGES[g % STAGES.length];
    // Mode roster varies by seed for mono-type (the forced type is seed-picked) — rotate it.
    const roster = rosterForRoom(baseRules, (g * 2654435761) >>> 0);
    if (!roster.length) break;                // mode produced no roster — skip
    const boards: UnitInstance[][] = [];
    let buff: TeamBuff | undefined;
    for (let f = 0; f < FLEET; f++) {
      const seed = (g * 7919 + f * 104729 + 1) >>> 0;
      const b = generatePlayerLikeBoard(stage, 5, "ultimate", seed, roster, undefined, undefined, { metaWeights: meta, preferMega: !!mode.flags?.megaMadness, itemBudgetMult: modeLootScale(baseRules) });
      buff = applyModeEffects(b, mode, baseRules); // gimmick effects (megas/emblem/loot); buff is mode-wide
      boards.push(b);
    }
    const valid = boards.filter((b) => b.length);
    if (valid.length < 2) continue;
    const place = rankLobby(valid, buff);
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
