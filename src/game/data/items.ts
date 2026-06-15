/** Item system with TFT-style combining: 6 components combine (2 → 1) into 21
 *  completed items. Effects are a structured object the combat engine applies
 *  generically (deterministic — no per-id branching in the sim). */

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
  sash?: boolean;         // survive one lethal blow at full HP
  statusImmune?: boolean; // immune to burn/stun/freeze
};

export type ItemDef = {
  id: string;
  name: string;
  nameFr: string;
  icon: string;
  rarity: ItemRarity;
  kind: "component" | "completed";
  effect: ItemEffect;
  /** Short human-readable effect summary. */
  text: string;
  textFr: string;
};

export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: "#94a3b8",
  rare: "#38bdf8",
  legendary: "#fbbf24",
};
export const RARITY_WEIGHT: Record<ItemRarity, number> = { common: 1, rare: 0.5, legendary: 0.16 };

/** The 6 building-block components — these are what drops; players combine them. */
export const COMPONENTS: ItemDef[] = [
  { id: "c-ad",   name: "Power Bracer", nameFr: "Bracelet Force", icon: "⚔️", rarity: "common", kind: "component", effect: { adMult: 1.2 },    text: "+20% Attack",        textFr: "+20% Attaque" },
  { id: "c-ap",   name: "Psy Crystal",  nameFr: "Cristal Psy",    icon: "🔮", rarity: "common", kind: "component", effect: { apMult: 1.2 },    text: "+20% Ability Power",  textFr: "+20% Att. Spé" },
  { id: "c-as",   name: "Spin Gear",    nameFr: "Engrenage",      icon: "🌀", rarity: "common", kind: "component", effect: { asMult: 1.18 },   text: "+18% Attack Speed",   textFr: "+18% Vitesse" },
  { id: "c-hp",   name: "Vital Band",   nameFr: "Ruban Vital",    icon: "❤️", rarity: "common", kind: "component", effect: { hpMult: 1.15 },   text: "+15% Health",         textFr: "+15% PV" },
  { id: "c-res",  name: "Stone Plate",  nameFr: "Plaque Pierre",  icon: "🛡️", rarity: "common", kind: "component", effect: { armorAdd: 18, mrAdd: 18 }, text: "+18 Armor & MR", textFr: "+18 Déf & Déf Spé" },
  { id: "c-crit", name: "Keen Edge",    nameFr: "Lame Affûtée",   icon: "✨", rarity: "common", kind: "component", effect: { critAdd: 0.12 },  text: "+12% Crit",           textFr: "+12% Critique" },
];

/** Completed items — one per unordered component pair (recipe key in RECIPES). */
export const COMPLETED: ItemDef[] = [
  { id: "choice-band",  name: "Choice Band",   nameFr: "Bandeau Choix",  icon: "🎗️", rarity: "rare",      kind: "completed", effect: { adMult: 1.8 },                          text: "+80% Attack",                       textFr: "+80% Attaque" },
  { id: "choice-specs", name: "Choice Specs",  nameFr: "Lunettes Choix", icon: "🔭", rarity: "rare",      kind: "completed", effect: { apMult: 1.8 },                          text: "+80% Ability Power",                textFr: "+80% Att. Spé" },
  { id: "choice-scarf", name: "Choice Scarf",  nameFr: "Mouchoir Choix", icon: "🧣", rarity: "rare",      kind: "completed", effect: { asMult: 1.6 },                          text: "+60% Attack Speed",                 textFr: "+60% Vitesse" },
  { id: "titan-heart",  name: "Titan Heart",   nameFr: "Cœur Titan",     icon: "💗", rarity: "rare",      kind: "completed", effect: { hpMult: 1.6, regenPerSec: 0.04 },       text: "+60% HP, regen 4%/s",               textFr: "+60% PV, régén 4%/s" },
  { id: "aegis",        name: "Aegis",         nameFr: "Égide",          icon: "🛡️", rarity: "rare",      kind: "completed", effect: { armorAdd: 55, mrAdd: 55, statusImmune: true }, text: "+55 Armor & MR, status immune", textFr: "+55 Déf & Déf Spé, immunité" },
  { id: "scope-lens",   name: "Scope Lens",    nameFr: "Lentille Visée", icon: "🎯", rarity: "rare",      kind: "completed", effect: { critAdd: 0.5 },                         text: "+50% Crit",                         textFr: "+50% Critique" },
  { id: "light-ball",   name: "Light Ball",    nameFr: "Balle Lumière",  icon: "⚡", rarity: "legendary", kind: "completed", effect: { adMult: 1.4, apMult: 1.4, critAdd: 0.1 }, text: "+40% AD & AP, +10% crit",           textFr: "+40% Att & Att.Spé, +10% crit" },
  { id: "berserker",    name: "Berserker Gene", nameFr: "Gène Berserk",  icon: "😤", rarity: "rare",      kind: "completed", effect: { adMult: 1.4, asMult: 1.35 },            text: "+40% Attack, +35% Speed",           textFr: "+40% Attaque, +35% Vitesse" },
  { id: "titan-fist",   name: "Titan Fist",    nameFr: "Poing Titan",    icon: "👊", rarity: "rare",      kind: "completed", effect: { adMult: 1.4, hpMult: 1.3 },             text: "+40% Attack, +30% HP",              textFr: "+40% Attaque, +30% PV" },
  { id: "adamant-edge", name: "Adamant Edge",  nameFr: "Lame Adamant",   icon: "🗡️", rarity: "rare",      kind: "completed", effect: { adMult: 1.4, armorPen: 0.4 },           text: "+40% Attack, 40% armor pen",        textFr: "+40% Attaque, 40% pén. déf" },
  { id: "sniper-scope", name: "Sniper Scope",  nameFr: "Viseur Sniper",  icon: "🔫", rarity: "legendary", kind: "completed", effect: { adMult: 1.4, critAdd: 0.4 },            text: "+40% Attack, +40% crit",            textFr: "+40% Attaque, +40% crit" },
  { id: "mystic-surge", name: "Mystic Surge",  nameFr: "Vague Mystique", icon: "🌟", rarity: "rare",      kind: "completed", effect: { apMult: 1.4, asMult: 1.35 },            text: "+40% AP, +35% Speed",               textFr: "+40% Att.Spé, +35% Vitesse" },
  { id: "burn-charm",   name: "Burn Charm",    nameFr: "Charme Brûlure", icon: "🔥", rarity: "rare",      kind: "completed", effect: { apMult: 1.4, burnDps: 0.04 },           text: "+40% AP, abilities burn",           textFr: "+40% Att.Spé, capacités brûlent" },
  { id: "jeweled-lens", name: "Jeweled Lens",  nameFr: "Lentille Joyau", icon: "💠", rarity: "legendary", kind: "completed", effect: { apMult: 1.4, critAdd: 0.4 },            text: "+40% AP, +40% crit",                textFr: "+40% Att.Spé, +40% crit" },
  { id: "sage-ward",    name: "Sage Ward",     nameFr: "Garde Sage",     icon: "📿", rarity: "rare",      kind: "completed", effect: { apMult: 1.4, armorAdd: 35, mrAdd: 35 }, text: "+40% AP, +35 Armor & MR",           textFr: "+40% Att.Spé, +35 Déf" },
  { id: "endless-belt", name: "Endless Belt",  nameFr: "Ceinture Sans Fin", icon: "🥋", rarity: "rare",   kind: "completed", effect: { asMult: 1.35, hpMult: 1.3 },            text: "+35% Speed, +30% HP",               textFr: "+35% Vitesse, +30% PV" },
  { id: "steadfast",    name: "Steadfast Gear", nameFr: "Garde Tenace",  icon: "⚙️", rarity: "rare",      kind: "completed", effect: { asMult: 1.35, armorAdd: 35, mrAdd: 35 }, text: "+35% Speed, +35 Armor & MR",       textFr: "+35% Vitesse, +35 Déf" },
  { id: "spark-coil",   name: "Spark Coil",    nameFr: "Bobine Étincelle", icon: "⚡", rarity: "rare",     kind: "completed", effect: { asMult: 1.35, critAdd: 0.3 },           text: "+35% Speed, +30% crit",             textFr: "+35% Vitesse, +30% crit" },
  { id: "bulwark",      name: "Bulwark",       nameFr: "Rempart",        icon: "🏰", rarity: "rare",      kind: "completed", effect: { hpMult: 1.35, armorAdd: 35, mrAdd: 35, thornsPct: 0.12 }, text: "+35% HP, +35 def, thorns", textFr: "+35% PV, +35 déf, épines" },
  { id: "vampire-fang", name: "Vampire Fang",  nameFr: "Croc Vampire",   icon: "🦇", rarity: "legendary", kind: "completed", effect: { hpMult: 1.3, critAdd: 0.25, lifeSteal: 0.25 }, text: "+30% HP, +25% crit, 25% lifesteal", textFr: "+30% PV, +25% crit, 25% vol de vie" },
  { id: "edge-night",   name: "Edge of Night",  nameFr: "Lame de Nuit",  icon: "🌑", rarity: "rare",     kind: "completed", effect: { armorAdd: 35, mrAdd: 35, critAdd: 0.25, sash: true }, text: "+35 def, +25% crit, survives one blow", textFr: "+35 déf, +25% crit, survit à un coup" },
];

export const ITEM_POOL: ItemDef[] = [...COMPONENTS, ...COMPLETED];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));
export const ITEM_EFFECT: Record<string, ItemEffect> = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i.effect]));

export const COMPONENT_IDS = COMPONENTS.map((c) => c.id);
/** Rules panel lists the completed items (the build targets). */
export const DEFAULT_ITEMS_ENABLED = COMPLETED.map((i) => i.id);

/** Stable key for a component pair, order-independent. */
export function combineKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Recipe table: every unordered pair of the 6 components → a completed item. */
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
};

export function isComponent(id: string): boolean {
  return ITEM_BY_ID[id]?.kind === "component";
}
