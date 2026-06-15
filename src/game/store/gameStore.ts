import { create } from "zustand";
import { ECONOMY, XP_TO_REACH, MAX_LEVEL, BOARD, boardSizeForLevel, roundKind, roundsInStage, advanceRound, stageBaseDamage, streakGold, type Cost, type RoundKind } from "../config";
import type { UnitInstance } from "../types";
import { getDef } from "../data/mons";
import { makeRng, randInt, type Rng } from "../engine/rng";
import { makePool, makeUnitsByCost, rollShop, takeFromPool, returnToPool, type Pool, type UnitsByCost } from "../engine/shop";
import { roundIncome, sellValue, interest } from "../engine/economy";
import { applyCombines, makeInstance } from "../engine/combine";
import { MEGA_STONE } from "../data/mega";
import { ITEM_POOL, COMPONENT_IDS, RECIPES, combineKey, isComponent } from "../data/itemPool";
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

// Pension (Day Care): gold to deposit, planning rounds until it matures (1★→2★).
export const PENSION_COST = 4;
export const PENSION_ROUNDS = 3;

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
  gold: number;
  xp: number;
  level: number;
  health: number;
  streak: number;
  stage: number;
  round: number;
  pool: Pool;
  unitsByCost: UnitsByCost;
  /** Completed item ids the lobby enabled. null/empty = all allowed. A component
   *  pair only fuses if its resulting completed item is in here. */
  enabledItems: string[] | null;
  units: UnitInstance[];
  shop: (string | null)[];
  frozen: boolean;
  history: RoundRecord[];
  /** Unequipped items in the player's inventory (e.g. Mega Stones). */
  items: string[];
  /** Chosen augment ids (TFT-style persistent boosts). */
  augments: string[];
  /** Pokémon Pension (Day Care): a single 1★ mon training to a 2★. `roundsLeft`
   *  ticks down each planning round; at 0 it's ready to collect. */
  pension: { defId: string; star: 1 | 2 | 3; roundsLeft: number } | null;

  // selectors
  benchUnits: () => UnitInstance[];
  boardUnits: () => UnitInstance[];
  xpProgress: () => { current: number; needed: number | null };

  // actions
  newGame: (startingHp?: number, allowedIds?: string[], enabledItems?: string[]) => void;
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
  endRound: (won: boolean, survivors?: number) => void;
  pveReward: (won: boolean) => void;
  carouselTake: (defId: string) => void;
  /** Multiplayer: grant a planning round's economy (income/xp/shop) for a host-driven round. */
  netRound: (stage: number, round: number, streak: number) => void;
  /** Multiplayer: take a carousel pick (unit or Mega Stone) without advancing the round. */
  netCarouselPick: (pick: string) => void;
  /** Pick an augment — applies its effect and persists it. */
  pickAugment: (id: string) => void;
  /** Multiplayer: snapshot / restore the local economy for reconnect. */
  exportSave: () => { gold: number; xp: number; level: number; units: UnitInstance[]; shop: (string | null)[]; items: string[]; augments: string[]; pension: State["pension"] };
  importSave: (save: { gold: number; xp: number; level: number; units?: UnitInstance[]; shop?: (string | null)[]; items?: string[]; augments?: string[]; pension?: State["pension"] }, allowedIds?: string[], enabledItems?: string[]) => void;
  grantItem: (itemId: string) => void;
  equipItem: (iid: string, itemId: string) => void;
  unequipItem: (iid: string, itemId: string) => void;
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
  health: ECONOMY.startingHealth,
  streak: 0,
  stage: 1,
  round: 1,
  pool: makePool(),
  unitsByCost: makeUnitsByCost(),
  enabledItems: null,
  pension: null,
  units: [],
  shop: [],
  frozen: false,
  history: [],
  items: [],
  augments: [],

  benchUnits: () => get().units.filter((u) => u.pos === null),
  boardUnits: () => get().units.filter((u) => u.pos !== null),
  xpProgress: () => {
    const { xp, level } = get();
    if (level >= MAX_LEVEL) return { current: xp, needed: null };
    const base = XP_TO_REACH[level];
    const next = XP_TO_REACH[level + 1];
    return { current: xp - base, needed: next - base };
  },

  newGame: (startingHp = ECONOMY.startingHealth, allowedIds?: string[], enabledItems?: string[]) => {
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
      gold: 4, xp: 0, level: 1, health: startingHp,
      streak: 0, stage: 1, round: 1, units, frozen: false, history: [], items: [], augments: [],
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

  // Rearrange the bench: drop a bench unit onto slot `toIndex` — SWAP with the
  // unit there, or move it to the end when the slot is empty. Bench order is the
  // filtered order in `units`, so we rebuild that slice. (Bench order never
  // affects combat — only on-board units are simulated.)
  reorderBench: (iid, toIndex) => {
    const state = get();
    const board = state.units.filter((u) => u.pos !== null);
    const bench = state.units.filter((u) => u.pos === null);
    const from = bench.findIndex((u) => u.iid === iid);
    if (from < 0) return;
    const nb = [...bench];
    if (toIndex < nb.length) {
      [nb[from], nb[toIndex]] = [nb[toIndex], nb[from]]; // swap with the occupied slot
    } else {
      const [m] = nb.splice(from, 1); // move to the first empty slot (end of the run)
      nb.push(m);
    }
    set({ units: [...board, ...nb] });
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
      const r = applyCombines([...state.units, makeInstance(pick)]);
      units = r.units; items = [...items, ...r.dropped];
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
    // Passive augments: extra gold / XP each round.
    const augGold = (state.augments.includes("rich") ? 1 : 0) + (state.augments.includes("compound-interest") ? 2 : 0);
    const augXp = (state.augments.includes("scholar") ? 2 : 0) + (state.augments.includes("fast-learner") ? 3 : 0);
    const income = ECONOMY.baseIncome + interest(state.gold) + streakGold(streak) + augGold;
    const newXp = state.xp + ECONOMY.passiveXpPerRound + augXp;
    const shop = state.frozen ? state.shop : rollShop(levelFromXp(newXp), state.pool, rng, state.unitsByCost);

    // PvE loot: if the round we just finished was a PvE round, drop extra gold and
    // occasionally an item or a free low-cost unit — keeps the economy moving.
    let bonusGold = 0;
    let items = state.items;
    let units = state.units;
    const prev = round > 1 ? { stage, round: round - 1 } : { stage: stage - 1, round: roundsInStage(stage - 1) };
    if (prev.stage >= 1 && roundKind(prev.stage, prev.round) === "pve") {
      bonusGold = 2 + Math.floor(stage / 2);
      // Reliable item economy: the opening (stage-1) PvE rounds always drop an
      // item component, like TFT's creep rounds; later PvE rounds drop one ~45%.
      if (prev.stage === 1 || rng() < 0.45) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
      const cheap = [...(state.unitsByCost[1] ?? []), ...(state.unitsByCost[2] ?? [])];
      if (rng() < 0.25 && cheap.length && units.filter((u) => u.pos === null).length < BENCH_SIZE) {
        const r = applyCombines([...units, makeInstance(cheap[randInt(rng, cheap.length)])]);
        units = r.units; items = [...items, ...r.dropped];
      }
    }

    // Pension trains one planning round closer to maturity (down to 0 = ready).
    const pension = state.pension ? { ...state.pension, roundsLeft: Math.max(0, state.pension.roundsLeft - 1) } : null;

    set({ gold: state.gold + income + bonusGold, xp: newXp, level: levelFromXp(newXp), stage, round, shop, frozen: false, items, units, pension });
  },

  netCarouselPick: (pick) => {
    const state = get();
    // Item picks (Mega Stone or any held item) go to the inventory; otherwise a unit.
    if (pick === MEGA_STONE || ITEM_IDS.has(pick)) { set({ items: [...state.items, pick] }); return; }
    if (state.units.filter((u) => u.pos === null).length < BENCH_SIZE) {
      const r = applyCombines([...state.units, makeInstance(pick)]);
      set({ units: r.units, items: [...state.items, ...r.dropped] });
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
      case "windfall": gold += 12; break;
      case "training": xp += 4; break;
      case "big-brain": xp += 8; break;
      case "mega-gift": items = [...items, MEGA_STONE]; break;
      case "treasure":
        for (let i = 0; i < 2; i++) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
        break;
      case "component-cache":
        for (let i = 0; i < 3; i++) items = [...items, COMPONENT_IDS[randInt(rng, COMPONENT_IDS.length)]];
        break;
      case "recruiter":
      case "draft-day": {
        const n = id === "draft-day" ? 3 : 2;
        const cheap = [...(state.unitsByCost[1] ?? []), ...(state.unitsByCost[2] ?? [])];
        for (let i = 0; i < n && benchFree() > 0 && cheap.length; i++) {
          const r = applyCombines([...units, makeInstance(cheap[randInt(rng, cheap.length)])]);
          units = r.units; items = [...items, ...r.dropped];
        }
        break;
      }
    }
    set({ augments: [...state.augments, id], gold, xp, level: levelFromXp(xp), items, units });
  },

  exportSave: () => {
    const s = get();
    return { gold: s.gold, xp: s.xp, level: s.level, units: s.units, shop: s.shop, items: s.items, augments: s.augments, pension: s.pension };
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
    for (const u of units) takeFromPool(pool, u.defId, u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
    set({
      pool, unitsByCost,
      enabledItems: enabledItems && enabledItems.length ? enabledItems : null,
      // Derive level from XP so it always matches (a stale/dropped synced `level`
      // can't stick after a reconnect and show the wrong level all game).
      gold: save.gold, xp: save.xp, level: levelFromXp(save.xp ?? 0),
      units,
      shop: toArray<string>(save.shop, ECONOMY.shopSlots),
      items: toArray<string>(save.items).filter(Boolean) as string[],
      augments: toArray<string>(save.augments).filter(Boolean) as string[],
      pension: save.pension ?? null,
    });
  },

  // Add an item to the inventory (carousel pick / loot).
  grantItem: (itemId) => set({ items: [...get().items, itemId] }),

  // Move an item from the inventory onto a unit.
  equipItem: (iid, itemId) => {
    const state = get();
    const idx = state.items.indexOf(itemId);
    if (idx < 0) return;
    const unit = state.units.find((u) => u.iid === iid);
    if (!unit) return;

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

  // Pension: deposit a 1★ mon to train into a 2★ over PENSION_ROUNDS planning
  // rounds (costs gold, one slot). Its held items return to the inventory.
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

  // Pension: retrieve a matured mon onto the bench, one star higher.
  collectPension: () => {
    const state = get();
    const p = state.pension;
    if (!p || p.roundsLeft > 0) return;
    if (state.units.filter((u) => u.pos === null).length >= BENCH_SIZE) { toast("Bench full", "Banc plein"); return; }
    const grown = { ...makeInstance(p.defId), star: Math.min(3, p.star + 1) as 1 | 2 | 3 };
    const { units, dropped } = applyCombines([...state.units, grown]); // may chain-combine into a 3★
    set({ units, items: [...state.items, ...dropped], pension: null });
  },
}));

export { roundKind };
