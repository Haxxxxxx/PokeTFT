import type { UnitDef, StatBlock, Move, PokeType, RoleTrait } from "../types";
import type { Cost } from "../config";
import { GEN_DEX_RANGES } from "./generations";
import { GENERATED } from "./mons.generated";
import { TRAITS_BY_KEY } from "./traits";

/** Sprite URL from national dex id. Served from our OWN origin (public/sprites/, mirrored from
 *  PokéAPI) instead of raw.githubusercontent.com — same-origin, cached-forever, no third-party
 *  rate-limits or regional blocks (the old host was unreliable on weak/slow clients).
 *  Regenerate after adding mons: scripts/mirror-sprites.sh. */
export function spriteUrl(dex: number): string {
  return `/sprites/${dex}.png`;
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

// Well-known national-dex sets used to give GENERATED units their role traits (their
// raw data ships none, so role synergies were curated-only). Base-form dex is enough;
// a generated unit whose dex falls here gets the matching role. `evolver` is left to
// the curated lines on purpose (already ~124 carriers — auto-tagging would flood it).
const LEGENDARY_DEX = new Set<number>([
  144, 145, 146, 150,                                   // Gen1 (Mewtwo also kanto-mythic)
  243, 244, 245, 249, 250,                               // Gen2
  377, 378, 379, 380, 381, 382, 383, 384,                // Gen3
  480, 481, 482, 483, 484, 485, 486, 487, 488,           // Gen4
  638, 639, 640, 641, 642, 643, 644, 645, 646,           // Gen5
  716, 717, 718,                                         // Gen6
  785, 786, 787, 788, 791, 792, 800,                     // Gen7
  888, 889, 890, 894, 895, 896, 897, 898,                // Gen8
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, // Gen9
]);
const MYTHIC_DEX = new Set<number>([
  151, 251, 385, 386, 489, 490, 491, 492, 493, 494,
  647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809,
  893, 1025,
]);
const KANTO_MYTHIC_DEX = new Set<number>([150, 151]); // Mewtwo, Mew — the trait's namesakes
const PSEUDO_DEX = new Set<number>([
  147, 148, 149, 246, 247, 248, 371, 372, 373, 443, 444, 445,
  633, 634, 635, 704, 705, 706, 782, 783, 784, 885, 886, 887, 996, 997, 998,
]);
const FOSSIL_DEX = new Set<number>([
  138, 139, 140, 141, 142, 345, 346, 347, 348, 408, 409, 410, 411,
  564, 565, 566, 567, 696, 697, 698, 699, 880, 881, 882, 883,
]);
const EEVEE_DEX = new Set<number>([133, 134, 135, 136, 196, 197, 470, 471, 700]);

/** Role traits for a generated unit, inferred from its base-form national dex. */
function rolesForGeneratedDex(dex0: number): RoleTrait[] {
  const out: RoleTrait[] = [];
  if (KANTO_MYTHIC_DEX.has(dex0)) out.push("kanto-mythic");
  if (LEGENDARY_DEX.has(dex0)) out.push("legendary");
  if (MYTHIC_DEX.has(dex0)) out.push("mythic");
  if (PSEUDO_DEX.has(dex0)) out.push("pseudo-legendary");
  if (FOSSIL_DEX.has(dex0)) out.push("fossil");
  if (EEVEE_DEX.has(dex0)) out.push("eeveelution");
  return out;
}

// Types that read as durable frontliners vs glass-cannon special attackers — used to
// bias each generated species' build so a Steel mon ≠ a Psychic mon at the same cost.
const BULKY_TYPES = new Set<PokeType>(["rock", "steel", "ground", "ice"]);
const SQUISHY_TYPES = new Set<PokeType>(["psychic", "ghost", "fairy", "poison", "fire", "electric"]);

/** Deterministic per-species stat variance for the auto-generated units (whose raw
 *  data only carries types/range, so every same-cost generated mon was otherwise
 *  IDENTICAL). Seeded by the dex number so it's stable across clients, and biased by
 *  type: bulkier species trade ATK for HP/armor, squishier ones the reverse. Also
 *  rebalances the melee/ranged curve — flips a deterministic slice of melee special
 *  attackers to range 2 so low cost isn't ~73% melee. Returns a patch layered UNDER
 *  the raw patch (so an explicit generator range still wins where it set one). */
function generatedVariance(dex: number, cost: Cost, types: PokeType[], rawRange?: number): Partial<StatBlock> {
  const base = STAT_BY_COST[cost];
  const rng = seededRng((dex * 2654435761) >>> 0);
  // "bulk" axis in [0,1]: 0 = glass cannon, 1 = tank. Nudged by type identity.
  let bulk = rng();
  if (types.some((t) => BULKY_TYPES.has(t))) bulk = Math.min(1, bulk + 0.25);
  if (types.some((t) => SQUISHY_TYPES.has(t))) bulk = Math.max(0, bulk - 0.18);
  const hpMult = 0.7 + 0.62 * bulk;                                         // [0.70 .. 1.32]
  // AD is inverse to bulk BUT with an independent jitter, so two equally-bulky mons
  // still differ — widens the spread well past the old single-axis variance.
  const adMult = Math.max(0.68, Math.min(1.5, (1.34 - 0.5 * bulk) * (0.84 + 0.32 * rng())));
  const asMult = 0.84 + 0.34 * rng();                                       // [0.84 .. 1.18]
  const scale3 = (xs: number[], m: number) => xs.map((x) => Math.round(x * m)) as [number, number, number];

  const patch: Partial<StatBlock> = {
    hp: scale3(base.hp, hpMult),
    ad: scale3(base.ad, adMult),
    attackSpeed: Math.round(base.attackSpeed * asMult * 100) / 100,
    armor: Math.round(base.armor * (0.82 + 0.42 * bulk)),
    magicResist: Math.round(base.magicResist * (0.82 + 0.42 * bulk)),
  };
  // Melee/ranged rebalance: a glassy special-attacker that the generator left melee
  // becomes ranged ~45% of the time, lifting the lopsided low-cost melee share.
  if ((rawRange ?? 1) <= 1 && types.some((t) => SQUISHY_TYPES.has(t)) && bulk < 0.5 && rng() < 0.45) {
    patch.range = 2;
  }
  return patch;
}

type DefInput = {
  id: string;
  name: string;
  cost: Cost;
  types: PokeType[];
  /** Per-star typing override (see UnitDef.typesByStar). */
  typesByStar?: PokeType[][];
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
    typesByStar: [["fire"], ["fire"], ["fire", "flying"]], // Charizard gains Flying
    dex: [4, 5, 6], stageNames: ["Charmander", "Charmeleon", "Charizard"], move: move("Ember", "fire", 180, "splash") }),
  def({ id: "bulbasaur", name: "Bulbasaur", cost: 1, types: ["grass", "poison"], roles: ["starter", "evolver"],
    dex: [1, 2, 3], stageNames: ["Bulbasaur", "Ivysaur", "Venusaur"], move: move("Vine Whip", "grass", 170) }),
  def({ id: "squirtle", name: "Squirtle", cost: 1, types: ["water"], roles: ["starter", "evolver"],
    dex: [7, 8, 9], stageNames: ["Squirtle", "Wartortle", "Blastoise"], move: move("Water Gun", "water", 175, "line"),
    patch: { range: 3, hp: [520, 936, 1685] } }),
  def({ id: "caterpie", name: "Caterpie", cost: 1, types: ["bug"], roles: ["swarm", "evolver"],
    typesByStar: [["bug"], ["bug"], ["bug", "flying"]], // Butterfree gains Flying
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
    typesByStar: [["dragon"], ["dragon"], ["dragon", "flying"]], // Dragonite gains Flying
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

  // ══════════════════════════════════════════════════════════════
  // GEN II — JOHTO — additions (+10)
  // ══════════════════════════════════════════════════════════════
  def({ id: "togepi", name: "Togepi", cost: 1, types: ["normal", "fairy"], roles: ["evolver"],
    dex: [175, 176, 176], stageNames: ["Togepi", "Togetic", "Togetic"], move: move("Charm", "fairy", 148, "splash"),
    patch: { hp: [510, 918, 1652] } }),
  def({ id: "marill", name: "Marill", cost: 1, types: ["water", "fairy"], roles: ["evolver"],
    dex: [183, 184, 184], stageNames: ["Marill", "Azumarill", "Azumarill"], move: move("Bubble Beam", "water", 162),
    patch: { hp: [600, 1080, 1944] } }),
  def({ id: "hoppip", name: "Hoppip", cost: 2, types: ["grass", "flying"], roles: ["swarm", "evolver"],
    dex: [187, 188, 189], stageNames: ["Hoppip", "Skiploom", "Jumpluff"], move: move("Gust", "flying", 186),
    patch: { range: 2 } }),
  def({ id: "wooper", name: "Wooper", cost: 2, types: ["water", "ground"], roles: ["evolver"],
    dex: [194, 195, 195], stageNames: ["Wooper", "Quagsire", "Quagsire"], move: move("Muddy Water", "water", 200, "splash"),
    patch: { hp: [720, 1296, 2333], armor: 30 } }),
  def({ id: "espeon", name: "Espeon", cost: 3, types: ["psychic"], roles: ["eeveelution"],
    dex: [196, 196, 196], stageNames: ["Espeon", "Espeon", "Espeon"], move: move("Psychic", "psychic", 268, "splash"),
    patch: { range: 3, hp: [680, 1224, 2203] } }),
  def({ id: "umbreon", name: "Umbreon", cost: 3, types: ["dark"], roles: ["eeveelution"],
    dex: [197, 197, 197], stageNames: ["Umbreon", "Umbreon", "Umbreon"], move: move("Foul Play", "dark", 252),
    patch: { hp: [900, 1620, 2916], armor: 45 } }),
  def({ id: "miltank", name: "Miltank", cost: 3, types: ["normal"],
    dex: [241, 241, 241], stageNames: ["Miltank", "Miltank", "Miltank"], move: move("Body Slam", "normal", 248, "splash"),
    patch: { hp: [900, 1620, 2916], armor: 40 } }),
  def({ id: "raikou", name: "Raikou", cost: 5, types: ["electric"], roles: ["legendary"],
    dex: [243, 243, 243], stageNames: ["Raikou", "Raikou", "Raikou"], move: move("Thunder", "electric", 470, "line"),
    patch: { range: 4, attackSpeed: 0.75 } }),
  def({ id: "entei", name: "Entei", cost: 5, types: ["fire"], roles: ["legendary"],
    dex: [244, 244, 244], stageNames: ["Entei", "Entei", "Entei"], move: move("Eruption", "fire", 480, "splash"),
    patch: { range: 3, hp: [1150, 2070, 4140] } }),
  def({ id: "suicune", name: "Suicune", cost: 5, types: ["water"], roles: ["legendary"],
    dex: [245, 245, 245], stageNames: ["Suicune", "Suicune", "Suicune"], move: move("Hydro Pump", "water", 460, "splash"),
    patch: { range: 4 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN III — HOENN — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "zigzagoon", name: "Zigzagoon", cost: 1, types: ["normal"], roles: ["swarm", "evolver"],
    dex: [263, 264, 264], stageNames: ["Zigzagoon", "Linoone", "Linoone"], move: move("Tackle", "normal", 155),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "wingull", name: "Wingull", cost: 1, types: ["water", "flying"], roles: ["evolver"],
    dex: [278, 279, 279], stageNames: ["Wingull", "Pelipper", "Pelipper"], move: move("Water Gun", "water", 162),
    patch: { range: 2 } }),
  def({ id: "shroomish", name: "Shroomish", cost: 2, types: ["grass", "fighting"], roles: ["evolver"],
    dex: [285, 286, 286], stageNames: ["Shroomish", "Breloom", "Breloom"], move: move("Force Palm", "fighting", 200) }),
  def({ id: "nuzleaf", name: "Nuzleaf", cost: 2, types: ["grass", "dark"], roles: ["evolver"],
    dex: [273, 274, 275], stageNames: ["Seedot", "Nuzleaf", "Shiftry"], move: move("Faint Attack", "dark", 198) }),
  def({ id: "sableye", name: "Sableye", cost: 3, types: ["dark", "ghost"],
    dex: [302, 302, 302], stageNames: ["Sableye", "Sableye", "Sableye"], move: move("Shadow Sneak", "ghost", 248),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "feebas", name: "Feebas", cost: 3, types: ["water"], roles: ["evolver"],
    dex: [349, 350, 350], stageNames: ["Feebas", "Milotic", "Milotic"], move: move("Aqua Ring", "water", 255, "splash"),
    patch: { range: 3, hp: [820, 1476, 2657] } }),
  def({ id: "latias", name: "Latias", cost: 5, types: ["dragon", "psychic"], roles: ["legendary"],
    dex: [380, 380, 380], stageNames: ["Latias", "Latias", "Latias"], move: move("Mist Ball", "dragon", 465, "splash"),
    patch: { range: 4 } }),
  def({ id: "latios", name: "Latios", cost: 5, types: ["dragon", "psychic"], roles: ["legendary"],
    dex: [381, 381, 381], stageNames: ["Latios", "Latios", "Latios"], move: move("Luster Purge", "psychic", 475, "line"),
    patch: { range: 4 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN IV — SINNOH — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "starly", name: "Starly", cost: 1, types: ["normal", "flying"], roles: ["swarm", "evolver"],
    dex: [396, 397, 398], stageNames: ["Starly", "Staravia", "Staraptor"], move: move("Quick Attack", "normal", 158),
    patch: { range: 2, attackSpeed: 0.72 } }),
  def({ id: "cranidos", name: "Cranidos", cost: 2, types: ["rock"], roles: ["fossil", "evolver"],
    dex: [408, 409, 409], stageNames: ["Cranidos", "Rampardos", "Rampardos"], move: move("Headbutt", "rock", 208),
    patch: { ad: [55, 99, 178], attackSpeed: 0.55 } }),
  def({ id: "shellos", name: "Shellos", cost: 2, types: ["water", "ground"], roles: ["evolver"],
    dex: [422, 423, 423], stageNames: ["Shellos", "Gastrodon", "Gastrodon"], move: move("Mud Bomb", "ground", 200, "splash"),
    patch: { hp: [720, 1296, 2333], armor: 30 } }),
  def({ id: "spiritomb", name: "Spiritomb", cost: 3, types: ["ghost", "dark"],
    dex: [442, 442, 442], stageNames: ["Spiritomb", "Spiritomb", "Spiritomb"], move: move("Shadow Ball", "ghost", 262, "splash"),
    patch: { range: 3, hp: [850, 1530, 2754] } }),
  def({ id: "hippopotas", name: "Hippopotas", cost: 3, types: ["ground"], roles: ["evolver"],
    dex: [449, 450, 450], stageNames: ["Hippopotas", "Hippowdon", "Hippowdon"], move: move("Earthquake", "ground", 258, "splash"),
    patch: { hp: [950, 1710, 3078], armor: 50, attackSpeed: 0.5 } }),
  def({ id: "rotom", name: "Rotom", cost: 3, types: ["electric", "ghost"],
    dex: [479, 479, 479], stageNames: ["Rotom", "Rotom", "Rotom"], move: move("Thunder Shock", "electric", 255, "splash"),
    patch: { range: 3, hp: [700, 1260, 2268] } }),
  def({ id: "froslass", name: "Froslass", cost: 3, types: ["ice", "ghost"], roles: ["evolver"],
    dex: [478, 478, 478], stageNames: ["Froslass", "Froslass", "Froslass"], move: move("Ice Beam", "ice", 258, "line"),
    patch: { range: 3, attackSpeed: 0.72 } }),
  def({ id: "heatran", name: "Heatran", cost: 5, types: ["fire", "steel"], roles: ["legendary"],
    dex: [485, 485, 485], stageNames: ["Heatran", "Heatran", "Heatran"], move: move("Magma Storm", "fire", 480, "splash"),
    patch: { range: 3, armor: 50 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN V — UNOVA — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "pidove", name: "Pidove", cost: 1, types: ["normal", "flying"], roles: ["swarm", "evolver"],
    dex: [519, 520, 521], stageNames: ["Pidove", "Tranquill", "Unfezant"], move: move("Quick Attack", "normal", 155),
    patch: { range: 2 } }),
  def({ id: "blitzle", name: "Blitzle", cost: 1, types: ["electric"], roles: ["evolver"],
    dex: [522, 523, 523], stageNames: ["Blitzle", "Zebstrika", "Zebstrika"], move: move("Shock Wave", "electric", 160),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "darumaka", name: "Darumaka", cost: 2, types: ["fire"], roles: ["evolver"],
    dex: [554, 555, 555], stageNames: ["Darumaka", "Darmanitan", "Darmanitan"], move: move("Fire Punch", "fire", 210) }),
  def({ id: "foongus", name: "Foongus", cost: 2, types: ["grass", "poison"], roles: ["evolver"],
    dex: [590, 591, 591], stageNames: ["Foongus", "Amoonguss", "Amoonguss"], move: move("Spore", "grass", 195, "splash"),
    patch: { hp: [700, 1260, 2268] } }),
  def({ id: "mienfoo", name: "Mienfoo", cost: 3, types: ["fighting"], roles: ["evolver"],
    dex: [619, 620, 620], stageNames: ["Mienfoo", "Mienshao", "Mienshao"], move: move("Hi Jump Kick", "fighting", 268),
    patch: { attackSpeed: 0.78 } }),
  def({ id: "golurk", name: "Golurk", cost: 3, types: ["ground", "ghost"], roles: ["evolver"],
    dex: [622, 623, 623], stageNames: ["Golett", "Golurk", "Golurk"], move: move("Shadow Punch", "ghost", 255),
    patch: { hp: [900, 1620, 2916], armor: 40 } }),
  def({ id: "cobalion", name: "Cobalion", cost: 5, types: ["fighting", "steel"], roles: ["legendary"],
    dex: [638, 638, 638], stageNames: ["Cobalion", "Cobalion", "Cobalion"], move: move("Sacred Sword", "fighting", 475),
    patch: { range: 2, attackSpeed: 0.75, armor: 50 } }),
  def({ id: "thundurus", name: "Thundurus", cost: 5, types: ["electric", "flying"], roles: ["legendary"],
    dex: [642, 642, 642], stageNames: ["Thundurus", "Thundurus", "Thundurus"], move: move("Thunderbolt", "electric", 480, "line"),
    patch: { range: 4 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN VI — KALOS — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "bunnelby", name: "Bunnelby", cost: 1, types: ["normal", "ground"], roles: ["evolver"],
    dex: [659, 660, 660], stageNames: ["Bunnelby", "Diggersby", "Diggersby"], move: move("Headbutt", "normal", 155) }),
  def({ id: "skiddo", name: "Skiddo", cost: 1, types: ["grass"], roles: ["evolver"],
    dex: [672, 673, 673], stageNames: ["Skiddo", "Gogoat", "Gogoat"], move: move("Razor Leaf", "grass", 162) }),
  def({ id: "klefki", name: "Klefki", cost: 2, types: ["steel", "fairy"],
    dex: [707, 707, 707], stageNames: ["Klefki", "Klefki", "Klefki"], move: move("Fairy Wind", "fairy", 200),
    patch: { range: 2, hp: [600, 1080, 1944] } }),
  def({ id: "sylveon", name: "Sylveon", cost: 3, types: ["fairy"], roles: ["eeveelution"],
    dex: [700, 700, 700], stageNames: ["Sylveon", "Sylveon", "Sylveon"], move: move("Draining Kiss", "fairy", 260),
    patch: { range: 3, hp: [820, 1476, 2657] } }),
  def({ id: "phantump", name: "Phantump", cost: 3, types: ["ghost", "grass"], roles: ["evolver"],
    dex: [708, 709, 709], stageNames: ["Phantump", "Trevenant", "Trevenant"], move: move("Shadow Ball", "ghost", 255, "splash"),
    patch: { range: 2 } }),
  def({ id: "tyrunt", name: "Tyrunt", cost: 3, types: ["rock", "dragon"], roles: ["fossil", "evolver"],
    dex: [696, 697, 697], stageNames: ["Tyrunt", "Tyrantrum", "Tyrantrum"], move: move("Dragon Claw", "dragon", 252),
    patch: { armor: 40 } }),
  def({ id: "noibat", name: "Noibat", cost: 4, types: ["flying", "dragon"], roles: ["evolver"],
    dex: [714, 715, 715], stageNames: ["Noibat", "Noivern", "Noivern"], move: move("Boomburst", "normal", 360, "splash"),
    patch: { range: 4, attackSpeed: 0.7 } }),
  def({ id: "diancie", name: "Diancie", cost: 5, types: ["rock", "fairy"], roles: ["mythic"],
    dex: [719, 719, 719], stageNames: ["Diancie", "Diancie", "Diancie"], move: move("Diamond Storm", "rock", 475, "splash"),
    patch: { range: 3, armor: 50 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN VII — ALOLA — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "grubbin", name: "Grubbin", cost: 1, types: ["bug", "electric"], roles: ["swarm", "evolver"],
    dex: [736, 737, 738], stageNames: ["Grubbin", "Charjabug", "Vikavolt"], move: move("Electroweb", "electric", 158, "splash"),
    patch: { range: 2 } }),
  def({ id: "yungoos", name: "Yungoos", cost: 1, types: ["normal"], roles: ["evolver"],
    dex: [734, 735, 735], stageNames: ["Yungoos", "Gumshoos", "Gumshoos"], move: move("Crunch", "dark", 158) }),
  def({ id: "mudbray", name: "Mudbray", cost: 2, types: ["ground"], roles: ["evolver"],
    dex: [749, 750, 750], stageNames: ["Mudbray", "Mudsdale", "Mudsdale"], move: move("Bulldoze", "ground", 200, "splash"),
    patch: { hp: [720, 1296, 2333], armor: 30 } }),
  def({ id: "wimpod", name: "Wimpod", cost: 2, types: ["bug", "water"], roles: ["evolver"],
    dex: [767, 768, 768], stageNames: ["Wimpod", "Golisopod", "Golisopod"], move: move("Aqua Jet", "water", 195),
    patch: { armor: 35 } }),
  def({ id: "dhelmise", name: "Dhelmise", cost: 3, types: ["ghost", "grass"],
    dex: [781, 781, 781], stageNames: ["Dhelmise", "Dhelmise", "Dhelmise"], move: move("Anchor Shot", "steel", 260, "splash") }),
  def({ id: "tapu-koko", name: "Tapu Koko", cost: 4, types: ["electric", "fairy"], roles: ["legendary"],
    dex: [785, 785, 785], stageNames: ["Tapu Koko", "Tapu Koko", "Tapu Koko"], move: move("Nature's Madness", "electric", 365, "splash"),
    patch: { range: 3, attackSpeed: 0.75 } }),
  def({ id: "tapu-lele", name: "Tapu Lele", cost: 4, types: ["psychic", "fairy"], roles: ["legendary"],
    dex: [786, 786, 786], stageNames: ["Tapu Lele", "Tapu Lele", "Tapu Lele"], move: move("Psychic Surge", "psychic", 368, "splash"),
    patch: { range: 4 } }),
  def({ id: "marshadow", name: "Marshadow", cost: 5, types: ["fighting", "ghost"], roles: ["mythic"],
    dex: [802, 802, 802], stageNames: ["Marshadow", "Marshadow", "Marshadow"], move: move("Spectral Thief", "ghost", 495),
    patch: { range: 2, attackSpeed: 0.78 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN VIII — GALAR — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "wooloo", name: "Wooloo", cost: 1, types: ["normal"], roles: ["evolver"],
    dex: [831, 832, 832], stageNames: ["Wooloo", "Dubwool", "Dubwool"], move: move("Body Slam", "normal", 160, "splash") }),
  def({ id: "applin", name: "Applin", cost: 1, types: ["grass", "dragon"], roles: ["evolver"],
    dex: [840, 841, 841], stageNames: ["Applin", "Flapple", "Flapple"], move: move("Dragon Breath", "dragon", 158),
    patch: { range: 2 } }),
  def({ id: "clobbopus", name: "Clobbopus", cost: 2, types: ["fighting", "water"], roles: ["evolver"],
    dex: [852, 853, 853], stageNames: ["Clobbopus", "Grapploct", "Grapploct"], move: move("Liquidation", "water", 205) }),
  def({ id: "sinistea", name: "Sinistea", cost: 2, types: ["ghost"], roles: ["evolver"],
    dex: [854, 855, 855], stageNames: ["Sinistea", "Polteageist", "Polteageist"], move: move("Shadow Ball", "ghost", 200, "splash"),
    patch: { range: 3 } }),
  def({ id: "cramorant", name: "Cramorant", cost: 3, types: ["flying", "water"],
    dex: [845, 845, 845], stageNames: ["Cramorant", "Cramorant", "Cramorant"], move: move("Surf", "water", 255, "splash"),
    patch: { range: 3 } }),
  def({ id: "dracozolt", name: "Dracozolt", cost: 3, types: ["electric", "dragon"], roles: ["fossil"],
    dex: [880, 880, 880], stageNames: ["Dracozolt", "Dracozolt", "Dracozolt"], move: move("Bolt Beak", "electric", 260),
    patch: { attackSpeed: 0.75 } }),
  def({ id: "urshifu", name: "Urshifu", cost: 4, types: ["fighting", "dark"], roles: ["legendary"],
    dex: [892, 892, 892], stageNames: ["Urshifu", "Urshifu", "Urshifu"], move: move("Wicked Blow", "dark", 368),
    patch: { attackSpeed: 0.78, armor: 45 } }),
  def({ id: "calyrex", name: "Calyrex", cost: 5, types: ["psychic", "grass"], roles: ["mythic"],
    dex: [898, 898, 898], stageNames: ["Calyrex", "Calyrex", "Calyrex"], move: move("Expanding Force", "psychic", 485, "splash"),
    patch: { range: 4 } }),

  // ══════════════════════════════════════════════════════════════
  // GEN IX — PALDEA — additions (+8)
  // ══════════════════════════════════════════════════════════════
  def({ id: "lechonk", name: "Lechonk", cost: 1, types: ["normal"], roles: ["evolver"],
    dex: [915, 916, 916], stageNames: ["Lechonk", "Oinkologne", "Oinkologne"], move: move("Body Slam", "normal", 158) }),
  def({ id: "tadbulb", name: "Tadbulb", cost: 1, types: ["electric"], roles: ["evolver"],
    dex: [938, 939, 939], stageNames: ["Tadbulb", "Bellibolt", "Bellibolt"], move: move("Electro Ball", "electric", 160, "splash"),
    patch: { range: 2 } }),
  def({ id: "maschiff", name: "Maschiff", cost: 2, types: ["dark"], roles: ["evolver"],
    dex: [942, 943, 943], stageNames: ["Maschiff", "Mabosstiff", "Mabosstiff"], move: move("Crunch", "dark", 202) }),
  def({ id: "charcadet", name: "Charcadet", cost: 3, types: ["fire", "psychic"], roles: ["evolver"],
    dex: [935, 936, 936], stageNames: ["Charcadet", "Armarouge", "Armarouge"], move: move("Armor Cannon", "fire", 258, "splash"),
    patch: { range: 3 } }),
  def({ id: "rellor", name: "Rellor", cost: 3, types: ["bug", "psychic"], roles: ["evolver"],
    dex: [953, 954, 954], stageNames: ["Rellor", "Rabsca", "Rabsca"], move: move("Psybeam", "psychic", 255, "splash"),
    patch: { range: 3, hp: [700, 1260, 2268] } }),
  def({ id: "great-tusk", name: "Great Tusk", cost: 4, types: ["fighting", "ground"], roles: ["legendary"],
    dex: [984, 984, 984], stageNames: ["Great Tusk", "Great Tusk", "Great Tusk"], move: move("Headlong Rush", "ground", 370, "splash"),
    patch: { hp: [1000, 1800, 3240], armor: 50, attackSpeed: 0.6 } }),
  def({ id: "iron-valiant", name: "Iron Valiant", cost: 4, types: ["fighting", "fairy"], roles: ["legendary"],
    dex: [1006, 1006, 1006], stageNames: ["Iron Valiant", "Iron Valiant", "Iron Valiant"], move: move("Moonblast", "fairy", 375, "splash"),
    patch: { range: 2, attackSpeed: 0.78 } }),
  def({ id: "ogerpon", name: "Ogerpon", cost: 4, types: ["grass"], roles: ["legendary"],
    dex: [1017, 1017, 1017], stageNames: ["Ogerpon", "Ogerpon", "Ogerpon"], move: move("Ivy Cudgel", "grass", 370),
    patch: { attackSpeed: 0.78 } }),
];

// Fill out each region's full national-dex roster from the auto-generated set.
// Curated lines above take precedence: a generated unit is skipped if its id or
// ANY of its dex stages already belongs to a curated line (no duplicate mons).
{
  const ids = new Set(UNITS.map((u) => u.id));
  const dexSeen = new Set(UNITS.flatMap((u) => u.dex));
  for (const g of GENERATED) {
    if (ids.has(g.id) || g.dex.some((d) => dexSeen.has(d))) continue;
    ids.add(g.id);
    g.dex.forEach((d) => dexSeen.add(d));
    UNITS.push(def({
      id: g.id, name: g.name, cost: g.cost, types: g.types, roles: rolesForGeneratedDex(g.dex[0]),
      dex: g.dex, stageNames: g.stageNames,
      move: move(g.move.name, g.move.type, g.move.power, g.move.shape),
      // Variance layered OVER the raw patch: it always differentiates hp/ad/as/armor,
      // and only sets `range` when it flips a melee special-attacker to ranged (it's
      // told the generator's rawRange, so it never flips an already-ranged unit — that
      // range is preserved because variance leaves range unset there).
      patch: { ...g.patch, ...generatedVariance(g.dex[0], g.cost, g.types, g.patch?.range) },
    }));
  }
}

// Evolution type shifts: lines that GAIN or CHANGE a type as they evolve. The generated
// roster only carries each line's BASE typing (so a generated Gyarados stayed pure Water),
// which the player rightly noticed. This table restores the per-star typing for the
// well-known shifting lines; it's applied to whatever unit holds the id (curated or
// generated) only when that unit doesn't already define its own typesByStar. Index 0 = ★,
// 1 = ★★, 2 = ★★★.
const TYPE_SHIFTS: Record<string, PokeType[][]> = {
  magikarp: [["water"], ["water", "flying"], ["water", "flying"]],       // Gyarados (at ★★, 2-stage) gains Flying
  // (Onix is a standalone unit here — dex [95,95,95], never evolves — so it stays Rock/Ground;
  //  Steelix is its own buyable unit. No shift.)
  bagon:    [["dragon"], ["dragon"], ["dragon", "flying"]],              // → Salamence (Flying)
  swablu:   [["normal", "flying"], ["dragon", "flying"], ["dragon", "flying"]], // → Altaria (Dragon)
  azurill:  [["normal", "fairy"], ["water", "fairy"], ["water", "fairy"]], // → Marill (Water)
  trapinch: [["ground"], ["ground", "dragon"], ["ground", "dragon"]],    // → Vibrava/Flygon (Dragon)
  seel:     [["water"], ["water", "ice"], ["water", "ice"]],             // → Dewgong (Ice)
  shellder: [["water"], ["water", "ice"], ["water", "ice"]],             // → Cloyster (Ice)
  staryu:   [["water"], ["water", "psychic"], ["water", "psychic"]],     // Starmie (at ★★, 2-stage) gains Psychic
  scatterbug: [["bug"], ["bug"], ["bug", "flying"]],                     // → Vivillon (Flying)
  fletchling: [["normal", "flying"], ["fire", "flying"], ["fire", "flying"]], // → Talonflame (Fire)
  charcadet: [["fire"], ["fire", "ghost"], ["fire", "ghost"]],           // → Armarouge/Ceruledge
  // ── Gen 1 ──
  poliwag:  [["water"], ["water"], ["water", "fighting"]],               // → Poliwrath (Fighting)
  horsea:   [["water"], ["water"], ["water", "dragon"]],                 // → Kingdra (Dragon)
  // ── Gen 2 ── (tyranitar is the buyable id for the Larvitar line)
  tyranitar: [["rock", "ground"], ["rock", "ground"], ["rock", "dark"]], // Larvitar/Pupitar Ground → Tyranitar Dark
  togepi:   [["fairy"], ["fairy", "flying"], ["fairy", "flying"]],       // Togetic/Togekiss gain Flying
  scyther:  [["bug", "flying"], ["bug", "steel"], ["bug", "steel"]],     // → Scizor (Steel)
  // Salamence line: the buyable id is `salamence`, not `bagon` (which owns no roster slot).
  salamence: [["dragon"], ["dragon"], ["dragon", "flying"]],             // Bagon/Shelgon Dragon → Salamence Flying
  // ── Gen 3 ── (nuzleaf is the buyable id for the Seedot line)
  nuzleaf:  [["grass"], ["grass", "dark"], ["grass", "dark"]],           // Seedot Grass → Nuzleaf/Shiftry Dark
  shroomish:[["grass"], ["grass", "fighting"], ["grass", "fighting"]],   // → Breloom (Fighting)
  surskit:  [["bug", "water"], ["bug", "flying"], ["bug", "flying"]],    // → Masquerain (Flying)
  cacnea:   [["grass"], ["grass", "dark"], ["grass", "dark"]],           // → Cacturne (Dark)
  corphish: [["water"], ["water", "dark"], ["water", "dark"]],           // → Crawdaunt (Dark)
  // flygon is the buyable id for the Trapinch line (Trapinch is pure Ground; Vibrava/Flygon gain Dragon)
  flygon:   [["ground"], ["ground", "dragon"], ["ground", "dragon"]],
  // ── Gen 4 ──
  riolu:    [["fighting"], ["fighting", "steel"], ["fighting", "steel"]],// → Lucario (Steel)
  // ── Gen 5 ──
  tympole:  [["water"], ["water", "ground"], ["water", "ground"]],       // Palpitoad/Seismitoad gain Ground
  // ── Gen 6 ──
  froakie:  [["water"], ["water"], ["water", "dark"]],                   // → Greninja (Dark)
  // ── Gen 7 (Alola starters) ──
  rowlet:   [["grass", "flying"], ["grass", "flying"], ["grass", "ghost"]], // → Decidueye (Ghost)
  litten:   [["fire"], ["fire"], ["fire", "dark"]],                      // → Incineroar (Dark)
  popplio:  [["water"], ["water"], ["water", "fairy"]],                  // → Primarina (Fairy)
  grubbin:  [["bug"], ["bug", "electric"], ["bug", "electric"]],         // Charjabug/Vikavolt gain Electric
  // ── Gen 8 (Galar) ──
  rookidee: [["flying"], ["flying"], ["flying", "steel"]],               // → Corviknight (Steel)
  blipbug:  [["bug"], ["bug", "psychic"], ["bug", "psychic"]],           // Dottler/Orbeetle gain Psychic
  hatenna:  [["psychic"], ["psychic"], ["psychic", "fairy"]],           // → Hatterene (Fairy)
  // ── Gen 9 (Paldea starters + more) ──
  sprigatito:[["grass"], ["grass"], ["grass", "dark"]],                  // → Meowscarada (Dark)
  fuecoco:  [["fire"], ["fire"], ["fire", "ghost"]],                     // → Skeledirge (Ghost)
  quaxly:   [["water"], ["water"], ["water", "fighting"]],               // → Quaquaval (Fighting)
  pawmi:    [["electric"], ["electric", "fighting"], ["electric", "fighting"]], // Pawmo/Pawmot gain Fighting
};
for (const u of UNITS) {
  const shift = TYPE_SHIFTS[u.id];
  if (shift && !u.typesByStar) u.typesByStar = shift as PokeType[][];
}

export const UNITS_BY_ID: Record<string, UnitDef> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
);

/** Synthetic stand-in for an unknown def id, cached per-id. Keeps rendering and
 *  the sim alive if a stale/cross-roster id ever reaches a client instead of
 *  throwing and white-screening the whole game tree. */
const PLACEHOLDER_CACHE: Record<string, UnitDef> = {};
function placeholderDef(id: string): UnitDef {
  return (PLACEHOLDER_CACHE[id] ??= {
    id,
    name: "?",
    cost: 1 as UnitDef["cost"],
    types: ["normal"] as UnitDef["types"],
    roles: [] as UnitDef["roles"],
    dex: [0, 0, 0],
    stageNames: ["?", "?", "?"],
    stats: { hp: [500, 600, 700], ad: [40, 50, 60], attackSpeed: 0.6, armor: 20, magicResist: 20, range: 1, maxMana: 100, startMana: 0 },
    move: { name: "—", type: "normal", power: [0, 0, 0], shape: "single" },
  });
}

/** True if `id` is a real, known unit def (use to filter RTDB-sourced ids). */
export function hasDef(id: string): boolean {
  return !!UNITS_BY_ID[id];
}

export function getDef(id: string): UnitDef {
  return UNITS_BY_ID[id] ?? placeholderDef(id);
}

/** The mon's typing at a given star (1..3). Falls back to base `types` for any star a
 *  line doesn't override. Used by combat, synergies and the detail panel so a mon that
 *  changes type as it evolves is reflected everywhere. */
export function typesForStar(def: UnitDef, star: number): PokeType[] {
  return def.typesByStar?.[star - 1] ?? def.types;
}

/** Combat-role archetype, derived from a mon's 1★ stats. Physical = auto-attack
 *  carry, Mage = ability carry, Tank = durable frontliner. */
export type Archetype = "physical" | "tank" | "mage";

/** The three role metrics from a unit's base (1★) statline. */
function roleMetrics(def: UnitDef): { auto: number; ability: number; ehp: number } {
  const s = def.stats;
  const auto = s.ad[0] * s.attackSpeed;                                   // auto-attack DPS
  const castsPerSec = s.maxMana > 0 ? (s.attackSpeed * 10) / s.maxMana : 0; // ~10 mana/attack
  const ability = (def.move?.power?.[0] ?? 0) * castsPerSec;             // ability DPS
  const ehp = s.hp[0] * (1 + (s.armor + s.magicResist) / 100);          // effective HP
  return { auto, ability, ehp };
}

// Per-cost averages of the three metrics, computed once, so classification is
// RELATIVE to a tier (a 1-cost tank ≠ a 5-cost tank in raw numbers).
let _costMeans: Record<number, { auto: number; ability: number; ehp: number }> | null = null;
function costMeans(): Record<number, { auto: number; ability: number; ehp: number }> {
  if (_costMeans) return _costMeans;
  const acc: Record<number, { auto: number; ability: number; ehp: number; n: number }> = {};
  for (const d of UNITS) {
    const m = roleMetrics(d);
    const a = (acc[d.cost] ??= { auto: 0, ability: 0, ehp: 0, n: 0 });
    a.auto += m.auto; a.ability += m.ability; a.ehp += m.ehp; a.n += 1;
  }
  _costMeans = {};
  for (const c of Object.keys(acc)) {
    const a = acc[+c];
    _costMeans[+c] = { auto: a.auto / a.n || 1, ability: a.ability / a.n || 1, ehp: a.ehp / a.n || 1 };
  }
  return _costMeans;
}

/** Classify a unit as physical / tank / mage by whichever metric most exceeds the
 *  average for its cost tier. Self-calibrating, so it stays meaningful as stats are
 *  rebalanced. Ties (e.g. an undifferentiated statline) fall back to physical. */
export function archetypeOf(def: UnitDef): Archetype {
  const m = roleMetrics(def);
  const mean = costMeans()[def.cost] ?? { auto: 1, ability: 1, ehp: 1 };
  const phys = m.auto / (mean.auto || 1);
  const mage = m.ability / (mean.ability || 1);
  const tank = m.ehp / (mean.ehp || 1);
  if (tank >= phys && tank >= mage && tank > 1.05) return "tank";
  if (mage > phys) return "mage";
  return "physical";
}

/** Signature ability flavour, derived deterministically from a unit's archetype +
 *  primary typing — so each mon's cast does something distinct beyond a typed nuke,
 *  without hand-authoring 600+ abilities. Pure (host & client agree → sim stays in sync).
 *   · guard   — tanks heal themselves on cast (sustain frontline)
 *   · heal    — supportive mages also mend the most-wounded ally
 *   · blast   — offensive mages hit EVERY enemy (team nuke) for reduced power
 *   · execute — physical carries deal bonus damage to low-HP targets
 *   · nuke    — default single/splash/line typed burst */
export type CastEffect = "nuke" | "guard" | "heal" | "blast" | "execute";
const HEAL_PRIMARY = new Set<PokeType>(["psychic", "fairy", "water", "grass", "normal"]);
export function castEffectOf(def: UnitDef): CastEffect {
  const arch = archetypeOf(def);
  if (arch === "tank") return "guard";
  if (arch === "mage") return HEAL_PRIMARY.has(def.types[0]) ? "heal" : "blast";
  return def.cost >= 3 ? "execute" : "nuke";
}

/** Returns unit IDs whose base-form dex number falls within the given generations. */
export function unitsForGenerations(gens: number[]): string[] {
  const ranges = gens.map((g) => GEN_DEX_RANGES[g]).filter(Boolean) as [number, number][];
  return UNITS
    .filter((u) => ranges.some(([s, e]) => u.dex[0] >= s && u.dex[0] <= e))
    .map((u) => u.id);
}

/** Default roster size when no explicit draft size is given (keeps the shop from
 *  being diluted by a 200+ pool you can never 3-star out of). */
export const ROSTER_CAP = 90;

// Tiny seeded RNG (mulberry32) so a game's random roster draw is identical on
// every client (seed = the room code) yet differs game-to-game.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The actual playable roster for the selected generations — the source of truth
 *  for the shop pool, bots, creeps and carousel alike.
 *
 *  When the eligible pool is larger than `size`, we draw a RANDOM, cost-balanced
 *  subset: the "draft size" rule decides how many of the region's mons are in
 *  play this game (so each match feels different), while the per-cost proportions
 *  are preserved so the shop still has units at every tier. The draw is seeded by
 *  `seed` (the room code) so the host and every client compute the identical
 *  roster — essential for combat determinism. */
export function rosterForGenerations(gens: number[], size: number = ROSTER_CAP, seed = 1): string[] {
  const ids = unitsForGenerations(gens);
  if (ids.length <= size) return ids;
  const rng = seededRng(seed);
  // Group by cost, shuffle each tier, take a proportional share so the subset
  // keeps the pool's cost spread.
  const byCost: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const id of ids) (byCost[getDef(id).cost] ??= []).push(id);
  const out: string[] = [];
  for (const c of [1, 2, 3, 4, 5]) {
    const tier = byCost[c] ?? [];
    tier.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // stable base order
    for (let i = tier.length - 1; i > 0; i--) { // seeded Fisher–Yates
      const j = Math.floor(rng() * (i + 1));
      [tier[i], tier[j]] = [tier[j], tier[i]];
    }
    const take = Math.max(1, Math.round((size * tier.length) / ids.length));
    out.push(...tier.slice(0, Math.min(take, tier.length)));
  }
  return repairTraits(out, ids, seed);
}

/** Every trait (type + role) a unit carries. */
function traitsOf(id: string): string[] {
  const d = getDef(id);
  return [...d.types, ...d.roles];
}

/** Deterministic repair pass: guarantee that every trait whose lowest breakpoint is
 *  actually reachable from the full pool has at least that many carriers in the drawn
 *  roster — so a random draft never strands a synergy as unbuildable. Swaps carriers
 *  in from the un-drawn remainder, evicting units that are "safe" (none of whose own
 *  traits would drop below their lowest breakpoint), preferring same-cost evictions to
 *  keep the tier spread. Fully deterministic (sorted order, no RNG) so the host and
 *  every client land on the identical roster. */
function repairTraits(draw: string[], allIds: string[], seed: number): string[] {
  const lowestBp = (key: string): number => TRAITS_BY_KEY[key]?.tiers?.[0]?.count ?? Infinity;
  const inDraw = new Set(draw);
  const count = (set: Set<string>, key: string): number => {
    let n = 0;
    for (const id of set) if (traitsOf(id).includes(key)) n++;
    return n;
  };
  // Which traits CAN be guaranteed (full pool has enough carriers)?
  const allTraits = new Set<string>();
  for (const id of allIds) for (const k of traitsOf(id)) allTraits.add(k);
  const guaranteeable = [...allTraits]
    .filter((k) => Number.isFinite(lowestBp(k)) && count(new Set(allIds), k) >= lowestBp(k))
    .sort();

  const remainder = allIds.filter((id) => !inDraw.has(id)).sort();
  // Cap iterations as a runaway guard (each swap fixes at most one carrier).
  for (let guard = 0; guard < draw.length * 2; guard++) {
    // Most-deficient guaranteeable trait (deterministic: largest deficit, then key).
    let target: string | null = null, worst = 0;
    for (const k of guaranteeable) {
      const deficit = lowestBp(k) - count(inDraw, k);
      if (deficit > worst) { worst = deficit; target = k; }
    }
    if (!target) break; // all satisfied

    // A carrier of `target` to add, preferring one that also helps other deficits.
    const candidate = remainder.find((id) => traitsOf(id).includes(target!));
    if (!candidate) break;
    const candCost = getDef(candidate).cost;

    // Evict a "safe" unit: removing it drops no trait below its lowest breakpoint, and
    // it does NOT carry `target`. Prefer same cost as the candidate (keep tier spread).
    const safeToEvict = (id: string): boolean => {
      if (traitsOf(id).includes(target!)) return false;
      return traitsOf(id).every((k) => !guaranteeable.includes(k) || count(inDraw, k) - 1 >= lowestBp(k));
    };
    const evict = draw.filter(safeToEvict).sort((a, b) => {
      const ca = getDef(a).cost === candCost ? 0 : 1, cb = getDef(b).cost === candCost ? 0 : 1;
      return ca !== cb ? ca - cb : a < b ? -1 : 1;
    })[0];
    if (!evict) break; // can't satisfy without breaking another guarantee

    inDraw.delete(evict); inDraw.add(candidate);
    draw[draw.indexOf(evict)] = candidate;
    remainder.splice(remainder.indexOf(candidate), 1);
    remainder.push(evict); remainder.sort();
  }
  void seed; // (kept for signature symmetry; the repair is RNG-free/deterministic)
  return draw;
}
