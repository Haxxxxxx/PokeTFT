import type { TraitDef, TraitTier, PokeType, RoleTrait } from "../types";

type RawTrait = Omit<TraitDef, "breakpoints">;

const RAW: RawTrait[] = [
  // ───────────── Type / origin traits ─────────────
  {
    key: "fire", label: "Fire", description: "Fire mons burn with raw offense.",
    tiers: [
      { count: 2, effect: "Fire mons: +15% Attack Damage.", buff: { adMult: 1.15 } },
      { count: 4, effect: "Fire mons: +32% Attack Damage.", buff: { adMult: 1.32 } },
      { count: 6, effect: "Fire mons: +55% Attack Damage.", buff: { adMult: 1.55 } },
      { count: 8, effect: "Fire mons: +85% Attack Damage.", buff: { adMult: 1.85 } },
    ],
  },
  {
    key: "water", label: "Water", description: "Rain floods the team with mana for faster casts.",
    tiers: [
      { count: 2, effect: "All allies start with +15 mana.", buff: { scope: "team", manaAdd: 15 } },
      { count: 4, effect: "All allies start with +30 mana.", buff: { scope: "team", manaAdd: 30 } },
      { count: 6, effect: "All allies start with +50 mana.", buff: { scope: "team", manaAdd: 50 } },
    ],
  },
  {
    key: "electric", label: "Electric", description: "Electric mons strike at blinding speed.",
    tiers: [
      { count: 2, effect: "Electric mons: +18% Attack Speed.", buff: { asMult: 1.18 } },
      { count: 4, effect: "Electric mons: +40% Attack Speed.", buff: { asMult: 1.4 } },
      { count: 6, effect: "Electric mons: +70% Attack Speed.", buff: { asMult: 1.7 } },
    ],
  },
  {
    key: "grass", label: "Grass", description: "Grass mons steadily regenerate health.",
    tiers: [
      { count: 3, effect: "Grass mons regen 2% max HP per second.", buff: { regenPerSec: 0.02 } },
      { count: 6, effect: "Grass mons regen 4.5% max HP per second.", buff: { regenPerSec: 0.045 } },
      { count: 9, effect: "Grass mons regen 8% max HP per second.", buff: { regenPerSec: 0.08 } },
    ],
  },
  {
    key: "psychic", label: "Psychic", description: "Psychic power shields the whole team at combat start.",
    tiers: [
      { count: 2, effect: "Team shield: +15% max HP.", buff: { scope: "team", shieldPct: 0.15 } },
      { count: 4, effect: "Team shield: +30% max HP.", buff: { scope: "team", shieldPct: 0.3 } },
      { count: 6, effect: "Team shield: +50% max HP.", buff: { scope: "team", shieldPct: 0.5 } },
    ],
  },
  {
    key: "poison", label: "Poison", description: "Poison mons channel potent ability power.",
    tiers: [
      { count: 3, effect: "Poison mons: +30% Ability Power.", buff: { apMult: 1.3 } },
      { count: 5, effect: "Poison mons: +55% Ability Power.", buff: { apMult: 1.55 } },
    ],
  },
  {
    key: "rock", label: "Rock", description: "Rock mons are walls of stone.",
    tiers: [
      { count: 2, effect: "Rock mons: +25 Armor & Magic Resist.", buff: { armorAdd: 25, mrAdd: 25 } },
      { count: 4, effect: "Rock mons: +55 Armor & Magic Resist.", buff: { armorAdd: 55, mrAdd: 55 } },
      { count: 6, effect: "Rock mons: +90 Armor & MR, +15% HP.", buff: { armorAdd: 90, mrAdd: 90, hpMult: 1.15 } },
    ],
  },
  {
    key: "flying", label: "Flying", description: "Flying mons weave fast through the fray.",
    tiers: [
      { count: 3, effect: "Flying mons: +18% Attack Speed.", buff: { asMult: 1.18 } },
      { count: 6, effect: "Flying mons: +38% Attack Speed.", buff: { asMult: 1.38 } },
    ],
  },
  {
    key: "dragon", label: "Dragon", description: "Dragons are raw, overwhelming power.",
    tiers: [
      { count: 2, effect: "Dragons: +35% Attack Damage & Ability Power.", buff: { adMult: 1.35, apMult: 1.35 } },
      { count: 3, effect: "Dragons: +60% Attack Damage & Ability Power.", buff: { adMult: 1.6, apMult: 1.6 } },
    ],
  },
  {
    key: "ghost", label: "Ghost", description: "Ghosts phase out of reach.",
    tiers: [{ count: 2, effect: "Ghosts: +30 Armor & MR, +15% Attack Speed.", buff: { armorAdd: 30, mrAdd: 30, asMult: 1.15 } }],
  },
  {
    key: "ground", label: "Ground", description: "Ground mons are heavy and durable.",
    tiers: [
      { count: 2, effect: "Ground mons: +20% max Health.", buff: { hpMult: 1.2 } },
      { count: 4, effect: "Ground mons: +40% max Health.", buff: { hpMult: 1.4 } },
    ],
  },
  {
    key: "bug", label: "Bug", description: "Bugs swarm with relentless speed.",
    tiers: [
      { count: 3, effect: "Bug mons: +22% Attack Speed.", buff: { asMult: 1.22 } },
      { count: 6, effect: "Bug mons: +45% Attack Speed.", buff: { asMult: 1.45 } },
    ],
  },
  {
    key: "normal", label: "Normal", description: "Normal mons steady the whole team.",
    tiers: [
      { count: 2, effect: "All allies: +6% Attack Damage & Health.", buff: { scope: "team", adMult: 1.06, hpMult: 1.06 } },
      { count: 4, effect: "All allies: +14% Attack Damage & Health.", buff: { scope: "team", adMult: 1.14, hpMult: 1.14 } },
      { count: 6, effect: "All allies: +24% Attack Damage & Health.", buff: { scope: "team", adMult: 1.24, hpMult: 1.24 } },
    ],
  },
  {
    key: "ice", label: "Ice", description: "Ice mons wield chilling magic.",
    tiers: [{ count: 2, effect: "Ice mons: +30% Ability Power, +20 MR.", buff: { apMult: 1.3, mrAdd: 20 } }],
  },
  {
    key: "fairy", label: "Fairy", description: "Fairy magic blunts incoming damage for the team.",
    tiers: [
      { count: 2, effect: "All allies: +20 Armor & Magic Resist.", buff: { scope: "team", armorAdd: 20, mrAdd: 20 } },
      { count: 4, effect: "All allies: +45 Armor & Magic Resist.", buff: { scope: "team", armorAdd: 45, mrAdd: 45 } },
    ],
  },
  {
    key: "fighting", label: "Fighting", description: "Fighting mons beat down with brute force.",
    tiers: [
      { count: 2, effect: "Fighting mons: +22% Attack Damage.", buff: { adMult: 1.22 } },
      { count: 4, effect: "Fighting mons: +45% Attack Damage.", buff: { adMult: 1.45 } },
    ],
  },
  {
    key: "dark", label: "Dark", description: "Dark mons hit hard from the shadows.",
    tiers: [
      { count: 2, effect: "Dark mons: +22% Attack Damage.", buff: { adMult: 1.22 } },
      { count: 4, effect: "Dark mons: +45% Attack Damage.", buff: { adMult: 1.45 } },
    ],
  },
  {
    key: "steel", label: "Steel", description: "Steel mons are fortresses of iron.",
    tiers: [
      { count: 2, effect: "Steel mons: +30 Armor & MR.", buff: { armorAdd: 30, mrAdd: 30 } },
      { count: 4, effect: "Steel mons: +65 Armor & MR, +12% HP.", buff: { armorAdd: 65, mrAdd: 65, hpMult: 1.12 } },
      { count: 6, effect: "Steel mons: +110 Armor & MR, +25% HP.", buff: { armorAdd: 110, mrAdd: 110, hpMult: 1.25 } },
    ],
  },

  // ───────────── Role / class traits ─────────────
  {
    key: "starter", label: "Starter", description: "Your starter trio grows into well-rounded threats.",
    tiers: [
      { count: 3, effect: "Starters: +20% Attack Damage & Health.", buff: { adMult: 1.2, hpMult: 1.2 } },
      { count: 6, effect: "Starters: +45% Attack Damage & Health.", buff: { adMult: 1.45, hpMult: 1.45 } },
    ],
  },
  {
    key: "evolver", label: "Evolver", description: "Evolvers reward a wide, upgraded board.",
    tiers: [
      { count: 4, effect: "Evolvers: +12% Attack Damage.", buff: { adMult: 1.12 } },
      { count: 6, effect: "Evolvers: +25% Attack Damage, +10% HP.", buff: { adMult: 1.25, hpMult: 1.1 } },
      { count: 9, effect: "Evolvers: +45% Attack Damage, +20% HP.", buff: { adMult: 1.45, hpMult: 1.2 } },
    ],
  },
  {
    key: "swarm", label: "Swarm", description: "Swarm mons feed off each other's speed.",
    tiers: [
      { count: 2, effect: "Swarm mons: +22% Attack Speed.", buff: { asMult: 1.22 } },
      { count: 4, effect: "Swarm mons: +45% Attack Speed.", buff: { asMult: 1.45 } },
    ],
  },
  {
    key: "eeveelution", label: "Eeveelution", description: "Eevee adapts and lifts the whole team.",
    tiers: [{ count: 1, effect: "All allies: +10% Attack Damage & Ability Power.", buff: { scope: "team", adMult: 1.1, apMult: 1.1 } }],
  },
  {
    key: "fossil", label: "Fossil", description: "Fossils are ancient and unyielding.",
    tiers: [{ count: 2, effect: "Fossils: +35% max Health.", buff: { hpMult: 1.35 } }],
  },
  {
    key: "pseudo-legendary", label: "Pseudo-Legend", description: "Few in number, immense in power.",
    tiers: [{ count: 2, effect: "Pseudo-legends: +30% Attack Damage, Ability Power & Health.", buff: { adMult: 1.3, apMult: 1.3, hpMult: 1.3 } }],
  },
  {
    key: "legendary", label: "Legendary", description: "Legendaries empower the entire team.",
    tiers: [
      { count: 2, effect: "All allies: +15% Attack Damage & Ability Power.", buff: { scope: "team", adMult: 1.15, apMult: 1.15 } },
      { count: 3, effect: "All allies: +30% Attack Damage & Ability Power.", buff: { scope: "team", adMult: 1.3, apMult: 1.3 } },
    ],
  },
  {
    key: "kanto-mythic", label: "Mythic", description: "Mew and Mewtwo bend the rules.",
    tiers: [{ count: 1, effect: "Mythic mons: +25% to all stats.", buff: { adMult: 1.25, apMult: 1.25, hpMult: 1.25 } }],
  },
  {
    key: "mythic", label: "Mythic", description: "Mythical mons defy the laws of nature.",
    tiers: [{ count: 1, effect: "Mythic mons: +20% to all stats.", buff: { adMult: 1.2, apMult: 1.2, hpMult: 1.2 } }],
  },
];

export const TRAITS: TraitDef[] = RAW.map((t) => ({
  ...t,
  breakpoints: t.tiers.map((tier) => tier.count),
}));

export const TRAITS_BY_KEY: Record<string, TraitDef> = Object.fromEntries(
  TRAITS.map((t) => [t.key, t]),
);

/** Returns the highest reached breakpoint tier (0 = inactive, 1+ = active tier). */
export function activeTier(key: PokeType | RoleTrait, count: number): number {
  const t = TRAITS_BY_KEY[key];
  if (!t) return 0;
  let tier = 0;
  for (const bp of t.breakpoints) {
    if (count >= bp) tier++;
  }
  return tier;
}

export type { TraitTier };
