"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";
import { hasUsable3DModel } from "@/game/data/model-availability";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { sfx } from "@/lib/audio";
import { hexToPixel, fieldPixelSize, hexDistance, FIELD, HEX_CLIP } from "@/game/engine/hex";
import { useGameLayout } from "./LayoutProvider";
import { ItemPips } from "./UnitChip";
import { CombatField3D } from "./CombatField3D";
import { useAppStore } from "@/game/store/appStore";
import { TYPE_COLOR } from "@/game/ui";
import { SnowIcon, SwordIcon, ShieldIcon } from "./icons";
import { Leaf, BarChart3 } from "lucide-react";
import { serverNow } from "@/game/net/serverTime";
import type { BoardModel } from "./Board3DModels";
import type { ModelId } from "@/lab/arena3d/UnitModel";
// geometry.ts was promoted to @/game/ui/hex3d on main (a pure rename), so the
// model work's import of HEX_W follows it here.
import { HEX_W } from "@/game/ui/hex3d";
import { abilityCells, normaliseUnitItems } from "@/game/engine/combat";
import type { CombatResult, Frame, FrameUnit, CombatEvent, CastShape } from "@/game/engine/combat";
import type { PokeType } from "@/game/types";

const Board3DModels = dynamic(
  () => import("./Board3DModels").then((module) => module.Board3DModels),
  { ssr: false, loading: () => null },
);

function projectArenaPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  tilt: number,
  perspective: number,
): [number, number, number] {
  const dx = x - width / 2;
  const dy = y - height / 2;
  const angle = (tilt * Math.PI) / 180;
  const depth = dy * Math.sin(angle);
  const scale = perspective / (perspective - depth);
  const screenX = width / 2 + dx * scale;
  const screenY = height / 2 + dy * Math.cos(angle) * scale;
  return [screenX - width / 2, height / 2 - screenY, 0];
}

function combatModelKey(unitId: string, dex: number): string {
  return `${unitId}:${dex}`;
}

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
  const models3d = useAppStore((st) => st.settings.models3d);
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

  const [loadedModels, setLoadedModels] = useState<Set<string>>(() => new Set());
  const handleModelReady = useCallback((key: string) => {
    setLoadedModels((loaded) => loaded.has(key) ? loaded : new Set(loaded).add(key));
  }, []);
  const handleModelError = useCallback((key: string, error: Error) => {
    console.error(`Combat model ${key} failed to load; keeping its sprite visible.`, error);
  }, []);
  const combatModels = useMemo<BoardModel[]>(() => {
    const models: BoardModel[] = [];
    for (const unit of a.units) {
      const next = bMap.get(unit.id) ?? unit;
      const model: ModelId = unit.dex;
      const from = hexToPixel({ c: unit.c, r: unit.r }, TILE_W, TILE_H);
      const to = hexToPixel({ c: next.c, r: next.r }, TILE_W, TILE_H);
      let x = lerp(from.x, to.x, frac);
      let y = lerp(from.y, to.y, frac);
      const attack = a.events.find((event) => event.kind === "attack" && event.from === unit.id);
      const actionKey = attack?.kind === "attack" ? `${fi}:${attack.to}` : undefined;
      if (attack?.kind === "attack") {
        const target = aMap.get(attack.to);
        if (target) {
          const point = hexToPixel({ c: target.c, r: target.r }, TILE_W, TILE_H);
          const dx = point.x - x;
          const dy = point.y - y;
          const distance = Math.hypot(dx, dy) || 1;
          x += (dx / distance) * 13;
          y += (dy / distance) * 13;
        }
      }
      const rotationY = unit.team === "enemy" ? Math.PI : 0;
      const position = (x: number, y: number) => projectArenaPoint(
        14 + x,
        14 + y,
        w + 28,
        h + 28,
        layout.tilt,
        layout.perspective,
      );
      if ((unit.alive || next.alive) && hasUsable3DModel(model)) {
        models.push({
          key: combatModelKey(unit.id, model),
          model,
          position: position(x, y),
          scale: TILE_W / HEX_W,
          rotationY,
          actionKey,
        });
      }
    }
    return models;
  }, [a, aMap, bMap, fi, frac, h, layout.perspective, layout.tilt, TILE_H, TILE_W, w]);

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
      : "fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"}>
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
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-200/80 animate-pulse">{t.cs_get_ready}</span>
          <div className="h-1.5 w-full rounded-full bg-black/50 overflow-hidden" style={{ outline: "1px solid rgba(212,175,55,0.3)" }}>
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${preview * 100}%`, transition: "width 80ms linear" }} />
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

          {/* Living units */}
          {a.units.map((u) => {
            const bu = bMap.get(u.id) ?? u;
            if (!u.alive && !bu.alive) return null;
            const pa = hexToPixel({ c: u.c, r: u.r }, TILE_W, TILE_H);
            const pb = hexToPixel({ c: bu.c, r: bu.r }, TILE_W, TILE_H);
            const x = lerp(pa.x, pb.x, frac);
            const y = lerp(pa.y, pb.y, frac);
            const hpFrac = lerp(u.hpFrac, bu.hpFrac, frac);
            const manaFrac = lerp(u.manaFrac, bu.manaFrac, frac);
            const attackEv = a.events.find((e) => e.kind === "attack" && e.from === u.id);
            const castEv = a.events.find((e) => e.kind === "cast" && e.from === u.id);
            const castColor = castEv && castEv.kind === "cast" ? (TYPE_COLOR[castEv.moveType] ?? "#a78bfa") : null;
            const hitThisFrame = recentHit.has(u.id);
            // Lunge toward the thing we're hitting.
            let lunge = { dx: 0, dy: 0 };
            if (attackEv && attackEv.kind === "attack") {
              const tgt = aMap.get(attackEv.to);
              if (tgt) {
                const tp = hexToPixel({ c: tgt.c, r: tgt.r }, TILE_W, TILE_H);
                const dx = tp.x - x, dy = tp.y - y;
                const m = Math.hypot(dx, dy) || 1;
                lunge = { dx: (dx / m) * 13, dy: (dy / m) * 13 }; // a punchier step into the target

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
                flash={hitThisFrame ? `${fi}-${u.id}` : null}
                cast={castColor}
                faceLeft={(facing.get(u.id) ?? u.c) < u.c}
                showSprite={!models3d || !loadedModels.has(combatModelKey(u.id, u.dex)) || !hasUsable3DModel(u.dex)}
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
            return <DamageNumber key={`dn-${fk}`} x={p.x} y={p.y} dmg={e.dmg} crit={e.crit} sup={e.sup} />;
          })}
        </div>
        </div>
      {/* 3D models are OFF by default (settings.models3d). Three reasons, all
          from the model work's own notes:
            - the baked pose map has ONE species reviewed out of 967, so most of
              the roster would render in an unreviewed stance;
            - every client would fetch models from a third-party GitHub repo over
              raw.githubusercontent.com, which is not a production CDN;
            - the model canvas sits above the unit DOM, so a tall model occludes
              the combat HP/mana bars.
          The pipeline is complete and ships here; flipping the default is a
          one-line change once the poses have been reviewed. */}
        {models3d && (
          <Board3DModels
            models={combatModels}
            height={h + 28}
            perspective={layout.perspective}
            animationMode="combat"
            onReady={handleModelReady}
            onError={handleModelError}
          />
        )}
        </>)}
      </div>
      </div>

      {/* Recap as an OVERLAY pinned to the stage's own left edge, not a sibling
          in the row. As a sibling it widened the layout and pushed itself over
          the trainers rail once the old 340px item column was removed. */}
      {suppressRecap ? null : recapOpen ? (
        <div className="absolute left-0 top-10 z-30 max-h-[78%] flex">
          <CombatRecapTabs units={a.units} label={t.cs_your_team} onClose={() => setRecapOpen(false)} />
        </div>
      ) : (
        <button
          onClick={() => setRecapOpen(true)}
          title={t.cs_show_recap}
          className="gilded absolute left-0 top-10 z-30 w-7 h-32 rounded-xl flex flex-col items-center justify-center gap-1.5 text-amber-200/70 hover:text-amber-100 transition-colors"
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
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${speed === sp ? "bg-amber-500/90 text-black border-amber-400" : "bg-black/30 border-[var(--panel-edge)] text-amber-100/70 hover:text-amber-50"}`}
              >
                {sp}x
              </button>
            ))}
            <button onClick={() => { setIdx(last); setFinished(true); }} className="px-3 py-1 rounded-md bg-black/30 border border-[var(--panel-edge)] text-amber-100/70 hover:text-amber-50 text-xs font-semibold ml-2">
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
                className="px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold"
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

/** Side recap panel for your team with DMG / TANK / HEAL tabs — pick a metric and
 *  the bars filter + re-sort to just that stat. */
function CombatRecapTabs({ units, label, onClose }: { units: FrameUnit[]; label: string; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<(typeof RECAP_TABS)[number]["key"]>("dmgDealt");
  const mine = units.filter((u) => u.team === "ally" && (u.dmgDealt + u.dmgTaken + u.healed) > 0);
  const active = RECAP_TABS.find((t) => t.key === tab)!;
  const val = (u: FrameUnit) => u[tab] as number;
  const max = Math.max(1, ...mine.map(val));
  const sorted = [...mine].sort((a, b) => val(b) - val(a)).slice(0, 8);

  return (
    <div className="gilded w-[210px] shrink-0 rounded-xl p-2 self-stretch">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[9px] uppercase tracking-wider text-amber-200/55">{label}</span>
        <button onClick={onClose} title={t.cs_hide_recap} aria-label={t.cs_hide_recap} className="text-slate-500 hover:text-slate-200 text-xs leading-none">✕</button>
      </div>
      <div className="flex gap-1 mb-2">
        {RECAP_TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={tab === tb.key ? { background: tb.color, color: "#0b1020" } : undefined}
            className={`flex-1 text-[10px] font-extrabold py-1 rounded-md border transition-colors ${tab === tb.key ? "border-transparent" : "bg-black/30 border-[var(--panel-edge)] text-amber-100/60 hover:text-amber-50"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
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
    </div>
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
  unit, x, y, hpFrac, manaFrac, lunge, flash, cast, faceLeft, showSprite, items,
}: {
  unit: FrameUnit; x: number; y: number; hpFrac: number; manaFrac: number;
  lunge: { dx: number; dy: number }; flash: string | null; cast: string | null; faceLeft: boolean;
  /** False once this unit's 3D model has loaded — the sprite is the fallback. */
  showSprite: boolean;
  /** Held item ids, constant for the fight (CombatResult.unitItems). */
  items: string[];
}) {
  const ally = unit.team === "ally";
  const ring = unit.mega ? "#f0abfc" : ally ? "#34d399" : "#fb7185";
  const flip = ally ? faceLeft : !faceLeft; // mons face their target
  const manaFull = manaFrac >= 0.999; // full mana → about to cast: telegraph it
  // HP bar is TEAM-coloured (green = yours, red = enemy) so you instantly read whose mon is
  // whose mid-fight; width still shows remaining health, and it dims/pulses when critical.
  const low = hpFrac <= 0.25;
  const hpBar = ally ? (low ? "#16a34a" : "#34d399") : (low ? "#dc2626" : "#fb7185");
  const lunging = lunge.dx !== 0 || lunge.dy !== 0; // mid-attack → thrust scale for impact
  const castScale = cast ? 1.16 : lunging ? 1.08 : 1; // cast wind-up pops bigger than an attack
  // Mirrors the planning board exactly: a cell-sized, bottom-aligned box with an
  // oversized sprite standing in it. The previous version counter-rotated the
  // WHOLE bar+sprite stack about its bottom edge while the sprite image was far
  // larger than its box — the two offsets compounded and left the HP bars
  // floating ~50px above the unit they belonged to.
  const layout = useGameLayout();
  const tilt = layout.tilt;
  const TW = layout.tile.w;
  const TH = layout.tile.h;
  /** Same 1.85x oversize as the board, to cancel PokéAPI sprite padding. */
  const S = Math.round(TW * 1.85);
  // Bar placement is TILE-relative, not derived from the sprite box: PokéAPI
  // frames carry wildly different amounts of transparent padding, so there's no
  // consistent "crown" to measure from — anchoring to the image box left bars
  // floating ~70px above small sprites.
  //
  // The sprite is the star: team identity comes from a soft back-glow and the
  // feet ring rather than a hard disc, so it reads as a Pokémon, not a token.
  return (
    <div
      className="absolute flex items-end justify-center"
      style={{
        left: x - TW / 2,
        top: y - TH / 2,
        width: TW,
        height: TH,
        transform: `translate(${lunge.dx}px, ${lunge.dy}px)`,
        transition: "transform 80ms ease-out",
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
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: -Math.round(TH * 0.32) - 8 }}>
      <div className={`h-[7px] rounded-[3px] bg-black/80 overflow-hidden mb-[3px] ${low ? "animate-pulse" : ""}`} style={{ outline: "1px solid rgba(0,0,0,0.55)", width: TW * 0.9 }}>
        <div className="h-full rounded-[3px] transition-[width] duration-100" style={{ width: `${hpFrac * 100}%`, background: hpBar, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 2px rgba(0,0,0,0.28)" }} />
      </div>
      {/* Mana bar — glows + pulses when full (a cast is coming). */}
      <div className={`h-[4px] rounded-full bg-black/70 overflow-hidden ${manaFull ? "animate-pulse" : ""}`} style={manaFull ? { boxShadow: "0 0 7px 1px #38bdf8dd", width: TW * 0.76 } : { width: TW * 0.76 }}>
        <div className="h-full transition-[width] duration-100" style={{ width: `${manaFrac * 100}%`, background: manaFull ? "#bae6fd" : "#38bdf8" }} />
      </div>
      </div>
      {/* Held items, under the feet exactly as on the planning board. Drawn
          OUTSIDE the counter-rotated sprite stack would tilt them with the
          board; inside it they stay upright and legible at every tilt tier. */}
      {items.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: -Math.round(TW * 0.18), width: TW }}>
          <div className="relative" style={{ height: 1 }}>
            <ItemPips items={items} megaReady={unit.mega} unitSize={TW} />
          </div>
        </div>
      )}
      {/* Grounding "feet" ellipse — team-coloured, sits under the sprite. */}
      <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%] pointer-events-none" style={{ bottom: -2, width: TW * 0.6, height: TW * 0.17, background: `radial-gradient(ellipse at center, ${ring}77, transparent 72%)` }} />
      {/* Box is the CELL; the sprite inside it is oversized and bottom-aligned,
          so it breaks the cell upward exactly like a board unit. */}
      <div className="relative mx-auto flex items-end justify-center" style={{ width: TW, height: TH }}>
        {/* Soft team aura behind the mon (stronger for mega) — replaces the hard ring disc. */}
        <span className="absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle at 50% 60%, ${ring}${unit.mega ? "55" : "2e"}, transparent 66%)` }} />
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
            className="relative drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]"
            style={{ imageRendering: "pixelated", transform: flip ? "scaleX(-1)" : "none", filter: cast ? `brightness(1.3) drop-shadow(0 0 11px ${cast})` : unit.disabled ? "brightness(1.25) saturate(0.4) drop-shadow(0 0 7px #7dd3fc)" : unit.burning ? "saturate(1.45) drop-shadow(0 0 7px #f97316)" : `drop-shadow(0 0 6px ${ring}88)` }}
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

function Corpse({ unit }: { unit: FrameUnit }) {
  const layout = useGameLayout();
  const TILE_W = layout.tile.w;
  const TILE_H = layout.tile.h;
  const p = hexToPixel({ c: unit.c, r: unit.r }, TILE_W, TILE_H);
  // Sprite + puff scale with the tile, so a corpse doesn't dwarf a 34px hex.
  const sprite = Math.round(TILE_W * 0.44);
  const puff = Math.round(TILE_W * 0.5);
  return (
    <>
      {/* One-shot dissipation puff at the moment of death (plays once on mount). */}
      <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: p.x - puff / 2, top: p.y - puff / 2, width: puff, height: puff, background: "radial-gradient(circle, rgba(226,232,240,0.55), rgba(148,163,184,0) 70%)" }} />
      <div key={unit.id} className="absolute pointer-events-none combat-die" style={{ left: p.x - sprite / 2, top: p.y - sprite / 2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteUrl(unit.dex)} alt="" width={sprite} height={sprite} style={{ imageRendering: "pixelated", filter: "grayscale(1) brightness(0.6)" }} draggable={false} />
      </div>
    </>
  );
}

function DamageNumber({ x, y, dmg, crit, sup }: { x: number; y: number; dmg: number; crit?: boolean; sup?: boolean }) {
  const color = crit ? "#fde047" : sup ? "#fb923c" : "#fff";
  const size = crit ? 25 : sup ? 18 : 13;
  const glow = crit
    ? "0 0 9px rgba(253,224,71,0.95), 0 1px 3px #000"
    : sup ? "0 0 7px rgba(251,146,60,0.85), 0 1px 3px #000" : "0 1px 3px #000";
  // Deterministic horizontal spread so a flurry of numbers on one target fans out instead of
  // stacking into an unreadable blob.
  const jx = ((dmg * 53) % 36) - 18;
  return (
    <div className="absolute pointer-events-none combat-float" style={{ left: x + jx, top: y - 18 }}>
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

  // A blast hits every living enemy at once. It must NOT fall through to the
  // single-target burst — that drew one small pop on one unit while the whole
  // enemy side took damage. A wide shockwave from the caster is the read.
  if (shape === "blast") {
    const s = 220 * boost;
    return (
      <>
        <span
          className="absolute pointer-events-none rounded-full combat-cast"
          style={{ left: x - s / 2, top: y - s / 2, width: s, height: s, border: `${sup ? 4 : 3}px solid ${color}`, boxShadow: `0 0 26px 4px ${color}aa` }}
        />
        <span
          className="absolute pointer-events-none rounded-full combat-burst"
          style={{ left: x - 60, top: y - 60, width: 120, height: 120, background: `radial-gradient(circle, ${sup ? "#fff" : color}, ${color}00 70%)` }}
        />
      </>
    );
  }
  // Super-effective flare: a second, wider shockwave ring + a white core, so type advantage
  // reads instantly during the fight.
  const supRing = sup ? (
    <span className="absolute pointer-events-none rounded-full combat-cast" style={{ left: tx - 52, top: ty - 52, width: 104, height: 104, border: `2px solid ${color}`, opacity: 0.7 }} />
  ) : null;
  if (shape === "splash") {
    const s = 64 * boost;
    return (
      <>
        {supRing}
        <span className="absolute pointer-events-none rounded-full combat-cast" style={{ left: tx - s / 2, top: ty - s / 2, width: s, height: s, border: `${sup ? 4 : 3}px solid ${color}`, boxShadow: sup ? `0 0 18px 3px ${color}` : undefined }} />
        <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: tx - 26, top: ty - 26, width: 52, height: 52, background: `radial-gradient(circle, ${sup ? "#fff" : color}, ${color}00 70%)` }} />
      </>
    );
  }
  if (shape === "line") {
    const dx = tx - x, dy = ty - y;
    const len = Math.max(40, Math.hypot(dx, dy) + 30);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <span
        className="absolute pointer-events-none combat-beam"
        style={{ left: x, top: y - 4, width: len, height: 8, transformOrigin: "0 50%", transform: `rotate(${ang}deg)`, borderRadius: 4, background: `linear-gradient(90deg, ${color}, ${color}cc 60%, ${color}00)`, boxShadow: `0 0 14px 2px ${color}aa` }}
      />
    );
  }
  // single — focused impact burst on the target
  const s = 46 * boost;
  return (
    <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: tx - s / 2, top: ty - s / 2, width: s, height: s, background: `radial-gradient(circle, ${color}, ${color}00 70%)`, boxShadow: `0 0 20px 5px ${color}aa` }} />
  );
}
