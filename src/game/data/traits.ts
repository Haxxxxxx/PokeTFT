import type { TraitDef, TraitTier, PokeType, RoleTrait } from "../types";

type RawTrait = Omit<TraitDef, "breakpoints">;

const RAW: RawTrait[] = [
  // ───────────── Type / origin traits ─────────────
  {
    key: "fire", label: "Fire", description: "Fire mons set enemies ablaze, dealing damage over time.",
    tiers: [
      { count: 2, effect: "Burn the target for 1% max HP per second." },
      { count: 4, effect: "Burn for 2% max HP/sec and reduce enemy healing by 33%." },
      { count: 6, effect: "Burn for 4% max HP/sec, applied to all enemies in combat." },
    ],
  },
  {
    key: "water", label: "Water", description: "Rain channels mana into your whole team.",
    tiers: [
      { count: 2, effect: "Restore +3 mana per second to all allies." },
      { count: 4, effect: "Restore +6 mana per second to all allies." },
      { count: 6, effect: "Restore +10 mana/sec; first cast each combat is free." },
    ],
  },
  {
    key: "electric", label: "Electric", description: "Attacks arc lightning to nearby foes.",
    tiers: [
      { count: 2, effect: "Attacks chain to 1 extra enemy for 40% damage." },
      { count: 4, effect: "Attacks chain to 3 enemies for 60% damage." },
    ],
  },
  {
    key: "grass", label: "Grass", description: "Grass mons steadily regenerate health.",
    tiers: [
      { count: 3, effect: "Regenerate 2% max HP per second." },
      { count: 6, effect: "Regenerate 5% max HP/sec and heal 15% of damage dealt." },
    ],
  },
  {
    key: "psychic", label: "Psychic", description: "Psychic power shields the team at combat start.",
    tiers: [
      { count: 2, effect: "Grant the team a shield for 15% of their max HP." },
      { count: 4, effect: "Shield for 30% max HP." },
      { count: 6, effect: "Shield for 50% max HP and reflect 25% of damage absorbed." },
    ],
  },
  {
    key: "poison", label: "Poison", description: "Poison makes enemies fragile.",
    tiers: [
      { count: 3, effect: "Poisoned enemies take +12% damage and heal 30% less." },
      { count: 5, effect: "Poisoned enemies take +20% damage and cannot heal." },
    ],
  },
  {
    key: "rock", label: "Rock", description: "Rock mons are walls of stone.",
    tiers: [
      { count: 2, effect: "Rock mons gain +20 Armor and +20 Magic Resist." },
      { count: 4, effect: "Gain +45 Armor & MR and reduce incoming damage by 15%." },
    ],
  },
  {
    key: "flying", label: "Flying", description: "Flying mons weave through attacks.",
    tiers: [
      { count: 3, effect: "Flying mons have a 15% chance to dodge attacks." },
      { count: 6, effect: "30% dodge chance and +20% movement speed." },
    ],
  },
  {
    key: "dragon", label: "Dragon", description: "Dragons are raw, overwhelming power.",
    tiers: [{ count: 2, effect: "Dragons gain +40% Attack Damage and +40 Ability Power." }],
  },
  {
    key: "ghost", label: "Ghost", description: "Ghosts phase out of reach.",
    tiers: [{ count: 2, effect: "Ghosts are untargetable for the first 3 seconds of combat." }],
  },
  {
    key: "ground", label: "Ground", description: "Ground mons are heavy and durable.",
    tiers: [{ count: 2, effect: "Ground mons gain +200 max Health." }],
  },
  {
    key: "bug", label: "Bug", description: "Bugs swarm even in death.",
    tiers: [{ count: 3, effect: "On death, Bug mons spawn a swarmling with 40% of their stats." }],
  },
  {
    key: "normal", label: "Normal", description: "Normal mons pad your wallet.",
    tiers: [
      { count: 2, effect: "Earn +1 gold at the end of each round." },
      { count: 4, effect: "Earn +3 gold at the end of each round." },
    ],
  },
  {
    key: "ice", label: "Ice", description: "Ice locks enemies in place.",
    tiers: [{ count: 2, effect: "Abilities have a 25% chance to freeze the target for 1.5s." }],
  },
  {
    key: "fairy", label: "Fairy", description: "Fairy magic blunts the biggest threats.",
    tiers: [{ count: 2, effect: "Take 25% less damage from the highest-cost enemy." }],
  },
  {
    key: "fighting", label: "Fighting", description: "Fighting mons beat down all defenses.",
    tiers: [
      { count: 2, effect: "Attacks ignore 20% of the target's Armor." },
      { count: 4, effect: "Attacks ignore 40% of Armor and deal +15% damage." },
    ],
  },
  {
    key: "dark", label: "Dark", description: "Dark mons strike when least expected.",
    tiers: [
      { count: 2, effect: "Deal +20% bonus damage to the lowest-HP enemy." },
      { count: 4, effect: "+20% bonus damage and execute targets below 15% HP." },
    ],
  },
  {
    key: "steel", label: "Steel", description: "Steel mons are fortresses of iron.",
    tiers: [
      { count: 2, effect: "Gain +30 Armor and +30 Magic Resist." },
      { count: 4, effect: "+60 Armor & MR; incoming crits deal no bonus damage." },
    ],
  },

  // ───────────── Role / class traits ─────────────
  {
    key: "starter", label: "Starter", description: "Your starter trio grows stronger every round.",
    tiers: [{ count: 3, effect: "Starters gain +8 Attack Damage and +60 Health each round (stacks)." }],
  },
  {
    key: "evolver", label: "Evolver", description: "Evolvers reward upgrading.",
    tiers: [
      { count: 4, effect: "Evolvers gain +10% stats when they star up." },
      { count: 6, effect: "Evolvers gain +25% stats on star-up and cost 1 less to buy." },
    ],
  },
  {
    key: "swarm", label: "Swarm", description: "Swarm mons feed off each other's speed.",
    tiers: [
      { count: 2, effect: "Swarm mons gain +10% Attack Speed per Swarm ally." },
      { count: 4, effect: "Swarm mons gain +18% Attack Speed per Swarm ally." },
    ],
  },
  {
    key: "eeveelution", label: "Eeveelution", description: "Eevee adapts to your team.",
    tiers: [{ count: 1, effect: "Eevee copies the strongest active trait on your board." }],
  },
  {
    key: "fossil", label: "Fossil", description: "Fossils refuse to stay down.",
    tiers: [{ count: 2, effect: "Fossils revive once at 33% Health the first time they fall." }],
  },
  {
    key: "pseudo-legendary", label: "Pseudo-Legend", description: "Few in number, immense in power.",
    tiers: [{ count: 2, effect: "Pseudo-legends gain +30% Attack Damage, Ability Power and Health." }],
  },
  {
    key: "legendary", label: "Legendary", description: "The legendary birds empower the team's element.",
    tiers: [
      { count: 2, effect: "The team deals +15% elemental damage." },
      { count: 3, effect: "+30% elemental damage and allies gain the birds' typing." },
    ],
  },
  {
    key: "kanto-mythic", label: "Mythic", description: "Mew and Mewtwo bend the rules.",
    tiers: [{ count: 1, effect: "Unlock a unique, game-warping power for the Mythic mon." }],
  },
  {
    key: "mythic", label: "Mythic", description: "Mythical mons defy the laws of nature.",
    tiers: [{ count: 1, effect: "This mon gains +20% to all stats and ignores type immunities." }],
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
