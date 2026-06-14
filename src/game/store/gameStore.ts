import { create } from "zustand";
import { ECONOMY, XP_TO_REACH, MAX_LEVEL, BOARD, boardSizeForLevel, roundKind, advanceRound, stageBaseDamage, streakGold, type Cost, type RoundKind } from "../config";
import type { UnitInstance } from "../types";
import { getDef } from "../data/mons";
import { makeRng, type Rng } from "../engine/rng";
import { makePool, makeUnitsByCost, rollShop, takeFromPool, returnToPool, type Pool, type UnitsByCost } from "../engine/shop";
import { roundIncome, sellValue, interest } from "../engine/economy";
import { applyCombines, makeInstance } from "../engine/combine";
import { MEGA_STONE } from "../data/mega";

export const BENCH_SIZE = 9;
const INITIAL_SEED = 1337;

/** RTDB returns arrays that have null/empty leading slots as objects keyed by
 *  index (and strips empty arrays to undefined). Coerce back to a dense array
 *  of the given length so `.map`/`.filter` never blow up after a reconnect. */
function toArray<T>(v: unknown, len?: number): (T | null)[] {
  let out: (T | null)[];
  if (Array.isArray(v)) out = v as (T | null)[];
  else if (v && typeof v === "object") {
    const obj = v as Record<string, T>;
    const keys = Object.keys(obj).map(Number).filter((k) => !Number.isNaN(k));
    const max = keys.length ? Math.max(...keys) : -1;
    out = Array.from({ length: max + 1 }, (_, i) => (i in obj ? obj[i] : null));
  } else out = [];
  if (len != null) {
    out = out.slice(0, len);
    while (out.length < len) out.push(null);
  }
  return out;
}

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
  const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng, state.unitsByCost);
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
  unitsByCost: UnitsByCost;
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
  newGame: (startingHp?: number, allowedIds?: string[]) => void;
  reroll: () => void;
  buyXp: () => void;
  buyUnit: (slot: number) => void;
  sell: (iid: string) => void;
  moveToBoard: (iid: string, col: number, row: number) => void;
  deployUnit: (iid: string) => void;
  moveToBench: (iid: string) => void;
  toggleFreeze: () => void;
  endRound: (won: boolean, survivors?: number) => void;
  pveReward: (won: boolean) => void;
  carouselTake: (defId: string) => void;
  /** Multiplayer: grant a planning round's economy (income/xp/shop) for a host-driven round. */
  netRound: (stage: number, round: number, streak: number) => void;
  /** Multiplayer: take a carousel pick (unit or Mega Stone) without advancing the round. */
  netCarouselPick: (pick: string) => void;
  /** Multiplayer: snapshot / restore the local economy for reconnect. */
  exportSave: () => { gold: number; xp: number; level: number; units: UnitInstance[]; shop: (string | null)[]; items: string[] };
  importSave: (save: { gold: number; xp: number; level: number; units?: UnitInstance[]; shop?: (string | null)[]; items?: string[] }) => void;
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
  unitsByCost: makeUnitsByCost(),
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

  newGame: (startingHp = ECONOMY.startingHealth, allowedIds?: string[]) => {
    // Fresh, independent randomness each game (and per player) — not a fixed seed,
    // so every player's shop rolls differently.
    rng = makeRng((Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0);
    const pool = makePool(allowedIds);
    const unitsByCost = makeUnitsByCost(allowedIds);
    set({
      pool, unitsByCost, gold: 4, xp: 0, level: 1, health: startingHp,
      streak: 0, stage: 1, round: 1, units: [], frozen: false, history: [], items: [],
      shop: rollShop(1, pool, rng, unitsByCost),
    });
  },

  reroll: () => {
    const { gold, level, pool, unitsByCost } = get();
    if (gold < ECONOMY.rerollCost) return;
    set({ gold: gold - ECONOMY.rerollCost, frozen: false, shop: rollShop(level, pool, rng, unitsByCost) });
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
    // Never buy more copies than the shared pool actually has left.
    if ((state.pool[defId] ?? 0) <= 0) return;

    // Combine first, THEN gate on bench size: a 3rd copy that merges into a
    // star-up frees its bench slots, so a full bench can still accept it.
    const units = applyCombines([...state.units, makeInstance(defId)]);
    const benchAfter = units.filter((u) => u.pos === null).length;
    if (benchAfter > BENCH_SIZE) return;

    takeFromPool(state.pool, defId);
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

  // Quick-deploy a bench unit onto the first free board cell (front rows first),
  // respecting the level cap. Used by double-click / the auto-deploy button.
  deployUnit: (iid) => {
    const state = get();
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit || unit.pos !== null) return;
    const cap = boardSizeForLevel(state.level);
    const onBoard = state.boardUnits();
    if (onBoard.length >= cap) return;
    const taken = new Set(onBoard.map((u) => `${u.pos![0]}-${u.pos![1]}`));
    // Front row (closest to the enemy) is the highest row index in player space.
    for (let row = BOARD.rows - 1; row >= 0; row--) {
      for (let col = 0; col < BOARD.cols; col++) {
        if (!taken.has(`${col}-${row}`)) {
          set({ units: state.units.map((u) => (u.iid === iid ? { ...u, pos: [col, row] as [number, number] } : u)) });
          return;
        }
      }
    }
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
    const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng, state.unitsByCost);
    set({ gold: state.gold + income, xp: newXp, level: levelFromXp(newXp), stage, round, shop, frozen: false });
  },

  netCarouselPick: (pick) => {
    const state = get();
    if (pick === MEGA_STONE) { set({ items: [...state.items, MEGA_STONE] }); return; }
    if (state.units.filter((u) => u.pos === null).length < BENCH_SIZE) {
      set({ units: applyCombines([...state.units, makeInstance(pick)]) });
    }
  },

  exportSave: () => {
    const s = get();
    return { gold: s.gold, xp: s.xp, level: s.level, units: s.units, shop: s.shop, items: s.items };
  },

  importSave: (save) => set({
    gold: save.gold, xp: save.xp, level: save.level,
    // RTDB mangles arrays (objects for sparse, undefined for empty) — coerce
    // everything back to dense arrays and guarantee each unit keeps `items`.
    units: toArray<UnitInstance>(save.units).filter(Boolean).map((u) => (u!.items ? u! : { ...u!, items: [] })),
    shop: toArray<string>(save.shop, ECONOMY.shopSlots),
    items: toArray<string>(save.items).filter(Boolean) as string[],
  }),

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
