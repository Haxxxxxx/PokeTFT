import type { UnitDef } from "../types";
import { COMPLETED, type ItemDef, type ItemEffect } from "./items";
import { archetypeOf, type Archetype } from "./mons";

/**
 * Which items are actually worth building on a given mon.
 *
 * The detail panel used to spend its tallest block on a type-effectiveness
 * chart: eighteen type chips restating the Pokémon type table, which does not
 * change, is not specific to the mon you are looking at, and answers a
 * question nobody asks mid-round. What you actually want to know, holding a
 * component and looking at a unit, is "does this go here".
 *
 * The scoring is deliberately derived from the SAME numbers the game balances
 * on — the three role metrics in mons.ts (auto DPS, ability DPS, effective HP)
 * — rather than a hand-written list of "good items for tanks". Two reasons:
 * a hand-written table silently rots the moment an item's stats are retuned,
 * and it cannot answer for the 600+ mons nobody hand-classified.
 *
 * The model, stated plainly so it can be argued with:
 *
 *   1. Recompute the unit's three metrics as if it held the item, using the
 *      engine's own formulas (mitigation is 100/(100+armor), crit is 20% for
 *      1.5x before items — see combat.ts).
 *   2. Collapse them into one number with a Cobb-Douglas utility,
 *      V = damage^a * survival^(1-a), which rewards a balanced gain over a
 *      lopsided one. `a` comes from the mon's archetype: a carry converts
 *      damage into wins, a tank converts staying alive into wins.
 *   3. Score = how much the item raises V, in percent. Rank, take the top few.
 *
 * It is an opinion, not an oracle — but it is an opinion computed from the
 * unit's real statline, and it moves when the balance moves.
 */

/** Engine constants, mirrored from combat.ts. Kept here as named values so the
 *  model reads as the formula it is rather than as magic numbers. */
const BASE_CRIT = 0.2;
const CRIT_MULT = 1.5;
/** Mana gained per auto-attack, used to turn attack speed into cast frequency. */
const MANA_PER_ATTACK = 10;
/**
 * The armor we assume on the thing being hit, for valuing armor penetration.
 * Pen is worth nothing against a target with no armor and a great deal against
 * a frontliner, so it has to be scored against SOME assumed target; this is
 * roughly a mid-cost frontliner. Stated rather than hidden, because it is the
 * one number here that is a judgement call instead of a measurement.
 */
const TARGET_ARMOR_REF = 45;
/** How long a fight runs, for converting per-second effects (regen, lifesteal)
 *  into a share of effective HP. */
const FIGHT_SECONDS = 12;

/** Damage's share of the utility, by archetype. The remainder goes to survival. */
const DAMAGE_WEIGHT: Record<Archetype, number> = {
  physical: 0.75,
  mage: 0.75,
  tank: 0.3,
};

/**
 * Melee units are focused first and fight inside everything; a ranged unit
 * sits behind the line and converts its stats straight into damage. So the
 * same archetype wants a different balance depending on where it stands, and
 * without this the model could not tell a melee carry from a ranged one —
 * it returned the same three items for both.
 */
function damageWeightFor(def: UnitDef): number {
  const base = DAMAGE_WEIGHT[archetypeOf(def)];
  const adj = def.stats.range > 1 ? 0.06 : -0.1;
  return Math.max(0.2, Math.min(0.85, base + adj));
}

export type AdviceAxis = "offense" | "ability" | "survive" | "sustain" | "tempo";

export type ItemAdvice = {
  item: ItemDef;
  /** Percent improvement to the unit's combat utility. */
  gain: number;
  /** Which axis the item mainly moves, for a one-word explanation in the UI. */
  axis: AdviceAxis;
};

type Metrics = { auto: number; ability: number; ehp: number; sustain: number };

function metricsFor(def: UnitDef, star: number, e: ItemEffect): Metrics {
  const s = def.stats;
  const i = Math.max(0, Math.min(2, star - 1));

  const ad = s.ad[i] * (e.adMult ?? 1);
  const hp = s.hp[i] * (e.hpMult ?? 1);
  const power = (def.move?.power?.[i] ?? 0) * (e.apMult ?? 1);
  const attackSpeed = s.attackSpeed * (e.asMult ?? 1);
  const armor = s.armor + (e.armorAdd ?? 0);
  const mr = s.magicResist + (e.mrAdd ?? 0);

  // Crit lifts auto damage only — abilities do not crit in this engine.
  const crit = Math.min(1, BASE_CRIT + (s.critAdd ?? 0) + (e.critAdd ?? 0));
  const critFactor = 1 + crit * (CRIT_MULT - 1);

  // Armor pen raises damage actually landed on an armoured target.
  const pen = e.armorPen ?? 0;
  const penFactor = (TARGET_ARMOR_REF + 100) / (TARGET_ARMOR_REF * (1 - pen) + 100);

  const auto = ad * attackSpeed * critFactor * penFactor;

  // Mana items shorten the cast cycle two ways, and the two are NOT the same
  // shape: more mana per swing speeds up every cast, while a head start on the
  // bar only buys the FIRST one. Treating a head start as if it shortened
  // every cast made Spirit Orb (+30 start mana) look like a 110% upgrade on
  // Abra and top the list for every caster in the game — it is good, but it is
  // not that. So the casts are counted over an actual fight and averaged.
  const manaPerAttack = MANA_PER_ATTACK + (e.manaPerAttack ?? 0);
  const manaPerSec = attackSpeed * manaPerAttack;
  let castsPerSec = 0;
  if (s.maxMana > 0 && manaPerSec > 0) {
    const toFirst = Math.max(0, s.maxMana - s.startMana - (e.manaStart ?? 0)) / manaPerSec;
    const perCast = s.maxMana / manaPerSec;
    const casts = toFirst > FIGHT_SECONDS ? 0 : 1 + (FIGHT_SECONDS - toFirst) / perCast;
    castsPerSec = casts / FIGHT_SECONDS;
  }
  const ability = power * castsPerSec * penFactor;

  const ehp = hp * (1 + (armor + mr) / 100);

  // Healing is survival you earn rather than carry: lifesteal scales with what
  // you deal, regen with what you have. Both are expressed as extra effective
  // HP over a fight so they can be compared against armour on equal terms.
  const lifeSteal = (e.lifeSteal ?? 0) * (auto + ability) * FIGHT_SECONDS;
  const regen = (e.regenPerSec ?? 0) * hp * FIGHT_SECONDS;
  // A one-shot save is worth roughly the HP it refuses to lose.
  const sash = e.sash ? hp * 0.5 : 0;
  // Thorns is damage, but it is damage you only get by being hit, so it counts
  // toward the durability side of the ledger rather than the damage side.
  const thorns = (e.thornsPct ?? 0) * hp * 2;
  const sustain = lifeSteal + regen + sash + thorns;

  return { auto, ability, ehp, sustain };
}

function utility(m: Metrics, w: number): number {
  const damage = Math.max(1e-6, m.auto + m.ability);
  const survival = Math.max(1e-6, m.ehp + m.sustain);
  return Math.pow(damage, w) * Math.pow(survival, 1 - w);
}

/** The axis an item mainly moves, picked by which metric it raised most. */
function axisOf(base: Metrics, next: Metrics, e: ItemEffect): AdviceAxis {
  const dAuto = next.auto / base.auto - 1;
  const dAbility = base.ability > 0 ? next.ability / base.ability - 1 : 0;
  const dEhp = next.ehp / base.ehp - 1;
  const dSustain = next.sustain - base.sustain;
  // Mana is called out by name because "tempo" is the reason you take it: the
  // stats on a mana item are ordinary, the earlier cast is the point.
  if ((e.manaPerAttack ?? 0) > 0 || (e.manaStart ?? 0) > 0) return "tempo";
  if (dSustain > 0 && dSustain > base.ehp * 0.25) return "sustain";
  const best = Math.max(dAuto, dAbility, dEhp);
  if (best === dEhp) return "survive";
  if (best === dAbility) return "ability";
  return "offense";
}

/**
 * Rank the completed items for this unit at this star.
 *
 * `pool` is the lobby's enabled item list (rules.itemsEnabled). Recommending
 * an item the lobby has switched off would be worse than recommending nothing
 * — it is advice the player cannot act on.
 */
export function recommendedItems(
  def: UnitDef,
  star: number,
  opts?: { pool?: string[] | null; limit?: number },
): ItemAdvice[] {
  const limit = opts?.limit ?? 3;
  const allowed = opts?.pool && opts.pool.length > 0 ? new Set(opts.pool) : null;
  const candidates = COMPLETED.filter((it) => !allowed || allowed.has(it.id));
  if (candidates.length === 0) return [];

  const w = damageWeightFor(def);
  const base = metricsFor(def, star, {});
  const baseV = utility(base, w);

  const ranked = candidates
    .map((item) => {
      const next = metricsFor(def, star, item.effect);
      return { item, gain: utility(next, w) / baseV - 1, axis: axisOf(base, next, item.effect) };
    })
    // Stable: ties resolve by id, so the same mon always lists the same items
    // in the same order rather than shuffling between renders.
    .sort((a, b) => b.gain - a.gain || a.item.id.localeCompare(b.item.id));

  // Taking the raw top three produced ONE answer for the whole roster: 195 of
  // 569 mons listed the same attack-speed trio, because attack speed feeds
  // both autos and mana and so wins almost everywhere. That is a true thing
  // about the balance, and useless as advice — a panel that says the same
  // words on every unit is a panel nobody reads twice.
  //
  // So: the best item outright, then the best from each axis not yet shown.
  // The top pick stays honest, and the rest answer "what if I want to go
  // defensive / sustain / tempo on this mon instead", which is the actual
  // question when you are holding one component and deciding where it goes.
  const picks: ItemAdvice[] = [];
  const axesUsed = new Set<AdviceAxis>();
  for (const r of ranked) {
    if (picks.length >= limit) break;
    if (axesUsed.has(r.axis)) continue;
    picks.push(r);
    axesUsed.add(r.axis);
  }
  // Fewer distinct axes than slots (a narrow lobby item pool): top up by score.
  for (const r of ranked) {
    if (picks.length >= limit) break;
    if (!picks.includes(r)) picks.push(r);
  }
  return picks.slice(0, limit);
}
