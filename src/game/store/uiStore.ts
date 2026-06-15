import { create } from "zustand";

/** Transient UI state (not part of game logic). */
type UiState = {
  /** The unit currently being inspected in the detail panel, or null.
   *  `iid` identifies the specific on-board/bench instance (for held items). */
  inspect: { defId: string; star: 1 | 2 | 3; iid?: string } | null;
  setInspect: (defId: string, star: 1 | 2 | 3, iid?: string) => void;
  clearInspect: () => void;

  /** An inventory item being inspected in the detail panel (mutually exclusive
   *  with a mon inspect). */
  inspectedItem: string | null;
  setInspectedItem: (id: string | null) => void;

  /** Which player's board we're viewing. null = your own (interactive). */
  viewPlayerId: string | null;
  setView: (playerId: string | null) => void;

  /** An inventory item the player has "picked up" to equip on the next unit click. */
  armedItem: string | null;
  armItem: (itemId: string | null) => void;

  /** Transient feedback toast for rejected/blocked actions (board full, not
   *  enough gold, item slots full…). The `seq` makes repeated identical messages
   *  re-trigger the auto-dismiss animation. */
  toast: { seq: number; text: string; kind: "error" | "info" } | null;
  pushToast: (text: string, kind?: "error" | "info") => void;
  clearToast: () => void;
};

let toastSeq = 0;

export const useUi = create<UiState>((set) => ({
  inspect: null,
  // Inspecting a mon clears any item inspect (one detail panel, one subject).
  setInspect: (defId, star, iid) => set({ inspect: { defId, star, iid }, inspectedItem: null }),
  clearInspect: () => set({ inspect: null, inspectedItem: null }),

  inspectedItem: null,
  setInspectedItem: (id) => set({ inspectedItem: id, inspect: null }),

  viewPlayerId: null,
  setView: (playerId) => set({ viewPlayerId: playerId }),

  armedItem: null,
  armItem: (itemId) => set((s) => ({ armedItem: s.armedItem === itemId ? null : itemId })),

  toast: null,
  pushToast: (text, kind = "error") => set({ toast: { seq: ++toastSeq, text, kind } }),
  clearToast: () => set({ toast: null }),
}));
