"use client";

import { create } from "zustand";
import { DEFAULT_ITEMS_ENABLED } from "../data/itemPool";
import { MAX_REGIONS } from "../data/generations";

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
  /** Drive the match from the dedicated server (#110). On by default. */
  serverDriven: boolean;
  /** Private lobby — not listed in the public game browser (friends can still join
   *  via the Friends panel). Default false (public). */
  isPrivate: boolean;
};

/** Host-side draft of the rules before a room is created. Once a room exists the
 *  networked roomStore is the source of truth; this just seeds the lobby + the
 *  WelcomeScreen "Create" flow. */
export type PreLobbyState = {
  rules: GameRules;
  setRules: (update: Partial<GameRules>) => void;
  toggleGeneration: (gen: number) => void;
  toggleItem: (itemId: string) => void;
};

const DEFAULT_RULES: GameRules = {
  generations: [1],
  // 60 < any single region's pool, so each game randomly drafts a DIFFERENT subset of
  // the region (seeded by room code) — variety game-to-game, whole dex reachable over
  // time. Pick the ★ "full" option in the lobby to play the entire region every game.
  draftPoolSize: 60,
  startingHp: 100,
  itemsEnabled: DEFAULT_ITEMS_ENABLED,
  maxPlayers: 8,
  augmentsEnabled: true,
  // Authoritative server drives every game by default (#110): Cloud Functions own the
  // phase transitions, combat resolution and the winner, so outcomes can't diverge
  // between players. The client keeps a 4s fallback if the server is ever late.
  serverDriven: true,
  isPrivate: false,
};

export const usePreLobby = create<PreLobbyState>((set) => ({
  rules: { ...DEFAULT_RULES },

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
}));
