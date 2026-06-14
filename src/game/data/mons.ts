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

  // ═══════════════════════════════════════════════════════════════
  // GEN II — JOHTO (dex 152–251)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "chikorita", name: "Chikorita", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [152, 153, 154], stageNames: ["Chikorita", "Bayleef", "Meganium"], move: move("Razor Leaf", "grass", 170, "splash") }),
  def({ id: "cyndaquil", name: "Cyndaquil", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [155, 156, 157], stageNames: ["Cyndaquil", "Quilava", "Typhlosion"], move: move("Ember", "fire", 170) }),
  def({ id: "totodile", name: "Totodile", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [158, 159, 160], stageNames: ["Totodile", "Croconaw", "Feraligatr"], move: move("Water Gun", "water", 172) }),

  // ───────────── 2-cost ─────────────
  def({ id: "mareep", name: "Mareep", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [179, 180, 181], stageNames: ["Mareep", "Flaaffy", "Ampharos"], move: move("ThunderShock", "electric", 195, "splash"),
    patch: { range: 3, hp: [580, 1044, 1879] } }),
  def({ id: "snubbull", name: "Snubbull", cost: 2, types: ["fairy"], roles: ["evolver"],
    dex: [209, 210, 210], stageNames: ["Snubbull", "Granbull", "Granbull"], move: move("Play Rough", "fairy", 200) }),
  def({ id: "murkrow", name: "Murkrow", cost: 2, types: ["dark", "flying"],
    dex: [198, 198, 198], stageNames: ["Murkrow", "Murkrow", "Murkrow"], move: move("Feint Attack", "dark", 195),
    patch: { range: 2 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "heracross", name: "Heracross", cost: 3, types: ["bug", "fighting"],
    dex: [214, 214, 214], stageNames: ["Heracross", "Heracross", "Heracross"], move: move("Megahorn", "bug", 265) }),
  def({ id: "houndour", name: "Houndour", cost: 3, types: ["dark", "fire"], roles: ["evolver"],
    dex: [228, 229, 229], stageNames: ["Houndour", "Houndoom", "Houndoom"], move: move("Flamethrower", "fire", 255),
    patch: { range: 3 } }),
  def({ id: "misdreavus", name: "Misdreavus", cost: 3, types: ["ghost"],
    dex: [200, 200, 200], stageNames: ["Misdreavus", "Misdreavus", "Misdreavus"], move: move("Shadow Ball", "ghost", 255, "splash"),
    patch: { range: 3 } }),

  // ───────────── 4-cost ─────────────
  def({ id: "tyranitar", name: "Tyranitar", cost: 4, types: ["rock", "dark"], roles: ["pseudo-legendary", "evolver"],
    dex: [246, 247, 248], stageNames: ["Larvitar", "Pupitar", "Tyranitar"], move: move("Rock Slide", "rock", 375, "splash"),
    patch: { hp: [1100, 1980, 3564], armor: 50 } }),
  def({ id: "steelix", name: "Steelix", cost: 4, types: ["steel", "ground"], roles: ["evolver"],
    dex: [208, 208, 208], stageNames: ["Steelix", "Steelix", "Steelix"], move: move("Iron Tail", "steel", 360),
    patch: { hp: [1000, 1800, 3240], armor: 65, attackSpeed: 0.5 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "lugia", name: "Lugia", cost: 5, types: ["psychic", "flying"], roles: ["legendary"],
    dex: [249, 249, 249], stageNames: ["Lugia", "Lugia", "Lugia"], move: move("Aeroblast", "flying", 465, "line"),
    patch: { range: 4 } }),
  def({ id: "ho-oh", name: "Ho-Oh", cost: 5, types: ["fire", "flying"], roles: ["legendary"],
    dex: [250, 250, 250], stageNames: ["Ho-Oh", "Ho-Oh", "Ho-Oh"], move: move("Sacred Fire", "fire", 480, "splash"),
    patch: { range: 3 } }),
  def({ id: "celebi", name: "Celebi", cost: 5, types: ["psychic", "grass"], roles: ["mythic"],
    dex: [251, 251, 251], stageNames: ["Celebi", "Celebi", "Celebi"], move: move("Magical Leaf", "grass", 430, "splash"),
    patch: { range: 3 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN III — HOENN (dex 252–386)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "treecko", name: "Treecko", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [252, 253, 254], stageNames: ["Treecko", "Grovyle", "Sceptile"], move: move("Bullet Seed", "grass", 162, "line") }),
  def({ id: "torchic", name: "Torchic", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [255, 256, 257], stageNames: ["Torchic", "Combusken", "Blaziken"], move: move("Ember", "fire", 165) }),
  def({ id: "mudkip", name: "Mudkip", cost: 1, types: ["water", "ground"], roles: ["starter", "evolver"],
    dex: [258, 259, 260], stageNames: ["Mudkip", "Marshtomp", "Swampert"], move: move("Water Gun", "water", 165) }),

  // ───────────── 2-cost ─────────────
  def({ id: "ralts", name: "Ralts", cost: 2, types: ["psychic", "fairy"], roles: ["evolver"],
    dex: [280, 281, 282], stageNames: ["Ralts", "Kirlia", "Gardevoir"], move: move("Psybeam", "psychic", 200, "splash"),
    patch: { range: 3, hp: [570, 1026, 1847] } }),
  def({ id: "electrike", name: "Electrike", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [309, 310, 310], stageNames: ["Electrike", "Manectric", "Manectric"], move: move("Shock Wave", "electric", 198, "splash"),
    patch: { range: 3, attackSpeed: 0.7 } }),
  def({ id: "aron", name: "Aron", cost: 2, types: ["steel", "rock"], roles: ["evolver"],
    dex: [304, 305, 306], stageNames: ["Aron", "Lairon", "Aggron"], move: move("Metal Claw", "steel", 200),
    patch: { armor: 30 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "flygon", name: "Flygon", cost: 3, types: ["dragon", "ground"], roles: ["evolver"],
    dex: [328, 329, 330], stageNames: ["Trapinch", "Vibrava", "Flygon"], move: move("Dragon Claw", "dragon", 260),
    patch: { range: 2 } }),
  def({ id: "absol", name: "Absol", cost: 3, types: ["dark"],
    dex: [359, 359, 359], stageNames: ["Absol", "Absol", "Absol"], move: move("Night Slash", "dark", 265),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "mawile", name: "Mawile", cost: 3, types: ["steel", "fairy"],
    dex: [303, 303, 303], stageNames: ["Mawile", "Mawile", "Mawile"], move: move("Iron Head", "steel", 245),
    patch: { armor: 45 } }),

  // ───────────── 4-cost ─────────────
  def({ id: "metagross", name: "Metagross", cost: 4, types: ["steel", "psychic"], roles: ["pseudo-legendary", "evolver"],
    dex: [375, 376, 376], stageNames: ["Metang", "Metagross", "Metagross"], move: move("Meteor Mash", "steel", 375),
    patch: { hp: [950, 1710, 3078], armor: 50 } }),
  def({ id: "salamence", name: "Salamence", cost: 4, types: ["dragon", "flying"], roles: ["pseudo-legendary", "evolver"],
    dex: [371, 372, 373], stageNames: ["Bagon", "Shelgon", "Salamence"], move: move("Dragon Rush", "dragon", 385),
    patch: { range: 2, attackSpeed: 0.7 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "kyogre", name: "Kyogre", cost: 5, types: ["water"], roles: ["legendary"],
    dex: [382, 382, 382], stageNames: ["Kyogre", "Kyogre", "Kyogre"], move: move("Origin Pulse", "water", 475, "splash"),
    patch: { range: 4 } }),
  def({ id: "groudon", name: "Groudon", cost: 5, types: ["ground"], roles: ["legendary"],
    dex: [383, 383, 383], stageNames: ["Groudon", "Groudon", "Groudon"], move: move("Precipice Blades", "ground", 465, "splash"),
    patch: { hp: [1200, 2160, 3888], armor: 50 } }),
  def({ id: "rayquaza", name: "Rayquaza", cost: 5, types: ["dragon", "flying"], roles: ["legendary"],
    dex: [384, 384, 384], stageNames: ["Rayquaza", "Rayquaza", "Rayquaza"], move: move("Dragon Ascent", "flying", 500, "line"),
    patch: { range: 4 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN IV — SINNOH (dex 387–493)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "turtwig", name: "Turtwig", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [387, 388, 389], stageNames: ["Turtwig", "Grotle", "Torterra"], move: move("Razor Leaf", "grass", 165, "splash") }),
  def({ id: "chimchar", name: "Chimchar", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [390, 391, 392], stageNames: ["Chimchar", "Monferno", "Infernape"], move: move("Ember", "fire", 165) }),
  def({ id: "piplup", name: "Piplup", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [393, 394, 395], stageNames: ["Piplup", "Prinplup", "Empoleon"], move: move("Bubble Beam", "water", 170) }),

  // ───────────── 2-cost ─────────────
  def({ id: "shinx", name: "Shinx", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [403, 404, 405], stageNames: ["Shinx", "Luxio", "Luxray"], move: move("Thunder Fang", "electric", 198) }),
  def({ id: "riolu", name: "Riolu", cost: 2, types: ["fighting", "steel"], roles: ["evolver"],
    dex: [447, 448, 448], stageNames: ["Riolu", "Lucario", "Lucario"], move: move("Force Palm", "fighting", 200) }),
  def({ id: "buizel", name: "Buizel", cost: 2, types: ["water"], roles: ["evolver"],
    dex: [418, 419, 419], stageNames: ["Buizel", "Floatzel", "Floatzel"], move: move("Aqua Jet", "water", 192) }),

  // ───────────── 3-cost ─────────────
  def({ id: "garchomp", name: "Garchomp", cost: 3, types: ["dragon", "ground"], roles: ["pseudo-legendary", "evolver"],
    dex: [443, 444, 445], stageNames: ["Gible", "Gabite", "Garchomp"], move: move("Dragon Claw", "dragon", 268) }),
  def({ id: "electivire", name: "Electivire", cost: 3, types: ["electric"],
    dex: [466, 466, 466], stageNames: ["Electivire", "Electivire", "Electivire"], move: move("Thunderpunch", "electric", 262),
    patch: { range: 2, attackSpeed: 0.8 } }),
  def({ id: "togekiss", name: "Togekiss", cost: 3, types: ["fairy", "flying"],
    dex: [468, 468, 468], stageNames: ["Togekiss", "Togekiss", "Togekiss"], move: move("Air Slash", "flying", 258, "splash"),
    patch: { range: 3 } }),

  // ───────────── 4-cost ─────────────
  def({ id: "weavile", name: "Weavile", cost: 4, types: ["dark", "ice"],
    dex: [461, 461, 461], stageNames: ["Weavile", "Weavile", "Weavile"], move: move("Night Slash", "dark", 365),
    patch: { attackSpeed: 0.85 } }),
  def({ id: "roserade", name: "Roserade", cost: 4, types: ["grass", "poison"],
    dex: [407, 407, 407], stageNames: ["Roserade", "Roserade", "Roserade"], move: move("Petal Dance", "grass", 360, "splash"),
    patch: { range: 3 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "dialga", name: "Dialga", cost: 5, types: ["steel", "dragon"], roles: ["legendary"],
    dex: [483, 483, 483], stageNames: ["Dialga", "Dialga", "Dialga"], move: move("Roar of Time", "dragon", 490, "line"),
    patch: { range: 4 } }),
  def({ id: "palkia", name: "Palkia", cost: 5, types: ["water", "dragon"], roles: ["legendary"],
    dex: [484, 484, 484], stageNames: ["Palkia", "Palkia", "Palkia"], move: move("Spacial Rend", "dragon", 485, "splash"),
    patch: { range: 3 } }),
  def({ id: "giratina", name: "Giratina", cost: 5, types: ["ghost", "dragon"], roles: ["legendary"],
    dex: [487, 487, 487], stageNames: ["Giratina", "Giratina", "Giratina"], move: move("Shadow Force", "ghost", 480),
    patch: { range: 3, hp: [1150, 2070, 4140] } }),
  def({ id: "arceus", name: "Arceus", cost: 5, types: ["normal"], roles: ["mythic"],
    dex: [493, 493, 493], stageNames: ["Arceus", "Arceus", "Arceus"], move: move("Judgment", "normal", 520, "splash"),
    patch: { range: 4 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN V — UNOVA (dex 494–649)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "snivy", name: "Snivy", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [495, 496, 497], stageNames: ["Snivy", "Servine", "Serperior"], move: move("Vine Whip", "grass", 165) }),
  def({ id: "tepig", name: "Tepig", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [498, 499, 500], stageNames: ["Tepig", "Pignite", "Emboar"], move: move("Ember", "fire", 165) }),
  def({ id: "oshawott", name: "Oshawott", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [501, 502, 503], stageNames: ["Oshawott", "Dewott", "Samurott"], move: move("Water Gun", "water", 165) }),

  // ───────────── 2-cost ─────────────
  def({ id: "sandile", name: "Sandile", cost: 2, types: ["ground", "dark"], roles: ["evolver"],
    dex: [551, 552, 553], stageNames: ["Sandile", "Krokorok", "Krookodile"], move: move("Bite", "dark", 198) }),
  def({ id: "joltik", name: "Joltik", cost: 2, types: ["bug", "electric"], roles: ["swarm", "evolver"],
    dex: [595, 596, 596], stageNames: ["Joltik", "Galvantula", "Galvantula"], move: move("Electroweb", "electric", 198, "splash"),
    patch: { range: 3 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "chandelure", name: "Chandelure", cost: 3, types: ["ghost", "fire"], roles: ["evolver"],
    dex: [607, 608, 609], stageNames: ["Litwick", "Lampent", "Chandelure"], move: move("Shadow Ball", "ghost", 268, "splash"),
    patch: { range: 3 } }),
  def({ id: "haxorus", name: "Haxorus", cost: 3, types: ["dragon"], roles: ["pseudo-legendary", "evolver"],
    dex: [610, 611, 612], stageNames: ["Axew", "Fraxure", "Haxorus"], move: move("Dragon Claw", "dragon", 262) }),
  def({ id: "excadrill", name: "Excadrill", cost: 3, types: ["steel", "ground"], roles: ["evolver"],
    dex: [529, 530, 530], stageNames: ["Drilbur", "Excadrill", "Excadrill"], move: move("Drill Run", "ground", 255),
    patch: { armor: 35 } }),

  // ───────────── 4-cost ─────────────
  def({ id: "hydreigon", name: "Hydreigon", cost: 4, types: ["dark", "dragon"], roles: ["pseudo-legendary", "evolver"],
    dex: [633, 634, 635], stageNames: ["Deino", "Zweilous", "Hydreigon"], move: move("Dark Pulse", "dark", 380, "splash"),
    patch: { range: 3 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "reshiram", name: "Reshiram", cost: 5, types: ["dragon", "fire"], roles: ["legendary"],
    dex: [643, 643, 643], stageNames: ["Reshiram", "Reshiram", "Reshiram"], move: move("Blue Flare", "fire", 490, "splash"),
    patch: { range: 3 } }),
  def({ id: "zekrom", name: "Zekrom", cost: 5, types: ["dragon", "electric"], roles: ["legendary"],
    dex: [644, 644, 644], stageNames: ["Zekrom", "Zekrom", "Zekrom"], move: move("Bolt Strike", "electric", 485),
    patch: { range: 3 } }),
  def({ id: "kyurem", name: "Kyurem", cost: 5, types: ["dragon", "ice"], roles: ["legendary"],
    dex: [646, 646, 646], stageNames: ["Kyurem", "Kyurem", "Kyurem"], move: move("Glaciate", "ice", 475, "splash"),
    patch: { range: 4 } }),
  def({ id: "victini", name: "Victini", cost: 5, types: ["psychic", "fire"], roles: ["mythic"],
    dex: [494, 494, 494], stageNames: ["Victini", "Victini", "Victini"], move: move("V-Create", "fire", 510, "splash"),
    patch: { range: 3 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN VI — KALOS (dex 650–721)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "chespin", name: "Chespin", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [650, 651, 652], stageNames: ["Chespin", "Quilladin", "Chesnaught"], move: move("Vine Whip", "grass", 162) }),
  def({ id: "fennekin", name: "Fennekin", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [653, 654, 655], stageNames: ["Fennekin", "Braixen", "Delphox"], move: move("Ember", "fire", 162) }),
  def({ id: "froakie", name: "Froakie", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [656, 657, 658], stageNames: ["Froakie", "Frogadier", "Greninja"], move: move("Bubble", "water", 160) }),

  // ───────────── 2-cost ─────────────
  def({ id: "fletchling", name: "Fletchling", cost: 2, types: ["normal", "flying"], roles: ["swarm", "evolver"],
    dex: [661, 662, 663], stageNames: ["Fletchling", "Fletchinder", "Talonflame"], move: move("Quick Attack", "normal", 188),
    patch: { range: 2, attackSpeed: 0.75 } }),
  def({ id: "litleo", name: "Litleo", cost: 2, types: ["fire", "normal"], roles: ["evolver"],
    dex: [667, 668, 668], stageNames: ["Litleo", "Pyroar", "Pyroar"], move: move("Flamethrower", "fire", 200),
    patch: { range: 3 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "goomy", name: "Goomy", cost: 3, types: ["dragon"], roles: ["pseudo-legendary", "evolver"],
    dex: [704, 705, 706], stageNames: ["Goomy", "Sliggoo", "Goodra"], move: move("Dragon Breath", "dragon", 250),
    patch: { range: 2 } }),
  def({ id: "pancham", name: "Pancham", cost: 3, types: ["fighting", "dark"], roles: ["evolver"],
    dex: [674, 675, 675], stageNames: ["Pancham", "Pangoro", "Pangoro"], move: move("Storm Throw", "fighting", 255) }),

  // ───────────── 4-cost ─────────────
  def({ id: "aegislash", name: "Aegislash", cost: 4, types: ["steel", "ghost"], roles: ["evolver"],
    dex: [679, 680, 681], stageNames: ["Honedge", "Doublade", "Aegislash"], move: move("Sacred Sword", "fighting", 360),
    patch: { armor: 60, attackSpeed: 0.5 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "xerneas", name: "Xerneas", cost: 5, types: ["fairy"], roles: ["legendary"],
    dex: [716, 716, 716], stageNames: ["Xerneas", "Xerneas", "Xerneas"], move: move("Geomancy", "fairy", 480, "splash"),
    patch: { range: 4 } }),
  def({ id: "yveltal", name: "Yveltal", cost: 5, types: ["dark", "flying"], roles: ["legendary"],
    dex: [717, 717, 717], stageNames: ["Yveltal", "Yveltal", "Yveltal"], move: move("Oblivion Wing", "dark", 490, "line"),
    patch: { range: 4 } }),
  def({ id: "zygarde", name: "Zygarde", cost: 5, types: ["dragon", "ground"], roles: ["legendary"],
    dex: [718, 718, 718], stageNames: ["Zygarde", "Zygarde", "Zygarde"], move: move("Core Enforcer", "dragon", 465, "splash"),
    patch: { hp: [1200, 2160, 3888], armor: 45 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN VII — ALOLA (dex 722–809)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "rowlet", name: "Rowlet", cost: 1, types: ["grass", "flying"], roles: ["starter", "evolver"],
    dex: [722, 723, 724], stageNames: ["Rowlet", "Dartrix", "Decidueye"], move: move("Leafage", "grass", 162),
    patch: { range: 2 } }),
  def({ id: "litten", name: "Litten", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [725, 726, 727], stageNames: ["Litten", "Torracat", "Incineroar"], move: move("Ember", "fire", 162) }),
  def({ id: "popplio", name: "Popplio", cost: 1, types: ["water", "fairy"], roles: ["starter", "evolver"],
    dex: [728, 729, 730], stageNames: ["Popplio", "Brionne", "Primarina"], move: move("Bubble", "water", 160) }),

  // ───────────── 2-cost ─────────────
  def({ id: "rockruff", name: "Rockruff", cost: 2, types: ["rock"], roles: ["evolver"],
    dex: [744, 745, 745], stageNames: ["Rockruff", "Lycanroc", "Lycanroc"], move: move("Rock Throw", "rock", 200),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "wishiwashi", name: "Wishiwashi", cost: 2, types: ["water"],
    dex: [746, 746, 746], stageNames: ["Wishiwashi", "Wishiwashi", "Wishiwashi"], move: move("Aqua Tail", "water", 215),
    patch: { hp: [720, 1296, 2333], armor: 25 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "jangmo-o", name: "Jangmo-o", cost: 3, types: ["dragon", "fighting"], roles: ["pseudo-legendary", "evolver"],
    dex: [782, 783, 784], stageNames: ["Jangmo-o", "Hakamo-o", "Kommo-o"], move: move("Dragon Claw", "dragon", 258) }),
  def({ id: "mimikyu", name: "Mimikyu", cost: 3, types: ["ghost", "fairy"],
    dex: [778, 778, 778], stageNames: ["Mimikyu", "Mimikyu", "Mimikyu"], move: move("Shadow Claw", "ghost", 258) }),

  // ───────────── 4-cost ─────────────
  def({ id: "silvally", name: "Silvally", cost: 4, types: ["normal"], roles: ["pseudo-legendary"],
    dex: [773, 773, 773], stageNames: ["Silvally", "Silvally", "Silvally"], move: move("Multi-Attack", "normal", 370, "splash") }),

  // ───────────── 5-cost ─────────────
  def({ id: "solgaleo", name: "Solgaleo", cost: 5, types: ["psychic", "steel"], roles: ["legendary"],
    dex: [791, 791, 791], stageNames: ["Solgaleo", "Solgaleo", "Solgaleo"], move: move("Sunsteel Strike", "steel", 475),
    patch: { range: 3 } }),
  def({ id: "lunala", name: "Lunala", cost: 5, types: ["psychic", "ghost"], roles: ["legendary"],
    dex: [792, 792, 792], stageNames: ["Lunala", "Lunala", "Lunala"], move: move("Moongeist Beam", "ghost", 480, "line"),
    patch: { range: 4 } }),
  def({ id: "necrozma", name: "Necrozma", cost: 5, types: ["psychic"], roles: ["legendary"],
    dex: [800, 800, 800], stageNames: ["Necrozma", "Necrozma", "Necrozma"], move: move("Prismatic Laser", "psychic", 490, "line"),
    patch: { range: 4 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN VIII — GALAR (dex 810–905)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "grookey", name: "Grookey", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [810, 811, 812], stageNames: ["Grookey", "Thwackey", "Rillaboom"], move: move("Branch Poke", "grass", 162) }),
  def({ id: "scorbunny", name: "Scorbunny", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [813, 814, 815], stageNames: ["Scorbunny", "Raboot", "Cinderace"], move: move("Ember", "fire", 162) }),
  def({ id: "sobble", name: "Sobble", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [816, 817, 818], stageNames: ["Sobble", "Drizzile", "Inteleon"], move: move("Water Gun", "water", 160) }),

  // ───────────── 2-cost ─────────────
  def({ id: "yamper", name: "Yamper", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [834, 835, 835], stageNames: ["Yamper", "Boltund", "Boltund"], move: move("Thunder Fang", "electric", 196) }),
  def({ id: "snom", name: "Snom", cost: 2, types: ["ice", "bug"], roles: ["evolver"],
    dex: [872, 873, 873], stageNames: ["Snom", "Frosmoth", "Frosmoth"], move: move("Powder Snow", "ice", 194, "splash") }),

  // ───────────── 3-cost ─────────────
  def({ id: "rookidee", name: "Rookidee", cost: 3, types: ["flying", "steel"], roles: ["evolver"],
    dex: [821, 822, 823], stageNames: ["Rookidee", "Corvisquire", "Corviknight"], move: move("Steel Wing", "steel", 252),
    patch: { range: 2 } }),
  def({ id: "dreepy", name: "Dreepy", cost: 3, types: ["dragon", "ghost"], roles: ["pseudo-legendary", "evolver"],
    dex: [885, 886, 887], stageNames: ["Dreepy", "Drakloak", "Dragapult"], move: move("Dragon Darts", "dragon", 258),
    patch: { range: 3, attackSpeed: 0.75 } }),

  // ───────────── 5-cost ─────────────
  def({ id: "zacian", name: "Zacian", cost: 5, types: ["fairy", "steel"], roles: ["legendary"],
    dex: [888, 888, 888], stageNames: ["Zacian", "Zacian", "Zacian"], move: move("Behemoth Blade", "steel", 490),
    patch: { range: 2, attackSpeed: 0.75 } }),
  def({ id: "zamazenta", name: "Zamazenta", cost: 5, types: ["fighting", "steel"], roles: ["legendary"],
    dex: [889, 889, 889], stageNames: ["Zamazenta", "Zamazenta", "Zamazenta"], move: move("Behemoth Bash", "fighting", 480),
    patch: { hp: [1150, 2070, 4140], armor: 50 } }),
  def({ id: "eternatus", name: "Eternatus", cost: 5, types: ["poison", "dragon"], roles: ["legendary"],
    dex: [890, 890, 890], stageNames: ["Eternatus", "Eternatus", "Eternatus"], move: move("Eternabeam", "dragon", 505, "line"),
    patch: { range: 4 } }),

  // ═══════════════════════════════════════════════════════════════
  // GEN IX — PALDEA (dex 906–1025)
  // ═══════════════════════════════════════════════════════════════

  // ───────────── 1-cost ─────────────
  def({ id: "sprigatito", name: "Sprigatito", cost: 1, types: ["grass"], roles: ["starter", "evolver"],
    dex: [906, 907, 908], stageNames: ["Sprigatito", "Floragato", "Meowscarada"], move: move("Leafage", "grass", 160) }),
  def({ id: "fuecoco", name: "Fuecoco", cost: 1, types: ["fire"], roles: ["starter", "evolver"],
    dex: [909, 910, 911], stageNames: ["Fuecoco", "Crocalor", "Skeledirge"], move: move("Ember", "fire", 162) }),
  def({ id: "quaxly", name: "Quaxly", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [912, 913, 914], stageNames: ["Quaxly", "Quaxwell", "Quaquaval"], move: move("Bubble", "water", 160) }),

  // ───────────── 2-cost ─────────────
  def({ id: "pawmi", name: "Pawmi", cost: 2, types: ["electric"], roles: ["evolver"],
    dex: [921, 922, 923], stageNames: ["Pawmi", "Pawmo", "Pawmot"], move: move("Spark", "electric", 196) }),
  def({ id: "nacli", name: "Nacli", cost: 2, types: ["rock"], roles: ["evolver"],
    dex: [932, 933, 934], stageNames: ["Nacli", "Naclstack", "Garganacl"], move: move("Salt Cure", "rock", 204),
    patch: { armor: 30 } }),

  // ───────────── 3-cost ─────────────
  def({ id: "frigibax", name: "Frigibax", cost: 3, types: ["dragon", "ice"], roles: ["pseudo-legendary", "evolver"],
    dex: [996, 997, 998], stageNames: ["Frigibax", "Arctibax", "Baxcalibur"], move: move("Glaive Rush", "dragon", 262),
    patch: { attackSpeed: 0.55 } }),
  def({ id: "palafin", name: "Palafin", cost: 3, types: ["water", "fighting"],
    dex: [963, 963, 963], stageNames: ["Palafin", "Palafin", "Palafin"], move: move("Jet Punch", "water", 255) }),

  // ───────────── 5-cost ─────────────
  def({ id: "koraidon", name: "Koraidon", cost: 5, types: ["fighting", "dragon"], roles: ["legendary"],
    dex: [1007, 1007, 1007], stageNames: ["Koraidon", "Koraidon", "Koraidon"], move: move("Collision Course", "fighting", 490),
    patch: { range: 2, attackSpeed: 0.75 } }),
  def({ id: "miraidon", name: "Miraidon", cost: 5, types: ["electric", "dragon"], roles: ["legendary"],
    dex: [1008, 1008, 1008], stageNames: ["Miraidon", "Miraidon", "Miraidon"], move: move("Electro Drift", "electric", 490),
    patch: { range: 3 } }),
  def({ id: "terapagos", name: "Terapagos", cost: 5, types: ["normal"], roles: ["mythic"],
    dex: [1024, 1024, 1024], stageNames: ["Terapagos", "Terapagos", "Terapagos"], move: move("Tera Blast", "normal", 480, "splash"),
    patch: { range: 4 } }),
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
