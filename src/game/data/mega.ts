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
};

export function megaFormFor(defId: string): MegaForm | undefined {
  return MEGA_FORMS[defId];
}

export function canMega(defId: string): boolean {
  return defId in MEGA_FORMS;
}

export function hasMegaStone(items: string[]): boolean {
  return items.includes(MEGA_STONE);
}

/** A mon Mega-evolves when it is mega-capable AND holds a Mega Stone. */
export function isMegaActive(defId: string, items: string[]): boolean {
  return canMega(defId) && hasMegaStone(items);
}
