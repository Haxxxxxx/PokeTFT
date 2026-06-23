import type { UnitInstance } from "../types";

/** RTDB strips empty arrays and turns sparse ones into index-keyed objects, so a
 *  synced unit's `items` can come back as `undefined` or `{0:"x"}`. Coerce to a
 *  dense, falsy-free array. SINGLE SOURCE OF TRUTH — the host (match.ts `board()`)
 *  and every client must coerce identically, or `boardSeed` differs → host/client
 *  roll different crits → combat replay desync. */
export function itemsArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v && typeof v === "object") return Object.values(v as Record<string, string>).filter(Boolean);
  return [];
}

/** Restore a synced unit's invariants at the RTDB boundary: dense `items` array
 *  and a defined `pos` (bench units come back without one). */
export function normalizeUnit(u: UnitInstance): UnitInstance {
  return { ...u, pos: u.pos ?? null, items: itemsArray(u.items) };
}
