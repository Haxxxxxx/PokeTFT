import type { UnitInstance } from "../types";
import { MAX_STAR } from "../config";

// Seeded from load time so dev hot-reloads don't collide iids with units that
// are still alive in the store from the previous module instance.
let counter = Math.floor(performance.now() * 1000) % 1_000_000;
export function newIid(): string {
  return `u${counter++}`;
}

export function makeInstance(defId: string, star: 1 | 2 | 3 = 1, chosen?: string): UnitInstance {
  const u: UnitInstance = { iid: newIid(), defId, star, pos: null, items: [] };
  if (chosen) u.chosen = chosen;
  return u;
}

/**
 * Repeatedly merges any 3 units sharing defId + star into one of the next star.
 * A merged unit inherits a board position if any of its components was on-board,
 * and pools the components' items (max 3 on the upgraded unit). Any items beyond
 * that cap are returned as `dropped` so the caller can refund them to the
 * inventory instead of destroying them. Returns the new units array + dropped ids.
 */
export function applyCombines(units: UnitInstance[]): { units: UnitInstance[]; dropped: string[] } {
  let working = [...units];
  const dropped: string[] = [];
  let merged = true;

  while (merged) {
    merged = false;
    // Group by defId+star.
    const groups = new Map<string, UnitInstance[]>();
    for (const u of working) {
      if (u.star >= MAX_STAR) continue;
      const key = `${u.defId}@${u.star}`;
      const arr = groups.get(key) ?? [];
      arr.push(u);
      groups.set(key, arr);
    }

    for (const [, arr] of groups) {
      if (arr.length < 3) continue;
      const [a, b, c] = arr;
      const components = [a, b, c];
      // Prefer to keep a board slot if one of the three was placed.
      const placed = components.find((u) => u.pos !== null);
      const pooled = components.flatMap((u) => u.items ?? []).filter(Boolean);
      const chosen = components.find((u) => u.chosen)?.chosen; // a Headliner upgrades into a Headliner
      const upgraded: UnitInstance = {
        iid: a.iid,
        defId: a.defId,
        star: (a.star + 1) as 1 | 2 | 3,
        pos: placed ? placed.pos : null,
        items: pooled.slice(0, 3),
        ...(chosen ? { chosen } : {}),
      };
      dropped.push(...pooled.slice(3)); // overflow → refunded to inventory by the caller
      const removeIids = new Set(components.map((u) => u.iid));
      working = working.filter((u) => !removeIids.has(u.iid));
      working.push(upgraded);
      merged = true;
      break; // restart scan after each merge (cascade ⭐⭐ -> ⭐⭐⭐)
    }
  }
  return { units: working, dropped };
}
