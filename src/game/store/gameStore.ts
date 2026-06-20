import { create } from "zustand";
import { ECONOMY, XP_TO_REACH, MAX_LEVEL, BOARD, boardSizeForLevel, roundKind, roundsInStage, streakGold, type Cost } from "../config";
import type { UnitInstance } from "../types";
import { getDef, typesForStar } from "../data/mons";
import { makeRng, randInt, type Rng } from "../engine/rng";
import { makePool, makeUnitsByCost, rollShop, takeFromPool, returnToPool, type Pool, type UnitsByCost } from "../engine/shop";
import { sellValue, interest } from "../engine/economy";
import { applyCombines, makeInstance } from "../engine/combine";
import { MEGA_STONE, canMega } from "../data/mega";
import { ITEM_POOL, ITEM_BY_ID, COMPONENT_IDS, COMPLETED_IDS, EMBLEM_IDS, EMBLEM_TRAIT, RECIPES, combineKey, isComponent, isEmblem } from "../data/itemPool";
import { AUGMENT_BY_ID } from "../data/augments";
import { useUi } from "./uiStore";
import { useAppStore } from "./appStore";

const ITEM_IDS = new Set(ITEM_POOL.map((i) => i.id));

/** Fire a localized feedback toast for a rejected action (no import cycle —
 *  uiStore/appStore don't import gameStore). */
function toast(en: string, fr: string) {
  const lang = useAppStore.getState().settings.language;
  useUi.getState().pushToast(lang === "fr" ? fr : en);
}

export const BENCH_SIZE = 9;
const INITIAL_SEED = 1337;

/** Resolve bench units to their slots (0..BENCH_SIZE-1). Units with an explicit
 *  `benchSlot` claim it (gaps preserved); the rest fill the first free slots. Returns
 *  an array indexed by slot, null = empty. Shared by the Bench render + drag logic. */
export function resolveBenchSlots(units: UnitInstance[]): (UnitInstance | null)[] {
  const slots: (UnitInstance | null)[] = new Array(BENCH_SIZE).fill(null);
  const unplaced: UnitInstance[] = [];
  for (const u of units) {
    if (u.pos !== null) continue; // on-board units aren't on the bench
    const s = u.benchSlot;
    if (s != null && s >= 0 && s < BENCH_SIZE && slots[s] == null) slots[s] = u;
    else unplaced.push(u);
  }
  let si = 0;
  for (const u of unplaced) {
    while (si < BENCH_SIZE && slots[si] != null) si++;
    if (si < BENCH_SIZE) slots[si] = u;
  }
  return slots;
}

// Pension (Day Care): gold to deposit, planning rounds until it matures (1★→2★).
export const PENSION_COST = 4;
export const PENSION_ROUNDS = 3;

/** Shared-pool copies a unit of the given star represents (★=1, ★★=3, ★★★=9). */
const copiesForStar = (star: number) => (star === 1 ? 1 : star === 2 ? 3 : 9);

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

/** A PvE item component dropped onto the board at a slain creep's position, waiting to
 *  be clicked to collect. `cell` is a FULL-FIELD coordinate [col(0..6), row(0..7)] so
 *  the drop sits exactly where the mob fell (the enemy half), not bunched on your side. */
export type ItemDrop = { id: string; itemId: string; cell: [number, number] };

type State = {
  gold: number;
  xp: number;
  level: number;
  streak: number;
  pool: Pool;
  unitsByCost: UnitsByCost;
  /** Completed item ids the lobby enabled. null/empty = all allowed. A component
   *  pair only fuses if its resulting completed item is in here. */
  enabledItems: string[] | null;
  units: UnitInstance[];
  shop: (string | null)[];
  frozen: boolean;
  /** Unequipped items in the player's inventory (e.g. Mega Stones). */
  items: string[];
  /** PvE loot dropped onto the board, waiting to be clicked to collect. Auto-collected
   *  the following planning round so a missed click never loses an item. */
  drops: ItemDrop[];
  /** Chosen augment ids (TFT-style persistent boosts). */
  augments: string[];
  /** Pokémon Pension (Day Care): a single 1★ mon training to a 2★. `roundsLeft`
   *  ticks down each planning round; at 0 it's ready to collect. */
  pension: { defId: string; star: 1 | 2 | 3; roundsLeft: number } | null;

  // selectors
  benchUnits: () => UnitInstance[];
  boardUnits: () => UnitInstance[];

  // actions
  newGame: (allowedIds?: string[], enabledItems?: string[], startItems?: string[]) => void;
  reroll: () => void;
  buyXp: () => void;
  buyUnit: (slot: number) => void;
  sell: (iid: string) => void;
  moveToBoard: (iid: string, col: number, row: number) => void;
  deployUnit: (iid: string) => void;
  moveToBench: (iid: string) => void;
  reorderBench: (iid: string, toIndex: number) => void;
  fillBoard: () => void;
  toggleFreeze: () => void;
  /** Multiplayer: grant a planning round's economy (income/xp/shop) for a host-driven round.
   *  `wonLast` adds the TFT win-gold (+1) on top of base + interest when the previous combat was won.
   *  `mode` carries game-mode round grants (a recurring item like Mega Madness's stone, and a
   *  PvE loot multiplier for Treasure Hunt). */
  netRound: (stage: number, round: number, streak: number, wonLast?: boolean, mode?: { roundItem?: string | null; lootScale?: number }) => void;
  /** Multiplayer: take a carousel pick (unit or Mega Stone) without advancing the round. */
  netCarouselPick: (pick: string) => void;
  /** Pick an augment — applies its effect and persists it. */
  pickAugment: (id: string) => void;
  /** Multiplayer: snapshot / restore the local economy for reconnect. */
  exportSave: () => { gold: number; xp: number; level: number; units: UnitInstance[]; shop: (string | null)[]; items: string[]; augments: string[]; pension: State["pension"] };
  importSave: (save: { gold: number; xp: number; level: number; units?: UnitInstance[]; shop?: (string | null)[]; items?: string[]; augments?: string[]; pension?: State["pension"] }, allowedIds?: string[], enabledItems?: string[]) => void;
  /** Spawn loot drops at slain-creep positions (called at PvE combat-end). Idempotent
   *  per id so a re-render / reconnect can't double-drop. */
  spawnDrops: (drops: ItemDrop[]) => void;
  /** Collect a dropped item from the board into the inventory. */
  collectDrop: (id: string) => void;
  equipItem: (iid: string, itemId: string) => void;
  unequipItem: (iid: string, itemId: string) => void;
  /** Anvil: reforge an inventory completed item / emblem into a random different one
   *  of the same class. */
  reforgeItem: (itemId: string) => void;
  /** Anvil: forge a completed item into a random Spatula emblem (trait grantor). */
  forgeEmblem: (itemId: string) => void;
  /** Pension: drop a 1★ mon into the Day Care to train it into a 2★. */
  depositToPension: (iid: string) => void;
  /** Pension: retrieve a matured mon (back to the bench, one star higher). */
  collectPension: () => void;
};

// Module-level RNG so the store stays serialisable; reseeded on newGame.
let rng: Rng = makeRng(INITIAL_SEED);

export const useGame = create<State>((set, get) => ({
  gold: 4,
  xp: 0,
  level: 1,
  streak: 0,
  pool: makePool(),
  unitsByCost: makeUnitsByCost(),
  enabledItems: null,
  pension: null,
  units: [],
  shop: [],
  frozen: false,
  items: [],
  drops: [],
  augments: [],

  benchUnits: () => get().units.filter((u) => u.pos === null),
  boardUnits: () => get().units.filter((u) => u.pos !== null),

  newGame: (allowedIds?: string[], enabledItems?: string[], startItems?: string[]) => {
    // Fresh, independent randomness each game (and per player) — not a fixed seed,
    // so every player's shop rolls differently.
    rng = makeRng((Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0);
    const pool = makePool(allowedIds);
    const unitsByCost = makeUnitsByCost(allowedIds);
    // One free starter, auto-placed on the front row, so the opening PvE round is
    // never an empty board. The first PvE rounds are kept deliberately soft (see
    // generateCreepBoard) so this single mon can win them.
    const starters = unitsByCost[1] ?? [];
    const units: UnitInstance[] = [];
    if (starters.length) {
      const id = starters[randInt(rng, starters.length)];
      takeFromPool(pool, id);
      units.push({ ...makeInstance(id), pos: [3, BOARD.rows - 1] });
    }
    set({
      pool, unitsByCost, enabledItems: enabledItems && enabledItems.length ? enabledItems : null,
      pension: null,
      gold: 4, xp: 0, level: 1,
      // Game-mode starting items (region signature Emblem + item, Mega Madness stone).
      streak: 0, units, frozen: false, items: startItems ? [...startItems] : [], drops: [], augments: [],
      shop: rollShop(1, pool, rng, unitsByCost),
    });
  },

  reroll: () => {
    const { gold, level, pool, unitsByCost, augments } = get();
    const cost = augments.includes("lucky") ? 1 : ECONOMY.rerollCost; // Lucky Rolls augment
    if (gold < cost) { toast("Not enough gold", "Pas assez d'or"); return; }
    set({ gold: gold - cost, frozen: false, shop: rollShop(level, pool, rng, unitsByCost) });
  },

  buyXp: () => {
    const { gold, xp, level } = get();
    if (level >= MAX_LEVEL) { toast("Already max level", "Niveau max atteint"); return; }
    if (gold < ECONOMY.buyXpCost) { toast("Not enough gold", "Pas assez d'or"); return; }
    const newXp = xp + ECONOMY.buyXpAmount;
    set({ gold: gold - ECONOMY.buyXpCost, xp: newXp, level: levelFromXp(newXp) });
  },

  buyUnit: (slot) => {
    const state = get();
    const defId = state.shop[slot];
    if (!defId) return;
    const cost = getDef(defId).cost as Cost;
    if (state.gold < cost) { toast("Not enough gold", "Pas assez d'or"); return; }
    // Never buy more copies than the shared pool actually has left.
    if ((state.pool[defId] ?? 0) <= 0) return;

    // Combine first, THEN gate on bench size: a 3rd copy that merges into a
    // star-up frees its bench slots, so a full bench can still accept it.
    const { units, dropped } = applyCombines([...state.units, makeInstance(defId)]);
    const benchAfter = units.filter((u) => u.pos === null).length;
    if (benchAfter > BENCH_SIZE) { toast("Bench full", "Banc plein"); return; }

    takeFromPool(state.pool, defId);
    const shop = [...state.shop];
    shop[slot] = null;
    set({ gold: state.gold - cost, units, shop, pool: { ...state.pool }, items: [...state.items, ...dropped] });
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
    if (unit.pos === null && !occupant && onBoard.length >= cap) { toast("Board full — level up for more slots", "Plateau plein — montez de niveau"); return; }

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

  // Auto-deploy bench units onto empty board cells (centre-out, front rows first)
  // until the level cap is reached or the bench runs dry — so one click fills the
  // board instead of placing mons one at a time.
  fillBoard: () => {
    const state = get();
    const cap = boardSizeForLevel(state.level);
    const COL_ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre column first, then outward
    const units = [...state.units];
    const benchOrder = units.filter((u) => u.pos === null); // leftmost bench unit first
    const taken = new Set(units.filter((u) => u.pos !== null).map((u) => `${u.pos![0]}-${u.pos![1]}`));
    let count = taken.size;
    let placedAny = false;
    for (const b of benchOrder) {
      if (count >= cap) break;
      let placed = false;
      for (let row = BOARD.rows - 1; row >= 0 && !placed; row--) {
        for (const col of COL_ORDER) {
          if (!taken.has(`${col}-${row}`)) {
            const idx = units.findIndex((u) => u.iid === b.iid);
            units[idx] = { ...units[idx], pos: [col, row] as [number, number] };
            taken.add(`${col}-${row}`);
            count++; placed = true; placedAny = true; break;
          }
        }
      }
    }
    if (placedAny) set({ units });
  },

  // Rearrange the bench: drop a bench unit onto slot `toSlot` — it sits THERE (gaps
  // allowed); if another unit occupies it, they swap. Bench placement never affects
  // combat (only on-board units are simulated).
  reorderBench: (iid, toSlot) => {
    const state = get();
    if (toSlot < 0 || toSlot >= BENCH_SIZE) return;
    const slots = resolveBenchSlots(state.units);
    const fromSlot = slots.findIndex((u) => u?.iid === iid);
    if (fromSlot < 0 || fromSlot === toSlot) return;
    const occupant = slots[toSlot];
    set({
      units: state.units.map((u) => {
        if (u.iid === iid) return { ...u, benchSlot: toSlot };
        if (occupant && u.iid === occupant.iid) return { ...u, benchSlot: fromSlot }; // swap
        return u;
      }),
    });
  },

  toggleFreeze: () => set({ frozen: !get().frozen }),

  // Multiplayer: economy for a host-driven planning round (stage/round/HP all come
  // from the room — this only grants the local econ: income, XP, shop, loot).
  netRound: (stage, round, streak, wonLast, mode) => {
    const state = get();
    // Passive augments: extra gold / XP each round.
    const augGold = (state.augments.includes("rich") ? 1 : 0) + (state.augments.includes("compound-interest") ? 2 : 0);
    const augXp = (state.augments.includes("scholar") ? 2 : 0) + (state.augments.includes("fast-learner") ? 3 : 0);
    // TFT win-gold: +1 for winning the previous combat, paid on top of base + interest + streak.
    const winGold = wonLast ? ECONOMY.winGold : 0;
    const income = ECONOMY.baseIncome + interest(state.gold) + streakGold(streak) + winGold + augGold;
    const newXp = state.xp + ECONOMY.passiveXpPerRound + augXp;
    const lvl = levelFromXp(newXp);
    const shop = state.frozen ? state.shop : rollShop(lvl, state.pool, rng, state.unitsByCost);

    // PvE loot: extra gold + an occasional free low-cost unit. (Item components now
    // drop at the slain creep's position — spawned at combat-end via spawnDrops — so
    // they appear where the mob fell instead of bunched on your board.)
    let bonusGold = 0;
    // Auto-collect any drops the player didn't click last round (never lose an item).
    let items = [...state.items, ...state.drops.map((d) => d.itemId)];
    let units = state.units;
    const lootScale = mode?.lootScale ?? 1; // Treasure Hunt mode pours out richer PvE loot.
    const prev = round > 1 ? { stage, round: round - 1 } : { stage: stage - 1, round: roundsInStage(stage - 1) };
    if (prev.stage >= 1 && roundKind(prev.stage, prev.round) === "pve") {
      bonusGold = Math.round((2 + Math.floor(stage / 2)) * lootScale);
      const cheap = [...(state.unitsByCost[1] ?? []), ...(state.unitsByCost[2] ?? [])];
      if (rng() < 0.25 * lootScale && cheap.length && units.filter((u) => u.pos === null).length < BENCH_SIZE) {
        const pickId = cheap[randInt(rng, cheap.length)];
        takeFromPool(state.pool, pickId); // free PvE drop is a real pool copy — debit it
        const r = applyCombines([...units, makeInstance(pickId)]);
        units = r.units; items = [...items, ...r.dropped];
      }
      // Treasure Hunt: an extra item component on every PvE round.
      if (lootScale > 1) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
    }

    // Prospector augment: a free item component every 3rd round.
    if (state.augments.includes("prospector") && round % 3 === 0) {
      items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
    }

    // Mega Madness mode: a fresh Mega Stone every round.
    if (mode?.roundItem) items = [...items, mode.roundItem];

    // Pension trains one planning round closer to maturity (down to 0 = ready).
    const pension = state.pension ? { ...state.pension, roundsLeft: Math.max(0, state.pension.roundsLeft - 1) } : null;

    set({ gold: state.gold + income + bonusGold, xp: newXp, level: lvl, shop, frozen: false, items, units, drops: [], pension, pool: { ...state.pool } });
  },

  netCarouselPick: (pick) => {
    const state = get();
    // Item picks (Mega Stone or any held item) go to the inventory; otherwise a unit.
    if (pick === MEGA_STONE || ITEM_IDS.has(pick)) { set({ items: [...state.items, pick] }); return; }
    if (state.units.filter((u) => u.pos === null).length < BENCH_SIZE) {
      takeFromPool(state.pool, pick); // carousel mons come from the shared bag — debit it
      const r = applyCombines([...state.units, makeInstance(pick)]);
      set({ units: r.units, items: [...state.items, ...r.dropped], pool: { ...state.pool } });
    }
  },

  pickAugment: (id) => {
    const state = get();
    if (state.augments.includes(id) || !AUGMENT_BY_ID[id]) return;
    let { gold, xp, items, units } = state;
    const benchFree = () => BENCH_SIZE - units.filter((u) => u.pos === null).length;
    // Instant effects fire on pick; passive ones are applied each round in netRound.
    switch (id) {
      case "pumped-up": gold += 8; break;
      case "pocket-change": gold += 5; break;
      case "windfall": gold += 12; break;
      case "jackpot": gold += 18; break;
      case "training": xp += 4; break;
      case "study-hall": xp += 6; break;
      case "big-brain": xp += 8; break;
      case "prodigy": xp += 12; break;
      case "merchant": gold += 6; items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]]; break;
      case "veteran": gold += 5; xp += 4; break;
      case "mega-gift": items = [...items, MEGA_STONE]; break;
      case "treasure":
        for (let i = 0; i < 2; i++) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
        break;
      case "component-cache":
        for (let i = 0; i < 3; i++) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
        break;
      case "spatula-set": items = [...items, EMBLEM_IDS[randInt(rng, EMBLEM_IDS.length)]]; break;
      case "trait-trove":
        for (let i = 0; i < 2; i++) items = [...items, EMBLEM_IDS[randInt(rng, EMBLEM_IDS.length)]];
        break;
      case "artisan": items = [...items, COMPLETED_IDS[randInt(rng, COMPLETED_IDS.length)]]; break;
      case "blacksmith":
        for (let i = 0; i < 2; i++) items = [...items, COMPLETED_IDS[randInt(rng, COMPLETED_IDS.length)]];
        break;
      case "head-start":
      case "recruiter":
      case "draft-day": {
        if (id === "head-start") gold += 3;
        const n = id === "draft-day" ? 3 : id === "head-start" ? 1 : 2;
        const cheap = [...(state.unitsByCost[1] ?? []), ...(state.unitsByCost[2] ?? [])];
        for (let i = 0; i < n && benchFree() > 0 && cheap.length; i++) {
          const pickId = cheap[randInt(rng, cheap.length)];
          takeFromPool(state.pool, pickId); // granted mons come from the shared bag — debit it
          const r = applyCombines([...units, makeInstance(pickId)]);
          units = r.units; items = [...items, ...r.dropped];
        }
        break;
      }
    }
    set({ augments: [...state.augments, id], gold, xp, level: levelFromXp(xp), items, units, pool: { ...state.pool } });
  },

  exportSave: () => {
    const s = get();
    // Fold any uncollected board drops into the synced items so a reconnect banks
    // them (the board-drop layer is purely a local visual; the item is never lost).
    return { gold: s.gold, xp: s.xp, level: s.level, units: s.units, shop: s.shop, items: [...s.items, ...s.drops.map((d) => d.itemId)], augments: s.augments, pension: s.pension };
  },

  importSave: (save, allowedIds, enabledItems) => {
    // Rebuild the shop pool from the room's roster — otherwise a restore leaves
    // pool/unitsByCost at the store's default makePool() (ALL generations), so the
    // shop would offer out-of-region mons even though the rules restrict the pool.
    const pool = makePool(allowedIds);
    const unitsByCost = makeUnitsByCost(allowedIds);
    // RTDB mangles arrays (objects for sparse, undefined for empty) and strips
    // null values — so bench units lose `pos: null` and any unit can lose its
    // empty `items`. Coerce back to dense arrays and restore both fields.
    const units = toArray<UnitInstance>(save.units).filter(Boolean).map((u) => ({ ...u!, pos: u!.pos ?? null, items: toArray<string>(u!.items).filter(Boolean) as string[] }));
    // Decrement the rebuilt pool by the copies the player ALREADY owns (a ⭐⭐ = 3
    // copies, ⭐⭐⭐ = 9) so scarcity/3-star odds stay honest — a full pool plus
    // owned units would double-count every copy.
    for (const u of units) takeFromPool(pool, u.defId, copiesForStar(u.star));
    // A pension mon still "exists" (it took its copies at buy time) — keep it only
    // if it belongs to this game's roster (drops a stale cross-roster rematch carry-
    // over) and debit its copies from the rebuilt pool too.
    const restoredPension = save.pension && getDef(save.pension.defId) && (!allowedIds || allowedIds.includes(save.pension.defId)) ? save.pension : null;
    if (restoredPension) takeFromPool(pool, restoredPension.defId, copiesForStar(restoredPension.star));
    set({
      pool, unitsByCost,
      enabledItems: enabledItems && enabledItems.length ? enabledItems : null,
      // Derive level from XP so it always matches (a stale/dropped synced `level`
      // can't stick after a reconnect and show the wrong level all game).
      gold: save.gold, xp: save.xp, level: levelFromXp(save.xp ?? 0),
      units,
      shop: toArray<string>(save.shop, ECONOMY.shopSlots),
      items: toArray<string>(save.items).filter(Boolean) as string[],
      drops: [], // synced saves bank drops as items (see exportSave)
      augments: toArray<string>(save.augments).filter(Boolean) as string[],
      pension: restoredPension,
    });
  },

  spawnDrops: (incoming) => {
    const state = get();
    const have = new Set(state.drops.map((d) => d.id));
    const fresh = incoming.filter((d) => !have.has(d.id));
    if (!fresh.length) return;
    set({ drops: [...state.drops, ...fresh] });
  },

  collectDrop: (id) => {
    const state = get();
    const drop = state.drops.find((d) => d.id === id);
    if (!drop) return;
    set({ items: [...state.items, drop.itemId], drops: state.drops.filter((d) => d.id !== id) });
  },

  // Move an item from the inventory onto a unit.
  equipItem: (iid, itemId) => {
    const state = get();
    const idx = state.items.indexOf(itemId);
    if (idx < 0) return;
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;

    // Mega Stone only attaches to a Mega-capable mon AT ITS FINAL FORM (★★★).
    if (itemId === MEGA_STONE) {
      if (!canMega(unit.defId)) { toast("This mon can't Mega Evolve", "Ce Pokémon ne peut pas Méga-évoluer"); return; }
      if (unit.star < 3) { toast("Mega Stone needs the final form (★★★)", "La Méga-Gemme nécessite la forme finale (★★★)"); return; }
    }

    // An emblem on a mon that already has that trait is wasted — block it.
    if (isEmblem(itemId)) {
      const def = getDef(unit.defId);
      const native = new Set<string>([...typesForStar(def, unit.star), ...def.roles]);
      if (native.has(EMBLEM_TRAIT[itemId])) { toast("Already has this trait", "Possède déjà ce trait"); return; }
    }

    // Combining: dragging a COMPONENT onto a unit that already holds a component
    // they form a recipe with fuses them into the completed item (2 → 1) — but
    // only if that completed item is enabled by the lobby rules (else the pieces
    // just stay as separate held components).
    const itemAllowed = (id: string) => !state.enabledItems || state.enabledItems.includes(id);
    if (isComponent(itemId)) {
      for (let i = 0; i < unit.items.length; i++) {
        const held = unit.items[i];
        if (!isComponent(held)) continue;
        const completed = RECIPES[combineKey(itemId, held)];
        if (completed && itemAllowed(completed)) {
          const items = [...state.items];
          items.splice(idx, 1); // consume the dragged component
          const newItems = [...unit.items];
          newItems[i] = completed; // the held component becomes the completed item
          set({ items, units: state.units.map((u) => (u.iid === iid ? { ...u, items: newItems } : u)) });
          return;
        }
      }
    }

    // No combine → slot the item whole (respect the 3-item cap).
    if (unit.items.length >= 3) { toast("Item slots full (3 max)", "Emplacements pleins (3 max)"); return; }
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

  // Anvil: reforge an inventory completed item / emblem into a random DIFFERENT one
  // of the same class. Random (not chosen), so it's a gamble — same as TFT's reforger.
  reforgeItem: (itemId) => {
    const state = get();
    const idx = state.items.indexOf(itemId);
    if (idx < 0) return;
    const def = ITEM_BY_ID[itemId];
    if (!def || def.kind === "component") { toast("Only completed items can be reforged", "Seuls les objets complets peuvent être reforgés"); return; }
    const pool = (def.kind === "emblem" ? EMBLEM_IDS : COMPLETED_IDS).filter((x) => x !== itemId);
    if (!pool.length) return;
    const next = pool[randInt(rng, pool.length)];
    const items = [...state.items];
    items[idx] = next;
    set({ items });
    toast(`Reforged → ${ITEM_BY_ID[next]?.name ?? next}`, `Reforgé → ${ITEM_BY_ID[next]?.nameFr ?? next}`);
  },

  // Anvil: sacrifice a completed item to forge a random Spatula emblem (a trait grantor).
  forgeEmblem: (itemId) => {
    const state = get();
    const idx = state.items.indexOf(itemId);
    if (idx < 0) return;
    const def = ITEM_BY_ID[itemId];
    if (!def || def.kind !== "completed") { toast("Forge an emblem from a completed item", "Forgez un emblème depuis un objet complet"); return; }
    const next = EMBLEM_IDS[randInt(rng, EMBLEM_IDS.length)];
    const items = [...state.items];
    items[idx] = next;
    set({ items });
    toast(`Forged → ${ITEM_BY_ID[next]?.name ?? next}`, `Forgé → ${ITEM_BY_ID[next]?.nameFr ?? next}`);
  },

  // Pension (day-care breeding): deposit a 1★ mon; after PENSION_ROUNDS planning
  // rounds you collect it back PLUS one bred copy of the same species (costs gold,
  // one slot). Its held items return to the inventory while it's away.
  depositToPension: (iid) => {
    const state = get();
    if (state.pension) { toast("Pension is occupied", "La Pension est occupée"); return; }
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;
    if (unit.star !== 1) { toast("Only ★ mons can be trained", "Seuls les ★ peuvent s'entraîner"); return; }
    if (state.gold < PENSION_COST) { toast("Not enough gold", "Pas assez d'or"); return; }
    set({
      gold: state.gold - PENSION_COST,
      units: state.units.filter((u) => u.iid !== iid),
      items: [...state.items, ...unit.items], // return any held items to inventory
      pension: { defId: unit.defId, star: unit.star, roundsLeft: PENSION_ROUNDS },
    });
  },

  // Pension: collect the matured mon back PLUS one bred copy of the same species
  // (both at the deposited star). The copies may chain-combine if you already own
  // more of that mon.
  collectPension: () => {
    const state = get();
    const p = state.pension;
    if (!p || p.roundsLeft > 0) return;
    // Keep pool scarcity honest: the deposited mon's copies were already debited at
    // buy time and stayed "out" while training — only the NEW bred copy is a fresh
    // draw from the bag, so debit just that. (A deposit→collect→sell loop then nets
    // zero on the original and −then-+ on the copy: no phantom copies minted.)
    const pool = { ...state.pool };
    takeFromPool(pool, p.defId, copiesForStar(p.star));
    const original = { ...makeInstance(p.defId), star: p.star }; // the mon you deposited, returned
    const copy = { ...makeInstance(p.defId), star: p.star };      // its bred copy
    const { units, dropped } = applyCombines([...state.units, original, copy]);
    // Guard bench overflow AFTER combines (two new mons may merge into one, or into
    // an existing pair) — if it still wouldn't fit, abort without mutating anything.
    if (units.filter((u) => u.pos === null).length > BENCH_SIZE) { toast("Bench full", "Banc plein"); return; }
    set({ units, items: [...state.items, ...dropped], pension: null, pool });
  },
}));
