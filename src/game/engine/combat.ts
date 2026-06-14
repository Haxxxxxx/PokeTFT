/**
 * Deterministic, tick-based auto-battler simulation.
 * PURE: no React, no DOM, no Date/Math.random — same inputs always yield the
 * same CombatResult, so it can run client- or server-side and is unit-testable.
 *
 * Output is a list of frames the renderer replays; the sim itself is headless.
 */

import type { UnitInstance, PokeType, Move } from "../types";
import { getDef } from "../data/mons";
import { effectiveness } from "../data/typeChart";
import { allyToField, enemyToField, neighbors, hexDistance, hexKey, type Hex } from "./hex";

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
  pos: Hex;
  atkCd: number;
  moveCd: number;
  targetId: string | null;
  alive: boolean;
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
};

export type CombatEvent =
  | { kind: "attack"; from: string; to: string }
  | { kind: "cast"; from: string; to: string; moveType: PokeType; eff: number }
  | { kind: "hit"; to: string; dmg: number; crit?: boolean }
  | { kind: "death"; id: string };

export type Frame = { t: number; units: FrameUnit[]; events: CombatEvent[] };

export type CombatResult = {
  winner: Team | "draw";
  /** Surviving units of the winning team (for HP-damage calc). */
  survivors: number;
  frames: Frame[];
  duration: number;
};

// Tuning.
const DT = 1 / 16; // 16 sim steps per second
const MAX_TIME = 25;
const MANA_PER_ATTACK = 10;
const MANA_ON_HIT = 3;
const MOVE_TIME = 0.3; // seconds per hex step

function armorMult(armor: number): number {
  return 100 / (100 + Math.max(0, armor));
}

function toCombatant(u: UnitInstance, team: Team): Combatant {
  const def = getDef(u.defId);
  const i = u.star - 1;
  const s = def.stats;
  const local = u.pos!;
  const pos = team === "ally" ? allyToField(local[0], local[1]) : enemyToField(local[0], local[1]);
  return {
    id: `${team}-${u.iid}`,
    team,
    defId: def.id,
    star: u.star,
    name: def.stageNames[i],
    dex: def.dex[i],
    types: def.types,
    move: def.move,
    hp: s.hp[i],
    maxHp: s.hp[i],
    ad: s.ad[i],
    attackSpeed: s.attackSpeed,
    armor: s.armor,
    mr: s.magicResist,
    range: s.range,
    mana: s.startMana,
    maxMana: s.maxMana,
    pos,
    atkCd: 0,
    moveCd: 0,
    targetId: null,
    alive: true,
  };
}

function snapshot(units: Combatant[], t: number, events: CombatEvent[]): Frame {
  return {
    t,
    events,
    units: units.map((u) => ({
      id: u.id,
      team: u.team,
      dex: u.dex,
      c: u.pos.c,
      r: u.pos.r,
      hpFrac: Math.max(0, u.hp / u.maxHp),
      manaFrac: u.maxMana > 0 ? u.mana / u.maxMana : 0,
      alive: u.alive,
    })),
  };
}

export function simulate(allies: UnitInstance[], enemies: UnitInstance[]): CombatResult {
  const units: Combatant[] = [
    ...allies.filter((u) => u.pos).map((u) => toCombatant(u, "ally")),
    ...enemies.filter((u) => u.pos).map((u) => toCombatant(u, "enemy")),
  ];
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
      u.atkCd = Math.max(0, u.atkCd - DT);
      u.moveCd = Math.max(0, u.moveCd - DT);

      // Keep the current target until it dies (stickiness avoids jitter), then
      // re-acquire: prefer the nearest foe, but break ties toward the foe with
      // the fewest current attackers so a team spreads its aggro instead of
      // dogpiling a single unit.
      let target = u.targetId ? byId.get(u.targetId) : undefined;
      if (!target || !target.alive) {
        const foes = enemiesOf(u);
        if (foes.length === 0) continue;

        const load = new Map<string, number>();
        for (const ally of units) {
          if (ally.alive && ally.team === u.team && ally.targetId) {
            load.set(ally.targetId, (load.get(ally.targetId) ?? 0) + 1);
          }
        }

        target = foes.reduce((best, f) => {
          const d = hexDistance(u.pos, f.pos);
          const bd = hexDistance(u.pos, best.pos);
          if (d !== bd) return d < bd ? f : best;
          const lf = load.get(f.id) ?? 0;
          const lb = load.get(best.id) ?? 0;
          if (lf !== lb) return lf < lb ? f : best;
          return f.id < best.id ? f : best;
        });
        u.targetId = target.id;
      }

      const dist = hexDistance(u.pos, target.pos);

      if (dist <= u.range) {
        // In range — attack if ready.
        if (u.atkCd <= 0) {
          u.atkCd = 1 / u.attackSpeed;
          dealDamage(u, target, u.ad * armorMult(target.armor), "physical", events);
          u.mana = Math.min(u.maxMana, u.mana + MANA_PER_ATTACK);

          // Cast on full mana — but only if the auto-attack didn't already kill
          // the target (otherwise the ability hits a corpse).
          if (u.mana >= u.maxMana && u.maxMana > 0 && target.hp > 0) {
            u.mana = 0;
            castAbility(u, target, units, events);
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

    frames.push(snapshot(units, t, events));

    const allyAlive = units.some((u) => u.alive && u.team === "ally");
    const enemyAlive = units.some((u) => u.alive && u.team === "enemy");
    if (!allyAlive || !enemyAlive) break;
  }

  return finalize(units, frames, t);
}

function dealDamage(from: Combatant, to: Combatant, rawDmg: number, _kind: string, events: CombatEvent[]) {
  const dmg = Math.round(rawDmg);
  to.hp -= dmg;
  to.mana = Math.min(to.maxMana, to.mana + MANA_ON_HIT);
  events.push({ kind: "attack", from: from.id, to: to.id });
  events.push({ kind: "hit", to: to.id, dmg });
}

function castAbility(caster: Combatant, target: Combatant, units: Combatant[], events: CombatEvent[]) {
  const i = caster.star - 1;
  const base = caster.move.power[i];
  const eff = effectiveness(caster.move.type, target.types);
  events.push({ kind: "cast", from: caster.id, to: target.id, moveType: caster.move.type, eff });

  const hitOne = (victim: Combatant) => {
    const e = effectiveness(caster.move.type, victim.types);
    const dmg = Math.round(base * e * (100 / (100 + victim.mr)));
    victim.hp -= dmg;
    events.push({ kind: "hit", to: victim.id, dmg, crit: e > 1 });
  };

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

function cleanupDeaths(units: Combatant[], occupied: Map<string, string>, events: CombatEvent[]) {
  for (const u of units) {
    if (u.alive && u.hp <= 0) {
      u.alive = false;
      occupied.delete(hexKey(u.pos));
      events.push({ kind: "death", id: u.id });
    }
  }
}

/** Greedy one-hex step: the free neighbor that minimises distance to the goal. */
function bestStep(from: Hex, goal: Hex, occupied: Map<string, string>): Hex | null {
  let best: Hex | null = null;
  let bestD = hexDistance(from, goal);
  for (const n of neighbors(from)) {
    if (occupied.has(hexKey(n))) continue;
    const d = hexDistance(n, goal);
    if (d < bestD || (d === bestD && best && hexKey(n) < hexKey(best))) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function finalize(units: Combatant[], frames: Frame[], duration: number): CombatResult {
  const allyAlive = units.filter((u) => u.alive && u.team === "ally");
  const enemyAlive = units.filter((u) => u.alive && u.team === "enemy");

  let winner: Team | "draw";
  let survivors: number;
  if (allyAlive.length && !enemyAlive.length) {
    winner = "ally";
    survivors = allyAlive.length;
  } else if (enemyAlive.length && !allyAlive.length) {
    winner = "enemy";
    survivors = enemyAlive.length;
  } else if (!allyAlive.length && !enemyAlive.length) {
    winner = "draw";
    survivors = 0;
  } else {
    // Timeout — most remaining total HP wins.
    const allyHp = allyAlive.reduce((s, u) => s + u.hp, 0);
    const enemyHp = enemyAlive.reduce((s, u) => s + u.hp, 0);
    winner = allyHp === enemyHp ? "draw" : allyHp > enemyHp ? "ally" : "enemy";
    survivors = winner === "ally" ? allyAlive.length : winner === "enemy" ? enemyAlive.length : 0;
  }

  return { winner, survivors, frames, duration };
}
