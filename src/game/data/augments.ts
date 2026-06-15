/** TFT-style augments: 3 are picked across a game, granting persistent boosts.
 *  All effects are economy/resource-level (applied in gameStore) so the
 *  deterministic combat sim is untouched and multiplayer stays in sync. */

export type AugmentTier = "silver" | "gold" | "prismatic";

export type Augment = {
  id: string;
  name: string;
  nameFr: string;
  desc: string;
  descFr: string;
  icon: string;
  /** "instant" applies once on pick; "passive" applies every round. */
  kind: "instant" | "passive";
  tier: AugmentTier;
};

/** Augment tier → accent colour (TFT silver / gold / prismatic). */
export const AUGMENT_TIER_COLOR: Record<AugmentTier, string> = {
  silver: "#cbd5e1",
  gold: "#fbbf24",
  prismatic: "#c084fc",
};

export const AUGMENTS: Augment[] = [
  // ── Silver ───────────────────────────────────────────────────────────────
  { id: "pumped-up",     name: "Pumped Up",        nameFr: "Gonflé à bloc",     desc: "+8 gold right now.",               descFr: "+8 or immédiatement.",                 icon: "💰", kind: "instant", tier: "silver" },
  { id: "training",      name: "Training Regimen", nameFr: "Entraînement",      desc: "+4 XP right now.",                 descFr: "+4 XP immédiatement.",                 icon: "📈", kind: "instant", tier: "silver" },
  { id: "scholar",       name: "Scholar",          nameFr: "Érudit",            desc: "+2 XP every round.",               descFr: "+2 XP à chaque tour.",                 icon: "📚", kind: "passive", tier: "silver" },
  { id: "fast-learner",  name: "Fast Learner",     nameFr: "Apprentissage",     desc: "+3 XP every round.",               descFr: "+3 XP à chaque tour.",                 icon: "🧠", kind: "passive", tier: "silver" },
  { id: "lucky",         name: "Lucky Rolls",      nameFr: "Coups de chance",   desc: "Reroll costs 1 gold.",             descFr: "Le reroll coûte 1 or.",                icon: "🎲", kind: "passive", tier: "gold" },
  // ── Gold ─────────────────────────────────────────────────────────────────
  { id: "recruiter",     name: "Recruiter",        nameFr: "Recruteur",         desc: "2 free units to your bench now.",  descFr: "2 unités gratuites sur le banc.",      icon: "🎯", kind: "instant", tier: "gold" },
  { id: "treasure",      name: "Treasure Trove",   nameFr: "Trésor caché",      desc: "2 random items now.",              descFr: "2 objets aléatoires immédiatement.",   icon: "🎁", kind: "instant", tier: "gold" },
  { id: "windfall",      name: "Windfall",         nameFr: "Aubaine",           desc: "+12 gold right now.",              descFr: "+12 or immédiatement.",                icon: "🪙", kind: "instant", tier: "gold" },
  { id: "component-cache", name: "Component Cache", nameFr: "Cache d'objets",   desc: "3 random items now.",              descFr: "3 objets aléatoires immédiatement.",   icon: "📦", kind: "instant", tier: "gold" },
  { id: "rich",          name: "Rich Get Richer",  nameFr: "Capital croissant", desc: "+1 gold every round.",             descFr: "+1 or à chaque tour.",                 icon: "🏦", kind: "passive", tier: "gold" },
  { id: "compound-interest", name: "Compound Interest", nameFr: "Intérêts composés", desc: "+2 gold every round.",      descFr: "+2 or à chaque tour.",                 icon: "📊", kind: "passive", tier: "prismatic" },
  // ── Prismatic ────────────────────────────────────────────────────────────
  { id: "mega-gift",     name: "Mega Gift",        nameFr: "Cadeau Méga",       desc: "A Mega Stone now.",                descFr: "Une Méga-Gemme immédiatement.",        icon: "🔮", kind: "instant", tier: "prismatic" },
  { id: "draft-day",     name: "Draft Day",        nameFr: "Jour de draft",     desc: "3 free units to your bench now.",  descFr: "3 unités gratuites sur le banc.",      icon: "🌟", kind: "instant", tier: "prismatic" },
  { id: "big-brain",     name: "Big Brain",        nameFr: "Gros cerveau",      desc: "+8 XP right now.",                 descFr: "+8 XP immédiatement.",                 icon: "🎓", kind: "instant", tier: "prismatic" },
];

export const AUGMENT_BY_ID: Record<string, Augment> = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

/** Which augment slot (0,1,2) a given round opens, or null. One per early stage. */
export function augmentSlot(stage: number, round: number): number | null {
  if (round !== 1) return null;
  if (stage === 2) return 0;
  if (stage === 3) return 1;
  if (stage === 4) return 2;
  return null;
}

export const AUGMENT_SLOTS = 3;
