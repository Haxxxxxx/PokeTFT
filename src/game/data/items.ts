/** Item system with TFT-style combining: 7 components combine (2 → 1) into 28
 *  completed items. Effects are a structured object the combat engine applies
 *  generically (deterministic — no per-id branching in the sim). Spatula-style
 *  EMBLEMS additionally grant their holder a synergy trait. */

import { TRAITS } from "./traits";

export type ItemRarity = "common" | "rare" | "legendary";

/** Stat/effect bundle an item grants its holder. The engine reads these directly. */
export type ItemEffect = {
  adMult?: number;        // attack damage ×
  apMult?: number;        // ability power ×
  asMult?: number;        // attack speed ×
  hpMult?: number;        // max HP ×
  armorAdd?: number;      // flat armor
  mrAdd?: number;         // flat magic resist
  critAdd?: number;       // + crit chance (0..1)
  lifeSteal?: number;     // heal a fraction of damage dealt
  armorPen?: number;      // ignore a fraction of target armor
  regenPerSec?: number;   // heal a fraction of max HP / second
  thornsPct?: number;     // reflect a fraction of attacker max HP on melee contact
  burnDps?: number;       // abilities burn for a fraction of victim max HP / sec
  stunChance?: number;    // abilities can stun
  manaStart?: number;     // + starting mana
  manaPerAttack?: number; // + bonus mana gained per auto-attack (caster accelerators)
  sash?: boolean;         // survive one lethal blow at full HP
  statusImmune?: boolean; // immune to burn/stun/freeze
};

export type ItemDef = {
  id: string;
  name: string;
  nameFr: string;
  rarity: ItemRarity;
  kind: "component" | "completed" | "emblem";
  effect: ItemEffect;
  /** Emblems only: the synergy trait key this item grants its holder. */
  grantsTrait?: string;
  /** Short human-readable effect summary. */
  text: string;
  textFr: string;
};

export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: "#94a3b8",
  rare: "#38bdf8",
  legendary: "#fbbf24",
};

/** The 7 building-block components — these are what drops; players combine them. */
export const COMPONENTS: ItemDef[] = [
  { id: "c-ad",   name: "Power Bracer", nameFr: "Bracelet Force", rarity: "common", kind: "component", effect: { adMult: 1.2 },    text: "+20% Attack",        textFr: "+20% Attaque" },
  { id: "c-ap",   name: "Psy Crystal",  nameFr: "Cristal Psy",    rarity: "common", kind: "component", effect: { apMult: 1.2 },    text: "+20% Ability Power",  textFr: "+20% Att. Spé" },
  { id: "c-as",   name: "Spin Gear",    nameFr: "Engrenage",      rarity: "common", kind: "component", effect: { asMult: 1.18 },   text: "+18% Attack Speed",   textFr: "+18% Vitesse" },
  { id: "c-hp",   name: "Vital Band",   nameFr: "Ruban Vital",    rarity: "common", kind: "component", effect: { hpMult: 1.15 },   text: "+15% Health",         textFr: "+15% PV" },
  { id: "c-res",  name: "Stone Plate",  nameFr: "Plaque Pierre",  rarity: "common", kind: "component", effect: { armorAdd: 18, mrAdd: 18 }, text: "+18 Armor & MR", textFr: "+18 Déf & Déf Spé" },
  { id: "c-crit", name: "Keen Edge",    nameFr: "Lame Affûtée",   rarity: "common", kind: "component", effect: { critAdd: 0.12 },  text: "+12% Crit",           textFr: "+12% Critique" },
  { id: "c-mana", name: "Leppa Berry",  nameFr: "Baie Mepo",      rarity: "common", kind: "component", effect: { manaStart: 15 },  text: "+15 Starting Mana",   textFr: "+15 Mana de départ" },
  // New components — Pokémon item flavour names.
  { id: "c-lifesteal", name: "Absorb Bulb",    nameFr: "Bulbe Absorb",   rarity: "common", kind: "component", effect: { lifeSteal: 0.1 },   text: "+10% Lifesteal",   textFr: "+10% Vol de vie" },
  { id: "c-pen",       name: "Punching Glove", nameFr: "Gant de Boxe",   rarity: "common", kind: "component", effect: { armorPen: 0.18 },   text: "+18% Armor Pen",   textFr: "+18% Pén. Déf." },
  { id: "c-regen",     name: "Oran Berry",     nameFr: "Baie Oran",      rarity: "common", kind: "component", effect: { regenPerSec: 0.02 }, text: "+2% HP regen/s",   textFr: "+2% régén PV/s" },
  // The Spatula — a rare crafting component. On its own it's a little bulk; combined with
  // ANY component it forges a Trait Emblem (see SPATULA_RECIPES). The TFT-style way to make
  // your own emblems instead of relying on carousel/anvil RNG.
  { id: "spatula", name: "Spatula", nameFr: "Spatule", rarity: "rare", kind: "component", effect: { hpMult: 1.12 }, text: "Combine with a component to forge a Trait Emblem.", textFr: "Combine avec un objet pour forger un Emblème de trait." },
];

/** Completed items — one per unordered component pair (recipe key in RECIPES). */
export const COMPLETED: ItemDef[] = [
  { id: "choice-band",  name: "Choice Band",   nameFr: "Bandeau Choix",  rarity: "rare",      kind: "completed", effect: { adMult: 1.8 },                          text: "+80% Attack",                       textFr: "+80% Attaque" },
  { id: "choice-specs", name: "Choice Specs",  nameFr: "Lunettes Choix", rarity: "rare",      kind: "completed", effect: { apMult: 1.8 },                          text: "+80% Ability Power",                textFr: "+80% Att. Spé" },
  { id: "choice-scarf", name: "Choice Scarf",  nameFr: "Mouchoir Choix", rarity: "rare",      kind: "completed", effect: { asMult: 1.6 },                          text: "+60% Attack Speed",                 textFr: "+60% Vitesse" },
  { id: "titan-heart",  name: "Titan Heart",   nameFr: "Cœur Titan",     rarity: "rare",      kind: "completed", effect: { hpMult: 1.6, regenPerSec: 0.04 },       text: "+60% HP, regen 4%/s",               textFr: "+60% PV, régén 4%/s" },
  { id: "aegis",        name: "Aegis",         nameFr: "Égide",          rarity: "rare",      kind: "completed", effect: { armorAdd: 55, mrAdd: 55, statusImmune: true }, text: "+55 Armor & MR, status immune", textFr: "+55 Déf & Déf Spé, immunité" },
  { id: "scope-lens",   name: "Scope Lens",    nameFr: "Lentille Visée", rarity: "rare",      kind: "completed", effect: { critAdd: 0.5 },                         text: "+50% Crit",                         textFr: "+50% Critique" },
  { id: "light-ball",   name: "Light Ball",    nameFr: "Balle Lumière",  rarity: "legendary", kind: "completed", effect: { adMult: 1.4, apMult: 1.4, critAdd: 0.1 }, text: "+40% AD & AP, +10% crit",           textFr: "+40% Att & Att.Spé, +10% crit" },
  { id: "berserker",    name: "Berserker Gene", nameFr: "Gène Berserk",  rarity: "rare",      kind: "completed", effect: { adMult: 1.4, asMult: 1.35 },            text: "+40% Attack, +35% Speed",           textFr: "+40% Attaque, +35% Vitesse" },
  { id: "titan-fist",   name: "Titan Fist",    nameFr: "Poing Titan",    rarity: "rare",      kind: "completed", effect: { adMult: 1.4, hpMult: 1.3 },             text: "+40% Attack, +30% HP",              textFr: "+40% Attaque, +30% PV" },
  { id: "adamant-edge", name: "Adamant Edge",  nameFr: "Lame Adamant",   rarity: "rare",      kind: "completed", effect: { adMult: 1.4, armorPen: 0.4 },           text: "+40% Attack, 40% armor pen",        textFr: "+40% Attaque, 40% pén. déf" },
  { id: "sniper-scope", name: "Sniper Scope",  nameFr: "Viseur Sniper",  rarity: "legendary", kind: "completed", effect: { adMult: 1.4, critAdd: 0.4 },            text: "+40% Attack, +40% crit",            textFr: "+40% Attaque, +40% crit" },
  { id: "mystic-surge", name: "Mystic Surge",  nameFr: "Vague Mystique", rarity: "rare",      kind: "completed", effect: { apMult: 1.4, asMult: 1.35 },            text: "+40% AP, +35% Speed",               textFr: "+40% Att.Spé, +35% Vitesse" },
  { id: "burn-charm",   name: "Burn Charm",    nameFr: "Charme Brûlure", rarity: "rare",      kind: "completed", effect: { apMult: 1.4, burnDps: 0.04 },           text: "+40% AP, abilities burn",           textFr: "+40% Att.Spé, capacités brûlent" },
  { id: "jeweled-lens", name: "Jeweled Lens",  nameFr: "Lentille Joyau", rarity: "legendary", kind: "completed", effect: { apMult: 1.4, critAdd: 0.4 },            text: "+40% AP, +40% crit",                textFr: "+40% Att.Spé, +40% crit" },
  { id: "sage-ward",    name: "Sage Ward",     nameFr: "Garde Sage",     rarity: "rare",      kind: "completed", effect: { apMult: 1.4, armorAdd: 35, mrAdd: 35 }, text: "+40% AP, +35 Armor & MR",           textFr: "+40% Att.Spé, +35 Déf" },
  { id: "endless-belt", name: "Endless Belt",  nameFr: "Ceinture Sans Fin", rarity: "rare",   kind: "completed", effect: { asMult: 1.35, hpMult: 1.3 },            text: "+35% Speed, +30% HP",               textFr: "+35% Vitesse, +30% PV" },
  { id: "steadfast",    name: "Steadfast Gear", nameFr: "Garde Tenace",  rarity: "rare",      kind: "completed", effect: { asMult: 1.35, armorAdd: 35, mrAdd: 35 }, text: "+35% Speed, +35 Armor & MR",       textFr: "+35% Vitesse, +35 Déf" },
  { id: "spark-coil",   name: "Spark Coil",    nameFr: "Bobine Étincelle", rarity: "rare",     kind: "completed", effect: { asMult: 1.35, critAdd: 0.3 },           text: "+35% Speed, +30% crit",             textFr: "+35% Vitesse, +30% crit" },
  { id: "bulwark",      name: "Bulwark",       nameFr: "Rempart",        rarity: "rare",      kind: "completed", effect: { hpMult: 1.35, armorAdd: 35, mrAdd: 35, thornsPct: 0.12 }, text: "+35% HP, +35 def, thorns", textFr: "+35% PV, +35 déf, épines" },
  { id: "vampire-fang", name: "Vampire Fang",  nameFr: "Croc Vampire",   rarity: "legendary", kind: "completed", effect: { hpMult: 1.3, critAdd: 0.25, lifeSteal: 0.25 }, text: "+30% HP, +25% crit, 25% lifesteal", textFr: "+30% PV, +25% crit, 25% vol de vie" },
  { id: "edge-night",   name: "Edge of Night",  nameFr: "Lame de Nuit",  rarity: "rare",     kind: "completed", effect: { armorAdd: 35, mrAdd: 35, critAdd: 0.25, sash: true }, text: "+35 def, +25% crit, survives one blow", textFr: "+35 déf, +25% crit, survit à un coup" },
  // Mana line (c-mana pairs) — caster accelerators that were impossible before.
  { id: "spirit-orb",   name: "Spirit Orb",    nameFr: "Orbe Spirituel", rarity: "legendary", kind: "completed", effect: { manaStart: 30, manaPerAttack: 8 },     text: "+30 start mana, +8 mana/attack",   textFr: "+30 mana initial, +8 mana/attaque" },
  { id: "archmage",     name: "Archmage Tome", nameFr: "Tome Archimage", rarity: "legendary", kind: "completed", effect: { apMult: 1.4, manaPerAttack: 6 },        text: "+40% AP, +6 mana/attack",          textFr: "+40% Att.Spé, +6 mana/attaque" },
  { id: "spellblade",   name: "Spellblade",    nameFr: "Lame Magique",   rarity: "rare",      kind: "completed", effect: { adMult: 1.4, manaPerAttack: 6 },        text: "+40% Attack, +6 mana/attack",      textFr: "+40% Attaque, +6 mana/attaque" },
  { id: "flux-rotor",   name: "Flux Rotor",    nameFr: "Rotor Flux",     rarity: "rare",      kind: "completed", effect: { asMult: 1.35, manaPerAttack: 5 },       text: "+35% Speed, +5 mana/attack",       textFr: "+35% Vitesse, +5 mana/attaque" },
  { id: "soul-vessel",  name: "Soul Vessel",   nameFr: "Calice d'Âme",   rarity: "rare",      kind: "completed", effect: { hpMult: 1.3, manaStart: 20 },           text: "+30% HP, +20 start mana",          textFr: "+30% PV, +20 mana initial" },
  { id: "mana-veil",    name: "Mana Veil",     nameFr: "Voile Mana",     rarity: "rare",      kind: "completed", effect: { armorAdd: 30, mrAdd: 30, manaStart: 15 }, text: "+30 Armor & MR, +15 start mana",  textFr: "+30 Déf, +15 mana initial" },
  { id: "resonance",    name: "Resonance Lens", nameFr: "Lentille Résonance", rarity: "rare", kind: "completed", effect: { critAdd: 0.3, manaPerAttack: 5 },        text: "+30% crit, +5 mana/attack",        textFr: "+30% crit, +5 mana/attaque" },
  // New completed items — lifesteal, armor-pen, and regen lines.
  // c-lifesteal self-pair
  { id: "big-root",      name: "Big Root",       nameFr: "Grosse Racine",     rarity: "legendary", kind: "completed", effect: { lifeSteal: 0.35, regenPerSec: 0.03 },           text: "35% lifesteal, regen 3%/s",              textFr: "35% vol de vie, régén 3%/s" },
  // c-pen self-pair
  { id: "kings-rock",    name: "King's Rock",    nameFr: "Roc Royal",         rarity: "rare",      kind: "completed", effect: { armorPen: 0.55, stunChance: 0.18 },             text: "55% armor pen, 18% stun on ability",     textFr: "55% pén. déf, 18% étourdi" },
  // c-regen self-pair
  { id: "leftovers",     name: "Leftovers",      nameFr: "Restes",            rarity: "rare",      kind: "completed", effect: { regenPerSec: 0.06, hpMult: 1.25 },              text: "6% HP regen/s, +25% HP",                 textFr: "6% régén PV/s, +25% PV" },
  // c-lifesteal cross-pairs
  { id: "black-belt",    name: "Black Belt",     nameFr: "Ceinture Noire",    rarity: "rare",      kind: "completed", effect: { adMult: 1.35, lifeSteal: 0.2 },                 text: "+35% Attack, 20% lifesteal",             textFr: "+35% Attaque, 20% vol de vie" },
  { id: "silk-scarf",    name: "Silk Scarf",     nameFr: "Écharpe de Soie",   rarity: "rare",      kind: "completed", effect: { asMult: 1.3, lifeSteal: 0.22 },                 text: "+30% Speed, 22% lifesteal",              textFr: "+30% Vitesse, 22% vol de vie" },
  { id: "mystic-water",  name: "Mystic Water",   nameFr: "Eau Mystique",      rarity: "rare",      kind: "completed", effect: { apMult: 1.35, lifeSteal: 0.2 },                 text: "+35% AP, 20% lifesteal",                 textFr: "+35% Att.Spé, 20% vol de vie" },
  { id: "shell-bell",    name: "Shell Bell",     nameFr: "Grelot Coquille",   rarity: "legendary", kind: "completed", effect: { lifeSteal: 0.2, manaPerAttack: 6 },             text: "20% lifesteal, +6 mana/attack",          textFr: "20% vol de vie, +6 mana/attaque" },
  { id: "dusk-stone",    name: "Dusk Stone",     nameFr: "Pierre Nuit",       rarity: "legendary", kind: "completed", effect: { lifeSteal: 0.22, critAdd: 0.3, sash: true },    text: "22% lifesteal, +30% crit, survives one blow", textFr: "22% vol de vie, +30% crit, survit à un coup" },
  { id: "drain-punch",   name: "Drain Punch",    nameFr: "Poing Drain",       rarity: "rare",      kind: "completed", effect: { lifeSteal: 0.18, armorAdd: 28, mrAdd: 28 },     text: "18% lifesteal, +28 Armor & MR",          textFr: "18% vol de vie, +28 Déf" },
  { id: "sap-sipper",    name: "Sap Sipper",     nameFr: "Sève-Siphon",       rarity: "rare",      kind: "completed", effect: { lifeSteal: 0.2, hpMult: 1.28 },                 text: "20% lifesteal, +28% HP",                 textFr: "20% vol de vie, +28% PV" },
  // c-pen cross-pairs
  { id: "twisted-spoon", name: "Twisted Spoon",  nameFr: "Cuillère Tordue",   rarity: "rare",      kind: "completed", effect: { apMult: 1.38, armorPen: 0.3 },                  text: "+38% AP, 30% armor pen",                 textFr: "+38% Att.Spé, 30% pén. déf" },
  { id: "wide-lens",     name: "Wide Lens",      nameFr: "Lentille Large",    rarity: "legendary", kind: "completed", effect: { armorPen: 0.35, critAdd: 0.35 },                text: "35% armor pen, +35% crit",               textFr: "35% pén. déf, +35% crit" },
  { id: "muscle-band",   name: "Muscle Band",    nameFr: "Bracelet Muscle",   rarity: "rare",      kind: "completed", effect: { adMult: 1.35, armorPen: 0.3 },                  text: "+35% Attack, 30% armor pen",             textFr: "+35% Attaque, 30% pén. déf" },
  { id: "iron-fist",     name: "Iron Fist",      nameFr: "Poing de Fer",      rarity: "rare",      kind: "completed", effect: { armorPen: 0.28, asMult: 1.28 },                 text: "28% armor pen, +28% Speed",              textFr: "28% pén. déf, +28% Vitesse" },
  { id: "sharp-beak",    name: "Sharp Beak",     nameFr: "Bec Acéré",         rarity: "rare",      kind: "completed", effect: { armorPen: 0.28, hpMult: 1.28 },                 text: "28% armor pen, +28% HP",                 textFr: "28% pén. déf, +28% PV" },
  { id: "hard-stone",    name: "Hard Stone",     nameFr: "Pierre Dure",       rarity: "rare",      kind: "completed", effect: { armorPen: 0.25, armorAdd: 30, mrAdd: 30 },      text: "25% armor pen, +30 Armor & MR",          textFr: "25% pén. déf, +30 Déf" },
  { id: "drill-bit",     name: "Drill Bit",      nameFr: "Foret",             rarity: "rare",      kind: "completed", effect: { armorPen: 0.28, manaPerAttack: 5 },             text: "28% armor pen, +5 mana/attack",          textFr: "28% pén. déf, +5 mana/attaque" },
  // c-regen cross-pairs
  { id: "charcoal",      name: "Charcoal",       nameFr: "Charbon",           rarity: "rare",      kind: "completed", effect: { adMult: 1.35, burnDps: 0.04 },                  text: "+35% Attack, abilities burn",            textFr: "+35% Attaque, capacités brûlent" },
  { id: "miracle-seed",  name: "Miracle Seed",   nameFr: "Graine Miracle",    rarity: "rare",      kind: "completed", effect: { apMult: 1.35, regenPerSec: 0.03 },              text: "+35% AP, regen 3%/s",                    textFr: "+35% Att.Spé, régén 3%/s" },
  { id: "rocky-helmet",  name: "Rocky Helmet",   nameFr: "Casque Rocailleux", rarity: "legendary", kind: "completed", effect: { regenPerSec: 0.04, armorAdd: 40, mrAdd: 40, thornsPct: 0.15 }, text: "4% regen/s, +40 def, thorns 15%", textFr: "4% régén/s, +40 déf, épines 15%" },
  { id: "lax-incense",   name: "Lax Incense",    nameFr: "Encens Laxatif",    rarity: "rare",      kind: "completed", effect: { regenPerSec: 0.03, asMult: 1.28 },              text: "3% regen/s, +28% Speed",                 textFr: "3% régén/s, +28% Vitesse" },
  { id: "focus-sash",    name: "Focus Sash",     nameFr: "Ceinture Volonté",  rarity: "legendary", kind: "completed", effect: { regenPerSec: 0.03, critAdd: 0.28, sash: true }, text: "3% regen/s, +28% crit, survives one blow", textFr: "3% régén/s, +28% crit, survit à un coup" },
  { id: "persim-berry",  name: "Persim Berry",   nameFr: "Baie Poisebo",      rarity: "rare",      kind: "completed", effect: { regenPerSec: 0.03, manaStart: 18, statusImmune: true }, text: "3% regen/s, +18 mana, status immune", textFr: "3% régén/s, +18 mana, immunité" },
  { id: "dragon-scale",  name: "Dragon Scale",   nameFr: "Écaille Dragon",    rarity: "legendary", kind: "completed", effect: { apMult: 1.3, hpMult: 1.3, regenPerSec: 0.03 },  text: "+30% AP, +30% HP, regen 3%/s",          textFr: "+30% Att.Spé, +30% PV, régén 3%/s" },
];

/** Spatula-style EMBLEMS — grant the holder a synergy trait (TFT emblems). One per
 *  trait, minus the team-wide count-1 traits (an emblem there would trivially flip a
 *  global buff on). The granted trait is read by the synergy counter, not the sim, so
 *  combat stays deterministic. A small defensive stat keeps them worth a slot. */
const NO_EMBLEM = new Set(["eeveelution", "kanto-mythic", "mythic", "legendary"]);
export const EMBLEMS: ItemDef[] = TRAITS.filter((t) => !NO_EMBLEM.has(t.key)).map((t) => ({
  id: `emblem-${t.key}`,
  name: `${t.label} Emblem`,
  nameFr: `Emblème ${t.label}`,
  rarity: "legendary" as const,
  kind: "emblem" as const,
  effect: { armorAdd: 12, mrAdd: 12 },
  grantsTrait: t.key as string,
  text: `Holder gains the ${t.label} trait, +12 Armor & MR.`,
  textFr: `Le porteur gagne le trait ${t.label}, +12 Déf & Déf Spé.`,
}));

/** item id → the trait key it grants (empty for non-emblems). */
export const EMBLEM_TRAIT: Record<string, string> = Object.fromEntries(
  EMBLEMS.map((e) => [e.id, e.grantsTrait!]),
);
export const EMBLEM_IDS = EMBLEMS.map((e) => e.id);
export function isEmblem(id: string): boolean {
  return id in EMBLEM_TRAIT;
}

export const ITEM_POOL: ItemDef[] = [...COMPONENTS, ...COMPLETED, ...EMBLEMS];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));
export const ITEM_EFFECT: Record<string, ItemEffect> = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i.effect]));

/** The Spatula is a component (so isComponent + recipes recognise it) but it must NOT be
 *  in the common drop/carousel pool — it's earned via a rare carousel slot. So the public
 *  COMPONENT_IDS (used by every random-drop site) excludes it. */
export const SPATULA_ID = "spatula";
export const COMPONENT_IDS = COMPONENTS.filter((c) => c.id !== SPATULA_ID).map((c) => c.id);
export const COMPLETED_IDS = COMPLETED.map((c) => c.id);
/** Rules panel lists the completed items (the build targets). */
export const DEFAULT_ITEMS_ENABLED = COMPLETED.map((i) => i.id);

/** Stable key for a component pair, order-independent. */
export function combineKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Recipe table: every unordered pair of the 7 components → a completed item. */
export const RECIPES: Record<string, string> = {
  [combineKey("c-ad", "c-ad")]: "choice-band",
  [combineKey("c-ap", "c-ap")]: "choice-specs",
  [combineKey("c-as", "c-as")]: "choice-scarf",
  [combineKey("c-hp", "c-hp")]: "titan-heart",
  [combineKey("c-res", "c-res")]: "aegis",
  [combineKey("c-crit", "c-crit")]: "scope-lens",
  [combineKey("c-ad", "c-ap")]: "light-ball",
  [combineKey("c-ad", "c-as")]: "berserker",
  [combineKey("c-ad", "c-hp")]: "titan-fist",
  [combineKey("c-ad", "c-res")]: "adamant-edge",
  [combineKey("c-ad", "c-crit")]: "sniper-scope",
  [combineKey("c-ap", "c-as")]: "mystic-surge",
  [combineKey("c-ap", "c-hp")]: "burn-charm",
  [combineKey("c-ap", "c-crit")]: "jeweled-lens",
  [combineKey("c-ap", "c-res")]: "sage-ward",
  [combineKey("c-as", "c-hp")]: "endless-belt",
  [combineKey("c-as", "c-res")]: "steadfast",
  [combineKey("c-as", "c-crit")]: "spark-coil",
  [combineKey("c-hp", "c-res")]: "bulwark",
  [combineKey("c-hp", "c-crit")]: "vampire-fang",
  [combineKey("c-res", "c-crit")]: "edge-night",
  // Mana component pairs.
  [combineKey("c-mana", "c-mana")]: "spirit-orb",
  [combineKey("c-mana", "c-ap")]: "archmage",
  [combineKey("c-mana", "c-ad")]: "spellblade",
  [combineKey("c-mana", "c-as")]: "flux-rotor",
  [combineKey("c-mana", "c-hp")]: "soul-vessel",
  [combineKey("c-mana", "c-res")]: "mana-veil",
  [combineKey("c-mana", "c-crit")]: "resonance",
  // Spatula recipes — the TFT-style way to FORGE a Trait Emblem of your choice. Each
  // component picks the emblem matching its stat identity; two spatulas make the dragon
  // emblem (the "prestige" craft). Other emblems remain anvil/carousel-only.
  [combineKey("spatula", "c-ad")]: "emblem-fighting",
  [combineKey("spatula", "c-ap")]: "emblem-psychic",
  [combineKey("spatula", "c-as")]: "emblem-flying",
  [combineKey("spatula", "c-hp")]: "emblem-ground",
  [combineKey("spatula", "c-res")]: "emblem-steel",
  [combineKey("spatula", "c-crit")]: "emblem-dark",
  [combineKey("spatula", "c-mana")]: "emblem-water",
  [combineKey("spatula", "spatula")]: "emblem-dragon",
  // New component self-pairs.
  [combineKey("c-lifesteal", "c-lifesteal")]: "big-root",
  [combineKey("c-pen",       "c-pen")]:       "kings-rock",
  [combineKey("c-regen",     "c-regen")]:     "leftovers",
  // c-lifesteal cross-pairs.
  [combineKey("c-lifesteal", "c-ad")]:   "black-belt",
  [combineKey("c-lifesteal", "c-as")]:   "silk-scarf",
  [combineKey("c-lifesteal", "c-ap")]:   "mystic-water",
  [combineKey("c-lifesteal", "c-mana")]: "shell-bell",
  [combineKey("c-lifesteal", "c-crit")]: "dusk-stone",
  [combineKey("c-lifesteal", "c-res")]:  "drain-punch",
  [combineKey("c-lifesteal", "c-hp")]:   "sap-sipper",
  // c-pen cross-pairs.
  [combineKey("c-pen", "c-ap")]:   "twisted-spoon",
  [combineKey("c-pen", "c-crit")]: "wide-lens",
  [combineKey("c-pen", "c-ad")]:   "muscle-band",
  [combineKey("c-pen", "c-as")]:   "iron-fist",
  [combineKey("c-pen", "c-hp")]:   "sharp-beak",
  [combineKey("c-pen", "c-res")]:  "hard-stone",
  [combineKey("c-pen", "c-mana")]: "drill-bit",
  // c-regen cross-pairs.
  [combineKey("c-regen", "c-ad")]:   "charcoal",
  [combineKey("c-regen", "c-ap")]:   "miracle-seed",
  [combineKey("c-regen", "c-res")]:  "rocky-helmet",
  [combineKey("c-regen", "c-as")]:   "lax-incense",
  [combineKey("c-regen", "c-crit")]: "focus-sash",
  [combineKey("c-regen", "c-mana")]: "persim-berry",
  [combineKey("c-regen", "c-hp")]:   "dragon-scale",
  // Spatula + new components → new emblems.
  [combineKey("spatula", "c-lifesteal")]: "emblem-ghost",
  [combineKey("spatula", "c-pen")]:       "emblem-fire",
  [combineKey("spatula", "c-regen")]:     "emblem-grass",
};

export function isComponent(id: string): boolean {
  return ITEM_BY_ID[id]?.kind === "component";
}
