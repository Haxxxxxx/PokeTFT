/** Game modes — TFT-style presets selectable in the lobby. A mode is a bundle of rule
 *  overrides + engine flags that the host round loop and the client both read from the
 *  room's `rules.mode`. Everything here is pure data + deterministic helpers so host and
 *  clients always agree (combat determinism).
 *
 *  Two families today:
 *   • REGION modes — lock the roster to one region and hand every trainer that region's
 *     signature synergy (a trait Emblem) + a signature item, so each region plays with
 *     its own identity.
 *   • GIMMICK modes — rule twists: Mono-Type, Mega Madness, Treasure Hunt.
 *
 *  Double Up (2v2) is a separate, larger effort and is intentionally NOT here yet. */

import type { PokeType } from "../types";
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
  rulesPatch?: { generations?: number[]; draftPoolSize?: number };
  /** Engine behaviour flags. */
  flags?: GameModeFlags;
  /** Region signature: the gen it locks, the synergy Emblem + item every trainer gets. */
  region?: number;
  signatureType?: PokeType;
  signatureItem?: string;
};

/** Per-region identity: signature synergy type (→ Emblem) + a thematic starting item. */
const REGION_SIGNATURE: Record<number, { type: PokeType; item: string; tag: string }> = {
  1: { type: "fire",     item: "choice-band",  tag: "Kanto" },
  2: { type: "electric", item: "choice-scarf", tag: "Johto" },
  3: { type: "water",    item: "archmage",     tag: "Hoenn" },
  4: { type: "steel",    item: "aegis",        tag: "Sinnoh" },
  5: { type: "dragon",   item: "light-ball",   tag: "Unova" },
  6: { type: "fairy",    item: "sage-ward",    tag: "Kalos" },
  7: { type: "psychic",  item: "jeweled-lens", tag: "Alola" },
  8: { type: "fighting", item: "titan-fist",   tag: "Galar" },
  9: { type: "dragon",   item: "adamant-edge", tag: "Paldea" },
};

function regionMode(gen: number): GameMode {
  const sig = REGION_SIGNATURE[gen];
  const label = GEN_LABELS[gen];
  return {
    id: `region-${gen}`,
    name: `${sig.tag} Clash`,
    nameFr: `Duel ${sig.tag}`,
    desc: `Only ${sig.tag} mons. Everyone starts with a ${sig.type} Emblem + a signature item.`,
    descFr: `Uniquement des ${sig.tag}. Chacun démarre avec un Emblème ${sig.type} + un objet signature.`,
    group: "region",
    color: "#22d3ee",
    rulesPatch: { generations: [gen], draftPoolSize: 9999 }, // full region (capped to its pool)
    region: gen,
    signatureType: sig.type,
    signatureItem: sig.item,
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

/** PvE loot multiplier for the mode (Treasure Hunt pours out more). */
export function modeLootScale(rules: RoomRulesLike | undefined): number {
  return getMode(rules?.mode).flags?.treasure ? 2.5 : 1;
}
