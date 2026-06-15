export type ItemRarity = "common" | "rare" | "legendary";

export type ItemDef = {
  id: string;
  name: string;
  nameFr: string;
  effect: string;
  icon: string;
  rarity: ItemRarity;
};

/** Rarity → accent colour (cards, borders). */
export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: "#94a3b8",
  rare: "#38bdf8",
  legendary: "#fbbf24",
};

/** Relative drop weight by rarity — rarer items appear less often. */
export const RARITY_WEIGHT: Record<ItemRarity, number> = {
  common: 1,
  rare: 0.55,
  legendary: 0.18,
};

export const ITEM_POOL: ItemDef[] = [
  // ── Common ─────────────────────────────────────────────────────────────────
  { id: "muscle-band",  name: "Muscle Band",   nameFr: "Bandeau Muscle",  effect: "+25% Attaque.",                                    icon: "💪", rarity: "common" },
  { id: "wise-glasses", name: "Wise Glasses",  nameFr: "Lunettes Spéciales", effect: "+20% Attaque Spéciale.",                        icon: "👓", rarity: "common" },
  { id: "leftovers",    name: "Leftovers",     nameFr: "Restes",          effect: "Régénère 5% des PV max à chaque seconde.",          icon: "🍎", rarity: "common" },
  { id: "focus-sash",   name: "Focus Sash",    nameFr: "Ceinture Force",  effect: "Survit à 1 PV si PV pleins lors du coup fatal.",     icon: "🥋", rarity: "common" },

  // ── Rare ───────────────────────────────────────────────────────────────────
  { id: "choice-band",  name: "Choice Band",   nameFr: "Bandeau Choix",   effect: "+50% Attaque.",                                     icon: "🎗️", rarity: "rare" },
  { id: "choice-specs", name: "Choice Specs",  nameFr: "Lunettes Choix",  effect: "+50% Attaque Spéciale.",                            icon: "🔭", rarity: "rare" },
  { id: "choice-scarf", name: "Choice Scarf",  nameFr: "Mouchoir Choix",  effect: "+35% Vitesse d'attaque.",                           icon: "🧣", rarity: "rare" },
  { id: "life-orb",     name: "Life Orb",      nameFr: "Orbe Vie",        effect: "+30% dégâts. Perd 10% PV par attaque.",             icon: "🔮", rarity: "rare" },
  { id: "shell-bell",   name: "Shell Bell",    nameFr: "Grelot Coque",    effect: "Soigne 20% des dégâts infligés.",                   icon: "🐚", rarity: "rare" },
  { id: "expert-belt",  name: "Expert Belt",   nameFr: "Ceinture Pro",    effect: "Ignore 40% de la Défense de la cible.",             icon: "🥇", rarity: "rare" },
  { id: "eviolite",     name: "Eviolite",      nameFr: "Évolite",         effect: "+50% Déf et Déf Spé si non-évolution finale.",      icon: "💎", rarity: "rare" },
  { id: "assault-vest", name: "Assault Vest",  nameFr: "Gilet Combat",    effect: "+50% Déf Spé. Immunise aux statuts.",               icon: "🦺", rarity: "rare" },
  { id: "rocky-helmet", name: "Rocky Helmet",  nameFr: "Casque Brut",     effect: "L'attaquant perd 16% PV sur tout contact.",         icon: "⛑️", rarity: "rare" },

  // ── Legendary ──────────────────────────────────────────────────────────────
  { id: "light-ball",   name: "Light Ball",    nameFr: "Balle Lumière",   effect: "+30% Attaque, +30% Att. Spé, +15% critique.",       icon: "⚡", rarity: "legendary" },
  { id: "kings-rock",   name: "King's Rock",   nameFr: "Roche Royale",    effect: "Les capacités ont 30% de chance d'étourdir.",       icon: "👑", rarity: "legendary" },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

export const DEFAULT_ITEMS_ENABLED = ITEM_POOL.map((i) => i.id);
