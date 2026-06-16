import type { PokeType } from "../types";

/** The held item that unlocks Mega Evolution for a compatible mon. */
export const MEGA_STONE = "mega-stone";

export type MegaForm = {
  /** National-dex sprite id of the Mega form (PokéAPI form ids, 10000+). */
  megaDex: number;
  name: string;
  /** Stat multipliers / bonuses applied on top of the mon's current-star stats. */
  hpMult: number;
  adMult: number;
  apMult: number;
  armorBonus: number;
  mrBonus: number;
  /** Optional typing shift while Mega (e.g. Charizard X gains Dragon). */
  addType?: PokeType;
};

/**
 * Gen-1 mega-capable lines we field. Keyed by the base unit id (the mon you buy);
 * the Mega applies at combat start when that unit holds a Mega Stone.
 */
export const MEGA_FORMS: Record<string, MegaForm> = {
  charmander: { megaDex: 10034, name: "Mega Charizard X", hpMult: 1.45, adMult: 1.6, apMult: 1.5, armorBonus: 25, mrBonus: 20, addType: "dragon" },
  bulbasaur:  { megaDex: 10033, name: "Mega Venusaur",    hpMult: 1.7,  adMult: 1.4, apMult: 1.5, armorBonus: 35, mrBonus: 35 },
  squirtle:   { megaDex: 10036, name: "Mega Blastoise",   hpMult: 1.55, adMult: 1.45, apMult: 1.6, armorBonus: 30, mrBonus: 30 },
  weedle:     { megaDex: 10090, name: "Mega Beedrill",    hpMult: 1.35, adMult: 1.8, apMult: 1.4, armorBonus: 15, mrBonus: 15 },
  abra:       { megaDex: 10037, name: "Mega Alakazam",    hpMult: 1.35, adMult: 1.3, apMult: 1.8, armorBonus: 15, mrBonus: 25 },
  gastly:     { megaDex: 10038, name: "Mega Gengar",      hpMult: 1.4,  adMult: 1.4, apMult: 1.7, armorBonus: 15, mrBonus: 25 },
  magikarp:   { megaDex: 10041, name: "Mega Gyarados",    hpMult: 1.5,  adMult: 1.6, apMult: 1.5, armorBonus: 30, mrBonus: 25 },
  aerodactyl: { megaDex: 10042, name: "Mega Aerodactyl",  hpMult: 1.4,  adMult: 1.65, apMult: 1.4, armorBonus: 25, mrBonus: 20 },
  mewtwo:     { megaDex: 10044, name: "Mega Mewtwo Y",    hpMult: 1.4,  adMult: 1.4, apMult: 1.9, armorBonus: 20, mrBonus: 30 },

  // ── Gen 1 (more) ──
  pidgey:     { megaDex: 10073, name: "Mega Pidgeot",     hpMult: 1.4,  adMult: 1.4,  apMult: 1.7,  armorBonus: 20, mrBonus: 20 },
  slowpoke:   { megaDex: 10071, name: "Mega Slowbro",     hpMult: 1.6,  adMult: 1.35, apMult: 1.6,  armorBonus: 40, mrBonus: 25 },
  kangaskhan: { megaDex: 10039, name: "Mega Kangaskhan",  hpMult: 1.5,  adMult: 1.7,  apMult: 1.3,  armorBonus: 25, mrBonus: 25 },
  pinsir:     { megaDex: 10040, name: "Mega Pinsir",      hpMult: 1.4,  adMult: 1.8,  apMult: 1.3,  armorBonus: 20, mrBonus: 15, addType: "flying" },
  // ── Gen 2 ──
  mareep:     { megaDex: 10045, name: "Mega Ampharos",    hpMult: 1.5,  adMult: 1.35, apMult: 1.75, armorBonus: 20, mrBonus: 30, addType: "dragon" },
  steelix:    { megaDex: 10072, name: "Mega Steelix",     hpMult: 1.7,  adMult: 1.5,  apMult: 1.3,  armorBonus: 50, mrBonus: 30, addType: "ground" },
  scyther:    { megaDex: 10046, name: "Mega Scizor",      hpMult: 1.45, adMult: 1.7,  apMult: 1.35, armorBonus: 30, mrBonus: 20, addType: "steel" },
  heracross:  { megaDex: 10047, name: "Mega Heracross",   hpMult: 1.45, adMult: 1.85, apMult: 1.3,  armorBonus: 25, mrBonus: 20 },
  houndour:   { megaDex: 10048, name: "Mega Houndoom",    hpMult: 1.4,  adMult: 1.45, apMult: 1.75, armorBonus: 20, mrBonus: 20 },
  tyranitar:  { megaDex: 10049, name: "Mega Tyranitar",   hpMult: 1.6,  adMult: 1.7,  apMult: 1.4,  armorBonus: 40, mrBonus: 30 },
  // ── Gen 3 ──
  treecko:    { megaDex: 10065, name: "Mega Sceptile",    hpMult: 1.4,  adMult: 1.6,  apMult: 1.6,  armorBonus: 20, mrBonus: 20, addType: "dragon" },
  torchic:    { megaDex: 10050, name: "Mega Blaziken",    hpMult: 1.45, adMult: 1.8,  apMult: 1.5,  armorBonus: 20, mrBonus: 20 },
  mudkip:     { megaDex: 10064, name: "Mega Swampert",    hpMult: 1.6,  adMult: 1.7,  apMult: 1.4,  armorBonus: 35, mrBonus: 25 },
  ralts:      { megaDex: 10051, name: "Mega Gardevoir",   hpMult: 1.4,  adMult: 1.3,  apMult: 1.85, armorBonus: 15, mrBonus: 30 },
  sableye:    { megaDex: 10066, name: "Mega Sableye",     hpMult: 1.65, adMult: 1.35, apMult: 1.5,  armorBonus: 35, mrBonus: 35 },
  mawile:     { megaDex: 10052, name: "Mega Mawile",      hpMult: 1.5,  adMult: 1.85, apMult: 1.35, armorBonus: 35, mrBonus: 25, addType: "fairy" },
  aron:       { megaDex: 10053, name: "Mega Aggron",      hpMult: 1.75, adMult: 1.55, apMult: 1.3,  armorBonus: 55, mrBonus: 30, addType: "steel" },
  meditite:   { megaDex: 10054, name: "Mega Medicham",    hpMult: 1.4,  adMult: 1.75, apMult: 1.5,  armorBonus: 20, mrBonus: 25 },
  electrike:  { megaDex: 10055, name: "Mega Manectric",   hpMult: 1.4,  adMult: 1.4,  apMult: 1.7,  armorBonus: 20, mrBonus: 20 },
  carvanha:   { megaDex: 10070, name: "Mega Sharpedo",    hpMult: 1.35, adMult: 1.9,  apMult: 1.4,  armorBonus: 15, mrBonus: 15 },
  numel:      { megaDex: 10087, name: "Mega Camerupt",    hpMult: 1.55, adMult: 1.4,  apMult: 1.75, armorBonus: 30, mrBonus: 25 },
  swablu:     { megaDex: 10067, name: "Mega Altaria",     hpMult: 1.5,  adMult: 1.4,  apMult: 1.6,  armorBonus: 25, mrBonus: 30, addType: "fairy" },
  shuppet:    { megaDex: 10056, name: "Mega Banette",     hpMult: 1.4,  adMult: 1.7,  apMult: 1.55, armorBonus: 20, mrBonus: 20 },
  absol:      { megaDex: 10057, name: "Mega Absol",       hpMult: 1.4,  adMult: 1.8,  apMult: 1.45, armorBonus: 20, mrBonus: 20 },
  snorunt:    { megaDex: 10074, name: "Mega Glalie",      hpMult: 1.5,  adMult: 1.6,  apMult: 1.5,  armorBonus: 25, mrBonus: 25 },
  salamence:  { megaDex: 10089, name: "Mega Salamence",   hpMult: 1.55, adMult: 1.75, apMult: 1.5,  armorBonus: 30, mrBonus: 25 },
  metagross:  { megaDex: 10076, name: "Mega Metagross",   hpMult: 1.6,  adMult: 1.65, apMult: 1.55, armorBonus: 40, mrBonus: 30 },
  latias:     { megaDex: 10062, name: "Mega Latias",      hpMult: 1.55, adMult: 1.35, apMult: 1.8,  armorBonus: 30, mrBonus: 35 },
  latios:     { megaDex: 10063, name: "Mega Latios",      hpMult: 1.45, adMult: 1.45, apMult: 1.85, armorBonus: 20, mrBonus: 30 },
  rayquaza:   { megaDex: 10079, name: "Mega Rayquaza",    hpMult: 1.6,  adMult: 1.8,  apMult: 1.8,  armorBonus: 30, mrBonus: 30 },
  // ── Gen 4 ──
  buneary:    { megaDex: 10088, name: "Mega Lopunny",     hpMult: 1.4,  adMult: 1.8,  apMult: 1.35, armorBonus: 20, mrBonus: 20, addType: "fighting" },
  riolu:      { megaDex: 10059, name: "Mega Lucario",     hpMult: 1.4,  adMult: 1.75, apMult: 1.6,  armorBonus: 20, mrBonus: 20 },
  snover:     { megaDex: 10060, name: "Mega Abomasnow",   hpMult: 1.6,  adMult: 1.55, apMult: 1.55, armorBonus: 30, mrBonus: 25 },
  garchomp:   { megaDex: 10058, name: "Mega Garchomp",    hpMult: 1.6,  adMult: 1.75, apMult: 1.5,  armorBonus: 30, mrBonus: 25 },
  // ── Gen 5 / 6 ──
  audino:     { megaDex: 10069, name: "Mega Audino",      hpMult: 1.7,  adMult: 1.3,  apMult: 1.5,  armorBonus: 35, mrBonus: 35, addType: "fairy" },
  diancie:    { megaDex: 10075, name: "Mega Diancie",     hpMult: 1.45, adMult: 1.6,  apMult: 1.75, armorBonus: 30, mrBonus: 30 },
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
