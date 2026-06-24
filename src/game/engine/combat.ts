/**
 * Deterministic, tick-based auto-battler simulation.
 * PURE: no React, no DOM, no Date/Math.random — same inputs always yield the
 * same CombatResult, so it can run client- or server-side and is unit-testable.
 *
 * Output is a list of frames the renderer replays; the sim itself is headless.
 */

import type { UnitInstance, PokeType, Move } from "../types";
import { getDef, typesForStar, castEffectOf, type CastEffect } from "../data/mons";
import { effectiveness } from "../data/typeChart";
import { isMegaActive, megaFormFor } from "../data/mega";
import { ITEM_EFFECT } from "../data/items";
import { computeTraits } from "./synergies";
import { TRAITS_BY_KEY } from "../data/traits";
import { makeRng, type Rng } from "./rng";
import { allyToField, enemyToField, neighbors, hexDistance, hexKey, type Hex } from "./hex";

const STATUS_TICKS = 24; // ~1.5s of stun/freeze (16 ticks/sec)
const BURN_TICKS = 48;   // ~3s of burn

/** Deterministic seed from the FROZEN board contents — host + every client pass
 *  identical boards into simulate(), so they all roll the same crits/status. */
function boardSeed(allies: UnitInstance[], enemies: UnitInstance[]): number {
  let h = 2166136261 >>> 0;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  // Order-independent: RTDB stores arrays as index-keyed objects and may reorder
  // them, so the host's array order can differ from a client's. We sort the
  // per-unit tokens (side-prefixed so allies≠enemies) before folding, guaranteeing
  // host and client derive an identical seed regardless of array order.
  const tokens: string[] = [];
  const collect = (side: string, list: UnitInstance[]) => {
    for (const u of list) {
      if (!u.pos) continue;
      tokens.push(`${side}|${u.iid}|${u.defId}|${u.star}|${u.pos[0]},${u.pos[1]}|${(u.items ?? []).join(",")}`);
    }
  };
  collect("A", allies);
  collect("E", enemies);
  tokens.sort();
  for (const t of tokens) mix(t);
  return h >>> 0;
}

export type Team = "ally" | "enemy";

type Combatant = {
  id: string;
  team: Team;
  defId: string;
  star: 1 | 2 | 3;
  name: string;
  dex: number;
  types: PokeType[];
  move: Move;
  hp: number;
  maxHp: number;
  ad: number;
  attackSpeed: number;
  armor: number;
  mr: number;
  range: number;
  mana: number;
  maxMana: number;
  /** Bonus mana gained per auto-attack from items (Shojin/Tear-style accelerators). */
  manaPerAttack: number;
  /** Ability-power multiplier (Mega boosts this). */
  apMult: number;
  mega: boolean;
  pos: Hex;
  atkCd: number;
  moveCd: number;
  targetId: string | null;
  alive: boolean;
  // Held-item effects (precomputed, deterministic).
  dmgMult: number;        // life-orb: +30% damage dealt
  lifeOrbSelfPct: number; // life-orb: self HP cost per attack (fraction of maxHp)
  regenPerSec: number;    // leftovers: fraction of maxHp healed per second
  thornsPct: number;      // rocky-helmet: fraction of attacker maxHp on melee contact
  sashReady: boolean;     // focus-sash: survive a lethal blow once at full HP
  // Offensive effects (from base + traits/items) — what this unit inflicts.
  critChance: number;     // chance a basic attack crits
  critMult: number;       // crit damage multiplier
  lifeStealPct: number;   // heal a fraction of damage dealt
  armorPenPct: number;    // ignore a fraction of the target's armor
  inflictBurnDps: number; // dark/fire: burn dmg/sec applied on ability hit (frac of victim maxHp)
  inflictStun: number;    // fighting: chance to stun a victim on ability hit
  inflictFreeze: number;  // ice: chance to freeze a victim on ability hit
  // Defensive / status state (on the affected unit).
  statusImmune: boolean;  // steel/assault-vest: immune to burn/stun/freeze
  burnTicks: number;      // remaining burn ticks
  burnPerSec: number;     // incoming burn dmg/sec (frac of maxHp)
  disabledTicks: number;  // stunned/frozen ticks remaining (can't act)
  // Signature ability flavour (derived from archetype + typing).
  castEffect: CastEffect;
  // Cumulative contribution (for the live damage/tank/heal recap).
  dmgDealt: number;
  dmgTaken: number;
  healed: number;
};

export type FrameUnit = {
  id: string;
  team: Team;
  dex: number;
  c: number;
  r: number;
  hpFrac: number;
  manaFrac: number;
  alive: boolean;
  mega: boolean;
  /** Cumulative up to this frame — drives the recap. */
  dmgDealt: number;
  dmgTaken: number;
  healed: number;
  name: string;
  /** Active status this frame, for the replay overlay. */
  burning: boolean;
  disabled: boolean;
};

export type CombatEvent =
  | { kind: "attack"; from: string; to: string }
  | { kind: "cast"; from: string; to: string; moveType: PokeType; eff: number; shape: Move["shape"]; move: string }
  | { kind: "hit"; to: string; dmg: number; crit?: boolean; sup?: boolean }
  | { kind: "death"; id: string };

export type Frame = { t: number; overtime: boolean; units: FrameUnit[]; events: CombatEvent[] };

export type CombatResult = {
  winner: Team | "draw";
  /** Surviving units of the winning team (head-count, shown to the player). */
  survivors: number;
  /** Weighted player damage from those survivors — like TFT, a stronger surviving
   *  board hurts more: each unit contributes its star (1/2/3) plus +1 for a 4/5-cost
   *  carry. This (not the raw count) is what the loser's HP is docked by. */
  survivorDamage: number;
  frames: Frame[];
  duration: number;
};

/** A team-wide combat buff (from combat augments). Applied to every unit on the side
 *  at combat start, ON TOP of the capped item multipliers — a separate bounded source,
 *  like trait buffs. Derived from PUBLIC augment data so host + client stay identical. */
export type TeamBuff = {
  adMult?: number;
  apMult?: number;
  asMult?: number;
  hpMult?: number;
  armorAdd?: number;
  mrAdd?: number;
  critAdd?: number;
  manaStart?: number;
  lifeSteal?: number;
  /** Fraction of enemy armor to ignore (0–1). Takes the highest source, like lifesteal. */
  armorPen?: number;
  /** Burn damage applied per second as a fraction of target max HP. */
  burnDps?: number;
  /** Probability (0–1) to stun the target on each hit. */
  stunChance?: number;
  /** HP regeneration per second as a fraction of max HP. */
  regenPerSec?: number;
  /** Extra mana gained per attack (additive across sources). */
  manaPerAttack?: number;
};

/** Per-surviving-unit player-damage weight: ★ value + a carry bonus for 4/5-costs. */
function survivorWeight(u: Combatant): number {
  const cost = getDef(u.defId).cost;
  return u.star + (cost >= 4 ? 1 : 0);
}

// Tuning.
const DT = 1 / 16; // 16 sim steps per second
const MAX_TIME = 35;
const OVERTIME_START = 15; // after this, a ramping storm forces a finish
const MANA_PER_ATTACK = 10;
const MANA_ON_HIT = 3;
const MAX_ATTACK_SPEED = 5.0; // hard ceiling on attacks/sec after all multipliers
const MOVE_TIME = 0.3; // seconds per hex step

function armorMult(armor: number): number {
  return 100 / (100 + Math.max(0, armor));
}

function toCombatant(u: UnitInstance, team: Team, buff?: TeamBuff): Combatant {
  const def = getDef(u.defId);
  const i = u.star - 1;
  const s = def.stats;
  const local = u.pos!;
  const pos = team === "ally" ? allyToField(local[0], local[1]) : enemyToField(local[0], local[1]);

  // Held items, coerced to a real array first: a RTDB round-trip can turn a sparse
  // array into an index-keyed object ({0:"x"}), which would throw on .includes/for-of
  // and desync whichever side fed the mangled shape. Coerce once, use everywhere.
  const items = Array.isArray(u.items) ? u.items : u.items ? Object.values(u.items as Record<string, string>) : [];

  // Mega Evolution applies at combat start when the mon holds a Mega Stone.
  const mega = isMegaActive(u.defId, items) ? megaFormFor(u.defId) : undefined;
  // Base typing at this star (a line can gain/shift a type as it evolves), then the
  // Mega's type shift on top.
  const starTypes = typesForStar(def, u.star);
  const types = mega?.addType && !starTypes.includes(mega.addType) ? [...starTypes, mega.addType] : starTypes;
  // Deterministic stat-scale (early-PvE creeps come in weakened so the opening
  // rounds are winnable). Applies before items/traits; undefined = 1.
  const scale = u.statScale ?? 1;
  let hp = Math.round((mega ? s.hp[i] * mega.hpMult : s.hp[i]) * scale);
  let ad = Math.round((mega ? s.ad[i] * mega.adMult : s.ad[i]) * scale);

  // Held-item stat modifiers (deterministic; items synced on the unit). Effects
  // are data-driven (ITEM_EFFECT) so combining produces items the sim applies
  // generically — no per-id branching here.
  let apMult = mega ? mega.apMult : 1;
  let armor = mega ? s.armor + mega.armorBonus : s.armor;
  let mr = mega ? s.magicResist + mega.mrBonus : s.magicResist;
  let attackSpeed = s.attackSpeed;
  let adMult = 1, hpMult = 1, critAdd = 0, lifeSteal = 0, armorPen = 0;
  let regen = 0, thorns = 0, burnDps = 0, stunChance = 0, manaAdd = 0, manaPerAtk = 0;
  let sash = false, statusImmune = false;
  for (const id of items) {
    const e = ITEM_EFFECT[id];
    if (!e) continue;
    if (e.adMult) adMult *= e.adMult;
    if (e.apMult) apMult *= e.apMult;
    if (e.asMult) attackSpeed *= e.asMult;
    if (e.hpMult) hpMult *= e.hpMult;
    if (e.armorAdd) armor += e.armorAdd;
    if (e.mrAdd) mr += e.mrAdd;
    if (e.critAdd) critAdd += e.critAdd;
    if (e.lifeSteal) lifeSteal = Math.max(lifeSteal, e.lifeSteal);
    if (e.armorPen) armorPen = Math.max(armorPen, e.armorPen);
    if (e.regenPerSec) regen += e.regenPerSec;
    if (e.thornsPct) thorns = Math.max(thorns, e.thornsPct);
    if (e.burnDps) burnDps = Math.max(burnDps, e.burnDps);
    if (e.stunChance) stunChance = Math.max(stunChance, e.stunChance);
    if (e.manaStart) manaAdd += e.manaStart;
    if (e.manaPerAttack) manaPerAtk += e.manaPerAttack;
    if (e.sash) sash = true;
    if (e.statusImmune) statusImmune = true;
  }
  // Cap the ITEM stat multipliers (traits stack on top, but they're bounded to one
  // tier per type). One or two items stay full-strength; this just defuses the
  // degenerate 3-identical-item stack (e.g. 3 Choice Bands = 1.8³ ≈ 5.8× AD).
  const ITEM_MULT_CAP = 2.6;
  adMult = Math.min(ITEM_MULT_CAP, adMult);
  apMult = Math.min(ITEM_MULT_CAP, apMult);
  hpMult = Math.min(ITEM_MULT_CAP, hpMult);
  // Team-wide augment buffs stack ON TOP of the capped item mults (a separate bounded
  // source, like traits). Applied before the final ad/hp rounding so they compound
  // correctly. Buff is derived from public augment data → identical host & client.
  if (buff) {
    adMult *= buff.adMult ?? 1;
    apMult *= buff.apMult ?? 1;
    hpMult *= buff.hpMult ?? 1;
    attackSpeed *= buff.asMult ?? 1;
    armor += buff.armorAdd ?? 0;
    mr += buff.mrAdd ?? 0;
    critAdd += buff.critAdd ?? 0;
    manaAdd += buff.manaStart ?? 0;
    lifeSteal = Math.max(lifeSteal, buff.lifeSteal ?? 0);
    armorPen = Math.max(armorPen, buff.armorPen ?? 0);
    burnDps = Math.max(burnDps, buff.burnDps ?? 0);
    stunChance = Math.max(stunChance, buff.stunChance ?? 0);
    regen += buff.regenPerSec ?? 0;
    manaPerAtk += buff.manaPerAttack ?? 0;
  }
  ad = Math.round(ad * adMult);
  hp = Math.round(hp * hpMult);

  return {
    id: `${team}-${u.iid}`,
    team,
    defId: def.id,
    star: u.star,
    name: mega ? mega.name : def.stageNames[i],
    dex: mega ? mega.megaDex : def.dex[i],
    types,
    move: def.move,
    hp,
    maxHp: hp,
    ad,
    attackSpeed,
    armor,
    mr,
    range: Math.max(1, s.range), // floor at melee — range 0 could never reach a target and would idle until overtime
    mana: Math.min(s.maxMana, s.startMana + manaAdd),
    maxMana: s.maxMana,
    // Cap stacked mana acceleration for the same reason item multipliers are capped:
    // 3 identical caster items shouldn't let a unit cast every other tick.
    manaPerAttack: Math.min(15, manaPerAtk),
    apMult,
    mega: !!mega,
    pos,
    atkCd: 0,
    moveCd: 0,
    targetId: null,
    alive: true,
    dmgMult: 1,
    lifeOrbSelfPct: 0,
    regenPerSec: regen,
    thornsPct: thorns,
    sashReady: sash,
    // Base 20% crit for 1.5x — items/traits add on top.
    critChance: 0.2 + critAdd,
    critMult: 1.5,
    lifeStealPct: lifeSteal,
    armorPenPct: armorPen,
    inflictBurnDps: burnDps,
    inflictStun: stunChance,
    inflictFreeze: 0,
    statusImmune,
    burnTicks: 0,
    burnPerSec: 0,
    disabledTicks: 0,
    castEffect: castEffectOf(def),
    dmgDealt: 0,
    dmgTaken: 0,
    healed: 0,
  };
}

/** Apply each active trait tier's buff to one team's combatants, deterministically.
 *  "self" buffs hit units carrying the trait; "team" buffs hit the whole side. */
function applyTraitBuffs(units: Combatant[], board: UnitInstance[], team: Team) {
  const traits = computeTraits(board.filter((u) => u.pos !== null));
  for (const tr of traits) {
    if (tr.tier <= 0) continue;
    const buff = TRAITS_BY_KEY[tr.key]?.tiers[tr.tier - 1]?.buff;
    if (!buff) continue;
    for (const c of units) {
      if (c.team !== team) continue;
      const def = getDef(c.defId);
      // Use the combatant's RESOLVED typing (per-star + Mega) so an evolved/mega'd mon
      // benefits from its current types, not just its base form.
      const carries = (c.types as string[]).includes(tr.key) || (def.roles as string[]).includes(tr.key);
      if (buff.scope !== "team" && !carries) continue;
      if (buff.hpMult) { c.maxHp = Math.round(c.maxHp * buff.hpMult); c.hp = c.maxHp; }
      if (buff.shieldPct) { const extra = Math.round(c.maxHp * buff.shieldPct); c.maxHp += extra; c.hp += extra; }
      if (buff.adMult) c.ad = Math.round(c.ad * buff.adMult);
      if (buff.apMult) c.apMult *= buff.apMult;
      if (buff.asMult) c.attackSpeed *= buff.asMult;
      if (buff.armorAdd) c.armor += buff.armorAdd;
      if (buff.mrAdd) c.mr += buff.mrAdd;
      if (buff.regenPerSec) c.regenPerSec += buff.regenPerSec;
      if (buff.manaAdd) c.mana = Math.min(c.maxMana, c.mana + buff.manaAdd);
      // Signature effects.
      if (buff.critAdd) c.critChance += buff.critAdd;
      if (buff.lifeSteal) c.lifeStealPct = Math.max(c.lifeStealPct, buff.lifeSteal);
      if (buff.armorPen) c.armorPenPct = Math.max(c.armorPenPct, buff.armorPen);
      if (buff.burnDps) c.inflictBurnDps = Math.max(c.inflictBurnDps, buff.burnDps);
      if (buff.stunChance) c.inflictStun = Math.max(c.inflictStun, buff.stunChance);
      if (buff.freezeChance) c.inflictFreeze = Math.max(c.inflictFreeze, buff.freezeChance);
      if (buff.statusImmune) c.statusImmune = true;
    }
  }
}

function snapshot(units: Combatant[], t: number, events: CombatEvent[]): Frame {
  return {
    t,
    overtime: t > OVERTIME_START,
    events,
    units: units.map((u) => ({
      id: u.id,
      team: u.team,
      dex: u.dex,
      c: u.pos.c,
      r: u.pos.r,
      hpFrac: u.maxHp > 0 ? Math.max(0, u.hp / u.maxHp) : 0, // guard maxHp=0 → no NaN in the rendered bar
      manaFrac: u.maxMana > 0 ? u.mana / u.maxMana : 0,
      alive: u.alive,
      mega: u.mega,
      dmgDealt: Math.round(u.dmgDealt),
      dmgTaken: Math.round(u.dmgTaken),
      healed: Math.round(u.healed),
      name: u.name,
      burning: u.burnTicks > 0,
      disabled: u.disabledTicks > 0,
    })),
  };
}

export function simulate(allies: UnitInstance[], enemies: UnitInstance[], allyBuff?: TeamBuff, enemyBuff?: TeamBuff): CombatResult {
  const units: Combatant[] = [
    ...allies.filter((u) => u.pos).map((u) => toCombatant(u, "ally", allyBuff)),
    ...enemies.filter((u) => u.pos).map((u) => toCombatant(u, "enemy", enemyBuff)),
  ];
  // Stable iteration order, independent of the incoming array order (which RTDB
  // can reorder). Every per-tick loop below iterates `units`, and movement /
  // tie-break decisions can depend on that order — so we pin it by unit id to
  // guarantee host and client step the sim identically.
  units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Trait synergies — applied as deterministic stat buffs at combat start.
  applyTraitBuffs(units, allies, "ally");
  applyTraitBuffs(units, enemies, "enemy");
  // Seeded RNG (crits / status), derived from the boards so every client matches.
  const rng = makeRng(boardSeed(allies, enemies));
  const byId = new Map(units.map((u) => [u.id, u]));
  const frames: Frame[] = [snapshot(units, 0, [])];

  const occupied = new Map<string, string>();
  for (const u of units) occupied.set(hexKey(u.pos), u.id);

  const enemiesOf = (u: Combatant) => units.filter((o) => o.alive && o.team !== u.team);

  let t = 0;
  while (t < MAX_TIME) {
    const events: CombatEvent[] = [];
    t += DT;

    for (const u of units) {
      if (!u.alive) continue;
      // Burn damage-over-time, then disable (stun/freeze) — disabled units skip.
      if (u.burnTicks > 0) { u.hp -= u.maxHp * u.burnPerSec * DT; u.dmgTaken += u.maxHp * u.burnPerSec * DT; u.burnTicks--; }
      if (u.disabledTicks > 0) { u.disabledTicks--; continue; }
      u.atkCd = Math.max(0, u.atkCd - DT);
      u.moveCd = Math.max(0, u.moveCd - DT);

      // Smarter target selection (deterministic — no RNG):
      //  1. If any enemy is already in attack range, FOCUS the lowest-HP one to
      //     secure kills (and stop walking past attackable foes).
      //  2. Otherwise hold the current target if it's still alive (stickiness),
      //     else acquire the nearest, tie-broken toward the lowest-HP foe.
      // Focus-firing the weakest reachable enemy wins fights faster than spreading
      // damage around, which is what real players do.
      const foes = enemiesOf(u);
      if (foes.length === 0) continue;

      const inRange = foes.filter((f) => hexDistance(u.pos, f.pos) <= u.range);
      let target: Combatant;
      if (inRange.length > 0) {
        target = inRange.reduce((best, f) => (f.hp !== best.hp ? (f.hp < best.hp ? f : best) : (f.id < best.id ? f : best)));
      } else {
        const cur = u.targetId ? byId.get(u.targetId) : undefined;
        if (cur && cur.alive) {
          target = cur;
        } else {
          target = foes.reduce((best, f) => {
            const d = hexDistance(u.pos, f.pos);
            const bd = hexDistance(u.pos, best.pos);
            if (d !== bd) return d < bd ? f : best;
            if (f.hp !== best.hp) return f.hp < best.hp ? f : best;
            return f.id < best.id ? f : best;
          });
        }
      }
      u.targetId = target.id;

      const dist = hexDistance(u.pos, target.pos);

      if (dist <= u.range) {
        // In range — attack if ready.
        if (u.atkCd <= 0) {
          // Clamp attack speed to (0.1 .. 5.0): the ceiling stops stacked-AS
          // machine-gun DPS, the floor guards against a 0/negative/NaN attackSpeed
          // (a bad item mult or misauthored stat) producing an infinite/negative
          // cooldown — i.e. a unit that never attacks or fires every tick.
          u.atkCd = 1 / Math.max(0.1, Math.min(MAX_ATTACK_SPEED, u.attackSpeed || 0));
          // Armor penetration ignores a fraction of the target's armor.
          dealDamage(u, target, u.ad * armorMult(target.armor * (1 - u.armorPenPct)), "physical", events, rng);
          u.mana = Math.min(u.maxMana, u.mana + MANA_PER_ATTACK + u.manaPerAttack);

          // Cast on full mana — but only if the auto-attack didn't already kill
          // the target (otherwise the ability hits a corpse).
          if (u.mana >= u.maxMana && u.maxMana > 0 && target.hp > 0) {
            u.mana = 0;
            castAbility(u, target, units, events, rng);
          }
          cleanupDeaths(units, occupied, events);
        }
      } else if (u.moveCd <= 0) {
        // Step one hex toward the target.
        const step = bestStep(u.pos, target.pos, occupied);
        if (step) {
          occupied.delete(hexKey(u.pos));
          u.pos = step;
          occupied.set(hexKey(step), u.id);
          u.moveCd = MOVE_TIME;
        }
      }
    }

    cleanupDeaths(units, occupied, events); // catch burn/DoT deaths

    // Leftovers: steady regen each tick (capped at max HP).
    for (const u of units) {
      if (u.alive && u.regenPerSec > 0 && u.hp < u.maxHp) {
        const before = u.hp;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.regenPerSec * DT);
        u.healed += u.hp - before;
      }
    }

    // Overtime: a ramping storm chips every survivor so stalemates can't run
    // to the time limit. Damage % per second grows the longer overtime lasts.
    if (t > OVERTIME_START) {
      const pctPerSec = 0.05 + 0.06 * (t - OVERTIME_START);
      for (const u of units) {
        if (u.alive) u.hp -= u.maxHp * pctPerSec * DT;
      }
      cleanupDeaths(units, occupied, events);
    }

    frames.push(snapshot(units, t, events));

    const allyAlive = units.some((u) => u.alive && u.team === "ally");
    const enemyAlive = units.some((u) => u.alive && u.team === "enemy");
    if (!allyAlive || !enemyAlive) break;
  }

  return finalize(units, frames, t);
}

/** Apply a hit, honouring Focus Sash (survive one lethal blow at full HP).
 *  Records actual HP lost as the attacker's damage and the victim's tank. */
function applyHit(from: Combatant | null, to: Combatant, dmg: number) {
  const before = to.hp;
  const wasFull = to.hp >= to.maxHp;
  to.hp -= dmg;
  if (to.hp <= 0 && to.sashReady && wasFull) {
    to.hp = 1;
    to.sashReady = false;
  }
  const lost = Math.max(0, before - to.hp);
  to.dmgTaken += lost;
  if (from) from.dmgDealt += lost;
}

/** Heal the attacker for a fraction of damage actually dealt (lifesteal). */
function lifesteal(from: Combatant, dmg: number) {
  if (from.lifeStealPct <= 0 || !from.alive) return;
  const heal = Math.min(dmg * from.lifeStealPct, from.maxHp - from.hp);
  if (heal > 0) { from.hp += heal; from.healed += heal; }
}

function dealDamage(from: Combatant, to: Combatant, rawDmg: number, _kind: string, events: CombatEvent[], rng: Rng) {
  // Crit roll (seeded → deterministic across clients). Crit chance past 100% would
  // otherwise be wasted, so the overcap converts into bonus crit DAMAGE — crit
  // items stay meaningful once you also have a crit trait (TFT "Infinity Edge").
  const overcap = Math.max(0, from.critChance - 1);
  const crit = rng() < from.critChance;
  const dmg = Math.round(rawDmg * from.dmgMult * (crit ? from.critMult + overcap : 1));
  const hpBefore = to.hp;
  applyHit(from, to, dmg);
  lifesteal(from, hpBefore - to.hp);
  to.mana = Math.min(to.maxMana, to.mana + MANA_ON_HIT);
  events.push({ kind: "attack", from: from.id, to: to.id });
  events.push({ kind: "hit", to: to.id, dmg, crit });
  // Rocky Helmet thorns on melee contact; Life Orb recoil on the attacker.
  if (to.thornsPct > 0 && from.range <= 1) applyHit(to, from, from.maxHp * to.thornsPct);
  if (from.lifeOrbSelfPct > 0) from.hp -= from.maxHp * from.lifeOrbSelfPct;
}

function castAbility(caster: Combatant, target: Combatant, units: Combatant[], events: CombatEvent[], rng: Rng) {
  const i = caster.star - 1;
  const base = caster.move.power[i] * caster.apMult;
  const eff = effectiveness(caster.move.type, target.types);
  events.push({ kind: "cast", from: caster.id, to: target.id, moveType: caster.move.type, eff, shape: caster.move.shape, move: caster.move.name });

  const hitOne = (victim: Combatant, mult = 1) => {
    const e = effectiveness(caster.move.type, victim.types);
    // Execute carries: low-HP targets take extra ability damage.
    const exec = caster.castEffect === "execute" && victim.hp < victim.maxHp * 0.35 ? 1.6 : 1;
    const dmg = Math.round(base * mult * exec * e * (100 / (100 + victim.mr)) * caster.dmgMult);
    const hpBefore = victim.hp;
    applyHit(caster, victim, dmg);
    lifesteal(caster, hpBefore - victim.hp);
    events.push({ kind: "hit", to: victim.id, dmg, sup: e > 1 });
    // Signature on-ability statuses, blocked by status immunity.
    if (victim.alive && !victim.statusImmune) {
      if (caster.inflictBurnDps > 0) { victim.burnTicks = BURN_TICKS; victim.burnPerSec = caster.inflictBurnDps; }
      if (caster.inflictStun > 0 && rng() < caster.inflictStun) victim.disabledTicks = Math.max(victim.disabledTicks, STATUS_TICKS);
      if (caster.inflictFreeze > 0 && rng() < caster.inflictFreeze) victim.disabledTicks = Math.max(victim.disabledTicks, STATUS_TICKS);
    }
  };

  // Restore HP to a unit, crediting the caster's HEAL recap tally.
  const heal = (u: Combatant, amount: number) => {
    if (!u.alive || amount <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    caster.healed += u.hp - before;
  };

  if (caster.castEffect === "blast") {
    // Team nuke — every living enemy takes a reduced-power hit (deterministic order).
    for (const v of units) {
      if (v.alive && v.team !== caster.team) hitOne(v, 0.55);
    }
  } else {
    hitOne(target);
    if (caster.move.shape === "splash") {
      const around = new Set(neighbors(target.pos).map(hexKey));
      for (const v of units) {
        if (v.alive && v.team !== caster.team && v.id !== target.id && around.has(hexKey(v.pos))) hitOne(v);
      }
    } else if (caster.move.shape === "line") {
      // Hit enemies sharing the target's column behind it.
      for (const v of units) {
        if (v.alive && v.team !== caster.team && v.id !== target.id && v.pos.c === target.pos.c) hitOne(v);
      }
    }
  }

  // Support flavours mend after striking: guards patch themselves, healers mend the
  // most-wounded ally (self included). Deterministic pick (stable reduce order).
  if (caster.castEffect === "guard") {
    heal(caster, base * 0.9);
  } else if (caster.castEffect === "heal") {
    const allies = units.filter((a) => a.alive && a.team === caster.team);
    const wounded = allies.reduce((lo, a) => (a.hp / a.maxHp < lo.hp / lo.maxHp ? a : lo), caster);
    heal(wounded, base * 0.7);
  }
}

function cleanupDeaths(units: Combatant[], occupied: Map<string, string>, events: CombatEvent[]) {
  for (const u of units) {
    if (u.alive && u.hp <= 0) {
      u.alive = false;
      occupied.delete(hexKey(u.pos));
      events.push({ kind: "death", id: u.id });
    }
  }
}

/** One-hex step toward the goal. Fast path: the free neighbour that strictly
 *  reduces distance (open field — identical to the old greedy behaviour). If every
 *  distance-reducing neighbour is blocked (a wall of allies in front), fall back to
 *  a deterministic BFS that routes AROUND the obstruction toward the reachable free
 *  hex closest to the goal — so rear units flow around their own line instead of
 *  standing idle until the front dies. Fully deterministic (fixed neighbour order +
 *  hexKey tie-breaks), so host and client step identically. */
function bestStep(from: Hex, goal: Hex, occupied: Map<string, string>): Hex | null {
  const curD = hexDistance(from, goal);
  // Fast path: a strictly-closer free neighbour (the common, open-field case).
  let greedy: Hex | null = null;
  let greedyD = curD;
  for (const n of neighbors(from)) {
    if (occupied.has(hexKey(n))) continue;
    const d = hexDistance(n, goal);
    if (d < greedyD || (d === greedyD && greedy && hexKey(n) < hexKey(greedy))) { greedyD = d; greedy = n; }
  }
  if (greedy) return greedy;

  // Blocked: BFS over free hexes to find the first step of the shortest detour to
  // whichever reachable free hex sits closest to the goal.
  const goalKey = hexKey(goal);
  const visited = new Set<string>([hexKey(from)]);
  const queue: { hex: Hex; first: Hex }[] = [];
  for (const n of neighbors(from)) {           // seed with free first-steps
    const k = hexKey(n);
    if (occupied.has(k) || visited.has(k)) continue;
    visited.add(k);
    queue.push({ hex: n, first: n });
  }
  let bestFirst: Hex | null = null;
  let bestD = Infinity;
  let bestKey = "";
  for (let head = 0; head < queue.length; head++) {
    const { hex, first } = queue[head];
    const d = hexDistance(hex, goal);
    const key = hexKey(hex);
    if (d < bestD || (d === bestD && key < bestKey)) { bestFirst = first; bestD = d; bestKey = key; }
    for (const n of neighbors(hex)) {
      const k = hexKey(n);
      if (visited.has(k) || k === goalKey || occupied.has(k)) continue;
      visited.add(k);
      queue.push({ hex: n, first });
    }
  }
  // Only commit to the detour if it actually gets us closer than standing still.
  return bestFirst && bestD < curD ? bestFirst : null;
}

function finalize(units: Combatant[], frames: Frame[], duration: number): CombatResult {
  const allyAlive = units.filter((u) => u.alive && u.team === "ally");
  const enemyAlive = units.filter((u) => u.alive && u.team === "enemy");

  let winner: Team | "draw";
  let winningUnits: Combatant[];
  if (allyAlive.length && !enemyAlive.length) {
    winner = "ally";
    winningUnits = allyAlive;
  } else if (enemyAlive.length && !allyAlive.length) {
    winner = "enemy";
    winningUnits = enemyAlive;
  } else if (!allyAlive.length && !enemyAlive.length) {
    winner = "draw";
    winningUnits = [];
  } else {
    // Timeout — most remaining total HP wins.
    const allyHp = allyAlive.reduce((s, u) => s + u.hp, 0);
    const enemyHp = enemyAlive.reduce((s, u) => s + u.hp, 0);
    winner = allyHp === enemyHp ? "draw" : allyHp > enemyHp ? "ally" : "enemy";
    winningUnits = winner === "ally" ? allyAlive : winner === "enemy" ? enemyAlive : [];
  }

  const survivors = winningUnits.length;
  const survivorDamage = winningUnits.reduce((s, u) => s + survivorWeight(u), 0);
  return { winner, survivors, survivorDamage, frames, duration };
}
