/** TFT-style augments: 3 are picked across a game, granting persistent boosts.
 *  Economy augments apply in gameStore; COMBAT augments carry a `combat` TeamBuff that
 *  the deterministic sim applies to the whole team at fight start (derived from public
 *  augment data, so multiplayer stays in sync). */

import type { TeamBuff } from "../engine/combat";

export type AugmentTier = "silver" | "gold" | "prismatic";

export type Augment = {
  id: string;
  name: string;
  nameFr: string;
  desc: string;
  descFr: string;
  /** "instant" applies once on pick; "passive" applies every round (econ) or every
   *  fight (combat). */
  kind: "instant" | "passive";
  tier: AugmentTier;
  /** Combat augments only: a team-wide buff applied in the sim. */
  combat?: TeamBuff;
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
  // ── Combat (silver) — team-wide buffs applied every fight ──────────────────
  { id: "sharp-claws",   name: "Sharp Claws",      nameFr: "Griffes Acérées",   desc: "Your team gains +10% Attack.",      descFr: "Votre équipe gagne +10% Attaque.",     kind: "passive", tier: "silver", combat: { adMult: 1.10 } },
  { id: "focus-band",    name: "Focus Band",       nameFr: "Bandeau",           desc: "Your team gains +12% Health.",      descFr: "Votre équipe gagne +12% PV.",          kind: "passive", tier: "silver", combat: { hpMult: 1.12 } },
  { id: "meditate",      name: "Meditate",         nameFr: "Méditation",        desc: "Your team starts with +12 mana.",   descFr: "Votre équipe démarre avec +12 mana.",  kind: "passive", tier: "silver", combat: { manaStart: 12 } },
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
  // ── Combat (gold) ──────────────────────────────────────────────────────────
  { id: "swords-dance",  name: "Swords Dance",     nameFr: "Danse-Lames",       desc: "Your team gains +18% Attack.",      descFr: "Votre équipe gagne +18% Attaque.",     kind: "passive", tier: "gold", combat: { adMult: 1.18 } },
  { id: "nasty-plot",    name: "Nasty Plot",       nameFr: "Machination",       desc: "Your team gains +20% Ability Power.", descFr: "Votre équipe gagne +20% Att. Spé.",  kind: "passive", tier: "gold", combat: { apMult: 1.20 } },
  { id: "agility",       name: "Agility",          nameFr: "Hâte",              desc: "Your team gains +18% Attack Speed.", descFr: "Votre équipe gagne +18% Vitesse.",    kind: "passive", tier: "gold", combat: { asMult: 1.18 } },
  { id: "iron-defense",  name: "Iron Defense",     nameFr: "Mur de Fer",        desc: "Your team gains +22 Armor & MR.",   descFr: "Votre équipe gagne +22 Déf & Déf Spé.", kind: "passive", tier: "gold", combat: { armorAdd: 22, mrAdd: 22 } },
  { id: "giga-drain",    name: "Giga Drain",       nameFr: "Giga-Sangsue",      desc: "Your team gains 15% lifesteal.",    descFr: "Votre équipe gagne 15% vol de vie.",   kind: "passive", tier: "gold", combat: { lifeSteal: 0.15 } },
  // ── Prismatic ────────────────────────────────────────────────────────────
  { id: "trait-trove",   name: "Trait Trove",      nameFr: "Trésor de Traits",  desc: "2 random trait Emblems now.",      descFr: "2 emblèmes de trait aléatoires.",      kind: "instant", tier: "prismatic" },
  { id: "blacksmith",    name: "Blacksmith",       nameFr: "Forgeron",          desc: "2 random completed items now.",    descFr: "2 objets complets aléatoires.",        kind: "instant", tier: "prismatic" },
  { id: "mega-gift",     name: "Mega Gift",        nameFr: "Cadeau Méga",       desc: "A Mega Stone now.",                descFr: "Une Méga-Gemme immédiatement.",        kind: "instant", tier: "prismatic" },
  { id: "draft-day",     name: "Draft Day",        nameFr: "Jour de draft",     desc: "3 free units to your bench now.",  descFr: "3 unités gratuites sur le banc.",      kind: "instant", tier: "prismatic" },
  { id: "big-brain",     name: "Big Brain",        nameFr: "Gros cerveau",      desc: "+8 XP right now.",                 descFr: "+8 XP immédiatement.",                 kind: "instant", tier: "prismatic" },
  { id: "jackpot",       name: "Jackpot",          nameFr: "Jackpot",           desc: "+18 gold right now.",              descFr: "+18 or immédiatement.",                kind: "instant", tier: "prismatic" },
  { id: "prodigy",       name: "Prodigy",          nameFr: "Prodige",           desc: "+12 XP right now.",                descFr: "+12 XP immédiatement.",                kind: "instant", tier: "prismatic" },
  // ── Combat (prismatic) — powerful team-wide buffs ──────────────────────────
  { id: "bulk-up",       name: "Bulk Up",          nameFr: "Gonflette",         desc: "Your team gains +22% Attack & +20% Health.", descFr: "Votre équipe : +22% Attaque & +20% PV.", kind: "passive", tier: "prismatic", combat: { adMult: 1.22, hpMult: 1.20 } },
  { id: "calm-mind",     name: "Calm Mind",        nameFr: "Plénitude",         desc: "Your team gains +28% AP & +18 start mana.",  descFr: "Votre équipe : +28% Att. Spé & +18 mana.", kind: "passive", tier: "prismatic", combat: { apMult: 1.28, manaStart: 18 } },
  { id: "dragon-dance",  name: "Dragon Dance",     nameFr: "Danse-Draco",       desc: "Your team gains +18% Attack & +18% Attack Speed.", descFr: "Votre équipe : +18% Attaque & +18% Vitesse.", kind: "passive", tier: "prismatic", combat: { adMult: 1.18, asMult: 1.18 } },
  { id: "sturdy",        name: "Sturdy",           nameFr: "Fermeté",           desc: "Your team gains +25% Health & +25 Armor & MR.", descFr: "Votre équipe : +25% PV & +25 Déf & Déf Spé.", kind: "passive", tier: "prismatic", combat: { hpMult: 1.25, armorAdd: 25, mrAdd: 25 } },

  // ── New combat augments (silver) ───────────────────────────────────────────
  { id: "quick-feet",    name: "Quick Feet",       nameFr: "Pieds Agiles",      desc: "Your team gains +12% Attack Speed.", descFr: "Votre équipe gagne +12% Vitesse.",     kind: "passive", tier: "silver", combat: { asMult: 1.12 } },
  { id: "leech-life",    name: "Leech Life",       nameFr: "Vampirisme",        desc: "Your team gains 10% lifesteal.",     descFr: "Votre équipe gagne 10% vol de vie.",   kind: "passive", tier: "silver", combat: { lifeSteal: 0.10 } },
  { id: "hard-shell",    name: "Hard Shell",       nameFr: "Carapace Dure",     desc: "Your team gains +16 Armor & MR.",    descFr: "Votre équipe gagne +16 Déf & Déf Spé.", kind: "passive", tier: "silver", combat: { armorAdd: 16, mrAdd: 16 } },
  // ── New combat augments (gold) ─────────────────────────────────────────────
  { id: "keen-eye",      name: "Keen Eye",         nameFr: "Œil Perçant",       desc: "Your team gains +26% Crit chance.",  descFr: "Votre équipe gagne +26% Critique.",    kind: "passive", tier: "gold", combat: { critAdd: 0.26 } },
  { id: "battle-frenzy", name: "Battle Frenzy",    nameFr: "Frénésie",          desc: "+14% Attack & +12% Attack Speed.",   descFr: "+14% Attaque & +12% Vitesse.",         kind: "passive", tier: "gold", combat: { adMult: 1.14, asMult: 1.12 } },
  { id: "arcane-focus",  name: "Arcane Focus",     nameFr: "Focalisation",      desc: "+22% Ability Power & +12 start mana.", descFr: "+22% Att. Spé & +12 mana de départ.", kind: "passive", tier: "gold", combat: { apMult: 1.22, manaStart: 12 } },
  { id: "vitality",      name: "Vitality",         nameFr: "Vitalité",          desc: "+20% Health & 12% lifesteal.",       descFr: "+20% PV & 12% vol de vie.",            kind: "passive", tier: "gold", combat: { hpMult: 1.20, lifeSteal: 0.12 } },
  { id: "veteran",       name: "Veteran",          nameFr: "Vétéran",           desc: "+5 gold and +4 XP right now.",       descFr: "+5 or et +4 XP immédiatement.",        kind: "instant", tier: "gold" },
  // ── New combat augments (prismatic) ────────────────────────────────────────
  { id: "apex-predator", name: "Apex Predator",    nameFr: "Prédateur Alpha",   desc: "+24% Attack, +22% Crit & 18% lifesteal.", descFr: "+24% Attaque, +22% Crit & 18% vol de vie.", kind: "passive", tier: "prismatic", combat: { adMult: 1.24, critAdd: 0.22, lifeSteal: 0.18 } },
  { id: "archmagus",     name: "Archmagus",        nameFr: "Archimage",         desc: "+30% Ability Power, +20 mana & +12% Attack Speed.", descFr: "+30% Att. Spé, +20 mana & +12% Vitesse.", kind: "passive", tier: "prismatic", combat: { apMult: 1.30, manaStart: 20, asMult: 1.12 } },
  { id: "titanforged",   name: "Titanforged",      nameFr: "Forge Titan",       desc: "+22% Health, +30 Armor & MR, +12% Attack.", descFr: "+22% PV, +30 Déf & Déf Spé, +12% Attaque.", kind: "passive", tier: "prismatic", combat: { hpMult: 1.22, armorAdd: 30, mrAdd: 30, adMult: 1.12 } },

  // ── Region signature augments — offered as a guaranteed pick in Region Clash modes,
  //    each themed to that region's signature type (see data/gameModes.ts). ──
  { id: "sig-kanto",  name: "Kanto Inferno",     nameFr: "Brasier Kanto",     desc: "+18% Attack & +10% Crit.",            descFr: "+18% Attaque & +10% Critique.",         kind: "passive", tier: "gold", combat: { adMult: 1.18, critAdd: 0.10 } },
  { id: "sig-johto",  name: "Johto Voltage",     nameFr: "Voltage Johto",     desc: "+20% Attack Speed.",                  descFr: "+20% Vitesse d'attaque.",               kind: "passive", tier: "gold", combat: { asMult: 1.20 } },
  { id: "sig-hoenn",  name: "Hoenn Tide",        nameFr: "Marée Hoenn",       desc: "+18% Ability Power & +12 start mana.", descFr: "+18% Att. Spé & +12 mana de départ.",  kind: "passive", tier: "gold", combat: { apMult: 1.18, manaStart: 12 } },
  { id: "sig-sinnoh", name: "Sinnoh Bulwark",    nameFr: "Rempart Sinnoh",    desc: "+28 Armor & MR, +8% Health.",         descFr: "+28 Déf & Déf Spé, +8% PV.",            kind: "passive", tier: "gold", combat: { armorAdd: 28, mrAdd: 28, hpMult: 1.08 } },
  { id: "sig-unova",  name: "Unova Surge",       nameFr: "Déferlante Unova",  desc: "+14% Attack & Ability Power.",        descFr: "+14% Attaque & Att. Spé.",              kind: "passive", tier: "gold", combat: { adMult: 1.14, apMult: 1.14 } },
  { id: "sig-kalos",  name: "Kalos Grace",       nameFr: "Grâce Kalos",       desc: "+16% Health, +14 Armor & MR.",        descFr: "+16% PV, +14 Déf & Déf Spé.",           kind: "passive", tier: "gold", combat: { hpMult: 1.16, armorAdd: 14, mrAdd: 14 } },
  { id: "sig-alola",  name: "Alola Mind",        nameFr: "Esprit Alola",      desc: "+22% Ability Power & +10 start mana.", descFr: "+22% Att. Spé & +10 mana de départ.",  kind: "passive", tier: "gold", combat: { apMult: 1.22, manaStart: 10 } },
  { id: "sig-galar",  name: "Galar Resolve",     nameFr: "Détermination Galar", desc: "+16% Attack & +18% Crit.",          descFr: "+16% Attaque & +18% Critique.",         kind: "passive", tier: "gold", combat: { adMult: 1.16, critAdd: 0.18 } },
  { id: "sig-paldea", name: "Paldea Paradox",    nameFr: "Paradoxe Paldea",   desc: "+12% Attack & AP, 12% lifesteal.",    descFr: "+12% Attaque & Att. Spé, 12% vol de vie.", kind: "passive", tier: "gold", combat: { adMult: 1.12, apMult: 1.12, lifeSteal: 0.12 } },
];

export const AUGMENT_BY_ID: Record<string, Augment> = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

/** Fold a player's owned augments into a single team-wide combat buff. Iterates the
 *  canonical AUGMENTS order (NOT the player's array order) so the floating-point fold
 *  is byte-identical on host and every client — the cornerstone of combat determinism. */
export function teamBuffForAugments(ids: string[] | undefined | null): TeamBuff {
  const buff: TeamBuff = {};
  if (!ids || !ids.length) return buff;
  const owned = new Set(ids);
  for (const a of AUGMENTS) {
    if (!a.combat || !owned.has(a.id)) continue;
    const c = a.combat;
    if (c.adMult) buff.adMult = (buff.adMult ?? 1) * c.adMult;
    if (c.apMult) buff.apMult = (buff.apMult ?? 1) * c.apMult;
    if (c.asMult) buff.asMult = (buff.asMult ?? 1) * c.asMult;
    if (c.hpMult) buff.hpMult = (buff.hpMult ?? 1) * c.hpMult;
    if (c.armorAdd) buff.armorAdd = (buff.armorAdd ?? 0) + c.armorAdd;
    if (c.mrAdd) buff.mrAdd = (buff.mrAdd ?? 0) + c.mrAdd;
    if (c.critAdd) buff.critAdd = (buff.critAdd ?? 0) + c.critAdd;
    if (c.manaStart) buff.manaStart = (buff.manaStart ?? 0) + c.manaStart;
    // lifeSteal does NOT stack additively — the highest source wins (matches the item
    // layer in combat.ts). If a 2nd lifeSteal augment is ever added, taking both grants
    // only the larger, by design.
    if (c.lifeSteal) buff.lifeSteal = Math.max(buff.lifeSteal ?? 0, c.lifeSteal);
  }
  // Hard ceilings on the folded buff. A legit 3-augment stack peaks around ~1.7x / +47
  // armor, so these never touch real play — but they bound a fabricated or future
  // over-tuned augment set so the combat sim can't be driven to absurd values. Applied
  // here (the shared fold) → identical on host + client, so determinism is preserved.
  if (buff.adMult) buff.adMult = Math.min(1.8, buff.adMult);
  if (buff.apMult) buff.apMult = Math.min(1.8, buff.apMult);
  if (buff.asMult) buff.asMult = Math.min(1.8, buff.asMult);
  if (buff.hpMult) buff.hpMult = Math.min(1.8, buff.hpMult);
  if (buff.armorAdd) buff.armorAdd = Math.min(60, buff.armorAdd);
  if (buff.mrAdd) buff.mrAdd = Math.min(60, buff.mrAdd);
  if (buff.critAdd) buff.critAdd = Math.min(0.5, buff.critAdd);
  if (buff.manaStart) buff.manaStart = Math.min(40, buff.manaStart);
  if (buff.lifeSteal) buff.lifeSteal = Math.min(0.4, buff.lifeSteal);
  return buff;
}

/** Apply the shared ceilings to a folded TeamBuff (mults capped, adds capped). Pulled out
 *  of teamBuffForAugments so other buff sources (region modifiers) clamp identically. */
function capBuff(buff: TeamBuff): TeamBuff {
  if (buff.adMult) buff.adMult = Math.min(1.8, buff.adMult);
  if (buff.apMult) buff.apMult = Math.min(1.8, buff.apMult);
  if (buff.asMult) buff.asMult = Math.min(1.8, buff.asMult);
  if (buff.hpMult) buff.hpMult = Math.min(1.8, buff.hpMult);
  if (buff.armorAdd) buff.armorAdd = Math.min(60, buff.armorAdd);
  if (buff.mrAdd) buff.mrAdd = Math.min(60, buff.mrAdd);
  if (buff.critAdd) buff.critAdd = Math.min(0.5, buff.critAdd);
  if (buff.manaStart) buff.manaStart = Math.min(40, buff.manaStart);
  if (buff.lifeSteal) buff.lifeSteal = Math.min(0.4, buff.lifeSteal);
  return buff;
}

/** Combine multiple TeamBuffs into one (mults multiply, adds add, lifesteal takes the max),
 *  then clamp. Order-independent for the supported ops so host + client agree (determinism).
 *  Used to fold a region modifier on top of the player's augment buff. */
export function combineTeamBuffs(...buffs: (TeamBuff | undefined | null)[]): TeamBuff {
  const out: TeamBuff = {};
  for (const b of buffs) {
    if (!b) continue;
    if (b.adMult) out.adMult = (out.adMult ?? 1) * b.adMult;
    if (b.apMult) out.apMult = (out.apMult ?? 1) * b.apMult;
    if (b.asMult) out.asMult = (out.asMult ?? 1) * b.asMult;
    if (b.hpMult) out.hpMult = (out.hpMult ?? 1) * b.hpMult;
    if (b.armorAdd) out.armorAdd = (out.armorAdd ?? 0) + b.armorAdd;
    if (b.mrAdd) out.mrAdd = (out.mrAdd ?? 0) + b.mrAdd;
    if (b.critAdd) out.critAdd = (out.critAdd ?? 0) + b.critAdd;
    if (b.manaStart) out.manaStart = (out.manaStart ?? 0) + b.manaStart;
    if (b.lifeSteal) out.lifeSteal = Math.max(out.lifeSteal ?? 0, b.lifeSteal);
  }
  return capBuff(out);
}

/** Coarse category of an augment, used to tailor + diversify the offering.
 *   ad  — physical-leaning combat (Attack / Speed / Crit / lifesteal)
 *   ap  — special-leaning combat (Ability Power / start mana)
 *   def — defensive combat (Armor / MR / Health)
 *   econ— everything non-combat (gold / XP / items / units / emblems) */
export type AugmentCategory = "ad" | "ap" | "def" | "econ";

export function augmentCategory(a: Augment): AugmentCategory {
  const c = a.combat;
  if (!c) return "econ";
  const ap = c.apMult ?? 1, ad = c.adMult ?? 1;
  if (ap > 1 && ap >= ad) return "ap";
  if (ad > 1 || c.asMult || c.critAdd || c.lifeSteal) return "ad";
  if (c.manaStart && ap <= 1 && ad <= 1) return "ap";
  if (c.armorAdd || c.mrAdd || c.hpMult) return "def";
  return "econ";
}

/** A board's damage lean, for tailoring augment offers. Counts physical vs special carries. */
export type BoardProfile = { ad: number; ap: number };

/** Pick `count` augments from `pool`, weighted toward the board's damage lean and spread
 *  across categories (so you rarely see three of the same flavour). Deterministic per `rng`.
 *  The relevance weighting is what makes the offer feel tailored rather than random. */
export function tailoredAugmentPicks(pool: Augment[], profile: BoardProfile, count: number, rng: () => number): Augment[] {
  const lean = profile.ad === profile.ap ? "none" : profile.ad > profile.ap ? "ad" : "ap";
  const weightFor = (a: Augment): number => {
    const cat = augmentCategory(a);
    if (cat === "def") return 1.3;            // always somewhat useful
    if (cat === "econ") return 1.0;
    if (lean === "none") return 1.2;          // no board lean yet → combat slightly favoured
    if (cat === lean) return 2.6;             // matches your carries → boosted
    return 0.5;                               // off-profile combat → downweighted
  };
  const remaining = pool.map((a) => ({ a, w: weightFor(a) }));
  const out: Augment[] = [];
  for (let k = 0; k < count && remaining.length; k++) {
    const total = remaining.reduce((s, x) => s + x.w, 0);
    let roll = rng() * total, idx = 0;
    for (; idx < remaining.length - 1; idx++) { roll -= remaining[idx].w; if (roll <= 0) break; }
    const [chosen] = remaining.splice(idx, 1);
    out.push(chosen.a);
    // Soft diversity: dampen anything in the same category so the next pick differs.
    const cat = augmentCategory(chosen.a);
    for (const x of remaining) if (augmentCategory(x.a) === cat) x.w *= 0.35;
  }
  return out;
}

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

