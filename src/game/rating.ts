/**
 * Pure ranked-rating math — NO Firebase / IO imports, so it can be shared by the client
 * (`net/users.ts`) AND the authoritative match loop (`net/match.ts`, which also runs in
 * Cloud Functions). Keep this module dependency-free; all DB writes live in the callers.
 *
 * See docs/server-authoritative-rating-design.md.
 */

/** Everyone starts here; placement nudges it up/down each game. (Silver II) */
export const START_RATING = 1000;

export const RANK_TIERS = [
  { name: "Iron", color: "#9ca3af" },
  { name: "Bronze", color: "#b45309" },
  { name: "Silver", color: "#cbd5e1" },
  { name: "Gold", color: "#fbbf24" },
  { name: "Platinum", color: "#22d3ee" },
  { name: "Diamond", color: "#60a5fa" },
];
const ROMAN = ["", "I", "II", "III", "IV"];
export const RATING_PER_DIV = 100;          // 100 "LP" per division
export const APEX_RATING = RANK_TIERS.length * 4 * RATING_PER_DIV; // 2400 → Master
/** Master accent (the apex tier above Diamond I). */
export const MASTER_COLOR = "#c084fc";

export type Rank = { tier: string; division: number; lp: number; lpMax: number; color: string; label: string; apex: boolean };

/** Map a continuous rating to a TFT-style tier + division + LP, with a promotion
 *  threshold of 100 LP per division (Iron IV … Diamond I, then open-ended Master). */
export function rankOf(rating: number): Rank {
  const r = Math.max(0, rating);
  if (r >= APEX_RATING) {
    return { tier: "Master", division: 0, lp: Math.round(r - APEX_RATING), lpMax: 0, color: MASTER_COLOR, label: "Master", apex: true };
  }
  const band = Math.floor(r / RATING_PER_DIV);   // 0..23
  const tier = RANK_TIERS[Math.floor(band / 4)];
  const division = 4 - (band % 4);               // IV(4) … I(1)
  return { tier: tier.name, division, lp: Math.round(r % RATING_PER_DIV), lpMax: RATING_PER_DIV, color: tier.color, label: `${tier.name} ${ROMAN[division]}`, apex: false };
}

/** Rating delta for a finished game: linear by placement around the midpoint, so 1st
 *  gains the most and last loses the most, scaled to the lobby size. */
export function ratingDelta(place: number, players: number): number {
  const mid = (players + 1) / 2;
  return Math.round((mid - place) * 8);
}

/** How much LP a bot opponent is worth relative to a human. Beating (or losing to) bots
 *  still moves your rating so practice isn't pointless — but at a fraction of a real game,
 *  so the ladder stays meaningful. 1 human + 7 bots → ~35% of a full lobby's swing. */
export const BOT_LP_WEIGHT = 0.35;

/** Weighted rating delta for a mixed human/bot lobby. Placement is computed over ALL
 *  players (bots included — they're real opponents on the board), but the resulting swing
 *  is scaled by how human the lobby was: human opponents pull full weight, bots pull
 *  BOT_LP_WEIGHT. A pure-human lobby is unchanged; a pure-bot lobby gives partial LP. */
export function weightedRatingDelta(place: number, players: number, humanOpponents: number, botOpponents: number): number {
  const raw = ratingDelta(place, players);
  const opponents = humanOpponents + botOpponents;
  if (opponents <= 0) return 0; // nobody to play against → no rating change
  const weight = (humanOpponents + botOpponents * BOT_LP_WEIGHT) / opponents;
  return Math.round(raw * weight);
}
