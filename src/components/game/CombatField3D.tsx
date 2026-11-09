"use client";

/**
 * The battlefield, rendered in the 3D arena.
 *
 * Swaps ONLY the field visualisation inside CombatStage — frame timing, SFX,
 * the recap tabs and all the surrounding chrome stay exactly where they are.
 * That matters: the combat replay is deterministic and host-verified, and the
 * last thing worth doing is forking 700 lines of timing logic to change how it
 * looks.
 *
 * Positions are interpolated in CELL space and then mapped to world space, so
 * this and the CSS field agree about where a unit is at any frame — they share
 * the same hex math, just a different projection.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Instance, Instances, Html, ContactShadows } from "@react-three/drei";
import { FIELD, FIELD_SIZE, HEX_R, cellToWorld, isAllyRow } from "@/game/ui/hex3d";
import { TYPE_COLOR } from "@/game/ui";
import { SpriteUnit } from "./SpriteUnit";
import { ArenaPlatform } from "./ArenaPlatform";
import { ItemPips } from "./UnitChip";
import { abilityCells, type Frame, type FrameUnit } from "@/game/engine/combat";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Neutral paved floor — team identity is read off the units, exactly as in the
 *  CSS field and in the reference. The only coloured hexes are ability areas. */
function Floor() {
  const cells = useMemo(() => {
    const out: { key: string; pos: [number, number, number]; ally: boolean }[] = [];
    for (let r = 0; r < FIELD.rows; r++) {
      for (let c = 0; c < FIELD.cols; c++) {
        out.push({ key: `${c}-${r}`, pos: cellToWorld(c, r), ally: isAllyRow(r) });
      }
    }
    return out;
  }, []);
  return (
    <Instances limit={FIELD.cols * FIELD.rows} receiveShadow>
      <cylinderGeometry args={[HEX_R * 0.88, HEX_R * 0.88, 0.1, 6]} />
      <meshStandardMaterial roughness={0.84} metalness={0.05} />
      {cells.map((c) => (
        <Instance key={c.key} position={c.pos} rotation={[0, Math.PI / 6, 0]} color={c.ally ? "#26324b" : "#2b2f48"} />
      ))}
    </Instances>
  );
}

/** HP + mana, billboarded above a unit. DOM-in-3D keeps the bars crisp at any
 *  camera distance and reuses the CSS field's visual language. */
function Bars({ hp, mana, ally, low }: { hp: number; mana: number; ally: boolean; low: boolean }) {
  const hpColor = ally ? (low ? "#16a34a" : "#34d399") : (low ? "#dc2626" : "#fb7185");
  return (
    <Html center distanceFactor={7} style={{ pointerEvents: "none", width: 58 }}>
      <div style={{ width: 58 }}>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.8)", outline: "1px solid rgba(0,0,0,0.6)", overflow: "hidden", marginBottom: 2 }}>
          <div style={{ width: `${Math.max(0, hp) * 100}%`, height: "100%", background: hpColor, borderRadius: 3 }} />
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(0,0,0,0.7)", overflow: "hidden", margin: "0 auto", width: "84%" }}>
          <div style={{ width: `${Math.max(0, mana) * 100}%`, height: "100%", background: mana >= 0.999 ? "#bae6fd" : "#38bdf8" }} />
        </div>
      </div>
    </Html>
  );
}

export function CombatField3D({
  a, b, frac, size, unitItems,
}: {
  a: Frame;
  b: Frame;
  frac: number;
  /** Pixel footprint to occupy — matches the CSS field so the shell is stable. */
  size: { w: number; h: number };
  /** Held items per combatant id (CombatResult.unitItems), constant per fight. */
  unitItems: Record<string, string[]>;
}) {
  const bMap = useMemo(() => new Map(b.units.map((u) => [u.id, u])), [b]);
  const aMap = useMemo(() => new Map(a.units.map((u) => [u.id, u])), [a]);

  /** World position for a unit this frame, interpolated in cell space. */
  const posOf = (u: FrameUnit) => {
    const bu = bMap.get(u.id) ?? u;
    const pa = cellToWorld(u.c, u.r);
    const pb = cellToWorld(bu.c, bu.r);
    return [lerp(pa[0], pb[0], frac), 0, lerp(pa[2], pb[2], frac)] as [number, number, number];
  };

  const living = a.units.filter((u) => u.alive || bMap.get(u.id)?.alive);

  /** Who took damage this frame — drives the hit flash. */
  const hitThisFrame = useMemo(() => {
    const s = new Set<string>();
    for (const e of a.events) if (e.kind === "hit") s.add(e.to);
    return s;
  }, [a]);

  /** Who is swinging at whom — drives the lunge. */
  const attacking = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of a.events) if (e.kind === "attack") m.set(e.from, e.to);
    return m;
  }, [a]);

  /** A short step toward the target, so an attack reads as a strike rather than
   *  two sprites standing still while numbers appear. */
  const lungeOf = (u: FrameUnit, from: [number, number, number]): [number, number, number] => {
    const toId = attacking.get(u.id);
    if (!toId) return from;
    const tgt = aMap.get(toId);
    if (!tgt) return from;
    const tp = cellToWorld(tgt.c, tgt.r);
    const dx = tp[0] - from[0];
    const dz = tp[2] - from[2];
    const m = Math.hypot(dx, dz) || 1;
    const step = HEX_R * 0.38;
    return [from[0] + (dx / m) * step, from[1], from[2] + (dz / m) * step];
  };

  return (
    <div className="relative" style={{ width: size.w, height: size.h }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 7.4, 7.0], fov: 38 }} gl={{ antialias: true }}>
        <hemisphereLight args={["#cfe0ff", "#161f38", 0.95]} />
        <directionalLight position={[3, 7, 5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3.5, 4, -4]} intensity={0.7} color="#9ec3ff" />

        <ArenaPlatform />
        <Floor />

        {/* Ability areas — the ONE place TFT tints hexes, and a large part of
            why its fights read. Cells come from the engine's own abilityCells,
            so the lit hexes are exactly the ones that take damage: an indicator
            that lies is worse than none at all. Painted under the units so a
            cast reads as ground effect rather than an overlay. */}
        {a.events.map((e, i) => {
          if (e.kind !== "cast") return null;
          const target = aMap.get(e.to);
          if (!target) return null;
          const colour = TYPE_COLOR[e.moveType] ?? "#a78bfa";
          const casterTeam = aMap.get(e.from)?.team;

          // A blast ignores the move's shape and hits EVERY living enemy, so the
          // only honest indicator is those units' own hexes — a geometric area
          // would be flatly wrong. Everything else uses the engine's own
          // abilityCells, minus the cells the caster's OWN side stands on:
          // castAbility filters by team, so those can never be hit and lighting
          // them up reads as damage that never lands. (The caster's half can't
          // simply be clipped off: units advance across the midline during a
          // fight, so an enemy may well be standing in it.)
          const cells =
            e.shape === "blast"
              ? a.units.filter((u) => u.alive && u.team !== casterTeam).map((u) => ({ c: u.c, r: u.r }))
              : abilityCells({ c: target.c, r: target.r }, e.shape).filter(
                  (cell) =>
                    !a.units.some((u) => u.alive && u.team === casterTeam && u.c === cell.c && u.r === cell.r),
                );

          return cells.map((cell, j) => {
            const p = cellToWorld(cell.c, cell.r);
            return (
              <mesh
                key={`fx-${i}-${j}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[p[0], 0.065, p[2]]}
              >
                {/* Hex-shaped, not a disc: it has to read as "these tiles",
                    which a circle spanning several cells never does. */}
                <circleGeometry args={[HEX_R * 0.88, 6]} />
                <meshBasicMaterial
                  color={colour}
                  transparent
                  opacity={0.42}
                  toneMapped={false}
                  depthWrite={false}
                />
              </mesh>
            );
          });
        })}

        {living.map((u) => {
          const bu = bMap.get(u.id) ?? u;
          const p = lungeOf(u, posOf(u));
          const hp = lerp(u.hpFrac, bu.hpFrac, frac);
          const mana = lerp(u.manaFrac, bu.manaFrac, frac);
          const tint = u.burning ? "#ff9a5c" : u.disabled ? "#9fd8ff" : undefined;
          return (
            <group key={u.id} position={p}>
              {(unitItems[u.id]?.length ?? 0) > 0 && (
                <Html position={[0, 0.02, 0.34]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
                  <div style={{ position: "relative", width: 40, height: 1 }}>
                    <ItemPips items={unitItems[u.id]} megaReady={u.mega} unitSize={40} />
                  </div>
                </Html>
              )}
              {/* Per-unit boundary. SpriteUnit suspends on its texture, and
                  with only the Canvas's own boundary ONE cold sprite blanked
                  the whole scene — platform, floor and every other unit —
                  until it resolved, which is the opening of the fight. */}
              <Suspense fallback={null}>
                <SpriteUnit
                  dex={u.dex}
                  star={u.star}
                  position={[0, 0, 0]}
                  flash={hitThisFrame.has(u.id)}
                  tint={tint}
                />
              </Suspense>
              <group position={[0, 1.25, 0]}>
                <Bars hp={hp} mana={mana} ally={u.team === "ally"} low={hp <= 0.25} />
              </group>
            </group>
          );
        })}

        {/* Damage numbers, at the unit that took the hit. Crits and
            super-effective hits are larger and warmer, matching the CSS field's
            language so the two views teach the same thing. */}
        {a.events.map((e, i) => {
          if (e.kind !== "hit") return null;
          const victim = aMap.get(e.to);
          if (!victim) return null;
          const p = cellToWorld(victim.c, victim.r);
          const big = e.crit || e.sup;
          return (
            <Html
              key={`dmg-${i}`}
              position={[p[0], 1.05, p[2]]}
              center
              distanceFactor={7}
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  font: `800 ${big ? 17 : 13}px ui-sans-serif,system-ui`,
                  color: e.crit ? "#ffd24a" : e.sup ? "#ff8a5c" : "#ffffff",
                  textShadow: "0 2px 4px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {Math.round(e.dmg)}
                {e.sup ? "!" : ""}
              </div>
            </Html>
          );
        })}

        {/* Fallen units stay on the field, dimmed, as in the CSS view. */}
        {a.units.filter((u) => !u.alive && !bMap.get(u.id)?.alive).map((u) => (
          <Suspense key={`dead-${u.id}`} fallback={null}>
            <SpriteUnit dex={u.dex} star={u.star} position={cellToWorld(u.c, u.r)} dimmed />
          </Suspense>
        ))}

        <ContactShadows position={[0, 0.06, 0]} opacity={0.42} scale={FIELD_SIZE.w * 1.5} blur={2.4} far={2.2} />
      </Canvas>
    </div>
  );
}
