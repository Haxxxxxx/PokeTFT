import { create } from "zustand";
import { ECONOMY, XP_TO_REACH, MAX_LEVEL, boardSizeForLevel, roundKind, type Cost } from "../config";
import type { UnitInstance } from "../types";
import { getDef } from "../data/mons";
import { makeRng, type Rng } from "../engine/rng";
import { makePool, rollShop, takeFromPool, returnToPool, type Pool } from "../engine/shop";
import { roundIncome, sellValue } from "../engine/economy";
import { applyCombines, makeInstance } from "../engine/combine";

export const BENCH_SIZE = 9;
const INITIAL_SEED = 1337;

function levelFromXp(xp: number): number {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= XP_TO_REACH[l]) lvl = l;
  }
  return lvl;
}

type State = {
  seed: number;
  gold: number;
  xp: number;
  level: number;
  health: number;
  streak: number;
  stage: number;
  round: number;
  pool: Pool;
  units: UnitInstance[];
  shop: (string | null)[];
  frozen: boolean;

  // selectors
  benchUnits: () => UnitInstance[];
  boardUnits: () => UnitInstance[];
  xpProgress: () => { current: number; needed: number | null };

  // actions
  newGame: () => void;
  reroll: () => void;
  buyXp: () => void;
  buyUnit: (slot: number) => void;
  sell: (iid: string) => void;
  moveToBoard: (iid: string, col: number, row: number) => void;
  moveToBench: (iid: string) => void;
  toggleFreeze: () => void;
  endRound: (won: boolean) => void;
};

// Module-level RNG so the store stays serialisable; reseeded on newGame.
let rng: Rng = makeRng(INITIAL_SEED);

export const useGame = create<State>((set, get) => ({
  seed: INITIAL_SEED,
  gold: 4,
  xp: 0,
  level: 1,
  health: ECONOMY.startingHealth,
  streak: 0,
  stage: 1,
  round: 1,
  pool: makePool(),
  units: [],
  shop: [],
  frozen: false,

  benchUnits: () => get().units.filter((u) => u.pos === null),
  boardUnits: () => get().units.filter((u) => u.pos !== null),
  xpProgress: () => {
    const { xp, level } = get();
    if (level >= MAX_LEVEL) return { current: xp, needed: null };
    const base = XP_TO_REACH[level];
    const next = XP_TO_REACH[level + 1];
    return { current: xp - base, needed: next - base };
  },

  newGame: () => {
    rng = makeRng(INITIAL_SEED);
    const pool = makePool();
    set({
      pool, gold: 4, xp: 0, level: 1, health: ECONOMY.startingHealth,
      streak: 0, stage: 1, round: 1, units: [], frozen: false,
      shop: rollShop(1, pool, rng),
    });
  },

  reroll: () => {
    const { gold, level, pool } = get();
    if (gold < ECONOMY.rerollCost) return;
    set({ gold: gold - ECONOMY.rerollCost, frozen: false, shop: rollShop(level, pool, rng) });
  },

  buyXp: () => {
    const { gold, xp, level } = get();
    if (gold < ECONOMY.buyXpCost || level >= MAX_LEVEL) return;
    const newXp = xp + ECONOMY.buyXpAmount;
    set({ gold: gold - ECONOMY.buyXpCost, xp: newXp, level: levelFromXp(newXp) });
  },

  buyUnit: (slot) => {
    const state = get();
    const defId = state.shop[slot];
    if (!defId) return;
    const cost = getDef(defId).cost as Cost;
    if (state.gold < cost) return;
    if (state.benchUnits().length >= BENCH_SIZE) return;

    takeFromPool(state.pool, defId);
    const units = applyCombines([...state.units, makeInstance(defId)]);
    const shop = [...state.shop];
    shop[slot] = null;
    set({ gold: state.gold - cost, units, shop, pool: { ...state.pool } });
  },

  sell: (iid) => {
    const state = get();
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;
    const value = sellValue(unit.defId, unit.star);
    const copies = unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9;
    returnToPool(state.pool, unit.defId, copies);
    set({
      gold: state.gold + value,
      units: state.units.filter((u) => u.iid !== iid),
      pool: { ...state.pool },
    });
  },

  moveToBoard: (iid, col, row) => {
    const state = get();
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;
    const cap = boardSizeForLevel(state.level);
    const onBoard = state.boardUnits();
    const occupant = onBoard.find((u) => u.pos?.[0] === col && u.pos?.[1] === row);

    // Reject if board full and this unit isn't already on the board (and not a swap).
    if (unit.pos === null && !occupant && onBoard.length >= cap) return;

    const units = state.units.map((u) => {
      if (u.iid === iid) return { ...u, pos: [col, row] as [number, number] };
      if (occupant && u.iid === occupant.iid) return { ...u, pos: unit.pos }; // swap
      return u;
    });
    set({ units });
  },

  moveToBench: (iid) => {
    const state = get();
    if (state.benchUnits().length >= BENCH_SIZE && state.units.find((u) => u.iid === iid)?.pos !== null) {
      // bench full — only allow if it's already on bench (no-op)
    }
    set({ units: state.units.map((u) => (u.iid === iid ? { ...u, pos: null } : u)) });
  },

  toggleFreeze: () => set({ frozen: !get().frozen }),

  endRound: (won) => {
    const state = get();
    const newStreak = won
      ? state.streak >= 0 ? state.streak + 1 : 1
      : state.streak <= 0 ? state.streak - 1 : -1;
    const income = roundIncome(state.gold, newStreak);

    // advance round / stage
    let stage = state.stage;
    let round = state.round + 1;
    if (round > 7) { round = 1; stage += 1; }

    const newXp = state.xp + ECONOMY.passiveXpPerRound;
    const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng);

    set({
      gold: state.gold + income,
      xp: newXp,
      level: levelFromXp(newXp),
      streak: newStreak,
      stage, round, shop, frozen: false,
    });
  },
}));

export { roundKind };
