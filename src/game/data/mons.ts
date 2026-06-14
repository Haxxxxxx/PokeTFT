import type { UnitDef, StatBlock, Move, PokeType, RoleTrait } from "../types";
import type { Cost } from "../config";
import { GEN_DEX_RANGES } from "./generations";

/** Sprite URL from national dex id (PokéAPI's public sprite repo). */
export function spriteUrl(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;
}

// Stat presets scaled by cost (~x1.8 per star, melee baseline).
const STAT_BY_COST: Record<Cost, StatBlock> = {
  1: { hp: [550, 990, 1782], ad: [40, 72, 130], attackSpeed: 0.6, armor: 20, magicResist: 20, range: 1, maxMana: 60, startMana: 0 },
  2: { hp: [650, 1170, 2106], ad: [45, 81, 146], attackSpeed: 0.6, armor: 25, magicResist: 25, range: 1, maxMana: 70, startMana: 0 },
  3: { hp: [750, 1350, 2430], ad: [50, 90, 162], attackSpeed: 0.65, armor: 30, magicResist: 30, range: 1, maxMana: 70, startMana: 10 },
  4: { hp: [900, 1620, 2916], ad: [65, 117, 210], attackSpeed: 0.65, armor: 40, magicResist: 40, range: 1, maxMana: 80, startMana: 20 },
  5: { hp: [1000, 1800, 3600], ad: [75, 135, 243], attackSpeed: 0.7, armor: 45, magicResist: 45, range: 1, maxMana: 100, startMana: 30 },
};

function move(name: string, type: PokeType, basePower: number, shape: Move["shape"] = "single"): Move {
  return { name, type, power: [basePower, Math.round(basePower * 1.7), Math.round(basePower * 2.9)], shape };
}

type DefInput = {
  id: string;
  name: string;
  cost: Cost;
  types: PokeType[];
  roles?: RoleTrait[];
  dex: [number, number, number];
  stageNames: [string, string, string];
  move: Move;
  /** Optional stat overrides (e.g. ranged units). */
  patch?: Partial<StatBlock>;
};

function def(d: DefInput): UnitDef {
  return {
    ...d,
    roles: d.roles ?? [],
    stats: { ...STAT_BY_COST[d.cost], ...d.patch },
  };
}

export const UNITS: UnitDef[] = [
  // ───────────── 1-cost ─────────────
  def({ id: "charmander", name: "Charmander", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [4, 5, 6], stageNames: ["Charmander", "Charmeleon", "Charizard"], move: move("Ember", "fire", 180, "splash") }),
  def({ id: "bulbasaur", name: "Bulbasaur", cost: 1, types: ["grass", "poison"], roles: ["starter", "evolver"],
    dex: [1, 2, 3], stageNames: ["Bulbasaur", "Ivysaur", "Venusaur"], move: move("Vine Whip", "grass", 170) }),
  def({ id: "squirtle", name: "Squirtle", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [7, 8, 9], stageNames: ["Squirtle", "Wartortle", "Blastoise"], move: move("Water Gun", "water", 175, "line"),
    patch: { range: 3, hp: [520, 936, 1685] } }),
  def({ id: "caterpie", name: "Caterpie", cost: 1, types: ["bug"], roles: ["swarm", "evolver"],
    dex: [10, 11, 12], stageNames: ["Caterpie", "Metapod", "Butterfree"], move: move("Gust", "flying", 160) }),
  def({ id: "weedle", name: "Weedle", cost: 1, types: ["bug", "poison"], roles: ["swarm", "evolver"],
    dex: [13, 14, 15], stageNames: ["Weedle", "Kakuna", "Beedrill"], move: move("Poison Sting", "poison", 150) }),
  def({ id: "pidgey", name: "Pidgey", cost: 1, types: ["normal", "flying"], roles: ["evolver"],
    dex: [16, 17, 18], stageNames: ["Pidgey", "Pidgeotto", "Pidgeot"], move: move("Quick Attack", "normal", 165),
    patch: { range: 2 } }),
  def({ id: "poliwag", name: "Poliwag", cost: 1, types: ["water"], roles: ["evolver"],
    dex: [60, 61, 62], stageNames: ["Poliwag", "Poliwhirl", "Poliwrath"], move: move("Bubble", "water", 160) }),
  def({ id: "rattata", name: "Rattata", cost: 1, types: ["normal"], roles: ["swarm", "evolver"],
    dex: [19, 20, 20], stageNames: ["Rattata", "Raticate", "Raticate"], move: move("Hyper Fang", "normal", 160),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "jigglypuff", name: "Jigglypuff", cost: 1, types: ["normal", "fairy"], roles: ["evolver"],
    dex: [39, 40, 40], stageNames: ["Jigglypuff", "Wigglytuff", "Wigglytuff"], move: move("Dazzling Gleam", "fairy", 150, "splash"),
    patch: { range: 2, hp: [580, 1044, 1879] } }),
  def({ id: "zubat", name: "Zubat", cost: 1, types: ["poison", "flying"], roles: ["swarm", "evolver"],
    dex: [41, 42, 42], stageNames: ["Zubat", "Golbat", "Golbat"], move: move("Wing Attack", "flying", 155),
    patch: { range: 2 } }),

  // ───────────── 2-cost ─────────────
  def({ id: "geodude", name: "Geodude", cost: 2, types: ["rock", "ground"], roles: ["evolver"],
    dex: [74, 75, 76], stageNames: ["Geodude", "Graveler", "Golem"], move: move("Rock Throw", "rock", 200) }),
  def({ id: "machop", name: "Machop", cost: 2, types: ["fighting"], roles: ["evolver"],
    dex: [66, 67, 68], stageNames: ["Machop", "Machoke", "Machamp"], move: move("Karate Chop", "fighting", 210) }),
  def({ id: "abra", name: "Abra", cost: 2, types: ["psychic"], roles: ["evolver"],
    dex: [63, 64, 65], stageNames: ["Abra", "Kadabra", "Alakazam"], move: move("Confusion", "psychic", 230, "splash"),
    patch: { range: 4, hp: [560, 1008, 1814] } }),
  def({ id: "oddish", name: "Oddish", cost: 2, types: ["grass", "poison"], roles: ["evolver"],
    dex: [43, 44, 45], stageNames: ["Oddish", "Gloom", "Vileplume"], move: move("Acid", "poison", 195, "splash") }),
  def({ id: "gastly", name: "Gastly", cost: 2, types: ["ghost", "poison"], roles: ["evolver"],
    dex: [92, 93, 94], stageNames: ["Gastly", "Haunter", "Gengar"], move: move("Lick", "ghost", 205),
    patch: { range: 3 } }),
  def({ id: "growlithe", name: "Growlithe", cost: 2, types: ["fire"],
    dex: [58, 59, 59], stageNames: ["Growlithe", "Arcanine", "Arcanine"], move: move("Flame Wheel", "fire", 200) }),
  def({ id: "ponyta", name: "Ponyta", cost: 2, types: ["fire"], roles: ["evolver"],
    dex: [77, 78, 78], stageNames: ["Ponyta", "Rapidash", "Rapidash"], move: move("Stomp", "fire", 195) }),
  def({ id: "magnemite", name: "Magnemite", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [81, 82, 82], stageNames: ["Magnemite", "Magneton", "Magneton"], move: move("ThunderShock", "electric", 190, "splash"),
    patch: { range: 3, hp: [580, 1044, 1879] } }),
  def({ id: "psyduck", name: "Psyduck", cost: 2, types: ["water", "psychic"], roles: ["evolver"],
    dex: [54, 55, 55], stageNames: ["Psyduck", "Golduck", "Golduck"], move: move("Confusion", "psychic", 200, "splash"),
    patch: { range: 3 } }),
  def({ id: "koffing", name: "Koffing", cost: 2, types: ["poison"], roles: ["evolver"],
    dex: [109, 110, 110], stageNames: ["Koffing", "Weezing", "Weezing"], move: move("Smog", "poison", 190, "splash"),
    patch: { hp: [720, 1296, 2333], armor: 30 } }),
  def({ id: "paras", name: "Paras", cost: 2, types: ["bug", "grass"], roles: ["evolver"],
    dex: [46, 47, 47], stageNames: ["Paras", "Parasect", "Parasect"], move: move("Spore", "grass", 185, "splash"),
    patch: { attackSpeed: 0.5 } }),
  def({ id: "drowzee", name: "Drowzee", cost: 2, types: ["psychic"], roles: ["evolver"],
    dex: [96, 97, 97], stageNames: ["Drowzee", "Hypno", "Hypno"], move: move("Psybeam", "psychic", 205, "splash"),
    patch: { range: 3 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "magikarp", name: "Magikarp", cost: 3, types: ["water", "flying"], roles: ["evolver"],
    dex: [129, 130, 130], stageNames: ["Magikarp", "Gyarados", "Gyarados"], move: move("Hydro Pump", "water", 320, "line"),
    patch: { hp: [700, 1500, 2700] } }),
  def({ id: "eevee", name: "Eevee", cost: 3, types: ["normal"], roles: ["eeveelution", "evolver"],
    dex: [133, 135, 136], stageNames: ["Eevee", "Jolteon", "Flareon"], move: move("Swift", "normal", 240, "splash") }),
  def({ id: "scyther", name: "Scyther", cost: 3, types: ["bug", "flying"], roles: ["swarm"],
    dex: [123, 123, 123], stageNames: ["Scyther", "Scyther", "Scyther"], move: move("Slash", "bug", 250) }),
  def({ id: "cubone", name: "Cubone", cost: 3, types: ["ground"], roles: ["evolver"],
    dex: [104, 105, 105], stageNames: ["Cubone", "Marowak", "Marowak"], move: move("Bonemerang", "ground", 245, "line") }),
  def({ id: "onix", name: "Onix", cost: 3, types: ["rock", "ground"],
    dex: [95, 95, 95], stageNames: ["Onix", "Onix", "Onix"], move: move("Rock Slide", "rock", 230, "splash"),
    patch: { hp: [900, 1620, 2916], armor: 50 } }),
  def({ id: "electabuzz", name: "Electabuzz", cost: 3, types: ["electric"],
    dex: [125, 125, 125], stageNames: ["Electabuzz", "Electabuzz", "Electabuzz"], move: move("Thunderpunch", "electric", 260),
    patch: { attackSpeed: 0.8, range: 2 } }),
  def({ id: "jynx", name: "Jynx", cost: 3, types: ["ice", "psychic"],
    dex: [124, 124, 124], stageNames: ["Jynx", "Jynx", "Jynx"], move: move("Ice Beam", "ice", 255, "line"),
    patch: { range: 3, hp: [680, 1224, 2203] } }),
  def({ id: "rhyhorn", name: "Rhyhorn", cost: 3, types: ["rock", "ground"], roles: ["evolver"],
    dex: [111, 112, 112], stageNames: ["Rhyhorn", "Rhydon", "Rhydon"], move: move("Horn Attack", "normal", 240, "line"),
    patch: { hp: [950, 1710, 3078], armor: 50, attackSpeed: 0.5 } }),
  def({ id: "hitmonlee", name: "Hitmonlee", cost: 3, types: ["fighting"],
    dex: [106, 106, 106], stageNames: ["Hitmonlee", "Hitmonlee", "Hitmonlee"], move: move("High Jump Kick", "fighting", 270),
    patch: { ad: [60, 108, 194], attackSpeed: 0.75 } }),

  // ───────────── 4-cost ─────────────
  def({ id: "dratini", name: "Dratini", cost: 4, types: ["dragon"], roles: ["pseudo-legendary", "evolver"],
    dex: [147, 148, 149], stageNames: ["Dratini", "Dragonair", "Dragonite"], move: move("Dragon Rush", "dragon", 380, "splash") }),
  def({ id: "lapras", name: "Lapras", cost: 4, types: ["water", "ice"],
    dex: [131, 131, 131], stageNames: ["Lapras", "Lapras", "Lapras"], move: move("Ice Beam", "ice", 360, "line"),
    patch: { range: 3, hp: [950, 1710, 3078] } }),
  def({ id: "snorlax", name: "Snorlax", cost: 4, types: ["normal"],
    dex: [143, 143, 143], stageNames: ["Snorlax", "Snorlax", "Snorlax"], move: move("Body Slam", "normal", 340, "splash"),
    patch: { hp: [1200, 2160, 3888], armor: 55, magicResist: 55 } }),
  def({ id: "aerodactyl", name: "Aerodactyl", cost: 4, types: ["rock", "flying"], roles: ["fossil"],
    dex: [142, 142, 142], stageNames: ["Aerodactyl", "Aerodactyl", "Aerodactyl"], move: move("Sky Attack", "flying", 370),
    patch: { range: 2, attackSpeed: 0.75 } }),
  def({ id: "omanyte", name: "Omanyte", cost: 4, types: ["rock", "water"], roles: ["fossil", "evolver"],
    dex: [138, 139, 139], stageNames: ["Omanyte", "Omastar", "Omastar"], move: move("Water Pulse", "water", 355, "splash"),
    patch: { range: 3, hp: [850, 1530, 2754] } }),
  def({ id: "porygon", name: "Porygon", cost: 4, types: ["normal"],
    dex: [137, 137, 137], stageNames: ["Porygon", "Porygon", "Porygon"], move: move("Tri Attack", "normal", 345, "splash"),
    patch: { range: 4, hp: [820, 1476, 2657] } }),

  // ───────────── 5-cost (legendaries) ─────────────
  def({ id: "articuno", name: "Articuno", cost: 5, types: ["ice", "flying"], roles: ["legendary"],
    dex: [144, 144, 144], stageNames: ["Articuno", "Articuno", "Articuno"], move: move("Blizzard", "ice", 450, "splash"),
    patch: { range: 4 } }),
  def({ id: "zapdos", name: "Zapdos", cost: 5, types: ["electric", "flying"], roles: ["legendary"],
    dex: [145, 145, 145], stageNames: ["Zapdos", "Zapdos", "Zapdos"], move: move("Thunder", "electric", 460, "line"),
    patch: { range: 4 } }),
  def({ id: "moltres", name: "Moltres", cost: 5, types: ["fire", "flying"], roles: ["legendary"],
    dex: [146, 146, 146], stageNames: ["Moltres", "Moltres", "Moltres"], move: move("Fire Blast", "fire", 470, "splash"),
    patch: { range: 4 } }),
  def({ id: "mewtwo", name: "Mewtwo", cost: 5, types: ["psychic"], roles: ["legendary", "kanto-mythic"],
    dex: [150, 150, 150], stageNames: ["Mewtwo", "Mewtwo", "Mewtwo"], move: move("Psystrike", "psychic", 520, "splash"),
    patch: { range: 4, hp: [1100, 1980, 3960] } }),
  def({ id: "mew", name: "Mew", cost: 5, types: ["psychic"], roles: ["kanto-mythic"],
    dex: [151, 151, 151], stageNames: ["Mew", "Mew", "Mew"], move: move("Aura Sphere", "fairy", 480, "splash"),
    patch: { range: 3 } }),
];

export const UNITS_BY_ID: Record<string, UnitDef> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
);

export function getDef(id: string): UnitDef {
  const d = UNITS_BY_ID[id];
  if (!d) throw new Error(`Unknown unit def: ${id}`);
  return d;
}

/** Returns unit IDs whose base-form dex number falls within the given generations. */
export function unitsForGenerations(gens: number[]): string[] {
  const ranges = gens.map((g) => GEN_DEX_RANGES[g]).filter(Boolean) as [number, number][];
  return UNITS
    .filter((u) => ranges.some(([s, e]) => u.dex[0] >= s && u.dex[0] <= e))
    .map((u) => u.id);
}
