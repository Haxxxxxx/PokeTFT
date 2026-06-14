export type ItemDef = {
  id: string;
  name: string;
  nameFr: string;
  effect: string;
  icon: string;
};

export const ITEM_POOL: ItemDef[] = [
  {
    id: "leftovers",
    name: "Leftovers",
    nameFr: "Restes",
    effect: "Régénère 5% des PV max à chaque tour.",
    icon: "🍎",
  },
  {
    id: "choice-band",
    name: "Choice Band",
    nameFr: "Bandeau Choix",
    effect: "+50% Attaque. Verrouille sur une capacité.",
    icon: "🎗️",
  },
  {
    id: "choice-specs",
    name: "Choice Specs",
    nameFr: "Lunettes Choix",
    effect: "+50% Attaque Spéciale. Verrouille sur une capacité.",
    icon: "🔭",
  },
  {
    id: "life-orb",
    name: "Life Orb",
    nameFr: "Orbe Vie",
    effect: "+30% dégâts. Perd 10% PV par attaque.",
    icon: "🔮",
  },
  {
    id: "focus-sash",
    name: "Focus Sash",
    nameFr: "Ceinture Force",
    effect: "Survit à 1 PV si PV pleins lors du coup fatal.",
    icon: "🥋",
  },
  {
    id: "eviolite",
    name: "Eviolite",
    nameFr: "Évolite",
    effect: "+50% Déf et Déf Spé si non-évolution finale.",
    icon: "💎",
  },
  {
    id: "assault-vest",
    name: "Assault Vest",
    nameFr: "Gilet Combat",
    effect: "+50% Déf Spé. Interdit les capacités de statut.",
    icon: "🦺",
  },
  {
    id: "rocky-helmet",
    name: "Rocky Helmet",
    nameFr: "Casque Brut",
    effect: "L'attaquant perd 16% PV sur tout contact.",
    icon: "⛑️",
  },
];

export const DEFAULT_ITEMS_ENABLED = ITEM_POOL.map((i) => i.id);
