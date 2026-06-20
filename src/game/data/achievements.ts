/** Achievements — cosmetic badges earned from a player's real match history + rating.
 *  Computed purely client-side from data we already store (no new persistence), so they
 *  light up instantly on the profile. Each has a predicate over the player's aggregate
 *  stats, rating, and history. */

import type { GameResult } from "../net/users";
import { rankOf, RANK_TIERS } from "../net/users";

export type AchievementTier = "bronze" | "silver" | "gold" | "prismatic";

export type Achievement = {
  id: string;
  name: string;
  nameFr: string;
  desc: string;
  descFr: string;
  icon: string; // emoji glyph
  tier: AchievementTier;
};

export const ACHIEVEMENT_TIER_COLOR: Record<AchievementTier, string> = {
  bronze: "#b45309",
  silver: "#cbd5e1",
  gold: "#fbbf24",
  prismatic: "#c084fc",
};

/** Everything an achievement predicate can read. */
export type AchievementInput = {
  games: number;
  wins: number;
  topHalf: number;
  rating: number;
  history: GameResult[];
};

type Def = Achievement & { earned: (i: AchievementInput) => boolean };

/** Longest run of consecutive wins in history (history is newest-first; order-agnostic for a streak). */
function bestWinStreak(h: GameResult[]): number {
  let best = 0, cur = 0;
  for (const g of h) {
    if (g.won || g.place === 1) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

/** Index of the highest tier reached at the player's current rating (0 = Iron … Master). */
function tierIndex(rating: number): number {
  const r = rankOf(rating);
  if (r.apex) return RANK_TIERS.length; // Master
  return RANK_TIERS.findIndex((t) => t.name === r.tier);
}

const DEFS: Def[] = [
  { id: "first-win",   name: "First Victory",  nameFr: "Première Victoire", desc: "Win your first game.",                 descFr: "Gagne ta première partie.",            icon: "🏆", tier: "bronze",    earned: (i) => i.wins >= 1 },
  { id: "champion",    name: "Champion",        nameFr: "Champion",          desc: "Win 5 games.",                        descFr: "Gagne 5 parties.",                     icon: "👑", tier: "silver",    earned: (i) => i.wins >= 5 },
  { id: "conqueror",   name: "Conqueror",       nameFr: "Conquérant",        desc: "Win 20 games.",                       descFr: "Gagne 20 parties.",                    icon: "⚔️", tier: "gold",      earned: (i) => i.wins >= 20 },
  { id: "rookie",      name: "Rookie",          nameFr: "Recrue",            desc: "Play 5 games.",                       descFr: "Joue 5 parties.",                      icon: "🎮", tier: "bronze",    earned: (i) => i.games >= 5 },
  { id: "veteran",     name: "Veteran",         nameFr: "Vétéran",           desc: "Play 25 games.",                      descFr: "Joue 25 parties.",                     icon: "🎖️", tier: "silver",    earned: (i) => i.games >= 25 },
  { id: "centurion",   name: "Centurion",       nameFr: "Centurion",         desc: "Play 100 games.",                     descFr: "Joue 100 parties.",                    icon: "💯", tier: "prismatic", earned: (i) => i.games >= 100 },
  { id: "consistent",  name: "Consistent",      nameFr: "Régulier",          desc: "Finish top half in 60%+ of games (min 10).", descFr: "Top moitié dans 60%+ des parties (min 10).", icon: "📈", tier: "gold", earned: (i) => i.games >= 10 && i.topHalf / i.games >= 0.6 },
  { id: "streak-3",    name: "On Fire",         nameFr: "En Feu",            desc: "Win 3 games in a row.",               descFr: "Gagne 3 parties d'affilée.",           icon: "🔥", tier: "gold",      earned: (i) => bestWinStreak(i.history) >= 3 },
  { id: "globetrotter",name: "Globetrotter",    nameFr: "Globe-trotteur",    desc: "Play in all 9 regions.",              descFr: "Joue dans les 9 régions.",             icon: "🗺️", tier: "prismatic", earned: (i) => new Set(i.history.flatMap((g) => g.regions ?? [])).size >= 9 },
  { id: "full-board",  name: "Full House",      nameFr: "Plateau Plein",     desc: "Win with a full board (8+ units).",   descFr: "Gagne avec un plateau plein (8+ unités).", icon: "🃏", tier: "silver", earned: (i) => i.history.some((g) => (g.won || g.place === 1) && (g.team?.length ?? 0) >= 8) },
  { id: "three-star",  name: "Three-Star Chef", nameFr: "Chef Trois Étoiles", desc: "Win with a 3★ unit on board.",       descFr: "Gagne avec une unité 3★ en jeu.",      icon: "⭐", tier: "gold",      earned: (i) => i.history.some((g) => (g.won || g.place === 1) && (g.team?.some((u) => u.s >= 3) ?? false)) },
  { id: "gold-tier",   name: "Gold League",     nameFr: "Ligue Or",          desc: "Reach Gold rank.",                    descFr: "Atteins le rang Or.",                  icon: "🥇", tier: "gold",      earned: (i) => tierIndex(i.rating) >= 3 },
  { id: "diamond-tier",name: "Diamond League",  nameFr: "Ligue Diamant",     desc: "Reach Diamond rank.",                 descFr: "Atteins le rang Diamant.",             icon: "💎", tier: "prismatic", earned: (i) => tierIndex(i.rating) >= 5 },
  { id: "master-tier", name: "Master",          nameFr: "Maître",            desc: "Reach Master rank.",                  descFr: "Atteins le rang Maître.",              icon: "🌟", tier: "prismatic", earned: (i) => tierIndex(i.rating) >= RANK_TIERS.length },
];

export const ACHIEVEMENTS: Achievement[] = DEFS.map(({ earned, ...a }) => a);

/** Returns each achievement with whether the player has earned it (earned first, by tier). */
export function computeAchievements(input: AchievementInput): (Achievement & { earned: boolean })[] {
  const order: AchievementTier[] = ["prismatic", "gold", "silver", "bronze"];
  return DEFS
    .map((d) => ({ ...(({ earned, ...a }) => a)(d), earned: d.earned(input) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned) || order.indexOf(a.tier) - order.indexOf(b.tier));
}

/** The player's headline title: the highest-tier earned achievement's name (or null). */
export function topTitle(input: AchievementInput, fr: boolean): string | null {
  const order: AchievementTier[] = ["prismatic", "gold", "silver", "bronze"];
  const earned = DEFS.filter((d) => d.earned(input)).sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  const top = earned[0];
  return top ? (fr ? top.nameFr : top.name) : null;
}
