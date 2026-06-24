/** Game modes — TFT-style presets selectable in the lobby. A mode is a bundle of rule
 *  overrides + engine flags that the host round loop and the client both read from the
 *  room's `rules.mode`. Everything here is pure data + deterministic helpers so host and
 *  clients always agree (combat determinism).
 *
 *  Two families:
 *   • REGION modes — lock the roster to one region and hand every trainer that region's
 *     signature synergy (a trait Emblem) + a signature item, so each region plays with
 *     its own identity.
 *   • GIMMICK modes — rule twists: Mono-Type, Mega Madness, Treasure Hunt, Double Up,
 *     Hyper Roll (fast games, cost 1-3 only, 50 HP), Legendary Clash (cost 4-5 only,
 *     150 HP), and Nuzlocke (units that die are permanently lost). */

import type { PokeType } from "../types";
import type { TeamBuff } from "../engine/combat";
import { GEN_DEX_RANGES, GEN_LABELS } from "./generations";
import { unitsForGenerations, getDef, rosterForGenerations } from "./mons";
import { MEGA_STONE } from "./mega";

export type GameModeFlags = {
  /** Roster locked to a single (seeded) type for the whole lobby. */
  monoType?: boolean;
  /** Every trainer starts with a Mega Stone and gets a fresh one every round. */
  megaMadness?: boolean;
  /** PvE rounds drop richer loot (more gold, more frequent free units/items). */
  treasure?: boolean;
  /** 2v2: players pair into teams sharing ONE HP pool; combat pairs across teams. */
  doubleUp?: boolean;
  /** Fast-paced mode: shop restricted to cost 1-3 units only. */
  hyperRoll?: boolean;
  /** Elite mode: shop restricted to cost 4-5 units only. */
  legendaryClash?: boolean;
  /** Permadeath: units that die in combat are permanently lost after the round. */
  nuzlocke?: boolean;
  /** PvE loot multiplier override (stacks on top of the base treasure flag). */
  lootScale?: number;
};

export type GameMode = {
  id: string;
  name: string;
  nameFr: string;
  desc: string;
  descFr: string;
  /** "Standard" | "Region" | "Gimmick" — for grouping in the lobby. */
  group: "standard" | "region" | "gimmick";
  /** Accent colour for the lobby chip. */
  color: string;
  /** Rule overrides forced when this mode is picked (e.g. a region forces its gen). */
  rulesPatch?: { generations?: number[]; draftPoolSize?: number; startingHp?: number };
  /** Engine behaviour flags. */
  flags?: GameModeFlags;
  /** Region signature: the gen it locks, the synergy Emblem + item every trainer gets. */
  region?: number;
  signatureType?: PokeType;
  signatureItem?: string;
  /** Region modifier — a passive team-wide combat buff folded in every fight (identity). */
  modifier?: TeamBuff;
  /** Short label for the modifier shown in the lobby/HUD. */
  modifierLabel?: string;
  modifierLabelFr?: string;
  /** Region augment id guaranteed in the augment offering (see data/augments.ts). */
  signatureAugment?: string;
  /** The region's signature legendary — appears as a scaling boss on recurring PvE rounds. */
  bossId?: string;
  bossName?: string;
};

/** Per-region identity: signature synergy type (→ Emblem), thematic starting item, a passive
 *  team modifier (combat buff), a signature augment, and a legendary PvE boss. */
const REGION_SIGNATURE: Record<number, {
  type: PokeType; item: string; tag: string;
  modifier: TeamBuff; modLabel: string; modLabelFr: string;
  augment: string; boss: string; bossName: string;
}> = {
  1: { type: "fire",     item: "choice-band",  tag: "Kanto",  modifier: { adMult: 1.08 },              modLabel: "Aggression: +8% Attack",      modLabelFr: "Agression : +8% Attaque",       augment: "sig-kanto",  boss: "mewtwo",   bossName: "Mewtwo" },
  2: { type: "electric", item: "choice-scarf", tag: "Johto",  modifier: { asMult: 1.10 },              modLabel: "Tempo: +10% Attack Speed",    modLabelFr: "Tempo : +10% Vitesse",          augment: "sig-johto",  boss: "lugia",    bossName: "Lugia" },
  3: { type: "water",    item: "archmage",     tag: "Hoenn",  modifier: { manaStart: 12 },             modLabel: "Downpour: +12 start mana",    modLabelFr: "Averse : +12 mana de départ",   augment: "sig-hoenn",  boss: "rayquaza", bossName: "Rayquaza" },
  4: { type: "steel",    item: "aegis",        tag: "Sinnoh", modifier: { armorAdd: 12, mrAdd: 12 },   modLabel: "Fortify: +12 Armor & MR",     modLabelFr: "Fortifié : +12 Déf & Déf Spé",  augment: "sig-sinnoh", boss: "dialga",   bossName: "Dialga" },
  5: { type: "dragon",   item: "light-ball",   tag: "Unova",  modifier: { adMult: 1.06, apMult: 1.06 },modLabel: "Ideals: +6% Attack & AP",     modLabelFr: "Idéaux : +6% Attaque & Att.Spé",augment: "sig-unova",  boss: "reshiram", bossName: "Reshiram" },
  6: { type: "fairy",    item: "sage-ward",    tag: "Kalos",  modifier: { hpMult: 1.10 },              modLabel: "Bond: +10% Health",           modLabelFr: "Lien : +10% PV",                augment: "sig-kalos",  boss: "xerneas",  bossName: "Xerneas" },
  7: { type: "psychic",  item: "jeweled-lens", tag: "Alola",  modifier: { apMult: 1.10 },              modLabel: "Aura: +10% Ability Power",    modLabelFr: "Aura : +10% Att. Spé",          augment: "sig-alola",  boss: "solgaleo", bossName: "Solgaleo" },
  8: { type: "fighting", item: "titan-fist",   tag: "Galar",  modifier: { adMult: 1.06, critAdd: 0.12 },modLabel: "Dynamax: +6% Attack, +12% Crit", modLabelFr: "Dynamax : +6% Attaque, +12% Crit", augment: "sig-galar", boss: "zacian",  bossName: "Zacian" },
  9: { type: "dragon",   item: "adamant-edge", tag: "Paldea", modifier: { lifeSteal: 0.10 },           modLabel: "Paradox: 10% lifesteal",      modLabelFr: "Paradoxe : 10% vol de vie",     augment: "sig-paldea", boss: "koraidon", bossName: "Koraidon" },
};

function regionMode(gen: number): GameMode {
  const sig = REGION_SIGNATURE[gen];
  return {
    id: `region-${gen}`,
    name: `${sig.tag} Clash`,
    nameFr: `Duel ${sig.tag}`,
    desc: `Only ${sig.tag} mons. Start with a ${sig.type} Emblem + signature item, a region modifier (${sig.modLabel}), and face ${sig.bossName} as a boss.`,
    descFr: `Uniquement des ${sig.tag}. Emblème ${sig.type} + objet signature, un modificateur de région (${sig.modLabelFr}), et ${sig.bossName} en boss.`,
    group: "region",
    color: "#22d3ee",
    rulesPatch: { generations: [gen], draftPoolSize: 9999 }, // full region (capped to its pool)
    region: gen,
    signatureType: sig.type,
    signatureItem: sig.item,
    modifier: sig.modifier,
    modifierLabel: sig.modLabel,
    modifierLabelFr: sig.modLabelFr,
    signatureAugment: sig.augment,
    bossId: sig.boss,
    bossName: sig.bossName,
  };
}

export const MODES: GameMode[] = [
  {
    id: "standard",
    name: "Standard", nameFr: "Standard",
    desc: "Classic 8-player Teamfight Tactics.", descFr: "Le Teamfight Tactics classique à 8 joueurs.",
    group: "standard", color: "#fbbf24",
  },
  // ── Region modes ──
  ...Object.keys(GEN_DEX_RANGES).map(Number).map(regionMode),
  // ── Gimmick modes ──
  {
    id: "monotype",
    name: "Mono-Type", nameFr: "Mono-Type",
    desc: "The whole lobby shares ONE random type — pure synergy chaos.",
    descFr: "Tout le lobby partage UN seul type aléatoire — chaos de synergie pur.",
    group: "gimmick", color: "#a78bfa", flags: { monoType: true },
  },
  {
    id: "mega-madness",
    name: "Mega Madness", nameFr: "Folie Méga",
    desc: "Start with a Mega Stone and get a fresh one every round.",
    descFr: "Démarre avec une Méga-Gemme et reçois-en une nouvelle chaque tour.",
    group: "gimmick", color: "#e879f9", flags: { megaMadness: true },
  },
  {
    id: "treasure",
    name: "Treasure Hunt", nameFr: "Chasse au Trésor",
    desc: "PvE rounds shower you with extra gold, items and free units.",
    descFr: "Les tours PvE vous comblent d'or, d'objets et d'unités gratuites.",
    group: "gimmick", color: "#fbbf24", flags: { treasure: true },
  },
  {
    id: "double-up",
    name: "Double Up (2v2)", nameFr: "Duo (2c2)",
    desc: "Pair into teams of 2 sharing one HP bar. Fight across teams — last team standing wins.",
    descFr: "Formez des équipes de 2 partageant une barre de PV. Combattez entre équipes — la dernière debout gagne.",
    group: "gimmick", color: "#34d399", flags: { doubleUp: true },
  },
  {
    id: "hyper-roll",
    name: "Hyper Roll", nameFr: "Hyper Roulette",
    desc: "Faster rounds. Smaller boards. The best team at the right time wins.",
    descFr: "Tours plus rapides. Équipes plus petites. La meilleure équipe au bon moment gagne.",
    group: "gimmick", color: "#f472b6",
    rulesPatch: { startingHp: 50, draftPoolSize: 25 },
    flags: { hyperRoll: true, lootScale: 1.5 },
  },
  {
    id: "legendary-clash",
    name: "Legendary Clash", nameFr: "Clash Légendaire",
    desc: "Only powerful Pokémon. Every fight is a clash of legends.",
    descFr: "Uniquement des Pokémon puissants. Chaque combat est un choc de légendes.",
    group: "gimmick", color: "#a78bfa",
    rulesPatch: { startingHp: 150 },
    flags: { legendaryClash: true, lootScale: 1.5 },
  },
  {
    id: "nuzlocke",
    name: "Nuzlocke", nameFr: "Nuzlocke",
    desc: "If a Pokémon faints in combat, it's gone forever. Choose every battle wisely.",
    descFr: "Si un Pokémon tombe au combat, il est perdu pour toujours. Chaque combat compte.",
    group: "gimmick", color: "#ef4444",
    flags: { nuzlocke: true },
  },
];

export const MODE_BY_ID: Record<string, GameMode> = Object.fromEntries(MODES.map((m) => [m.id, m]));

/** Resolve a mode id to its definition, defaulting to Standard. */
export function getMode(id: string | undefined | null): GameMode {
  return (id && MODE_BY_ID[id]) || MODE_BY_ID["standard"];
}

/** Deterministically pick the Mono-Type type for a lobby: among the types in the
 *  selected gens that have enough depth (≥14 units) to actually field a board, chosen
 *  by the room seed so host + clients agree. */
export function pickMonoType(gens: number[], seed: number): PokeType {
  const counts = new Map<PokeType, number>();
  for (const id of unitsForGenerations(gens)) {
    for (const t of getDef(id).types) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const viable = [...counts.entries()].filter(([, n]) => n >= 14).map(([t]) => t).sort();
  const pool = viable.length ? viable : [...counts.keys()].sort();
  return pool[seed % pool.length] ?? "normal";
}

type RoomRulesLike = { generations?: number[]; draftPoolSize?: number; mode?: string };

/** The final playable roster for a room — applies Mono-Type filtering on top of the
 *  region draft. Host (match.ts) and client (NetGameClient) BOTH call this with the same
 *  seed so their pools are identical. */
export function rosterForRoom(rules: RoomRulesLike | undefined, seed: number): string[] {
  const gens = rules?.generations ?? [1];
  const mode = getMode(rules?.mode);
  if (mode.flags?.monoType) {
    const type = pickMonoType(gens, seed);
    const ids = unitsForGenerations(gens).filter((id) => getDef(id).types.includes(type));
    if (ids.length >= 8) return ids; // the whole mono-type pool (already small — no further draft)
  }
  return rosterForGenerations(gens, rules?.draftPoolSize, seed);
}

/** Items every trainer receives at the START of a fresh game in this mode (region
 *  signature Emblem + item, or a Mega Stone for Mega Madness). */
export function modeStartItems(rules: RoomRulesLike | undefined): string[] {
  const mode = getMode(rules?.mode);
  const out: string[] = [];
  if (mode.signatureType) out.push(`emblem-${mode.signatureType}`);
  if (mode.signatureItem) out.push(mode.signatureItem);
  if (mode.flags?.megaMadness) out.push(MEGA_STONE);
  return out;
}

/** An item granted to every trainer EACH round in this mode (Mega Madness), or null. */
export function modeRoundItem(rules: RoomRulesLike | undefined): string | null {
  return getMode(rules?.mode).flags?.megaMadness ? MEGA_STONE : null;
}

/** PvE loot multiplier for the mode (Treasure Hunt pours out more; other modes may set a
 *  custom lootScale flag). */
export function modeLootScale(rules: RoomRulesLike | undefined): number {
  const flags = getMode(rules?.mode).flags;
  if (flags?.treasure) return 2.5;
  return flags?.lootScale ?? 1;
}

/** The region modifier's team-wide combat buff (folded into every fight in a Region
 *  Clash mode), or undefined. Caps mirror the augment fold so it can't be over-tuned. */
export function modeTeamBuff(rules: RoomRulesLike | undefined): TeamBuff | undefined {
  const m = getMode(rules?.mode).modifier;
  if (!m) return undefined;
  return { ...m };
}

/** The region's signature augment id (guaranteed in the offering), or null. */
export function modeSignatureAugment(rules: RoomRulesLike | undefined): string | null {
  return getMode(rules?.mode).signatureAugment ?? null;
}

/** The region's signature completed item, added to the carousel item pool (themed
 *  carousel), or null. */
export function modeCarouselItem(rules: RoomRulesLike | undefined): string | null {
  return getMode(rules?.mode).signatureItem ?? null;
}

/** The region's PvE boss legendary id (recurring PvE rounds), or null. */
export function modeBossId(rules: RoomRulesLike | undefined): string | null {
  return getMode(rules?.mode).bossId ?? null;
}

/** The region's PvE boss display name, or "Boss". */
export function modeBossName(rules: RoomRulesLike | undefined): string {
  return getMode(rules?.mode).bossName ?? "Boss";
}

/** True if this room is a 2v2 Double Up game. */
export function isDoubleUp(rules: RoomRulesLike | undefined): boolean {
  return !!getMode(rules?.mode).flags?.doubleUp;
}

/** True if the shop should be restricted to cost 1-3 units (Hyper Roll). */
export function isHyperRoll(rules: RoomRulesLike | undefined): boolean {
  return !!getMode(rules?.mode).flags?.hyperRoll;
}

/** True if the shop should be restricted to cost 4-5 units (Legendary Clash). */
export function isLegendaryClash(rules: RoomRulesLike | undefined): boolean {
  return !!getMode(rules?.mode).flags?.legendaryClash;
}

/** True if units that die in combat are permanently removed (Nuzlocke). */
export function isNuzlocke(rules: RoomRulesLike | undefined): boolean {
  return !!getMode(rules?.mode).flags?.nuzlocke;
}

/** Pair players into deterministic teams of 2 (sorted by uid so host + clients agree).
 *  Returns a map uid → teamId (0,1,2,…). A trailing odd player forms a solo team. */
export function assignTeams(uids: string[]): Record<string, number> {
  const sorted = [...uids].sort();
  const out: Record<string, number> = {};
  for (let i = 0; i < sorted.length; i++) out[sorted[i]] = Math.floor(i / 2);
  return out;
}
