import type { Cost } from "./config";
import type { PokeType } from "./types";

/** Border/glow color per cost tier (TFT-style rarity colors). */
export const COST_COLOR: Record<Cost, string> = {
  1: "#9aa4b2", // gray
  2: "#3fb950", // green
  3: "#2f81f7", // blue
  4: "#bc6cff", // purple
  5: "#f5b400", // gold
};

/** Background tint per Pokémon type, for trait badges. */
export const TYPE_COLOR: Record<PokeType, string> = {
  normal: "#9099a1", fire: "#ff7b3d", water: "#4d90d5", electric: "#f4d23c",
  grass: "#63bb5b", ice: "#74cec0", fighting: "#ce4069", poison: "#ab6ac8",
  ground: "#d97746", flying: "#8fa8dd", psychic: "#f97176", bug: "#90c12c",
  rock: "#c7b78b", ghost: "#5269ac", dragon: "#0a6dc4", dark: "#5a5366",
  steel: "#5a8ea1", fairy: "#ec8fe6",
};

/** Glyph per trait (link) — types + role traits. Used by the synergy UI. */
export const TRAIT_ICON: Record<string, string> = {
  // types
  normal: "●", fire: "🔥", water: "💧", electric: "⚡", grass: "🌿", ice: "❄",
  fighting: "🥊", poison: "☠", ground: "⛰", flying: "🪶", psychic: "🌀", bug: "🐛",
  rock: "🪨", ghost: "👻", dragon: "🐉", dark: "🌑", steel: "⚙", fairy: "✦",
  // roles
  starter: "🌱", evolver: "🔄", swarm: "🐝", eeveelution: "🦊", fossil: "🦴",
  "pseudo-legendary": "💎", legendary: "🦅", "kanto-mythic": "🧬", mythic: "🌟",
};
