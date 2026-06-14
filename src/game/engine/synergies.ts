import type { UnitInstance } from "../types";
import { getDef } from "../data/mons";
import { activeTier, TRAITS_BY_KEY } from "../data/traits";

export type ActiveTrait = {
  key: string;
  label: string;
  count: number;
  tier: number; // 0 inactive, 1+ active breakpoint reached
  breakpoints: number[];
};

/** Counts each trait across DISTINCT board units (TFT counts unique units, not copies). */
export function computeTraits(boardUnits: UnitInstance[]): ActiveTrait[] {
  const counts = new Map<string, number>();
  const seenDef = new Set<string>();

  for (const u of boardUnits) {
    // Each distinct unit definition contributes once per trait.
    const def = getDef(u.defId);
    if (seenDef.has(def.id)) continue;
    seenDef.add(def.id);
    for (const key of [...def.types, ...def.roles]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const result: ActiveTrait[] = [];
  for (const [key, count] of counts) {
    const def = TRAITS_BY_KEY[key];
    if (!def) continue;
    result.push({
      key,
      label: def.label,
      count,
      tier: activeTier(def.key, count),
      breakpoints: def.breakpoints,
    });
  }
  // Active traits first, then by count desc, then by key. The key tiebreak makes
  // the order TOTAL and board-order-independent — so the combat buff layer
  // (applyTraitBuffs) composes stacked multipliers identically on every client.
  return result.sort((a, b) => (b.tier - a.tier) || (b.count - a.count) || (a.key < b.key ? -1 : 1));
}
