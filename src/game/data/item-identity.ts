import { RECIPES, COMPONENTS, isEmblem } from "./items";

/**
 * Visual identity for items, derived from what an item IS rather than from
 * what it does.
 *
 * The problem this solves is measurable: the roster has 63 items, and the
 * glyph was picked from the item's dominant effect — which collapses them onto
 * about 8 Lucide icons. Roughly eight items therefore shared each icon, so at
 * a glance (and item pips on a unit are ~10px) they were indistinguishable.
 * Adding more icons does not fix it either, because "+20% attack" genuinely
 * looks like "+20% attack".
 *
 * But every completed item IS a pair of components, and that pair is how
 * players already learn and talk about items. Giving each component a colour
 * and painting a combined item in its two components' colours gives all 52
 * completed items a unique two-tone signature — 11 components make 66 possible
 * unordered pairs — with no bespoke artwork, and it teaches the recipe at the
 * same time. Colour also survives being shrunk to a 10px pip, which a
 * silhouette does not.
 */

/** One hue per component. Distinct at a glance, and stable across the app. */
export const COMPONENT_COLOR: Readonly<Record<string, string>> = {
  "c-ad": "#ef4444",        // red      — raw attack
  "c-ap": "#a855f7",        // purple   — ability power
  "c-as": "#eab308",        // yellow   — attack speed
  "c-hp": "#22c55e",        // green    — health
  "c-res": "#3b82f6",       // blue     — armour / MR
  "c-crit": "#f43f5e",      // rose     — crit
  "c-mana": "#06b6d4",      // cyan     — mana
  "c-lifesteal": "#ec4899", // pink     — lifesteal
  "c-pen": "#f97316",       // orange   — penetration
  "c-regen": "#14b8a6",     // teal     — regeneration
  spatula: "#e7c66b",       // gold     — the emblem forge
};

/** Fallback for anything with no colour of its own. */
const NEUTRAL = "#94a3b8";

/**
 * Completed item → the two components that build it.
 *
 * Inverted from RECIPES rather than written out, so the two can never disagree
 * about what an item is made of — a glyph that taught the wrong recipe would be
 * worse than the undifferentiated icons it replaces.
 */
export const ITEM_COMPONENTS: Readonly<Record<string, readonly [string, string]>> =
  Object.entries(RECIPES).reduce<Record<string, [string, string]>>((acc, [key, itemId]) => {
    const [a, b] = key.split("|");
    if (a && b && !acc[itemId]) acc[itemId] = [a, b];
    return acc;
  }, {});

const COMPONENT_IDS = new Set(COMPONENTS.map((c) => c.id));

export type ItemIdentity =
  /** A raw component: one colour. */
  | { kind: "component"; colors: readonly [string, string] }
  /** A built item: its two components' colours. */
  | { kind: "combined"; colors: readonly [string, string] }
  /** Emblems and anything unrecognised keep their existing glyph. */
  | { kind: "other" };

export function itemIdentity(id: string): ItemIdentity {
  if (isEmblem(id)) return { kind: "other" };
  if (COMPONENT_IDS.has(id)) {
    const c = COMPONENT_COLOR[id] ?? NEUTRAL;
    return { kind: "component", colors: [c, c] };
  }
  const pair = ITEM_COMPONENTS[id];
  if (!pair) return { kind: "other" };
  return {
    kind: "combined",
    // Sorted by combineKey already, so a given pair always paints the same way
    // round — the signature has to be stable to be learnable.
    colors: [COMPONENT_COLOR[pair[0]] ?? NEUTRAL, COMPONENT_COLOR[pair[1]] ?? NEUTRAL],
  };
}
