"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";
import { sfx } from "@/lib/audio";
import { hexToPixel, fieldPixelSize, hexDistance, FIELD } from "@/game/engine/hex";
import { TYPE_COLOR } from "@/game/ui";
import { serverNow } from "@/game/net/serverTime";
import type { CombatResult, FrameUnit } from "@/game/engine/combat";

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

const TILE_W = 80;
const TILE_H = 76;
const SIM_DT = 1 / 16;
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function hpColor(f: number): string {
  if (f > 0.5) return "#34d399";
  if (f > 0.25) return "#fbbf24";
  return "#f87171";
}

export function CombatStage({
  result: rawResult,
  flip = false,
  opponentName,
  onResolve,
  autoResolve = false,
  inline = false,
  pve = false,
  syncStart,
  syncWindowMs,
}: {
  result: CombatResult;
  /** Mirror the view (this player is the canonical sim's "enemy" side). */
  flip?: boolean;
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
  const totalTime = frames[last].t;
  const clockDriven = syncStart != null && syncWindowMs != null;
  const t = useT();
  const [idx, setIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [speed, setSpeed] = useState(1.5);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    // Lockstep playback: map elapsed shared-clock time onto the frame timeline,
    // finishing at 85% of the window so the result banner shows before the
    // round transitions. Identical on every client (deterministic frames +
    // constant window), so nobody sees a different ending.
    const loopSynced = () => {
      const playWindow = (syncWindowMs! / 1000) * 0.85;
      const elapsed = (serverNow() - syncStart!) / 1000;
      const p = Math.max(0, Math.min(1, elapsed / playWindow));
      setIdx(p * last);
      if (p >= 1) { setFinished(true); return; }
      raf = requestAnimationFrame(loopSynced);
    };
    const loopLocal = (ts: number) => {
      if (lastTs.current == null) lastTs.current = ts;
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

  // Play sound when combat ends
  useEffect(() => {
    if (!finished) return;
    if (won) sfx.victory(); else sfx.defeat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const { w, h } = fieldPixelSize(TILE_W, TILE_H);
  const fi = Math.min(Math.floor(idx), last);
  const frac = idx - fi;
  const a = frames[fi];
  const b = frames[Math.min(fi + 1, last)];
  const bMap = new Map(b.units.map((u) => [u.id, u]));
  const aMap = new Map(a.units.map((u) => [u.id, u]));

  const won = result.winner === "ally";
  const aliveAlly = a.units.filter((u) => u.team === "ally" && u.alive).length;
  const aliveEnemy = a.units.filter((u) => u.team === "enemy" && u.alive).length;

  // Nearest enemy per unit (for facing + lunge fallback).
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

  return (
    <div className={inline
      ? "w-full flex flex-col items-center rounded-2xl border border-slate-700/50 bg-slate-950/60 p-3"
      : "fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4"}>
      {/* Scoreboard header: both teams + survivor counts */}
      <div className="flex items-stretch gap-3 mb-2 w-full max-w-[600px]">
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
          <span className="text-2xl font-extrabold tabular-nums text-emerald-300">{aliveAlly}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-400/80 leading-tight">{t.cs_your_team}</span>
        </div>
        <div className="flex flex-col items-center justify-center px-1">
          <span className={`text-xs font-extrabold ${a.overtime ? "text-rose-400 animate-pulse" : "text-slate-500"}`}>
            {a.overtime ? t.cs_overtime : t.cs_vs}
          </span>
        </div>
        <div className={`flex-1 flex items-center justify-end gap-2 px-3 py-1.5 rounded-lg border ${pve ? "bg-emerald-950/40 border-emerald-800/50" : "bg-rose-950/40 border-rose-800/50"}`}>
          {pve && <span className="text-sm">🌿</span>}
          <span className={`text-[11px] font-bold uppercase tracking-wide leading-tight text-right truncate ${pve ? "text-emerald-400/80" : "text-rose-400/80"}`}>{opponentName}</span>
          <span className={`text-2xl font-extrabold tabular-nums ${pve ? "text-emerald-300" : "text-rose-300"}`}>{aliveEnemy}</span>
        </div>
      </div>

      {/* Combat timer */}
      <div className="w-full max-w-[600px] h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
        <div className={`h-full ${a.overtime ? "bg-rose-500" : "bg-slate-400/70"}`} style={{ width: `${(a.t / totalTime) * 100}%` }} />
      </div>

      {/* Battlefield */}
      <div
        className="relative rounded-2xl border border-slate-700/50 overflow-hidden"
        style={{ width: w + 24, height: h + 24, padding: 12, background: "radial-gradient(120% 90% at 50% 50%, #18243f 0%, #0a1020 75%)" }}
      >
        <div className="absolute" style={{ left: 12, top: 12, width: w, height: h }}>
          <HexGrid />

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
            const hitThisFrame = a.events.some((e) => e.kind === "hit" && e.to === u.id);
            // Lunge toward the thing we're hitting.
            let lunge = { dx: 0, dy: 0 };
            if (attackEv && attackEv.kind === "attack") {
              const tgt = aMap.get(attackEv.to);
              if (tgt) {
                const tp = hexToPixel({ c: tgt.c, r: tgt.r }, TILE_W, TILE_H);
                const dx = tp.x - x, dy = tp.y - y;
                const m = Math.hypot(dx, dy) || 1;
                lunge = { dx: (dx / m) * 7, dy: (dy / m) * 7 };
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
                faceLeft={(facing.get(u.id) ?? u.c) < u.c}
              />
            );
          })}

          {/* Projectiles for ranged attacks + casts */}
          {a.events.map((e, k) => {
            if (e.kind !== "attack" && e.kind !== "cast") return null;
            const from = aMap.get(e.from);
            const to = aMap.get(e.to);
            if (!from || !to) return null;
            const cast = e.kind === "cast";
            if (!cast && hexDistance({ c: from.c, r: from.r }, { c: to.c, r: to.r }) <= 1) return null; // melee, no projectile
            const pa = hexToPixel({ c: from.c, r: from.r }, TILE_W, TILE_H);
            const pb = hexToPixel({ c: to.c, r: to.r }, TILE_W, TILE_H);
            const t = easeOut(frac);
            const color = e.kind === "cast" ? TYPE_COLOR[e.moveType] : "#e2e8f0";
            const size = cast ? 14 : 8;
            return (
              <div
                key={`p-${fi}-${k}`}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: lerp(pa.x, pb.x, t) - size / 2,
                  top: lerp(pa.y, pb.y, t) - size / 2,
                  width: size, height: size,
                  background: color,
                  boxShadow: `0 0 10px 2px ${color}`,
                }}
              />
            );
          })}

          {/* Cast rings + damage numbers */}
          {a.events.map((e, k) => {
            if (e.kind === "cast") {
              const c = aMap.get(e.from);
              if (!c) return null;
              const p = hexToPixel({ c: c.c, r: c.r }, TILE_W, TILE_H);
              return <CastFlash key={`cf-${fi}-${k}`} x={p.x} y={p.y} eff={e.eff} />;
            }
            if (e.kind === "hit") {
              const t = aMap.get(e.to);
              if (!t) return null;
              const p = hexToPixel({ c: t.c, r: t.r }, TILE_W, TILE_H);
              return <DamageNumber key={`dn-${fi}-${k}`} x={p.x} y={p.y} dmg={e.dmg} crit={e.crit} sup={e.sup} />;
            }
            return null;
          })}
        </div>
      </div>

      {/* Live damage / tank / heal recap for your team. */}
      <CombatRecap units={a.units} label={t.cs_your_team} />

      {/* Controls */}
      <div className="flex items-center gap-2 mt-3 min-h-[40px]">
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
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${speed === sp ? "bg-sky-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}
              >
                {sp}x
              </button>
            ))}
            <button onClick={() => { setIdx(last); setFinished(true); }} className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-xs font-semibold ml-2">
              Skip →
            </button>
          </>
          )
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className={`text-xl font-extrabold ${won ? "text-emerald-400" : result.winner === "draw" ? "text-slate-300" : "text-rose-400"}`}>
              {won ? t.cs_victory : result.winner === "draw" ? t.cs_draw : t.cs_defeat}
              {result.winner === "enemy" && <span className="text-sm text-slate-400 font-medium"> · {result.survivors} survived</span>}
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

/** Compact per-mon contribution recap (your team): damage dealt, tank, heal. */
function CombatRecap({ units, label }: { units: FrameUnit[]; label: string }) {
  const mine = units.filter((u) => u.team === "ally" && (u.dmgDealt + u.dmgTaken + u.healed) > 0);
  if (mine.length === 0) return null;
  const max = Math.max(1, ...mine.map((u) => Math.max(u.dmgDealt, u.dmgTaken)));
  // Top contributors only, capped so the recap can't balloon the combat column
  // (and push the whole page taller than the viewport).
  const sorted = [...mine].sort((a, b) => b.dmgDealt - a.dmgDealt).slice(0, 6);
  return (
    <div className="mt-2 w-full max-w-[600px] rounded-lg bg-slate-900/60 border border-slate-700/40 p-2">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500 mb-1 px-0.5">
        <span>{label}</span>
        <span className="flex gap-2"><span className="text-rose-400">DMG</span><span className="text-sky-400">TANK</span><span className="text-emerald-400">HEAL</span></span>
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((u) => (
          <div key={u.id} className={`flex items-center gap-1.5 ${u.alive ? "" : "opacity-50"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spriteUrl(u.dex)} alt="" width={18} height={18} style={{ imageRendering: "pixelated" }} />
            <div className="flex-1 flex flex-col gap-px min-w-0">
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-rose-500" style={{ width: `${(u.dmgDealt / max) * 100}%` }} /></div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${(u.dmgTaken / max) * 100}%` }} /></div>
            </div>
            <span className="w-9 text-right text-[10px] tabular-nums text-rose-300">{u.dmgDealt}</span>
            <span className="w-9 text-right text-[10px] tabular-nums text-sky-300">{u.dmgTaken}</span>
            <span className="w-9 text-right text-[10px] tabular-nums text-emerald-300">{u.healed}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const HexGrid = memo(function HexGrid() {
  const cells = [];
  for (let r = 0; r < FIELD.rows; r++) {
    for (let c = 0; c < FIELD.cols; c++) {
      const p = hexToPixel({ c, r }, TILE_W, TILE_H);
      const ally = r >= 4;
      cells.push(
        <div
          key={`${c}-${r}`}
          className="absolute"
          style={{
            left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W - 3, height: TILE_H - 3,
            clipPath: HEX_CLIP,
            background: ally ? "rgba(52,211,153,0.06)" : "rgba(251,113,133,0.06)",
            boxShadow: `inset 0 0 0 1px ${ally ? "rgba(52,211,153,0.14)" : "rgba(251,113,133,0.14)"}`,
          }}
        />,
      );
    }
  }
  return <>{cells}</>;
});

function CombatUnit({
  unit, x, y, hpFrac, manaFrac, lunge, flash, faceLeft,
}: {
  unit: FrameUnit; x: number; y: number; hpFrac: number; manaFrac: number;
  lunge: { dx: number; dy: number }; flash: string | null; faceLeft: boolean;
}) {
  const ally = unit.team === "ally";
  const ring = unit.mega ? "#f0abfc" : ally ? "#34d399" : "#fb7185";
  const flip = ally ? faceLeft : !faceLeft; // mons face their target
  return (
    <div
      className="absolute"
      style={{ left: x - 28, top: y - 38, width: 56, transform: `translate(${lunge.dx}px, ${lunge.dy}px)`, transition: "transform 90ms ease-out" }}
    >
      <div className="h-2 w-14 rounded-full bg-black/70 overflow-hidden mx-auto mb-[3px]" style={{ outline: `1px solid ${ring}66` }}>
        <div className="h-full rounded-full" style={{ width: `${hpFrac * 100}%`, background: hpColor(hpFrac) }} />
      </div>
      <div className="h-[4px] w-14 rounded-full bg-black/70 overflow-hidden mx-auto mb-[3px]">
        <div className="h-full bg-sky-400" style={{ width: `${manaFrac * 100}%` }} />
      </div>
      <div
        className="relative mx-auto rounded-full flex items-center justify-center"
        style={{
          width: 52, height: 52,
          background: `radial-gradient(circle, ${ring}${unit.mega ? "55" : "33"}, transparent 70%)`,
          boxShadow: unit.mega ? `0 0 0 2px ${ring}, 0 0 12px 2px ${ring}aa` : `0 0 0 2px ${ring}cc, 0 3px 8px rgba(0,0,0,0.5)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteUrl(unit.dex)} alt="" width={46} height={46} style={{ imageRendering: "pixelated", transform: flip ? "scaleX(-1)" : "none", filter: unit.disabled ? "brightness(1.3) saturate(0.4)" : unit.burning ? "saturate(1.4)" : "none" }} draggable={false} />
        {flash && <span key={flash} className="absolute inset-0 rounded-full combat-hitflash" style={{ background: "#fff" }} />}
        {unit.burning && (
          <span className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "inset 0 0 10px 2px #f9731699, 0 0 8px 1px #ea580c88" }} />
        )}
        {unit.disabled && (
          <span className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, #bae6fd55, transparent 70%)", boxShadow: "inset 0 0 8px 2px #7dd3fcaa" }} />
        )}
        {unit.mega && (
          <span className="absolute -top-1.5 -right-1.5 text-[8px] font-extrabold bg-fuchsia-500 text-black rounded px-0.5 leading-tight">M</span>
        )}
        {(unit.burning || unit.disabled) && (
          <span className="absolute -top-1.5 -left-1.5 text-[10px] leading-none drop-shadow">{unit.disabled ? "❄️" : "🔥"}</span>
        )}
      </div>
    </div>
  );
}

function Corpse({ unit }: { unit: FrameUnit }) {
  const p = hexToPixel({ c: unit.c, r: unit.r }, TILE_W, TILE_H);
  return (
    <div key={unit.id} className="absolute pointer-events-none combat-die" style={{ left: p.x - 18, top: p.y - 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={spriteUrl(unit.dex)} alt="" width={36} height={36} style={{ imageRendering: "pixelated", filter: "grayscale(1) brightness(0.6)" }} draggable={false} />
    </div>
  );
}

function DamageNumber({ x, y, dmg, crit, sup }: { x: number; y: number; dmg: number; crit?: boolean; sup?: boolean }) {
  const color = crit ? "#fde047" : sup ? "#fb923c" : "#fff";
  return (
    <div className="absolute pointer-events-none font-extrabold combat-float" style={{ left: x, top: y - 18, color, fontSize: crit ? 18 : sup ? 15 : 12, textShadow: "0 1px 3px #000" }}>
      {dmg}{crit ? "!" : sup ? "▲" : ""}
    </div>
  );
}

function CastFlash({ x, y, eff }: { x: number; y: number; eff: number }) {
  const color = eff > 1 ? "#fbbf24" : eff < 1 ? "#64748b" : "#a78bfa";
  return <div className="absolute pointer-events-none rounded-full combat-cast" style={{ left: x - 24, top: y - 24, width: 48, height: 48, border: `3px solid ${color}` }} />;
}
