import { SHOP_ODDS, POOL_SIZE, ECONOMY, type Cost } from "../config";
import { UNITS } from "../data/mons";
import { weightedPick, type Rng } from "./rng";

/** Shared pool: defId -> remaining copies in the global bag. */
export type Pool = Record<string, number>;

export function makePool(): Pool {
  const pool: Pool = {};
  for (const u of UNITS) pool[u.id] = POOL_SIZE[u.cost];
  return pool;
}

const UNITS_BY_COST: Record<Cost, string[]> = (() => {
  const m = { 1: [], 2: [], 3: [], 4: [], 5: [] } as Record<Cost, string[]>;
  for (const u of UNITS) m[u.cost].push(u.id);
  return m;
})();

/** Roll one shop of 5 slots for a player at `level`, drawing from the shared pool. */
export function rollShop(level: number, pool: Pool, rng: Rng): (string | null)[] {
  const odds = SHOP_ODDS[Math.min(level, 10)];
  const slots: (string | null)[] = [];

  for (let i = 0; i < ECONOMY.shopSlots; i++) {
    const cost = (weightedPick(rng, odds) + 1) as Cost;
    const candidates = UNITS_BY_COST[cost];
    // Weight each candidate by its remaining copies in the bag.
    const weights = candidates.map((id) => pool[id]);
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

/** Return copies to the pool when a unit is sold/dies-out. */
export function returnToPool(pool: Pool, defId: string, copies = 1): void {
  pool[defId] = (pool[defId] ?? 0) + copies;
}
