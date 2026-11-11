"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { spriteUrl, DEF_BY_DEX, primaryTypeForDex } from "@/game/data/mons";
import { useUi } from "@/game/store/uiStore";
import { spriteArt, spriteBoxFor } from "@/game/ui/sprite-art";
import { combatFxMetrics, lungeCurve } from "@/game/ui/combat-fx";
import { relativeModelScale } from "@/game/data/model-scale";
import { useT } from "@/lib/i18n";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { sfx } from "@/lib/audio";
import { hexToPixel, fieldPixelSize, hexDistance, FIELD, HEX_CLIP } from "@/game/engine/hex";
import { useGameLayout } from "./LayoutProvider";
import { useDraggablePanel } from "./useDraggablePanel";
import { ItemPips } from "./UnitChip";
import { CombatField3D } from "./CombatField3D";
import { useAppStore } from "@/game/store/appStore";
import { TYPE_COLOR } from "@/game/ui";
import { SnowIcon, SwordIcon, ShieldIcon } from "./icons";
import { Leaf, BarChart3 } from "lucide-react";
import { serverNow } from "@/game/net/serverTime";
// geometry.ts was promoted to @/game/ui/hex3d on main (a pure rename), so the
// model work's import of HEX_W follows it here.
import { abilityCells, normaliseUnitItems } from "@/game/engine/combat";
import type { CombatResult, Frame, FrameUnit, CombatEvent, CastShape } from "@/game/engine/combat";
import type { PokeType } from "@/game/types";




/** Mirror a replay through the field centre (180° rotation) and swap teams, so
 *  the "enemy"-side player of a shared canonical sim still sees THEIR team at the
 *  bottom. Pure view transform — the underlying sim is byte-identical on both
 *  screens, which is what guarantees matching outcomes. */
function mirrorResult(r: CombatResult): CombatResult {
  return {
    ...r,
    winner: r.winner === "ally" ? "enemy" : r.winner === "enemy" ? "ally" : "draw",
    frames: r.frames.map((f) => ({
      ...f,
      units: f.units.map((u) => ({
        ...u,
        team: u.team === "ally" ? "enemy" : "ally",
        c: FIELD.cols - 1 - u.c,
        r: FIELD.rows - 1 - u.r,
      })),
    })),
  };
}

/** Stable empty — a new [] per render would change identity every frame and
 *  defeat the memoised unit rows. */
const EMPTY_ITEMS: string[] = [];

/** Tile size is responsive now (see LayoutProvider) — each component that draws
 *  on the field reads it from the layout and keeps the old local names, so the
 *  geometry call sites below are unchanged. */
const SIM_DT = 1 / 16;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export function CombatStage({
  result: rawResult,
  flip = false,
  opponentName,
  onResolve,
  autoResolve = false,
  inline = false,
  pve = false,
  authWon,
  hpLost,
  suppressRecap = false,
  syncStart,
  syncWindowMs,
}: {
  result: CombatResult;
  /** Mirror the view (this player is the canonical sim's "enemy" side). */
  flip?: boolean;
  /** HP the player lost this round (0 on a win / PvE breather) — shown in the banner. */
  hpLost?: number;
  /** Hide the side recap (e.g. while a unit's detail card occupies the rail). */
  suppressRecap?: boolean;
  /** Host-authoritative win flag for THIS player. When set, the result banner
   *  uses it (instead of the local re-sim) so the outcome shown can never
   *  disagree with the HP the host actually applied. */
  authWon?: boolean;
  opponentName: string;
  onResolve: (won: boolean, survivors: number) => void;
  /** Multiplayer: the host clock advances the round, so hide the Continue button. */
  autoResolve?: boolean;
  /** PvE (wild Pokémon) round — shown with a distinct banner. */
  pve?: boolean;
  /** Render in-flow (inside the board column) instead of a fullscreen overlay,
   *  so the bench + shop stay reachable during the fight. */
  inline?: boolean;
  /** Multiplayer: server-time ms the combat phase started. When set (with
   *  syncWindowMs), the replay is driven by the SHARED clock — every client
   *  plays in lockstep and always finishes within the round, so local speed
   *  controls can't desync what people see. The result itself is already
   *  host-authoritative; this just keeps the visuals aligned. */
  syncStart?: number;
  /** Multiplayer: length of the combat phase in ms (COMBAT_MS). */
  syncWindowMs?: number;
}) {
  const result = useMemo(() => (flip ? mirrorResult(rawResult) : rawResult), [rawResult, flip]);
  const frames = result.frames;
  const last = frames.length - 1;
  const clockDriven = syncStart != null && syncWindowMs != null;
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [recapOpen, setRecapOpen] = useState(true);
  const [speed, setSpeed] = useState(1.5);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  const lastTs = useRef<number | null>(null);
  // Pre-fight stare-down: hold both teams on their opening hexes for PREFIGHT_MS
  // while a bar fills 0→full, so you get a beat to read the enemy board before the
  // sim animates. `preview` is the 0..1 fill (1 = preview done, fight rolling).
  const PREFIGHT_MS = 2000;
  const [preview, setPreview] = useState(0);
  const localStartTs = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    // Lockstep playback: map elapsed shared-clock time onto the frame timeline,
    // finishing at 85% of the window so the result banner shows before the
    // round transitions. Identical on every client (deterministic frames +
    // constant window), so nobody sees a different ending.
    const preS = PREFIGHT_MS / 1000;
    const loopSynced = () => {
      const elapsed = (serverNow() - syncStart!) / 1000;
      // Stare-down first: pin the opening frame, fill the readiness bar.
      if (elapsed < preS) {
        setIdx(0);
        setPreview(elapsed / preS);
        raf = requestAnimationFrame(loopSynced);
        return;
      }
      setPreview(1);
      // Replay over the rest of the window (minus the preview we just spent), still
      // finishing at 85% of the window so the banner shows before the transition.
      const playWindow = (syncWindowMs! / 1000) * 0.85 - preS;
      const p = Math.max(0, Math.min(1, (elapsed - preS) / playWindow));
      setIdx(p * last);
      if (p >= 1) { setFinished(true); return; }
      raf = requestAnimationFrame(loopSynced);
    };
    const loopLocal = (ts: number) => {
      if (localStartTs.current == null) localStartTs.current = ts;
      const sinceStart = (ts - localStartTs.current) / 1000;
      if (sinceStart < preS) {
        setPreview(sinceStart / preS);
        raf = requestAnimationFrame(loopLocal);
        return;
      }
      setPreview(1);
      if (lastTs.current == null) lastTs.current = ts; // first post-preview frame → dt 0
      const dtReal = (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      setIdx((prev) => {
        const next = prev + (dtReal / SIM_DT) * speedRef.current;
        if (next >= last) { setFinished(true); return last; }
        return next;
      });
      raf = requestAnimationFrame(loopLocal);
    };
    raf = requestAnimationFrame(clockDriven ? loopSynced : loopLocal);
    return () => cancelAnimationFrame(raf);
  }, [last, clockDriven, syncStart, syncWindowMs]);

  // Trust the host's authoritative outcome for the banner (falls back to the
  // local sim only when not provided) — so "you win/lose" always matches the HP
  // the host applied, even if a board edge-case made the local replay diverge.
  const won = authWon ?? (result.winner === "ally");

  // Post-combat tally — your team's total damage dealt / taken this fight, for the result beat.
  const tally = useMemo(() => {
    let dealt = 0, taken = 0;
    for (const u of frames[last]?.units ?? []) if (u.team === "ally") { dealt += u.dmgDealt; taken += u.dmgTaken; }
    return { dealt: Math.round(dealt), taken: Math.round(taken) };
  }, [frames, last]);

  // Tamper/desync detection: the client independently re-ran the SAME
  // deterministic sim from the host's frozen boards, so a disagreement between
  // the host's authoritative outcome and our local result means either a genuine
  // desync or a host writing a result that isn't the canonical sim. We can't
  // override host-applied HP without a trusted server, but we surface it.
  const flaggedRef = useRef(false);
  useEffect(() => {
    if (!finished || flaggedRef.current || authWon === undefined) return;
    flaggedRef.current = true;
    if (authWon !== (result.winner === "ally")) {
      console.warn("[combat-integrity] host outcome disagrees with local canonical sim", { authWon, localWinner: result.winner });
    }
  }, [finished, authWon, result.winner]);

  // Play sound when combat ends — exactly once, using the LATEST `won` at the
  // moment the fight finishes (a ref so a late-arriving authWon isn't read stale
  // and we never play both the local and the authoritative result).
  const wonRef = useRef(won);
  useEffect(() => { wonRef.current = won; });
  const playedEnd = useRef(false);
  useEffect(() => {
    if (!finished || playedEnd.current) return;
    playedEnd.current = true;
    if (wonRef.current) sfx.victory(); else sfx.defeat();
  }, [finished]);

  const layout = useGameLayout();
  const board3d = useAppStore((st) => st.settings.board3d);
  // Older fights were persisted before unitItems existed; default it so a
  // stored replay from a previous version still renders.
  // Coerced, not just defaulted. Firebase RTDB stores arrays as index-keyed
  // objects and hands them back that way, so `unitItems[id]` can arrive as
  // {0:"x",1:"y"} rather than an array — `.length` is then undefined and
  // `.map` throws, mid-fight, only for the non-host clients. toCombatant()
  // already guards the same hazard on `u.items`; this is the same trap one
  // level up.
  const unitItems = useMemo(
    () => normaliseUnitItems(result.unitItems as Record<string, unknown> | undefined),
    [result],
  );
  const TILE_W = layout.tile.w;
  const FX = combatFxMetrics(TILE_W);
  const TILE_H = layout.tile.h;

  const { w, h } = fieldPixelSize(TILE_W, TILE_H);
  // Platform thickness, matching the planning board's.
  const wallT = Math.max(10, Math.round(TILE_W * 0.26));
  const fi = Math.min(Math.floor(idx), last);
  const frac = idx - fi;
  const a = frames[fi];
  const b = frames[Math.min(fi + 1, last)];

  // The per-frame derived structures (interpolation maps, the trailing FX window,
  // and the O(n²) facing pass) depend ONLY on the integer frame index `fi`, not
  // the sub-frame `frac`. Memoizing on `fi` rebuilds them when the frame advances
  // instead of on every 60fps paint — kills the combat-phase jank.
  const FX_TRAIL = 9;
  const { aMap, bMap, recentFx, recentHit, facing } = useMemo(() => {
    const aMap = new Map(a.units.map((u) => [u.id, u]));
    const bMap = new Map(b.units.map((u) => [u.id, u]));
    const recentFx: { fk: string; e: CombatEvent; pos: Map<string, FrameUnit> }[] = [];
    const recentHit = new Set<string>();
    for (let f = Math.max(0, fi - FX_TRAIL); f <= fi; f++) {
      const fr = frames[f];
      if (!fr) continue;
      const pm = f === fi ? aMap : new Map(fr.units.map((u) => [u.id, u]));
      fr.events.forEach((e, k) => {
        if (e.kind === "hit") { recentFx.push({ fk: `${f}-${k}`, e, pos: pm }); if (f >= fi - 1) recentHit.add(e.to); }
        else if (e.kind === "cast") recentFx.push({ fk: `${f}-${k}`, e, pos: pm });
      });
    }
    const facing = new Map<string, number>();
    for (const u of a.units) {
      if (!u.alive) continue;
      let nx = u.c;
      let best = Infinity;
      for (const o of a.units) {
        if (!o.alive || o.team === u.team) continue;
        const d = hexDistance({ c: u.c, r: u.r }, { c: o.c, r: o.r });
        if (d < best) { best = d; nx = o.c; }
      }
      facing.set(u.id, nx);
    }
    return { aMap, bMap, recentFx, recentHit, facing };
  }, [fi, frames, a, b]);


  const aliveAlly = a.units.filter((u) => u.team === "ally" && u.alive).length;
  const aliveEnemy = a.units.filter((u) => u.team === "enemy" && u.alive).length;

  // Side strength as a fraction of what that side STARTED with. hpFrac is all a
  // frame carries (no maxHp), so this is unit-weighted rather than HP-weighted
  // — it tracks "how much army is left standing", which is what the bar is for.
  // Baseline MUST come from `result`, not `rawResult`: mirrorResult() swaps the
  // team labels for a flipped player, so a baseline taken from the unmirrored
  // frames would be compared against the opposite side and the two bars would
  // read inverted for exactly half the players.
  const startStrength = useMemo(() => {
    const f0 = result.frames[0];
    const sum = (team: string) =>
      f0 ? f0.units.filter((u) => u.team === team).reduce((n, u) => n + u.hpFrac, 0) : 0;
    return { ally: sum("ally"), enemy: sum("enemy") };
  }, [result]);
  const liveSum = (team: string) =>
    a.units.filter((u) => u.team === team && u.alive).reduce((n, u) => n + u.hpFrac, 0);
  const allyStrength = startStrength.ally > 0 ? Math.min(1, liveSum("ally") / startStrength.ally) : 0;
  const enemyStrength = startStrength.enemy > 0 ? Math.min(1, liveSum("enemy") / startStrength.enemy) : 0;

  return (
    <div className={inline
      ? "absolute inset-0 flex items-center justify-center"
      : "fixed inset-0 z-screen flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"}>
      {/* Combat chrome (scoreboard + timer) FLOATS at the top so the battlefield
          stays vertically centered in the exact same box as the planning board —
          the layout never shifts between phases. */}
      <div className="absolute top-0 inset-x-0 flex flex-col items-center">
      {/* Subtle one-line matchup (was a big scoreboard bar) — survivor counts +
          opponent, kept minimal so it doesn't dominate the fight view. */}
      <div className="flex items-center justify-center gap-2 mb-1 text-[11px] font-bold max-w-[460px]">
        <span className="tabular-nums text-emerald-300">{aliveAlly}</span>
        <span className={a.overtime ? "text-rose-400 animate-pulse" : "text-slate-500"}>{a.overtime ? t.cs_overtime : t.cs_vs}</span>
        <span className={`inline-flex items-center gap-1 truncate ${pve ? "text-emerald-300" : "text-rose-300"}`}>{pve && <Leaf size={13} />}{opponentName} <span className="tabular-nums">{aliveEnemy}</span></span>
      </div>

      {/* Army strength. Survivor counts alone hide the shape of a fight: 4v4
          reads as even whether both sides are untouched or yours is four
          slivers. TFT pairs the opponent with a strength bar for exactly this
          reason. Weighted by remaining health across the side's starting
          roster, so it falls as units are chipped, not only as they die. */}
      <div className="flex items-center gap-1.5 w-[260px] max-w-full mb-0.5" aria-hidden>
        <div className="flex-1 h-[5px] rounded-full bg-black/70 overflow-hidden flex justify-end">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${allyStrength * 100}%`, background: "#34d399" }} />
        </div>
        <div className="flex-1 h-[5px] rounded-full bg-black/70 overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${enemyStrength * 100}%`, background: pve ? "#34d399" : "#fb7185" }} />
        </div>
      </div>

      {a.overtime && <span className="text-[9px] font-extrabold text-rose-400 animate-pulse tracking-wider mt-0.5">{t.cs_overtime}</span>}

      {/* Pre-fight stare-down bar — fills 0→full over PREFIGHT_MS, then the fight rolls. */}
      {preview < 1 && !finished && (
        <div className="flex flex-col items-center gap-1 mt-0.5 w-[240px]">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold-200/80 animate-pulse">{t.cs_get_ready}</span>
          <div className="h-1.5 w-full rounded-full bg-black/50 overflow-hidden" style={{ outline: "1px solid rgba(212,175,55,0.3)" }}>
            <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${preview * 100}%`, transition: "width 80ms linear" }} />
          </div>
        </div>
      )}
      </div>

      {/* Battlefield (the focus) + a compact side recap with DMG/TANK/HEAL tabs.
          Inline (multiplayer) pins the battlefield to the LEFT so it lines up
          pixel-for-pixel with the planning board; the recap overflows to the
          right into the reserved rail space. Fullscreen centers the pair. */}
      {/* Centred in both modes now. This used to pin LEFT when inline so the
          recap could spill into the 340px item rail — but that rail is gone
          (details float on demand), so spilling put the recap on top of the
          trainers list. The recap is an overlay below instead. */}
      <div className="flex items-start justify-center w-full">
      <div
        className="relative shrink-0 arena-frame"
        style={{
          width: w + 28, height: h + 28, padding: board3d ? 0 : 14,
          // The CSS field needs a perspective ancestor; the canvas brings its
          // own camera and must NOT be inside a rotated plane, or it gets
          // skewed and drawn on top of a second, redundant arena.
          ...(board3d ? {} : { perspective: `${layout.perspective}px`, perspectiveOrigin: "50% 50%" }),
        }}
      >
        {board3d && (
          <CombatField3D a={a} b={b} frac={frac} size={{ w: w + 28, h: h + 28 }} unitItems={unitItems} />
        )}
        {!board3d && (<>
        {/* Same raked platform as the planning board — combat was rendering a
            flat grid while planning showed a 3D arena, which made the phase
            flip look like two different games. */}
        <div
          className="absolute inset-0 arena-plane"
          style={{ transform: `rotateX(${layout.tilt}deg)`, transformStyle: "preserve-3d" }}
        >
        <div className="absolute inset-0 rounded-2xl arena-slab" style={{ transformStyle: "preserve-3d" }}>
          <span className="arena-wall arena-wall-front" style={{ height: wallT, transformOrigin: "50% 0%", transform: "rotateX(-90deg)" }} aria-hidden />
          <span className="arena-wall arena-wall-side" style={{ width: wallT, left: 0, transformOrigin: "100% 50%", transform: "rotateY(90deg)" }} aria-hidden />
          <span className="arena-wall arena-wall-side" style={{ width: wallT, right: 0, transformOrigin: "0% 50%", transform: "rotateY(-90deg)" }} aria-hidden />
          <span className="arena-rail" aria-hidden />
          <span className="arena-dust" aria-hidden />
        </div>
        <div className="absolute" style={{ left: 14, top: 14, width: w, height: h }}>
          <HexGrid />

          {/* Ability areas. TFT tints hexes in exactly one place — the cells an
              ability is about to hit — and it is a large part of why its fights
              read. This existed only in the WebGL field, which is opt-in and
              off by default, so the single highest-value readability cue in the
              game was invisible to most players. Same engine source
              (abilityCells) and the same truth rules as the 3D field, so the
              two renderers cannot disagree about what gets hit. */}
          <AbilityCells frames={frames} fi={fi} />

          {/* Corpses (behind) */}
          {a.units.filter((u) => !u.alive && !(bMap.get(u.id)?.alive)).map((u) => (
            <Corpse key={`c-${u.id}`} unit={u} />
          ))}

          {/* Living units.
              PAINTED BACK TO FRONT. Units carry no z-index, so paint order was
              simulation order — whatever sequence the engine happened to hold
              them in. With every sprite drawn at 1.85x its tile and overflowing
              upward, neighbours overlap heavily, so a unit standing BEHIND
              another was regularly drawn on top of it. The planning board has
              always ordered by row (`zIndex: localR + ALLY_ROW0`); combat never
              did.
              Sorting rather than assigning z-index on purpose: these units sit
              in the same stacking context as the ability FX and damage numbers
              that follow them, and giving units a z-index would lift them above
              those too. DOM order is the painter's algorithm and leaves the FX
              layer where it belongs. Sorted on the INTERPOLATED y so the order
              stays correct while units are moving, not just when they land. */}
          {a.units
            .flatMap((u) => {
              const bu = bMap.get(u.id) ?? u;
              if (!u.alive && !bu.alive) return [];
              const pa = hexToPixel({ c: u.c, r: u.r }, TILE_W, TILE_H);
              const pb = hexToPixel({ c: bu.c, r: bu.r }, TILE_W, TILE_H);
              return [{ u, bu, x: lerp(pa.x, pb.x, frac), y: lerp(pa.y, pb.y, frac) }];
            })
            .sort((p, q) => p.y - q.y)
            .map(({ u, bu, x, y }) => {
            const hpFrac = lerp(u.hpFrac, bu.hpFrac, frac);
            const manaFrac = lerp(u.manaFrac, bu.manaFrac, frac);
            const attackEv = a.events.find((e) => e.kind === "attack" && e.from === u.id);
            const castEv = a.events.find((e) => e.kind === "cast" && e.from === u.id);
            const castColor = castEv && castEv.kind === "cast" ? (TYPE_COLOR[castEv.moveType] ?? "#a78bfa") : null;
            const hitThisFrame = recentHit.has(u.id);
            // Step into the thing we're hitting.
            //
            // Reach scales with the tile (it was a flat 13px, so the same step
            // was 28% of a tile on a phone and 11% on a desktop), and it is
            // shaped across the frame by lungeCurve rather than held at full
            // extension for the whole of it — a unit that is already extended
            // when the frame opens has no moment of impact.
            let lunge = { dx: 0, dy: 0 };
            let strike = 0;
            if (attackEv && attackEv.kind === "attack") {
              const tgt = aMap.get(attackEv.to);
              if (tgt) {
                const tp = hexToPixel({ c: tgt.c, r: tgt.r }, TILE_W, TILE_H);
                const dx = tp.x - x, dy = tp.y - y;
                const m = Math.hypot(dx, dy) || 1;
                strike = lungeCurve(frac);
                const reach = FX.lunge * strike;
                lunge = { dx: (dx / m) * reach, dy: (dy / m) * reach };
              }
            }
            return (
              <CombatUnit
                key={u.id}
                unit={u}
                x={x}
                y={y}
                hpFrac={hpFrac}
                manaFrac={manaFrac}
                lunge={lunge}
                strike={strike}
                flash={hitThisFrame ? `${fi}-${u.id}` : null}
                cast={castColor}
                faceLeft={(facing.get(u.id) ?? u.c) < u.c}
                showSprite
                items={unitItems[u.id] ?? EMPTY_ITEMS}
              />
            );
          })}

          {/* Projectiles for ranged BASIC attacks (abilities get their own VFX). */}
          {a.events.map((e, k) => {
            if (e.kind !== "attack") return null;
            const from = aMap.get(e.from);
            const to = aMap.get(e.to);
            if (!from || !to) return null;
            if (hexDistance({ c: from.c, r: from.r }, { c: to.c, r: to.r }) <= 1) return null; // melee, no projectile
            if (reducedMotion) return null; // flying bolt is JS-driven motion CSS can't suppress — skip it; the hit + damage number still convey the attack
            const pa = hexToPixel({ c: from.c, r: from.r }, TILE_W, TILE_H);
            const pb = hexToPixel({ c: to.c, r: to.r }, TILE_W, TILE_H);
            const t = easeOut(frac);
            // A glowing energy bolt: an elongated streak aimed along its flight path + a bright
            // core, instead of a flat white dot.
            const cx = lerp(pa.x, pb.x, t), cy = lerp(pa.y, pb.y, t);
            const ang = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
            return (
              <div
                key={`p-${fi}-${k}`}
                className="absolute pointer-events-none"
                style={{ left: cx, top: cy, transform: `translate(-50%, -50%) rotate(${ang}deg)` }}
              >
                <span className="block rounded-full" style={{ width: 22, height: 5, background: "linear-gradient(90deg, rgba(254,240,138,0) 0%, #fde68a 60%, #fff 100%)", boxShadow: "0 0 10px 2px #fde68acc" }} />
              </div>
            );
          })}

          {/* Cast effects + damage numbers — from the trailing window so nothing
              is skipped; ability VFX vary by the move's TYPE and SHAPE. */}
          {recentFx.map(({ fk, e, pos }) => {
            if (e.kind === "cast") {
              const c = pos.get(e.from);
              const tg = pos.get(e.to);
              if (!c) return null;
              const cp = hexToPixel({ c: c.c, r: c.r }, TILE_W, TILE_H);
              const tp = tg ? hexToPixel({ c: tg.c, r: tg.r }, TILE_W, TILE_H) : cp;
              return <AbilityFx key={`cf-${fk}`} x={cp.x} y={cp.y} tx={tp.x} ty={tp.y} moveType={e.moveType} shape={e.shape} eff={e.eff} />;
            }
            if (e.kind !== "hit") return null;
            const t = pos.get(e.to);
            if (!t) return null;
            const p = hexToPixel({ c: t.c, r: t.r }, TILE_W, TILE_H);
            return <DamageNumber key={`dn-${fk}`} x={p.x} y={p.y} dmg={e.dmg} crit={e.crit} sup={e.sup}
              type={TYPE_COLOR[primaryTypeForDex(t.dex) ?? "normal"] ?? null} />;
          })}
        </div>
        </div>
      {/* No 3D layer — see the note in Board.tsx. */}
        </>)}
      </div>
      </div>

      {/* Recap as an OVERLAY pinned to the stage's own left edge, not a sibling
          in the row. As a sibling it widened the layout and pushed itself over
          the trainers rail once the old 340px item column was removed. */}
      {suppressRecap ? null : recapOpen ? (
        <CombatRecapTabs
          units={a.units}
          label={t.cs_your_team}
          onClose={() => setRecapOpen(false)}
          // Where it has always opened: the stage's own left edge, just below
          // the top of the fight. Expressed in viewport coordinates because
          // the panel renders in a portal -- see the note on it. The left rail
          // is only inline above the compact tier; below that the board starts
          // at the padding.
          defaultStyle={{
            position: "fixed",
            left: layout.pad + (layout.railsAsDrawers ? 0 : layout.leftRail + layout.gap),
            top: layout.pad + layout.topH + layout.gap * 2 + 40,
          }}
        />
      ) : (
        <button
          onClick={() => setRecapOpen(true)}
          title={t.cs_show_recap}
          className="gilded absolute left-0 top-10 z-30 w-7 h-32 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gold-200/70 hover:text-gold-100 transition-colors"
        >
          <span><BarChart3 size={14} /></span>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-extrabold uppercase tracking-wider">{t.cs_recap}</span>
        </button>
      )}

      {/* Controls — floated at the bottom of the same box (keeps the field static). */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-2 min-h-[40px]">
        {!finished ? (
          clockDriven ? (
            // Lockstep with the shared clock — no local speed/skip (would desync visuals).
            <span className="text-xs text-slate-500">Resolving combat…</span>
          ) : (
          <>
            {[1, 1.5, 2, 4].map((sp) => (
              <button
                key={sp}
                onClick={() => setSpeed(sp)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${speed === sp ? "bg-gold-500/90 text-black border-gold-400" : "bg-black/30 border-[var(--panel-edge)] text-gold-100/70 hover:text-gold-50"}`}
              >
                {sp}x
              </button>
            ))}
            <button onClick={() => { setIdx(last); setFinished(true); }} className="px-3 py-1 rounded-md bg-black/30 border border-[var(--panel-edge)] text-gold-100/70 hover:text-gold-50 text-xs font-semibold ml-2">
              Skip →
            </button>
          </>
          )
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="gilded gilded-strong celebrate-pop px-6 py-2 rounded-xl flex items-baseline gap-2"
              style={{ boxShadow: `inset 0 1px 0 rgba(231,198,107,0.14), 0 0 34px -10px ${won ? "rgba(52,211,153,0.55)" : result.winner === "draw" ? "rgba(148,163,184,0.4)" : "rgba(244,63,94,0.55)"}, 0 22px 60px -34px rgba(0,0,0,0.85)` }}
            >
              <span className={`text-2xl font-extrabold tracking-tight ${won ? "text-emerald-300" : result.winner === "draw" ? "text-slate-200" : "text-rose-300"}`}>
                {won ? t.cs_victory : result.winner === "draw" ? t.cs_draw : t.cs_defeat}
              </span>
              {!won && result.winner === "enemy" && <span className="text-sm text-slate-400 font-medium">· {result.survivors} survived</span>}
              {/* HP-loss readout (TFT-style): how much the round cost you. */}
              {pve ? (
                <span className="text-xs text-emerald-300/70 font-semibold">· {t.cs_breather}</span>
              ) : hpLost && hpLost > 0 ? (
                <span className="text-sm font-extrabold text-rose-400">−{hpLost} {t.net_hp}</span>
              ) : !won ? null : (
                <span className="text-xs text-emerald-300/70 font-semibold">· {t.cs_no_dmg}</span>
              )}
            </div>
            {/* Damage recap beat — what your team dealt vs took this fight. */}
            <div className="flex items-center gap-2.5 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1 text-rose-300"><SwordIcon size={11} />{tally.dealt}</span>
              <span className="text-slate-600">·</span>
              <span className="inline-flex items-center gap-1 text-sky-300"><ShieldIcon size={11} />{tally.taken}</span>
              {result.survivors > 0 && <><span className="text-slate-600">·</span><span className="text-slate-400">{result.survivors} left</span></>}
            </div>
            {autoResolve ? (
              <span className="text-xs text-slate-500">…</span>
            ) : (
              <button
                onClick={() => onResolve(won, result.winner === "enemy" ? result.survivors : 0)}
                className="px-6 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-black text-sm font-bold"
              >
                {t.cs_continue}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const RECAP_TABS = [
  { key: "dmgDealt", label: "DMG", color: "#fb7185", bar: "bg-rose-500", text: "text-rose-300" },
  { key: "dmgTaken", label: "TANK", color: "#38bdf8", bar: "bg-sky-500", text: "text-sky-300" },
  { key: "healed", label: "HEAL", color: "#34d399", bar: "bg-emerald-500", text: "text-emerald-300" },
] as const;

/**
 * Side recap panel for your team with DMG / TANK / HEAL tabs — pick a metric
 * and the bars filter + re-sort to just that stat.
 *
 * Draggable, because it is pinned over the left of the battlefield and that is
 * where your own back line fights. You could close it, which loses the numbers
 * you opened it for, or leave it covering the fight it is describing. Now it
 * moves, and stays where you put it.
 *
 * Portalled to the body for the same reason the round recap is: a z-index only
 * ranks an element against its siblings inside the nearest stacking context,
 * and the stage sits inside one — so no z-index here could lift a panel the
 * player had dragged over the HUD. It also means the panel is no longer
 * clipped by the stage's own box, which is what "anywhere" has to mean.
 */
function CombatRecapTabs({
  units, label, defaultStyle, onClose,
}: {
  units: FrameUnit[];
  label: string;
  defaultStyle: CSSProperties;
  onClose: () => void;
}) {
  const t = useT();
  const { nodeRef, style, onPointerDown, dragging, moved, reset } = useDraggablePanel(
    "poketft.combatRecap",
    defaultStyle,
  );
  const [tab, setTab] = useState<(typeof RECAP_TABS)[number]["key"]>("dmgDealt");
  const mine = units.filter((u) => u.team === "ally" && (u.dmgDealt + u.dmgTaken + u.healed) > 0);
  const active = RECAP_TABS.find((t) => t.key === tab)!;
  const val = (u: FrameUnit) => u[tab] as number;
  const max = Math.max(1, ...mine.map(val));
  const sorted = [...mine].sort((a, b) => val(b) - val(a)).slice(0, 8);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={nodeRef}
      data-panel="combat-recap"
      style={{ ...style, maxHeight: "72vh" }}
      onPointerDown={onPointerDown}
      className={`gilded z-panel w-[210px] shrink-0 rounded-xl p-2 flex flex-col select-none ${
        dragging ? "cursor-grabbing shadow-[0_8px_30px_rgba(0,0,0,0.6)]" : "cursor-grab"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 px-0.5 shrink-0">
        {/* The grip is the affordance. Without it a draggable panel is only
            discoverable by accident, which is the same as not being draggable. */}
        <span className="flex items-center gap-1.5 min-w-0">
          <span aria-hidden className="text-slate-600 leading-none tracking-[-0.15em] text-[11px]">⋮⋮</span>
          <span className="text-[9px] uppercase tracking-wider text-gold-200/55 truncate">{label}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {moved && (
            <button onClick={reset} title={t.net_panel_reset} aria-label={t.net_panel_reset} className="text-slate-500 hover:text-slate-200 text-xs leading-none">↺</button>
          )}
          <button onClick={onClose} title={t.cs_hide_recap} aria-label={t.cs_hide_recap} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
        </span>
      </div>
      <div className="flex gap-1 mb-2 shrink-0">
        {RECAP_TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={tab === tb.key ? { background: tb.color, color: "#0b1020" } : undefined}
            className={`flex-1 text-[10px] font-extrabold py-1 rounded-md border transition-colors ${tab === tb.key ? "border-transparent" : "bg-black/30 border-[var(--panel-edge)] text-gold-100/60 hover:text-gold-50"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {/* The list scrolls rather than the panel growing: it is now positioned
          from the viewport, so an eight-mon board must not push its own bottom
          off screen. */}
      <div className="flex flex-col gap-1 min-h-0 overflow-y-auto">
        {sorted.length === 0 && <div className="text-[10px] text-slate-600 text-center py-2">—</div>}
        {sorted.map((u) => (
          <div key={u.id} className={`flex items-center gap-1.5 ${u.alive ? "" : "opacity-50"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(u.dex)} alt="" width={20} height={20} style={{ imageRendering: "pixelated" }} />
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-0">
              <div className={`h-full rounded-full ${active.bar}`} style={{ width: `${(val(u) / max) * 100}%` }} />
            </div>
            <span className={`w-10 text-right text-[10px] tabular-nums font-semibold ${active.text}`}>{val(u)}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The hexes a cast is about to hit, painted on the floor under the units.
 *
 * Mirrors CombatField3D exactly:
 *  - a `blast` ignores the move's shape and hits EVERY living enemy, so its
 *    cells are those units' own hexes — a geometric area would be plain wrong;
 *  - every other shape uses the engine's own abilityCells(), minus the cells
 *    the caster's OWN side stands on, since castAbility filters by team and
 *    those can never be hit.
 * The caster's half is deliberately NOT clipped: units advance across the
 * midline during a fight, so an enemy may well be standing in it.
 */
/** How many sim frames a telegraph stays on screen. */
const AREA_HOLD_FRAMES = 8;

const AbilityCells = memo(function AbilityCells({ frames, fi }: { frames: Frame[]; fi: number }) {
  const layout = useGameLayout();
  const TILE_W = layout.tile.w;
  const TILE_H = layout.tile.h;

  // Cast events live on ONE frame, and a frame is SIM_DT (62.5ms) of wall time.
  // Rendering only the current frame's casts made each telegraph appear and
  // unmount within a single frame — far too brief to read, and it cut the fade
  // animation off before it started. So we gather the casts from a short window
  // of recent frames and key them by their frame, which keeps each element
  // mounted as the window slides and lets its animation play out in full.
  const start = Math.max(0, fi - AREA_HOLD_FRAMES + 1);
  const recent: { f: number; i: number; e: Extract<CombatEvent, { kind: "cast" }> }[] = [];
  for (let f = start; f <= fi; f++) {
    const fr = frames[f];
    if (!fr) continue;
    fr.events.forEach((e, i) => { if (e.kind === "cast") recent.push({ f, i, e }); });
  }
  if (recent.length === 0) return null;

  return (
    <>
      {recent.map(({ f, i, e }) => {
        // EVERY part of the cell set is read from the frame the cast FIRED on.
        // That is the board state the engine resolved the ability against, so
        // it is the only snapshot that can describe what actually got hit.
        //
        // Reading the target from the CURRENT frame instead (an earlier version
        // of this) was wrong twice over: the indicator dragged along behind a
        // target that had since stepped away, and — because the own-team filter
        // below still used the cast frame — the two halves of the set were
        // computed from different boards, so it could tint a hex an ally had
        // since moved onto, which is exactly what the filter exists to prevent.
        const frame = frames[f];
        const byId = new Map(frame.units.map((u) => [u.id, u]));
        const target = byId.get(e.to);
        if (!target) return null;
        const colour = TYPE_COLOR[e.moveType] ?? "#a78bfa";
        const casterTeam = byId.get(e.from)?.team;

        const cells =
          e.shape === "blast"
            ? frame.units.filter((u) => u.alive && u.team !== casterTeam).map((u) => ({ c: u.c, r: u.r }))
            : abilityCells({ c: target.c, r: target.r }, e.shape).filter(
                (cell) =>
                  !frame.units.some((u) => u.alive && u.team === casterTeam && u.c === cell.c && u.r === cell.r),
              );

        // Fragment with an explicit key, NOT a bare returned array. React
        // reconciles a nested array by its position in the parent's children
        // and wraps it in a KEYLESS fiber, so the inner keys only match within
        // whichever slot the array happens to occupy. As soon as the oldest
        // cast fell out of the hold window every surviving cast shifted down a
        // slot, its inner keys stopped matching, and all of its cells were
        // destroyed and recreated — restarting the fade from zero. That is the
        // precise flicker the hold window was added to remove.
        return (
          <Fragment key={`fx-${f}-${i}`}>
            {cells.map((cell, j) => {
              const p = hexToPixel(cell, TILE_W, TILE_H);
              return (
                <div
                  key={j}
                  className="absolute pointer-events-none combat-area"
                  style={{
                    left: p.x - TILE_W / 2,
                    top: p.y - TILE_H / 2,
                    width: TILE_W - 3,
                    height: TILE_H - 3,
                    clipPath: HEX_CLIP,
                    background: colour,
                    boxShadow: `inset 0 0 0 2px ${colour}`,
                  }}
                />
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
});

const HexGrid = memo(function HexGrid() {
  const layout = useGameLayout();
  const TILE_W = layout.tile.w;
  const TILE_H = layout.tile.h;
  // Combat floor is hex-PAVED STONE, not a team-tinted grid.
  //
  // TFT's fight view has no green/red lattice: the arena is neutral paving and
  // the only coloured hexes are ability-area indicators. Team identity is read
  // from the units themselves — their HP bar colour and feet ring — which is
  // also why it stays legible when two armies are interleaved. Tinting every
  // cell by owner competed with that and made the fight read as a board game
  // rather than a battle.
  const cells = [];
  for (let r = 0; r < FIELD.rows; r++) {
    for (let c = 0; c < FIELD.cols; c++) {
      const p = hexToPixel({ c, r }, TILE_W, TILE_H);
      cells.push(
        <div
          key={`${c}-${r}`}
          className="absolute"
          style={{
            left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W - 3, height: TILE_H - 3,
            clipPath: HEX_CLIP,
            background: "rgba(170,196,236,0.045)",
            boxShadow: "inset 0 0 0 1px rgba(170,196,236,0.16), inset 0 0 14px rgba(120,150,200,0.06)",
          }}
        />,
      );
    }
  }
  return <>{cells}</>;
});

function CombatUnit({
  unit, x, y, hpFrac, manaFrac, lunge, strike, flash, cast, faceLeft, showSprite, items,
}: {
  unit: FrameUnit; x: number; y: number; hpFrac: number; manaFrac: number;
  lunge: { dx: number; dy: number }; strike: number; flash: string | null; cast: string | null; faceLeft: boolean;
  /** False once this unit's 3D model has loaded — the sprite is the fallback. */
  showSprite: boolean;
  /** Held item ids, constant for the fight (CombatResult.unitItems). */
  items: string[];
}) {
  const ally = unit.team === "ally";
  const ring = unit.mega ? "#f0abfc" : ally ? "#34d399" : "#fb7185";
  const flip = ally ? faceLeft : !faceLeft; // mons face their target
  const manaFull = manaFrac >= 0.999; // full mana → about to cast: telegraph it
  // HP bar carries the mon's TYPE, not its team.
  //
  // Team was already legible without it — the back-glow and the feet ring under
  // every unit are team-coloured, which is what the renderer leans on. Spending
  // the bar on the same fact twice wasted the one piece of per-unit colour on
  // screen, while the thing you actually want mid-fight (what am I looking at,
  // and will it resist that) had no colour at all.
  const low = hpFrac <= 0.25;
  const typeColor = TYPE_COLOR[primaryTypeForDex(unit.dex) ?? "normal"] ?? "#94a3b8";
  const hpBar = typeColor;
  // The thrust scale follows the same curve as the step, so the unit swells
  // INTO the hit and settles out of it instead of popping to a fixed size for
  // the frame and snapping back.
  const castScale = cast ? 1.16 : 1 + 0.08 * strike;
  // Mirrors the planning board exactly: a cell-sized, bottom-aligned box with an
  // oversized sprite standing in it. The previous version counter-rotated the
  // WHOLE bar+sprite stack about its bottom edge while the sprite image was far
  // larger than its box — the two offsets compounded and left the HP bars
  // floating ~50px above the unit they belonged to.
  const layout = useGameLayout();
  const tilt = layout.tilt;
  const TW = layout.tile.w;
  const TH = layout.tile.h;
  /** Height of the HP + mana stack, so it clears the head rather than covering it. */
  const BAR_STACK_H = 18;
  /**
   * Bar width, as a fraction of the tile.
   *
   * Was 0.9, against a column pitch of exactly one tile — so two units standing
   * side by side had bars 0.1 of a tile apart, which read as ONE continuous
   * rail spanning both of them rather than as each mon's own health.
   */
  const BAR_W = 0.66;
  /**
   * Same rule as the board: size from the ART, not the padded frame.
   *
   * This was a flat `TW * 1.85` with NO species scale, while the board applied
   * one -- so a mon changed size between planning and combat. Both now go
   * through spriteBoxFor(), so a unit is the same size wherever it stands.
   */
  const S = Math.round(spriteBoxFor(unit.dex, TW, relativeModelScale(unit.dex)));
  const art = spriteArt(unit.dex, S);
  /**
   * The art's horizontal centre, in px from the cell's centre, AFTER mirroring.
   *
   * `flip` mirrors the sprite about its FRAME's centre (scaleX(-1)), so for a
   * mon whose art sits off-centre in its 96x96 frame the art lands on the other
   * side when flipped. Every unit flips to face its target, so half the board
   * is mirrored at any moment — and anything placed at the unmirrored offset
   * (the HP bar, the feet shadow) was then wrong by twice that offset, pushing
   * it toward a neighbour.
   */
  const artCx = flip ? -art.centerOffsetX : art.centerOffsetX;
  // Bar placement is TILE-relative, not derived from the sprite box: PokéAPI
  // frames carry wildly different amounts of transparent padding, so there's no
  // consistent "crown" to measure from — anchoring to the image box left bars
  // floating ~70px above small sprites.
  //
  // The sprite is the star: team identity comes from a soft back-glow and the
  // feet ring rather than a hard disc, so it reads as a Pokémon, not a token.
  return (
    <div
      // Clickable mid-fight. A combat frame is a replay, so inspecting a unit
      // changes nothing — and the fight is exactly when you want to know what
      // a mon is, what it resists and what it evolves into. There was no way
      // to ask: units were inert for the whole phase.
      onClick={() => {
        const hit = DEF_BY_DEX[unit.dex];
        if (hit) useUi.getState().setInspect(hit.def.id, hit.star);
      }}
      role="button"
      tabIndex={-1}
      className="absolute flex items-end justify-center cursor-pointer"
      style={{
        left: x - TW / 2,
        top: y - TH / 2,
        width: TW,
        height: TH,
        transform: `translate(${lunge.dx}px, ${lunge.dy}px)`,
        // No transition: the lunge is recomputed every animation frame now, and
        // easing a value that is already being driven per-frame only makes it
        // lag the thing it is supposed to be hitting.
      }}
    >
      {/* Counter-rotated so the unit stands upright on the raked ground, anchored
          at its feet — the bars live INSIDE this, pinned relative to the sprite,
          so they can never drift away from the unit they describe. */}
      <div
        className="relative"
        style={{
          transform: `rotateX(${-tilt}deg) scale(${castScale})`,
          transformOrigin: "bottom center",
          transition: "transform 80ms ease-out",
        }}
      >
      {/* Bars, stacked just above the sprite's crown. */}
      {/* Centred on the unit explicitly. `inset-x-0` plus an explicit width
          fight each other: inset pins left AND right, then the width wins and
          the stack grows rightward from the left edge — which is exactly how
          the bars ended up floating off to the side of their unit. */}
      {/* Anchored to the mon's HEAD. The old tile-relative offset was a fixed
          fraction of the tile, which ignored how much transparent padding the
          sprite carries above its art — on average 20.6% of the frame, up to
          50%. With the sprite drawn at 1.85x the tile that put the bar more
          than half a hex above its own unit, close enough to the mon in FRONT
          to read as that one's health. Measured per species instead. */}
      <div
        className="absolute flex flex-col items-center"
        style={{
          // The sprite box is pinned to [TH - S, TH], so the art's top edge is
          // TH - S + art.top and the bar sits one stack-height above it.
          // + .bottom because the sprite is shifted down by exactly that much.
          top: TH - S + art.top + art.bottom - BAR_STACK_H,
          // Centred on the ART, not the frame: a fair number of sprites sit
          // off-centre in their 96x96 box, which slid the bar sideways off its
          // own mon and toward a neighbour.
          left: TW / 2 + artCx,
          transform: "translateX(-50%)",
        }}
      >
      {/* Critical HP used to be a darker shade of the team colour. With a type
          hue that trick is gone, so it is a red outline + pulse instead —
          louder than the old cue, and it does not fight the type for the fill. */}
      <div className={`h-[7px] rounded-[3px] bg-black/80 overflow-hidden mb-[3px] ${low ? "animate-pulse" : ""}`} style={{ outline: low ? "1.5px solid #f87171" : "1px solid rgba(0,0,0,0.55)", width: TW * BAR_W }}>
        <div className="h-full rounded-[3px] transition-[width] duration-100" style={{ width: `${hpFrac * 100}%`, background: hpBar, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 2px rgba(0,0,0,0.28)" }} />
      </div>
      {/* Mana bar — glows + pulses when full (a cast is coming). */}
      <div className={`h-[4px] rounded-full bg-black/70 overflow-hidden ${manaFull ? "animate-pulse" : ""}`} style={manaFull ? { boxShadow: "0 0 7px 1px #38bdf8dd", width: TW * BAR_W * 0.82 } : { width: TW * BAR_W * 0.82 }}>
        <div className="h-full transition-[width] duration-100" style={{ width: `${manaFrac * 100}%`, background: manaFull ? "#bae6fd" : "#38bdf8" }} />
      </div>
      </div>
      {/* Held items, under the feet exactly as on the planning board. Drawn
          OUTSIDE the counter-rotated sprite stack would tilt them with the
          board; inside it they stay upright and legible at every tilt tier. */}
      {items.length > 0 && (
        <div className="absolute pointer-events-none" style={{ bottom: -Math.round(TW * 0.18), left: TW / 2 + artCx, transform: "translateX(-50%)", width: TW }}>
          <div className="relative" style={{ height: 1 }}>
            <ItemPips items={items} megaReady={unit.mega} unitSize={TW} />
          </div>
        </div>
      )}
      {/* Grounding "feet" ellipse — team-coloured, sits under the sprite. */}
      {/* Grounding "feet" ellipse. Centred on the ART (flip included) rather
          than on the cell: a mon standing off-centre in its frame otherwise
          cast its shadow beside itself. */}
      <span
        className="absolute rounded-[50%] pointer-events-none"
        style={{
          bottom: -2,
          left: TW / 2 + artCx,
          transform: "translateX(-50%)",
          width: TW * 0.6,
          height: TW * 0.17,
          background: `radial-gradient(ellipse at center, ${ring}77, transparent 72%)`,
        }}
      />
      {/* Box is the CELL; the sprite inside it is oversized and bottom-aligned,
          so it breaks the cell upward exactly like a board unit. */}
      <div className="relative mx-auto" style={{ width: TW, height: TH }}>
        {/* Soft team aura behind the mon (stronger for mega) — replaces the hard ring disc. */}
        {/* Centred on the art (flip included), like the shadow — a back-glow
            offset from its own mon reads as a second, ghostly unit. */}
        <span className="absolute inset-y-0 rounded-full pointer-events-none" style={{ left: TW / 2 + artCx, transform: "translateX(-50%)", width: TW, background: `radial-gradient(circle at 50% 60%, ${ring}${unit.mega ? "55" : "2e"}, transparent 66%)` }} />
        {/* Cast wind-up: a charging aura + an expanding ring in the move's colour, telegraphing
            the ability the instant before it fires. */}
        {cast && <span className="absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${cast}88, transparent 62%)` }} />}
        {cast && <span className="absolute inset-[-7px] rounded-full pointer-events-none combat-cast" style={{ border: `3px solid ${cast}`, boxShadow: `0 0 18px 3px ${cast}` }} />}
        {showSprite && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteUrl(unit.dex)}
            alt=""
            width={S}
            height={S}
            // Absolute, not a flex child: as a flex item it was shrunk from S to
            // fit a box 1.85x smaller, so its real size was whatever flexbox
            // decided and every offset computed from S was wrong. Bottom-aligned
            // and centred by hand, so the art box is exactly [TH - S, TH].
            style={{
              // max-width:none is load-bearing. Tailwind's Preflight sets
              // `img { max-width: 100%; height: auto }`, which silently clamped
              // this sprite to its CONTAINER — measured live, a combat sprite
              // asking for 1.85x the tile rendered at 107x74 inside a 107x70
              // cell. So the oversized-sprite design never actually applied,
              // and every offset derived from that size (star badges, HP bars)
              // was computed from a number the renderer had discarded.
              position: "absolute", left: (TW - S) / 2, width: S, height: S,
              // Pushed DOWN by the sprite's own bottom padding so the mon's FEET
              // land on the cell floor. Bottom-aligning the frame instead left
              // every unit hovering above its contact shadow by however much
              // empty space its art carries underneath — 20.7% of the frame on
              // average, 40.6% at worst, which is 66px of nothing under a
              // Bulbasaur at this sprite size.
              bottom: -art.bottom,
              maxWidth: "none",
              imageRendering: "pixelated",
              transform: flip ? "scaleX(-1)" : "none",
              filter: cast ? `brightness(1.3) drop-shadow(0 0 11px ${cast})`
                : unit.disabled ? "brightness(1.25) saturate(0.4) drop-shadow(0 0 7px #7dd3fc)"
                : unit.burning ? "saturate(1.45) drop-shadow(0 0 7px #f97316)"
                : `drop-shadow(0 0 6px ${ring}88)`,
            }}
            className="drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]"
            draggable={false}
          />
        )}
        {flash && <span key={flash} className="absolute inset-0 combat-hitflash" style={{ background: "radial-gradient(circle, #fff, #ffffff00 70%)" }} />}
        {unit.mega && (
          <span className="absolute top-0 -right-1 text-[9px] font-bold bg-fuchsia-500 text-black rounded px-0.5 leading-tight shadow">M</span>
        )}
        {unit.disabled && <span className="absolute top-0 -left-1 text-sky-300 drop-shadow"><SnowIcon size={14} /></span>}
        {unit.burning && !unit.disabled && <span className="absolute top-0.5 -left-0.5 w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.7)]" />}
      </div>
      </div>
    </div>
  );
}

/**
 * A dead unit, fading out where it fell.
 *
 * This used to be a separate geometry from a living unit: the sprite was drawn
 * at 0.44 of a tile and centred on the CELL, while a living unit is drawn at
 * 1.85 of a tile, bottom-aligned, standing on the floor. So the moment a mon
 * died it shrank to roughly a quarter of its size and jumped upward to the
 * middle of its hex — a hard visual cut in the one instant the player is
 * actually looking at that unit.
 *
 * It now matches the living unit exactly — same scale, same feet-on-the-floor
 * placement, same counter-rotation — and the only difference is that it is
 * grey and fading, which is the difference that should read.
 */
function Corpse({ unit }: { unit: FrameUnit }) {
  // Unmounted once the fade has played. The animation alone is not enough: a
  // unit stays dead for the rest of the combat, so this component keeps being
  // rendered, and anything it leaves on screen stays there. Removing the node
  // is what actually guarantees no residue.
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFaded(true), 450); // just past the 0.4s fade
    return () => clearTimeout(id);
  }, []);
  const layout = useGameLayout();
  const TILE_W = layout.tile.w;
  const TILE_H = layout.tile.h;
  const p = hexToPixel({ c: unit.c, r: unit.r }, TILE_W, TILE_H);
  const S = Math.round(spriteBoxFor(unit.dex, TILE_W, relativeModelScale(unit.dex)));
  const art = spriteArt(unit.dex, S);
  const puff = Math.round(TILE_W * 0.5);
  if (faded) return null;
  return (
    <>
      {/* One-shot dissipation puff at the moment of death (plays once on mount). */}
      <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: p.x - puff / 2, top: p.y - puff / 2, width: puff, height: puff, background: "radial-gradient(circle, rgba(226,232,240,0.55), rgba(148,163,184,0) 70%)" }} />
      <div
        className="absolute pointer-events-none flex items-end justify-center"
        style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W, height: TILE_H }}
      >
        <div
          className="relative"
          style={{ transform: `rotateX(${-layout.tilt}deg)`, transformOrigin: "bottom center" }}
        >
          <div className="relative mx-auto" style={{ width: TILE_W, height: TILE_H }}>
            <div key={unit.id} className="combat-die">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={spriteUrl(unit.dex)}
                alt=""
                width={S}
                height={S}
                style={{
                  position: "absolute", left: (TILE_W - S) / 2, bottom: -art.bottom,
                  width: S, height: S, maxWidth: "none",
                  imageRendering: "pixelated",
                  filter: "grayscale(1) brightness(0.6)",
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DamageNumber({ x, y, dmg, crit, sup, type }: { x: number; y: number; dmg: number; crit?: boolean; sup?: boolean; type?: string | null }) {
  // Tile-relative: an 18px rise and a 25px crit numeral swamp a phone board and
  // disappear on a desktop one. Floored so they stay readable either way.
  const FX = combatFxMetrics(useGameLayout().tile.w);
  // Crit and super-effective KEEP their own hues. Those two carry game
  // information that a type colour would overwrite — a yellow number means
  // "that rolled a crit", not "that mon is Electric" — so only ordinary damage
  // takes the struck mon's type, replacing a plain white that said nothing.
  const color = crit ? "#fde047" : sup ? "#fb923c" : (type ?? "#fff");
  const size = crit ? FX.dmgFontCrit : sup ? FX.dmgFontSup : FX.dmgFont;
  const glow = crit
    ? "0 0 9px rgba(253,224,71,0.95), 0 1px 3px #000"
    : sup ? "0 0 7px rgba(251,146,60,0.85), 0 1px 3px #000" : "0 1px 3px #000";
  // Deterministic horizontal spread so a flurry of numbers on one target fans out instead of
  // stacking into an unreadable blob.
  const jx = (((dmg * 53) % 36) - 18) * (FX.dmgSpread / 36);
  return (
    <div className="absolute pointer-events-none combat-float" style={{ left: x + jx, top: y - FX.dmgRise }}>
      <span
        className={`block font-extrabold leading-none ${crit || sup ? "dmg-pop" : ""}`}
        style={{ color, fontSize: size, textShadow: glow, WebkitTextStroke: crit ? "0.6px rgba(0,0,0,0.45)" : undefined }}
      >
        {dmg}{crit ? "!" : sup ? "▲" : ""}
      </span>
    </div>
  );
}

/** Ability visual — varies by the move's TYPE (colour) and SHAPE so different
 *  mons' attacks read distinctly:
 *   · splash → an expanding ring that bursts on the target
 *   · line   → a beam from the caster through the target
 *   · single → a focused impact burst on the target
 *  A super-effective hit (eff>1) flares brighter. */
function AbilityFx({ x, y, tx, ty, moveType, shape, eff }: { x: number; y: number; tx: number; ty: number; moveType: PokeType; shape: CastShape; eff: number }) {
  const color = TYPE_COLOR[moveType] ?? "#a78bfa";
  const sup = eff > 1;        // super-effective → a bigger, brighter, double-ring hit
  const boost = sup ? 1.5 : 1;
  // Sized against the tile. These were fixed pixels, so the same blast was six
  // tiles wide on a phone and two on a desktop. See combat-fx.ts.
  const FX = combatFxMetrics(useGameLayout().tile.w);

  // A blast hits every living enemy at once. It must NOT fall through to the
  // single-target burst — that drew one small pop on one unit while the whole
  // enemy side took damage. A wide shockwave from the caster is the read.
  if (shape === "blast") {
    const s = FX.blastRing * boost;
    return (
      <>
        {/* The scorch OUTLASTS the ring. A blast hits the whole enemy side and
            was over in 0.5s, which left no trace that something board-wide had
            just happened — by the time you looked, the only evidence was the
            health bars. This lingers for ~1.6s, under the units, so a big
            ability reads as having happened TO the board. */}
        <span
          className="absolute pointer-events-none rounded-full combat-scorch"
          style={{ left: x - s / 2, top: y - s / 2, width: s, height: s, background: `radial-gradient(circle, ${color}3a, ${color}00 68%)` }}
        />
        <span
          className="absolute pointer-events-none rounded-full combat-cast"
          style={{ left: x - s / 2, top: y - s / 2, width: s, height: s, border: `${sup ? FX.strokeSup : FX.stroke}px solid ${color}`, boxShadow: `0 0 26px 4px ${color}aa` }}
        />
        <span
          className="absolute pointer-events-none rounded-full combat-burst"
          style={{ left: x - FX.blastCore / 2, top: y - FX.blastCore / 2, width: FX.blastCore, height: FX.blastCore, background: `radial-gradient(circle, ${sup ? "#fff" : color}, ${color}00 70%)` }}
        />
      </>
    );
  }
  // Super-effective flare: a second, wider shockwave ring + a white core, so type advantage
  // reads instantly during the fight.
  const supRing = sup ? (
    <span className="absolute pointer-events-none rounded-full combat-cast" style={{ left: tx - FX.supRing / 2, top: ty - FX.supRing / 2, width: FX.supRing, height: FX.supRing, border: `${FX.strokeThin}px solid ${color}`, opacity: 0.7 }} />
  ) : null;
  if (shape === "splash") {
    const s = FX.splashRing * boost;
    return (
      <>
        {/* Same idea at target scale — see the blast note. */}
        <span
          className="absolute pointer-events-none rounded-full combat-scorch"
          style={{ left: tx - s / 2, top: ty - s / 2, width: s, height: s, background: `radial-gradient(circle, ${color}32, ${color}00 70%)` }}
        />
        {supRing}
        <span className="absolute pointer-events-none rounded-full combat-cast" style={{ left: tx - s / 2, top: ty - s / 2, width: s, height: s, border: `${sup ? FX.strokeSup : FX.stroke}px solid ${color}`, boxShadow: sup ? `0 0 18px 3px ${color}` : undefined }} />
        <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: tx - FX.splashCore / 2, top: ty - FX.splashCore / 2, width: FX.splashCore, height: FX.splashCore, background: `radial-gradient(circle, ${sup ? "#fff" : color}, ${color}00 70%)` }} />
      </>
    );
  }
  if (shape === "line") {
    const dx = tx - x, dy = ty - y;
    const len = Math.max(FX.beamMin, Math.hypot(dx, dy) + FX.beamOvershoot);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <span
        className="absolute pointer-events-none combat-beam"
        style={{ left: x, top: y - FX.beamThickness / 2, width: len, height: FX.beamThickness, transformOrigin: "0 50%", transform: `rotate(${ang}deg)`, borderRadius: FX.beamThickness / 2, background: `linear-gradient(90deg, ${color}, ${color}cc 60%, ${color}00)`, boxShadow: `0 0 14px 2px ${color}aa` }}
      />
    );
  }
  // single — focused impact burst on the target
  const s = FX.single * boost;
  return (
    <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: tx - s / 2, top: ty - s / 2, width: s, height: s, background: `radial-gradient(circle, ${color}, ${color}00 70%)`, boxShadow: `0 0 20px 5px ${color}aa` }} />
  );
}
