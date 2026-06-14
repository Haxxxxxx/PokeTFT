import { ECONOMY, streakGold, buyCost, type Cost } from "../config";
import { getDef } from "../data/mons";

/** Interest = +1 per 10 banked gold, capped. */
export function interest(gold: number): number {
  return Math.min(Math.floor(gold / ECONOMY.interestPer), ECONOMY.interestCap);
}

/** Total gold awarded at the end of a round. */
export function roundIncome(gold: number, streak: number): number {
  return ECONOMY.baseIncome + interest(gold) + streakGold(streak);
}

/** Sell value: full price for a ⭐ single; multi-star/copies refund cost*copies - 1. */
export function sellValue(defId: string, star: number): number {
  const cost = getDef(defId).cost as Cost;
  const copies = star === 1 ? 1 : star === 2 ? 3 : 9;
  const raw = buyCost(cost) * copies;
  // 1-cost units refund full; higher tiers lose 1 gold once upgraded (TFT convention).
  return cost === 1 || star === 1 ? raw : raw - 1;
}
