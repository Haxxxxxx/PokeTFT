import { create } from "zustand";
import type { UnitInstance } from "../types";
import { simulate, type CombatResult } from "../engine/combat";

type CombatState = {
  result: CombatResult | null;
  opponentId: string | null;
  opponentName: string;
  /** Run the deterministic sim of the human board vs an opponent board. */
  start: (allies: UnitInstance[], enemies: UnitInstance[], stage: number, round: number, opponentId: string, opponentName: string) => void;
  clear: () => void;
};

export const useCombat = create<CombatState>((set) => ({
  result: null,
  opponentId: null,
  opponentName: "Rival",
  start: (allies, enemies, stage, round, opponentId, opponentName) => {
    const seed = stage * 1000 + round * 17 + allies.length * 3 + 1;
    const result = simulate(allies, enemies, seed);
    set({ result, opponentId, opponentName });
  },
  clear: () => set({ result: null, opponentId: null }),
}));
