import type { PokeType } from "../types";

/** The held item that unlocks Mega Evolution for a compatible mon. */
export const MEGA_STONE = "mega-stone";

/** Combat identity of a Mega form. Drives the stat profile so a Mega's buff matches
 *  the mon it actually is — a physical bruiser gets Attack, a glass-cannon mage gets
 *  Ability Power, a wall gets HP + defenses — instead of every Mega getting a flat
 *  all-round boost. Also shown on the unit detail panel so the player knows what the
 *  stone will do before slamming it on. */
export type MegaArchetype = "physical" | "special" | "mixed" | "bruiser" | "tank" | "special-tank";

/** Per-archetype stat profile. hp/ad/ap are multipliers on the mon's current-star stats;
 *  armor/mr are flat additions. Tuned so each archetype reads clearly in combat. */
const ARCHETYPE: Record<MegaArchetype, { hpMult: number; adMult: number; apMult: number; armorBonus: number; mrBonus: number; label: string; labelFr: string }> = {
  // Glass-cannon auto-attacker — lives and dies by raw Attack.
  physical:       { hpMult: 1.40, adMult: 1.90, apMult: 1.05, armorBonus: 18, mrBonus: 18, label: "Physical", labelFr: "Physique" },
  // Glass-cannon caster — pours everything into Ability Power.
  special:        { hpMult: 1.40, adMult: 1.05, apMult: 1.95, armorBonus: 15, mrBonus: 25, label: "Special", labelFr: "Spéciale" },
  // Hits hard with both attacks and abilities.
  mixed:          { hpMult: 1.45, adMult: 1.55, apMult: 1.55, armorBonus: 22, mrBonus: 24, label: "Mixed", labelFr: "Mixte" },
  // Beefy physical threat — durable AND a real Attack carry.
  bruiser:        { hpMult: 1.60, adMult: 1.65, apMult: 1.10, armorBonus: 38, mrBonus: 28, label: "Bruiser", labelFr: "Bagarreur" },
  // Pure wall — soaks damage, light offense.
  tank:           { hpMult: 1.75, adMult: 1.30, apMult: 1.30, armorBonus: 52, mrBonus: 38, label: "Tank", labelFr: "Tank" },
  // Bulky caster — survives while it ramps its abilities.
  "special-tank": { hpMult: 1.65, adMult: 1.10, apMult: 1.55, armorBonus: 34, mrBonus: 42, label: "Special Wall", labelFr: "Mur Spécial" },
};

export type MegaForm = {
  /** National-dex sprite id of the Mega form (PokéAPI form ids, 10000+). */
  megaDex: number;
  name: string;
  archetype: MegaArchetype;
  /** Stat multipliers / bonuses applied on top of the mon's current-star stats. */
  hpMult: number;
  adMult: number;
  apMult: number;
  armorBonus: number;
  mrBonus: number;
  /** Optional typing shift while Mega (e.g. Charizard X gains Dragon). */
  addType?: PokeType;
  /** Archetype display labels (for the unit detail panel). */
  roleLabel: string;
  roleLabelFr: string;
};

/** Build a Mega form from an archetype, with optional per-mon stat tweaks for signature
 *  forms (e.g. Mewtwo Y leans even harder into AP). Keeps the data declarative + tailored. */
function mega(megaDex: number, name: string, archetype: MegaArchetype, opts?: { addType?: PokeType; tweak?: Partial<Pick<MegaForm, "hpMult" | "adMult" | "apMult" | "armorBonus" | "mrBonus">> }): MegaForm {
  const a = ARCHETYPE[archetype];
  return {
    megaDex, name, archetype,
    hpMult: opts?.tweak?.hpMult ?? a.hpMult,
    adMult: opts?.tweak?.adMult ?? a.adMult,
    apMult: opts?.tweak?.apMult ?? a.apMult,
    armorBonus: opts?.tweak?.armorBonus ?? a.armorBonus,
    mrBonus: opts?.tweak?.mrBonus ?? a.mrBonus,
    addType: opts?.addType,
    roleLabel: a.label,
    roleLabelFr: a.labelFr,
  };
}

/**
 * Mega-capable lines we field, keyed by the base unit id (the mon you buy). The Mega
 * applies at combat start when that unit holds a Mega Stone. Each form's archetype is
 * chosen to match how the Mega actually plays in the games.
 */
export const MEGA_FORMS: Record<string, MegaForm> = {
  // ── Gen 1 (Kanto) ──
  charmander: mega(10034, "Mega Charizard X",  "bruiser",      { addType: "dragon" }), // physical dragon bruiser
  bulbasaur:  mega(10033, "Mega Venusaur",     "tank"),                                  // defensive wall
  squirtle:   mega(10036, "Mega Blastoise",    "special-tank"),                          // bulky cannon
  weedle:     mega(10090, "Mega Beedrill",     "physical"),                              // hyper-offensive attacker
  abra:       mega(10037, "Mega Alakazam",     "special",      { tweak: { apMult: 2.05 } }), // apex special sweeper
  gastly:     mega(10038, "Mega Gengar",       "special"),                               // special nuke
  magikarp:   mega(10041, "Mega Gyarados",     "bruiser",      { addType: "dark" }),     // physical bruiser
  aerodactyl: mega(10042, "Mega Aerodactyl",   "physical"),                              // fast physical
  mewtwo:     mega(10044, "Mega Mewtwo Y",     "special",      { tweak: { apMult: 2.1, hpMult: 1.45 } }), // strongest special
  pidgey:     mega(10073, "Mega Pidgeot",      "special"),                               // special flyer
  slowpoke:   mega(10071, "Mega Slowbro",      "special-tank"),                          // bulky caster
  kangaskhan: mega(10039, "Mega Kangaskhan",   "physical"),                              // parental-bond physical
  pinsir:     mega(10040, "Mega Pinsir",       "physical",     { addType: "flying" }),   // aerial physical
  // ── Gen 2 (Johto) ──
  mareep:     mega(10045, "Mega Ampharos",     "special",      { addType: "dragon" }),   // special dragon
  onix:       mega(10072, "Mega Steelix",      "tank",         { addType: "steel", tweak: { armorBonus: 60 } }), // steel wall
  steelix:    mega(10072, "Mega Steelix",      "tank",         { tweak: { armorBonus: 60 } }),
  scyther:    mega(10046, "Mega Scizor",       "bruiser",      { addType: "steel" }),    // physical steel bruiser
  heracross:  mega(10047, "Mega Heracross",    "physical",     { tweak: { adMult: 2.0 } }), // monstrous attack
  houndour:   mega(10048, "Mega Houndoom",     "special"),                               // special fire/dark
  tyranitar:  mega(10049, "Mega Tyranitar",    "bruiser",      { tweak: { hpMult: 1.65, armorBonus: 44 } }), // physical juggernaut
  // ── Gen 3 (Hoenn) ──
  treecko:    mega(10065, "Mega Sceptile",     "mixed",        { addType: "dragon" }),   // fast mixed
  torchic:    mega(10050, "Mega Blaziken",     "physical",     { tweak: { adMult: 2.0 } }), // speed-boost attacker
  mudkip:     mega(10064, "Mega Swampert",     "bruiser"),                               // bulky physical
  ralts:      mega(10051, "Mega Gardevoir",    "special"),                               // fairy special
  sableye:    mega(10066, "Mega Sableye",      "tank",         { tweak: { apMult: 1.5 } }), // bulky disruptor
  mawile:     mega(10052, "Mega Mawile",       "physical",     { addType: "fairy", tweak: { adMult: 2.0, armorBonus: 30 } }), // huge-power
  aron:       mega(10053, "Mega Aggron",       "tank",         { addType: "steel", tweak: { armorBonus: 60, hpMult: 1.8 } }), // hardest wall
  meditite:   mega(10054, "Mega Medicham",     "physical",     { tweak: { adMult: 2.0 } }), // pure-power physical
  electrike:  mega(10055, "Mega Manectric",    "special"),                               // fast special
  carvanha:   mega(10070, "Mega Sharpedo",     "physical",     { tweak: { adMult: 2.0 } }), // glass-cannon attacker
  numel:      mega(10087, "Mega Camerupt",     "special"),                               // slow special nuke
  swablu:     mega(10067, "Mega Altaria",      "mixed",        { addType: "fairy" }),     // dragon/fairy mixed
  shuppet:    mega(10056, "Mega Banette",      "physical"),                              // physical ghost
  absol:      mega(10057, "Mega Absol",        "physical"),                              // magic-bounce attacker
  snorunt:    mega(10074, "Mega Glalie",       "mixed"),                                 // refrigerate mixed
  salamence:  mega(10089, "Mega Salamence",    "bruiser"),                               // aerilate physical bruiser
  bagon:      mega(10089, "Mega Salamence",    "bruiser"),
  metagross:  mega(10076, "Mega Metagross",    "bruiser",      { tweak: { adMult: 1.7, armorBonus: 40 } }), // steel bruiser
  beldum:     mega(10076, "Mega Metagross",    "bruiser",      { tweak: { adMult: 1.7, armorBonus: 40 } }),
  latias:     mega(10062, "Mega Latias",       "special-tank"),                          // bulky special
  latios:     mega(10063, "Mega Latios",       "special"),                               // offensive special
  rayquaza:   mega(10079, "Mega Rayquaza",     "mixed",        { tweak: { hpMult: 1.6, adMult: 1.8, apMult: 1.8, armorBonus: 30, mrBonus: 30 } }), // apex
  kyogre:     mega(10077, "Primal Kyogre",     "special",      { tweak: { hpMult: 1.6, apMult: 1.95, mrBonus: 35 } }), // primal special
  groudon:    mega(10078, "Primal Groudon",    "bruiser",      { addType: "fire", tweak: { hpMult: 1.65, adMult: 1.8, armorBonus: 45 } }), // primal physical
  // ── Gen 4 (Sinnoh) ──
  buneary:    mega(10088, "Mega Lopunny",      "physical",     { addType: "fighting" }), // scrappy physical
  riolu:      mega(10059, "Mega Lucario",      "mixed"),                                 // adaptable mixed
  snover:     mega(10060, "Mega Abomasnow",    "special-tank"),                          // bulky special
  gible:      mega(10058, "Mega Garchomp",     "bruiser"),                               // physical bruiser
  garchomp:   mega(10058, "Mega Garchomp",     "bruiser"),
  // ── Gen 5 / 6 ──
  audino:     mega(10069, "Mega Audino",       "tank",         { addType: "fairy" }),    // healer wall
  diancie:    mega(10075, "Mega Diancie",      "mixed"),                                 // rock/fairy mixed
};

export function megaFormFor(defId: string): MegaForm | undefined {
  return MEGA_FORMS[defId];
}

export function canMega(defId: string): boolean {
  return defId in MEGA_FORMS;
}

export function hasMegaStone(items: string[] | undefined): boolean {
  return !!items && items.includes(MEGA_STONE);
}

/** A mon Mega-evolves when it is mega-capable AND holds a Mega Stone. */
export function isMegaActive(defId: string, items: string[] | undefined): boolean {
  return canMega(defId) && hasMegaStone(items);
}
