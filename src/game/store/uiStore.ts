import { create } from "zustand";

/** Transient UI state (not part of game logic). */
type UiState = {
  /** The unit currently being inspected in the detail panel, or null. */
  inspect: { defId: string; star: 1 | 2 | 3 } | null;
  setInspect: (defId: string, star: 1 | 2 | 3) => void;
  clearInspect: () => void;

  /** Which player's board we're viewing. null = your own (interactive). */
  viewPlayerId: string | null;
  setView: (playerId: string | null) => void;

  /** An inventory item the player has "picked up" to equip on the next unit click. */
  armedItem: string | null;
  armItem: (itemId: string | null) => void;
};

export const useUi = create<UiState>((set) => ({
  inspect: null,
  setInspect: (defId, star) => set({ inspect: { defId, star } }),
  clearInspect: () => set({ inspect: null }),

  viewPlayerId: null,
  setView: (playerId) => set({ viewPlayerId: playerId }),

  armedItem: null,
  armItem: (itemId) => set((s) => ({ armedItem: s.armedItem === itemId ? null : itemId })),
}));
