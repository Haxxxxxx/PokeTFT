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
  { id: "pumped-up",     name: "Pumped Up",        nameFr: "Gonflé à bloc",     desc: "+8 gold right now.",               descFr: "+8 or immédiatement.",                 kind: "instant", tier: "silver" },
  { id: "pocket-change", name: "Pocket Change",    nameFr: "Petite monnaie",    desc: "+5 gold right now.",               descFr: "+5 or immédiatement.",                 kind: "instant", tier: "silver" },
  { id: "training",      name: "Training Regimen", nameFr: "Entraînement",      desc: "+4 XP right now.",                 descFr: "+4 XP immédiatement.",                 kind: "instant", tier: "silver" },
  { id: "study-hall",    name: "Study Hall",       nameFr: "Salle d'étude",     desc: "+6 XP right now.",                 descFr: "+6 XP immédiatement.",                 kind: "instant", tier: "silver" },
  { id: "scholar",       name: "Scholar",          nameFr: "Érudit",            desc: "+2 XP every round.",               descFr: "+2 XP à chaque tour.",                 kind: "passive", tier: "silver" },
  { id: "fast-learner",  name: "Fast Learner",     nameFr: "Apprentissage",     desc: "+3 XP every round.",               descFr: "+3 XP à chaque tour.",                 kind: "passive", tier: "silver" },
  { id: "head-start",    name: "Head Start",       nameFr: "Longueur d'avance", desc: "+3 gold and a free unit now.",     descFr: "+3 or et une unité gratuite.",         kind: "instant", tier: "silver" },
  { id: "lucky",         name: "Lucky Rolls",      nameFr: "Coups de chance",   desc: "Reroll costs 1 gold.",             descFr: "Le reroll coûte 1 or.",                kind: "passive", tier: "gold" },
  // ── Gold ─────────────────────────────────────────────────────────────────
  { id: "spatula-set",   name: "Spatula Set",      nameFr: "Jeu de Spatules",   desc: "A random trait Emblem now.",       descFr: "Un emblème de trait aléatoire.",       kind: "instant", tier: "gold" },
  { id: "artisan",       name: "Artisan",          nameFr: "Artisan",           desc: "A random completed item now.",     descFr: "Un objet complet aléatoire.",          kind: "instant", tier: "gold" },
  { id: "recruiter",     name: "Recruiter",        nameFr: "Recruteur",         desc: "2 free units to your bench now.",  descFr: "2 unités gratuites sur le banc.",      kind: "instant", tier: "gold" },
  { id: "merchant",      name: "Merchant",         nameFr: "Marchand",          desc: "+6 gold and a random item now.",   descFr: "+6 or et un objet aléatoire.",         kind: "instant", tier: "gold" },
  { id: "prospector",    name: "Prospector",       nameFr: "Prospecteur",       desc: "A random item every 3rd round.",   descFr: "Un objet aléatoire tous les 3 tours.", kind: "passive", tier: "gold" },
  { id: "treasure",      name: "Treasure Trove",   nameFr: "Trésor caché",      desc: "2 random items now.",              descFr: "2 objets aléatoires immédiatement.",   kind: "instant", tier: "gold" },
  { id: "windfall",      name: "Windfall",         nameFr: "Aubaine",           desc: "+12 gold right now.",              descFr: "+12 or immédiatement.",                kind: "instant", tier: "gold" },
  { id: "component-cache", name: "Component Cache", nameFr: "Cache d'objets",   desc: "3 random items now.",              descFr: "3 objets aléatoires immédiatement.",   kind: "instant", tier: "gold" },
  { id: "rich",          name: "Rich Get Richer",  nameFr: "Capital croissant", desc: "+1 gold every round.",             descFr: "+1 or à chaque tour.",                 kind: "passive", tier: "gold" },
  { id: "compound-interest", name: "Compound Interest", nameFr: "Intérêts composés", desc: "+2 gold every round.",      descFr: "+2 or à chaque tour.",                 kind: "passive", tier: "prismatic" },
  // ── Prismatic ────────────────────────────────────────────────────────────
  { id: "trait-trove",   name: "Trait Trove",      nameFr: "Trésor de Traits",  desc: "2 random trait Emblems now.",      descFr: "2 emblèmes de trait aléatoires.",      kind: "instant", tier: "prismatic" },
  { id: "blacksmith",    name: "Blacksmith",       nameFr: "Forgeron",          desc: "2 random completed items now.",    descFr: "2 objets complets aléatoires.",        kind: "instant", tier: "prismatic" },
  { id: "mega-gift",     name: "Mega Gift",        nameFr: "Cadeau Méga",       desc: "A Mega Stone now.",                descFr: "Une Méga-Gemme immédiatement.",        kind: "instant", tier: "prismatic" },
  { id: "draft-day",     name: "Draft Day",        nameFr: "Jour de draft",     desc: "3 free units to your bench now.",  descFr: "3 unités gratuites sur le banc.",      kind: "instant", tier: "prismatic" },
  { id: "big-brain",     name: "Big Brain",        nameFr: "Gros cerveau",      desc: "+8 XP right now.",                 descFr: "+8 XP immédiatement.",                 kind: "instant", tier: "prismatic" },
  { id: "jackpot",       name: "Jackpot",          nameFr: "Jackpot",           desc: "+18 gold right now.",              descFr: "+18 or immédiatement.",                kind: "instant", tier: "prismatic" },
  { id: "prodigy",       name: "Prodigy",          nameFr: "Prodige",           desc: "+12 XP right now.",                descFr: "+12 XP immédiatement.",                kind: "instant", tier: "prismatic" },
];

export const AUGMENT_BY_ID: Record<string, Augment> = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

/** Which augment slot (0,1,2) a given round opens, or null. One per early stage,
 *  offered at round 2 — AFTER the stage's first fight (the carousel is the mid-stage
 *  event at round 4, so the two rewards never share a round). */
export function augmentSlot(stage: number, round: number): number | null {
  if (round !== 2) return null;
  if (stage === 2) return 0;
  if (stage === 3) return 1;
  if (stage === 4) return 2;
  return null;
}

