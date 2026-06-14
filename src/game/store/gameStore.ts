import { create } from "zustand";
import { ECONOMY, XP_TO_REACH, MAX_LEVEL, boardSizeForLevel, roundKind, advanceRound, stageBaseDamage, streakGold, type Cost, type RoundKind } from "../config";
import type { UnitInstance } from "../types";
import { getDef } from "../data/mons";
import { makeRng, type Rng } from "../engine/rng";
import { makePool, rollShop, takeFromPool, returnToPool, type Pool } from "../engine/shop";
import { roundIncome, sellValue, interest } from "../engine/economy";
import { applyCombines, makeInstance } from "../engine/combine";
import { MEGA_STONE } from "../data/mega";

export const BENCH_SIZE = 9;
const INITIAL_SEED = 1337;

function levelFromXp(xp: number): number {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= XP_TO_REACH[l]) lvl = l;
  }
  return lvl;
}

export type RoundOutcome = "win" | "loss" | "pve" | "carousel";
export type RoundRecord = { stage: number; round: number; kind: RoundKind; outcome: RoundOutcome };

/** Shared round-advance: passive XP, income, next round/stage, fresh shop. */
function advancePartial(state: State, gold: number) {
  const { stage, round } = advanceRound(state.stage, state.round);
  const newXp = state.xp + ECONOMY.passiveXpPerRound;
  const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng);
  return { gold, xp: newXp, level: levelFromXp(newXp), stage, round, shop, frozen: false };
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
  history: RoundRecord[];
  /** Unequipped items in the player's inventory (e.g. Mega Stones). */
  items: string[];

  // selectors
  benchUnits: () => UnitInstance[];
  boardUnits: () => UnitInstance[];
  xpProgress: () => { current: number; needed: number | null };

  // actions
  newGame: (startingHp?: number) => void;
  reroll: () => void;
  buyXp: () => void;
  buyUnit: (slot: number) => void;
  sell: (iid: string) => void;
  moveToBoard: (iid: string, col: number, row: number) => void;
  moveToBench: (iid: string) => void;
  toggleFreeze: () => void;
  endRound: (won: boolean, survivors?: number) => void;
  pveReward: (won: boolean) => void;
  carouselTake: (defId: string) => void;
  /** Multiplayer: grant a planning round's economy (income/xp/shop) for a host-driven round. */
  netRound: (stage: number, round: number, streak: number) => void;
  grantItem: (itemId: string) => void;
  equipItem: (iid: string, itemId: string) => void;
  unequipItem: (iid: string, itemId: string) => void;
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
  history: [],
  items: [],

  benchUnits: () => get().units.filter((u) => u.pos === null),
  boardUnits: () => get().units.filter((u) => u.pos !== null),
  xpProgress: () => {
    const { xp, level } = get();
    if (level >= MAX_LEVEL) return { current: xp, needed: null };
    const base = XP_TO_REACH[level];
    const next = XP_TO_REACH[level + 1];
    return { current: xp - base, needed: next - base };
  },

  newGame: (startingHp = ECONOMY.startingHealth) => {
    rng = makeRng(INITIAL_SEED);
    const pool = makePool();
    set({
      pool, gold: 4, xp: 0, level: 1, health: startingHp,
      streak: 0, stage: 1, round: 1, units: [], frozen: false, history: [], items: [],
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
    // Never buy more copies than the shared pool actually has left.
    if ((state.pool[defId] ?? 0) <= 0) return;

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
      items: [...state.items, ...unit.items], // recover any held items
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
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;
    // Block board -> bench if the bench is already full (a board unit is no-op-ed).
    if (unit.pos !== null && state.benchUnits().length >= BENCH_SIZE) return;
    set({ units: state.units.map((u) => (u.iid === iid ? { ...u, pos: null } : u)) });
  },

  toggleFreeze: () => set({ frozen: !get().frozen }),

  endRound: (won, survivors = 0) => {
    const state = get();
    const newStreak = won
      ? state.streak >= 0 ? state.streak + 1 : 1
      : state.streak <= 0 ? state.streak - 1 : -1;
    const income = roundIncome(state.gold, newStreak);

    // HP damage on a loss = stage base + surviving enemy units.
    const damage = won ? 0 : stageBaseDamage(state.stage) + survivors;
    const health = Math.max(0, state.health - damage);

    const record: RoundRecord = { stage: state.stage, round: state.round, kind: "pvp", outcome: won ? "win" : "loss" };
    set({
      ...advancePartial(state, state.gold + income),
      streak: newStreak,
      health,
      history: [...state.history, record],
    });
  },

  // PvE round: keep your streak, take no HP damage, earn loot gold on a win.
  pveReward: (won) => {
    const state = get();
    const income = roundIncome(state.gold, state.streak);
    const loot = won ? 3 : 1;
    const record: RoundRecord = { stage: state.stage, round: state.round, kind: "pve", outcome: "pve" };
    set({
      ...advancePartial(state, state.gold + income + loot),
      history: [...state.history, record],
    });
  },

  // Carousel: take one free pick (a unit, or a Mega Stone), then advance the round.
  carouselTake: (pick) => {
    const state = get();
    let units = state.units;
    let items = state.items;
    if (pick === MEGA_STONE) {
      items = [...state.items, MEGA_STONE];
    } else if (state.units.filter((u) => u.pos === null).length < BENCH_SIZE) {
      units = applyCombines([...state.units, makeInstance(pick)]);
    }
    const income = roundIncome(state.gold, state.streak);
    const record: RoundRecord = { stage: state.stage, round: state.round, kind: "carousel", outcome: "carousel" };
    set({
      ...advancePartial(state, state.gold + income),
      units,
      items,
      history: [...state.history, record],
    });
  },

  // Multiplayer: economy for a host-driven planning round (no stage/round of its
  // own — both come from the room; health is room-authoritative, not touched here).
  netRound: (stage, round, streak) => {
    const state = get();
    const income = ECONOMY.baseIncome + interest(state.gold) + streakGold(streak);
    const newXp = state.xp + ECONOMY.passiveXpPerRound;
    const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng);
    set({ gold: state.gold + income, xp: newXp, level: levelFromXp(newXp), stage, round, shop, frozen: false });
  },

  // Add an item to the inventory (carousel pick / loot).
  grantItem: (itemId) => set({ items: [...get().items, itemId] }),

  // Move an item from the inventory onto a unit.
  equipItem: (iid, itemId) => {
    const state = get();
    const idx = state.items.indexOf(itemId);
    if (idx < 0) return;
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit || unit.items.length >= 3) return;
    const items = [...state.items];
    items.splice(idx, 1);
    set({
      items,
      units: state.units.map((u) => (u.iid === iid ? { ...u, items: [...u.items, itemId] } : u)),
    });
  },

  // Pull an item back off a unit into the inventory.
  unequipItem: (iid, itemId) => {
    const state = get();
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;
    const ui = unit.items.indexOf(itemId);
    if (ui < 0) return;
    const newItems = [...unit.items];
    newItems.splice(ui, 1);
    set({
      items: [...state.items, itemId],
      units: state.units.map((u) => (u.iid === iid ? { ...u, items: newItems } : u)),
    });
  },
}));

export { roundKind };
