import type { TraitDef, TraitTier, PokeType, RoleTrait } from "../types";

type RawTrait = Omit<TraitDef, "breakpoints">;

const RAW: RawTrait[] = [
  // ───────────── Type / origin traits ─────────────
  {
    key: "fire", label: "Fire", description: "Fire mons burn enemies with their abilities.",
    tiers: [
      { count: 2, effect: "+15% Attack Damage · abilities burn (3% HP/s).", buff: { adMult: 1.15, burnDps: 0.03 } },
      { count: 4, effect: "+32% Attack Damage · burn 5% HP/s.", buff: { adMult: 1.32, burnDps: 0.05 } },
      { count: 6, effect: "+55% Attack Damage · burn 7% HP/s.", buff: { adMult: 1.55, burnDps: 0.07 } },
      { count: 8, effect: "+85% Attack Damage · burn 10% HP/s.", buff: { adMult: 1.85, burnDps: 0.1 } },
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
      { count: 3, effect: "Grass mons: +12% HP · regen 3% max HP/s.", buff: { hpMult: 1.12, regenPerSec: 0.03 } },
      { count: 6, effect: "Grass mons: +25% HP · regen 6% max HP/s.", buff: { hpMult: 1.25, regenPerSec: 0.06 } },
      { count: 9, effect: "Grass mons: +45% HP · regen 11% max HP/s.", buff: { hpMult: 1.45, regenPerSec: 0.11 } },
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
      { count: 2, effect: "Poison mons: +25% Ability Power · abilities poison (3% HP/s).", buff: { apMult: 1.25, burnDps: 0.03 } },
      { count: 4, effect: "Poison mons: +45% Ability Power · poison 5% HP/s.", buff: { apMult: 1.45, burnDps: 0.05 } },
      { count: 6, effect: "Poison mons: +70% Ability Power · poison 8% HP/s.", buff: { apMult: 1.7, burnDps: 0.08 } },
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
      { count: 2, effect: "Dragons: +22% Attack Damage & Ability Power.", buff: { adMult: 1.22, apMult: 1.22 } },
      { count: 3, effect: "Dragons: +45% Attack Damage & Ability Power.", buff: { adMult: 1.45, apMult: 1.45 } },
    ],
  },
  {
    key: "ghost", label: "Ghost", description: "Ghosts phase through defenses.",
    tiers: [{ count: 2, effect: "Ghosts: +15% Attack Speed · ignore 40% of armor.", buff: { mrAdd: 20, asMult: 1.15, armorPen: 0.4 } }],
  },
  {
    key: "ground", label: "Ground", description: "Ground mons are heavy and durable.",
    tiers: [
      { count: 2, effect: "Ground mons: +20% max Health.", buff: { hpMult: 1.2 } },
      { count: 4, effect: "Ground mons: +40% max Health.", buff: { hpMult: 1.4 } },
    ],
  },
  {
    key: "bug", label: "Bug", description: "Bugs swarm fast and drain life.",
    tiers: [
      { count: 3, effect: "+22% Attack Speed · 15% lifesteal.", buff: { asMult: 1.22, lifeSteal: 0.15 } },
      { count: 6, effect: "+45% Attack Speed · 30% lifesteal.", buff: { asMult: 1.45, lifeSteal: 0.3 } },
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
    key: "ice", label: "Ice", description: "Ice mons freeze foes with their abilities.",
    tiers: [{ count: 2, effect: "Ice mons: +30% Ability Power · 35% to freeze on ability.", buff: { apMult: 1.3, mrAdd: 20, freezeChance: 0.35 } }],
  },
  {
    key: "fairy", label: "Fairy", description: "Fairy magic blunts incoming damage for the team.",
    tiers: [
      { count: 2, effect: "All allies: +20 Armor & Magic Resist.", buff: { scope: "team", armorAdd: 20, mrAdd: 20 } },
      { count: 4, effect: "All allies: +45 Armor & Magic Resist.", buff: { scope: "team", armorAdd: 45, mrAdd: 45 } },
    ],
  },
  {
    key: "fighting", label: "Fighting", description: "Fighting mons stagger foes with their blows.",
    tiers: [
      { count: 2, effect: "+22% Attack Damage · 25% to stun on ability.", buff: { adMult: 1.22, stunChance: 0.25 } },
      { count: 4, effect: "+45% Attack Damage · 40% to stun on ability.", buff: { adMult: 1.45, stunChance: 0.4 } },
    ],
  },
  {
    key: "dark", label: "Dark", description: "Dark mons land vicious critical strikes.",
    tiers: [
      { count: 2, effect: "+18% Attack Damage · +20% crit chance.", buff: { adMult: 1.18, critAdd: 0.2 } },
      { count: 4, effect: "+35% Attack Damage · +40% crit chance.", buff: { adMult: 1.35, critAdd: 0.4 } },
    ],
  },
  {
    key: "steel", label: "Steel", description: "Steel mons are fortresses of iron.",
    tiers: [
      { count: 2, effect: "Steel mons: +28 Armor & Magic Resist.", buff: { armorAdd: 28, mrAdd: 28 } },
      { count: 4, effect: "+60 Armor & MR, +12% HP · immune to status.", buff: { armorAdd: 60, mrAdd: 60, hpMult: 1.12, statusImmune: true } },
      { count: 6, effect: "+110 Armor & MR, +25% HP · immune to status.", buff: { armorAdd: 110, mrAdd: 110, hpMult: 1.25, statusImmune: true } },
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
    key: "evolver", label: "Evolver", description: "Counts only EVOLVED (★★+) mons — reward for upgrading your board.",
    // Almost every mon "can evolve", so a flat evolver count was active on every board
    // and meaningless. It now counts ONLY units you've actually evolved to ★★ or ★★★
    // (see computeTraits), making it a real build-around: a tempo/3-star board that
    // commits to upgrading rather than going wide gets paid for it.
    tiers: [
      { count: 3, effect: "Evolved mons: +12% Attack Damage & Ability Power.", buff: { scope: "team", adMult: 1.12, apMult: 1.12 } },
      { count: 5, effect: "All allies: +24% Attack Damage & Ability Power, +12% HP.", buff: { scope: "team", adMult: 1.24, apMult: 1.24, hpMult: 1.12 } },
      { count: 7, effect: "All allies: +45% Attack Damage & Ability Power, +25% HP.", buff: { scope: "team", adMult: 1.45, apMult: 1.45, hpMult: 1.25 } },
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
