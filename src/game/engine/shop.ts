import { SHOP_ODDS, POOL_SIZE, ECONOMY, type Cost } from "../config";
import { UNITS, getDef } from "../data/mons";
import { weightedPick, type Rng } from "./rng";

/** Shared pool: defId -> remaining copies in the global bag. */
export type Pool = Record<string, number>;

/** Units available per cost tier for shop rolls. */
export type UnitsByCost = Record<Cost, string[]>;

/** Build the eligible unit list per cost tier from an optional allowed-IDs set.
 *  If allowedIds is omitted, all units are included. */
export function makeUnitsByCost(allowedIds?: string[]): UnitsByCost {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const m: UnitsByCost = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const u of UNITS) {
    if (!allowed || allowed.has(u.id)) m[u.cost].push(u.id);
  }
  return m;
}

/** Build the shared pool for the given allowed units (or all units if omitted). */
export function makePool(allowedIds?: string[]): Pool {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const pool: Pool = {};
  for (const u of UNITS) {
    if (!allowed || allowed.has(u.id)) pool[u.id] = POOL_SIZE[u.cost];
  }
  return pool;
}

/** Roll one shop of 5 slots for a player at `level`, drawing from the shared pool. */
export function rollShop(level: number, pool: Pool, rng: Rng, unitsByCost: UnitsByCost): (string | null)[] {
  const odds = SHOP_ODDS[Math.min(level, 10)];
  const slots: (string | null)[] = [];

  for (let i = 0; i < ECONOMY.shopSlots; i++) {
    const cost = (weightedPick(rng, odds) + 1) as Cost;
    const candidates = unitsByCost[cost];
    const weights = candidates.map((id) => pool[id] ?? 0);
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) {
      slots.push(null);
      continue;
    }
    slots.push(candidates[weightedPick(rng, weights)]);
  }
  return slots;
}

/** Remove a copy from the pool when bought. */
export function takeFromPool(pool: Pool, defId: string, copies = 1): void {
  pool[defId] = Math.max(0, (pool[defId] ?? 0) - copies);
}

/** Return copies to the pool when a unit is sold/dies-out. Clamped to the original
 *  bag size for that cost so no path can ever inflate a mon's pool weight beyond
 *  POOL_SIZE (defense-in-depth: even if a free grant hit an empty slot, selling it
 *  back can't mint phantom copies that would skew everyone's shop odds). */
export function returnToPool(pool: Pool, defId: string, copies = 1): void {
  const cap = POOL_SIZE[getDef(defId).cost] ?? Infinity;
  pool[defId] = Math.min(cap, (pool[defId] ?? 0) + copies);
}
