import { create } from "zustand";
import type { UnitInstance } from "../types";
import { stageBaseDamage } from "../config";
import { simulate, type CombatResult } from "../engine/combat";
import { generateBoard } from "../engine/enemy";

export type Player = {
  id: string;
  name: string;
  health: number;
  level: number;
  board: UnitInstance[];
  streak: number;
  alive: boolean;
  /** Finishing place (1 = winner) once eliminated. */
  place: number | null;
};

const RIVALS = ["Brock", "Misty", "Surge", "Erika", "Koga", "Sabrina", "Blaine"];

/** AI economy curve: level + board size grow with the total round number. */
function aiLevel(totalRound: number): number {
  return Math.min(2 + Math.floor(totalRound / 2.2), 9);
}
function boardCount(level: number): number {
  return Math.min(level, 8);
}
function totalRound(stage: number, round: number): number {
  return (stage - 1) * 7 + round;
}

function freshBoard(player: Player, stage: number, round: number, salt: number): UnitInstance[] {
  const level = aiLevel(totalRound(stage, round));
  const seed = salt * 31 + stage * 101 + round * 7 + player.name.length;
  return generateBoard(level, boardCount(level), seed);
}

type LobbyState = {
  players: Player[];
  lastOpponent: number;

  init: (aiCount?: number, startingHp?: number) => void;
  pickOpponent: () => Player | null;
  /** Apply the human fight result to the human's opponent, then resolve all
   *  AI-vs-AI fights and grow every surviving AI board for the next round. */
  resolveRound: (opponentId: string, result: CombatResult, combatStage: number, nextStage: number, nextRound: number) => void;
};

export const useLobby = create<LobbyState>((set, get) => ({
  players: [],
  lastOpponent: -1,

  init: (aiCount = RIVALS.length, startingHp = 100) => {
    const players: Player[] = RIVALS.slice(0, Math.max(1, Math.min(aiCount, RIVALS.length))).map((name, i) => ({
      id: `ai${i}`,
      name,
      health: startingHp,
      level: 2,
      board: generateBoard(2, 2, (i + 1) * 9176 + 3),
      streak: 0,
      alive: true,
      place: null,
    }));
    set({ players, lastOpponent: -1 });
  },

  pickOpponent: () => {
    const { players, lastOpponent } = get();
    const alive = players.filter((p) => p.alive);
    if (alive.length === 0) return null;
    // Round-robin through living rivals.
    let idx = lastOpponent;
    for (let n = 0; n < players.length; n++) {
      idx = (idx + 1) % players.length;
      if (players[idx].alive) {
        set({ lastOpponent: idx });
        return players[idx];
      }
    }
    return alive[0];
  },

  resolveRound: (opponentId, result, combatStage, nextStage, nextRound) => {
    const players = get().players.map((p) => ({ ...p }));
    const byId = new Map(players.map((p) => [p.id, p]));

    // 1) Human's opponent takes the result of that fight.
    const opp = byId.get(opponentId);
    if (opp && opp.alive) {
      if (result.winner === "ally") {
        opp.health -= stageBaseDamage(combatStage) + result.survivors;
        opp.streak = opp.streak <= 0 ? opp.streak - 1 : -1;
      } else if (result.winner === "enemy") {
        opp.streak = opp.streak >= 0 ? opp.streak + 1 : 1;
      }
    }

    // 2) Pair the rest of the living AI and fight them off-screen.
    const rest = players.filter((p) => p.alive && p.id !== opponentId);
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const a = rest[i];
      const b = rest[i + 1];
      const r = simulate(a.board, b.board);
      const loser = r.winner === "ally" ? b : r.winner === "enemy" ? a : null;
      const winner = r.winner === "ally" ? a : r.winner === "enemy" ? b : null;
      if (loser) {
        loser.health -= stageBaseDamage(combatStage) + r.survivors;
        loser.streak = loser.streak <= 0 ? loser.streak - 1 : -1;
      }
      if (winner) winner.streak = winner.streak >= 0 ? winner.streak + 1 : 1;
    }
    // Odd one out fights a neutral board.
    if (rest.length % 2 === 1) {
      const solo = rest[rest.length - 1];
      const ghost = generateBoard(aiLevel(totalRound(combatStage, nextRound)), boardCount(solo.level), combatStage * 777 + 13);
      const r = simulate(solo.board, ghost);
      if (r.winner === "enemy") solo.health -= stageBaseDamage(combatStage) + r.survivors;
    }

    // 3) Eliminate the fallen, then grow survivors for the next planning phase.
    const aliveBefore = players.filter((p) => p.alive).length;
    let deaths = 0;
    for (const p of players) {
      if (p.alive && p.health <= 0) {
        p.health = 0;
        p.alive = false;
        deaths++;
        p.place = aliveBefore - deaths + 1; // human counted separately; close enough
      }
    }
    for (const p of players) {
      if (!p.alive) continue;
      p.level = aiLevel(totalRound(nextStage, nextRound));
      p.board = freshBoard(p, nextStage, nextRound, players.indexOf(p) + 1);
    }

    set({ players });
  },
}));
