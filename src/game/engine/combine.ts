import type { UnitInstance } from "../types";
import { MAX_STAR } from "../config";

// Seeded from load time so dev hot-reloads don't collide iids with units that
// are still alive in the store from the previous module instance.
let counter = Math.floor(performance.now() * 1000) % 1_000_000;
export function newIid(): string {
  return `u${counter++}`;
}

export function makeInstance(defId: string, star: 1 | 2 | 3 = 1): UnitInstance {
  return { iid: newIid(), defId, star, pos: null, items: [] };
}

/**
 * Repeatedly merges any 3 units sharing defId + star into one of the next star.
 * A merged unit inherits a board position if any of its components was on-board,
 * and pools the components' items. Returns a new units array.
 */
export function applyCombines(units: UnitInstance[]): UnitInstance[] {
  let working = [...units];
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
      const upgraded: UnitInstance = {
        iid: a.iid,
        defId: a.defId,
        star: (a.star + 1) as 1 | 2 | 3,
        pos: placed ? placed.pos : null,
        items: components.flatMap((u) => u.items ?? []).slice(0, 3),
      };
      const removeIids = new Set(components.map((u) => u.iid));
      working = working.filter((u) => !removeIids.has(u.iid));
      working.push(upgraded);
      merged = true;
      break; // restart scan after each merge (cascade ⭐⭐ -> ⭐⭐⭐)
    }
  }
  return working;
}
