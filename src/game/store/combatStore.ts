import { create } from "zustand";
import type { UnitInstance } from "../types";
import { simulate, type CombatResult } from "../engine/combat";

export type CombatMode = "pvp" | "pve";

type CombatState = {
  result: CombatResult | null;
  mode: CombatMode;
  opponentId: string | null;
  opponentName: string;
  /** Run the deterministic sim of the human board vs an opponent board. */
  start: (allies: UnitInstance[], enemies: UnitInstance[], mode: CombatMode, opponentId: string | null, opponentName: string) => void;
  clear: () => void;
};

export const useCombat = create<CombatState>((set) => ({
  result: null,
  mode: "pvp",
  opponentId: null,
  opponentName: "Rival",
  start: (allies, enemies, mode, opponentId, opponentName) => {
    const result = simulate(allies, enemies);
    set({ result, mode, opponentId, opponentName });
  },
  clear: () => set({ result: null, opponentId: null }),
}));
