/**
 * PokéTFT — core game constants.
 * Numbers cloned from live Teamfight Tactics (verified) and adapted for Pokémon.
 * Everything that affects balance lives here so we can tune in one place.
 */

export const ECONOMY = {
  baseIncome: 5,
  /** +1 gold per 10 banked, capped. */
  interestPer: 10,
  interestCap: 5,
  /** XP gained passively at the start of each round (from Stage 2). */
  passiveXpPerRound: 2,
  /** Buy 4 XP for 4 gold. */
  buyXpCost: 4,
  buyXpAmount: 4,
  rerollCost: 2,
  shopSlots: 5,
  startingGold: 0,
  startingHealth: 100,
} as const;

/** Win/loss streak → bonus gold. Index by abs(streak length). */
export function streakGold(streak: number): number {
  const s = Math.abs(streak);
  if (s >= 5) return 3;
  if (s >= 4) return 2;
  if (s >= 2) return 1;
  return 0;
}

/** Cumulative XP required to REACH each level. Level 1 is the start. */
export const XP_TO_REACH: Record<number, number> = {
  1: 0,
  2: 2,
  3: 8,
  4: 18,
  5: 38,
  6: 74,
  7: 122,
  8: 194,
  9: 278,
  10: 378,
};

export const MAX_LEVEL = 10;

/** Board size (units you can field) === player level. */
export function boardSizeForLevel(level: number): number {
  return level;
}

/** Cost tiers 1..5. */
export type Cost = 1 | 2 | 3 | 4 | 5;

/** Copies of each unit in the shared global bag, per cost tier. */
export const POOL_SIZE: Record<Cost, number> = {
  1: 30,
  2: 25,
  3: 18,
  4: 10,
  5: 9,
};

/** Copies needed to reach each star (3 to ⭐⭐, 9 total to ⭐⭐⭐). */
export const COPIES_TO_STAR = { 2: 3, 3: 9 } as const;
export const MAX_STAR = 3;

/** Gold cost to buy a unit === its cost tier. Sell value handled in economy.ts. */
export function buyCost(cost: Cost): number {
  return cost;
}

/**
 * Shop odds: P(slot rolls a unit of given cost) by player level.
 * Rows are levels 1..10, columns cost 1..5. Each row sums to 100.
 */
export const SHOP_ODDS: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 35, 15, 1],
  8: [18, 25, 32, 22, 3],
  9: [10, 20, 25, 35, 10],
  10: [5, 10, 20, 40, 25],
};

/**
 * Round structure per stage:
 * X-1,2,3 PvP · X-4 carousel · X-5,6 PvP · X-7 PvE.
 * Stage 1 is the opening creep rounds + first carousel.
 */
export type RoundKind = "pvp" | "pve" | "carousel";

export function roundKind(stage: number, round: number): RoundKind {
  if (stage === 1) {
    // 1-1..1-3 PvE creeps, 1-4 carousel
    return round === 4 ? "carousel" : "pve";
  }
  if (round === 4) return "carousel";
  if (round === 7) return "pve";
  return "pvp";
}

/** HP damage taken on a lost PvP round = stageBase + surviving enemy units. */
export const STAGE_BASE_DAMAGE: Record<number, number> = {
  1: 0,
  2: 0,
  3: 2,
  4: 5,
  5: 8,
  6: 12,
  7: 16,
};

export function stageBaseDamage(stage: number): number {
  return STAGE_BASE_DAMAGE[stage] ?? 18;
}

/** Board geometry — each player owns a 7-wide x 4-deep hex grid. */
export const BOARD = {
  cols: 7,
  rows: 4,
} as const;
