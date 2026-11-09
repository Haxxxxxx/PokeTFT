import type { UnitInstance } from "../types";
import { getDef, typesForStar } from "../data/mons";
import { activeTier, TRAITS_BY_KEY } from "../data/traits";
import { EMBLEM_TRAIT } from "../data/items";

export type ActiveTrait = {
  key: string;
  label: string;
  count: number;
  tier: number; // 0 inactive, 1+ active breakpoint reached
  breakpoints: number[];
};

/** A synergy that buying a given unit would push over a breakpoint. */
export type TraitGain = { key: string; label: string; from: number; to: number; count: number };

/**
 * Which traits would ACTIVATE or step up a tier if this def joined the board.
 *
 * This is the question a player is actually asking while scanning the shop, and
 * reading it off a list of trait names means doing the arithmetic yourself
 * every reroll. Note that traits count DISTINCT defs, so buying a unit already
 * on the board gains nothing here — which is exactly the trap worth surfacing.
 *
 * Computed by simulating the board with the unit added and diffing tiers, so it
 * can't drift from the real synergy rules the way a reimplementation would.
 */
export function traitGainsFor(defId: string, boardUnits: UnitInstance[]): TraitGain[] {
  const before = new Map(computeTraits(boardUnits).map((t) => [t.key, t]));
  const preview: UnitInstance = { iid: "__preview__", defId, star: 1, pos: [0, 0], items: [] };
  const after = computeTraits([...boardUnits, preview]);

  const gains: TraitGain[] = [];
  for (const t of after) {
    const prevTier = before.get(t.key)?.tier ?? 0;
    if (t.tier > prevTier) gains.push({ key: t.key, label: t.label, from: prevTier, to: t.tier, count: t.count });
  }
  return gains;
}

/** Counts each trait across DISTINCT board units (TFT counts unique units, not copies). */
export function computeTraits(boardUnits: UnitInstance[]): ActiveTrait[] {
  const counts = new Map<string, number>();
  // Each distinct unit definition contributes once per trait, using its HIGHEST star
  // on the board so an evolved mon's gained typing (typesByStar) counts. Spatula
  // emblems add their granted trait to whichever def carries them (deduped via a Set
  // so an emblem matching a native trait can't double-count that def).
  const maxStar = new Map<string, number>();
  const emblemTraits = new Map<string, Set<string>>();
  for (const u of boardUnits) {
    maxStar.set(u.defId, Math.max(maxStar.get(u.defId) ?? 0, u.star));
    const items = Array.isArray(u.items) ? u.items : u.items ? Object.values(u.items as Record<string, string>) : [];
    for (const id of items) {
      const t = EMBLEM_TRAIT[id];
      if (!t) continue;
      if (!emblemTraits.has(u.defId)) emblemTraits.set(u.defId, new Set());
      emblemTraits.get(u.defId)!.add(t);
    }
  }
  for (const [defId, star] of maxStar) {
    const def = getDef(defId);
    const keys = new Set<string>([...typesForStar(def, star), ...def.roles]);
    for (const t of emblemTraits.get(defId) ?? []) keys.add(t);
    // "Evolver" rewards UPGRADING the board, not merely owning evolvable mons (almost
    // every mon can evolve). It only counts once a unit has actually evolved to ★★+.
    if (star < 2) keys.delete("evolver");
    for (const key of keys) {
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
