"use client";

import { create } from "zustand";
import { DEFAULT_ITEMS_ENABLED } from "../data/itemPool";
import { MAX_REGIONS } from "../data/generations";

export type BotDifficulty = "easy" | "medium" | "hard";

export type PlayerSlot = {
  id: string;
  type: "empty" | "human" | "bot";
  name: string;
  botDifficulty: BotDifficulty;
  status: "waiting" | "ready" | "connected";
};

export type GameRules = {
  /** Generations included. [1] = Kanto only, [1,2] = Kanto+Johto, etc. */
  generations: number[];
  /** How many Pokémon to draft from the eligible pool. */
  draftPoolSize: number;
  /** Starting HP (default 100). */
  startingHp: number;
  /** Item ids that are enabled for this game. */
  itemsEnabled: string[];
  /** Max players (2–8). */
  maxPlayers: number;
  /** Whether augment rounds (stage 2/3/4) are offered. Default on. */
  augmentsEnabled: boolean;
  /** Drive the match from the dedicated server (#110). Off by default. */
  serverDriven: boolean;
};

export type PreLobbyState = {
  lobbyCode: string;
  isHost: boolean;
  slots: PlayerSlot[];
  rules: GameRules;
  phase: "welcome" | "lobby" | "starting";

  enterLobby: (username: string, isHost?: boolean) => void;
  generateCode: () => void;
  setSlot: (slotId: string, update: Partial<PlayerSlot>) => void;
  addBot: (slotId: string, difficulty: BotDifficulty) => void;
  clearSlot: (slotId: string) => void;
  setRules: (update: Partial<GameRules>) => void;
  toggleGeneration: (gen: number) => void;
  toggleItem: (itemId: string) => void;
  readyToStart: () => boolean;
  startGame: () => void;
};

function makeSlots(count = 8): PlayerSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `slot-${i + 1}`,
    type: i === 0 ? "human" : "empty",
    name: i === 0 ? "Joueur 1" : "",
    botDifficulty: "medium",
    status: i === 0 ? "ready" : "waiting",
  }));
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const DEFAULT_RULES: GameRules = {
  generations: [1],
  draftPoolSize: 90,
  startingHp: 100,
  itemsEnabled: DEFAULT_ITEMS_ENABLED,
  maxPlayers: 8,
  augmentsEnabled: true,
  serverDriven: false,
};

export const usePreLobby = create<PreLobbyState>((set, get) => ({
  // Deterministic placeholder for SSR; randomised on the client after mount
  // (LobbyScreen calls generateCode) to avoid a hydration mismatch.
  lobbyCode: "------",
  isHost: true,
  slots: makeSlots(),
  rules: { ...DEFAULT_RULES },
  phase: "welcome",

  enterLobby: (username, isHost = true) =>
    set((s) => ({
      phase: "lobby",
      isHost,
      slots: s.slots.map((sl) =>
        sl.id === "slot-1" ? { ...sl, name: username, status: "ready" } : sl
      ),
    })),

  generateCode: () => set({ lobbyCode: randomCode() }),

  setSlot: (slotId, update) =>
    set((s) => ({
      slots: s.slots.map((sl) => (sl.id === slotId ? { ...sl, ...update } : sl)),
    })),

  addBot: (slotId, difficulty) =>
    set((s) => ({
      slots: s.slots.map((sl) =>
        sl.id === slotId
          ? { ...sl, type: "bot", botDifficulty: difficulty, name: `IA (${difficulty})`, status: "ready" }
          : sl
      ),
    })),

  clearSlot: (slotId) =>
    set((s) => ({
      slots: s.slots.map((sl) =>
        sl.id === slotId && sl.id !== "slot-1"
          ? { ...sl, type: "empty", name: "", status: "waiting", botDifficulty: "medium" }
          : sl
      ),
    })),

  setRules: (update) =>
    set((s) => ({ rules: { ...s.rules, ...update } })),

  toggleGeneration: (gen) =>
    set((s) => {
      const has = s.rules.generations.includes(gen);
      // Hybrid model: cap the mix at MAX_REGIONS — ignore a request to add beyond it.
      if (!has && s.rules.generations.length >= MAX_REGIONS) return s;
      const gens = has
        ? s.rules.generations.filter((g) => g !== gen)
        : [...s.rules.generations, gen].sort((a, b) => a - b);
      // Always keep at least 1 generation.
      if (gens.length === 0) return s;
      return { rules: { ...s.rules, generations: gens } };
    }),

  toggleItem: (itemId) =>
    set((s) => {
      const enabled = s.rules.itemsEnabled.includes(itemId)
        ? s.rules.itemsEnabled.filter((id) => id !== itemId)
        : [...s.rules.itemsEnabled, itemId];
      return { rules: { ...s.rules, itemsEnabled: enabled } };
    }),

  readyToStart: () => {
    const { slots } = get();
    const active = slots.filter((sl) => sl.type !== "empty");
    return active.length >= 2 && active.every((sl) => sl.status === "ready");
  },

  startGame: () => set({ phase: "starting" }),
}));
