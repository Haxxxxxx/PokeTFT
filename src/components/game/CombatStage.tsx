"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { sfx } from "@/lib/audio";
import { hexToPixel, fieldPixelSize, hexDistance, FIELD, TILE, HEX_CLIP } from "@/game/engine/hex";
import { TYPE_COLOR } from "@/game/ui";
import { SnowIcon, SwordIcon, ShieldIcon } from "./icons";
import { Leaf, BarChart3 } from "lucide-react";
import { serverNow } from "@/game/net/serverTime";
import type { CombatResult, FrameUnit, CombatEvent } from "@/game/engine/combat";
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

const TILE_W = TILE.w;
const TILE_H = TILE.h;
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

  const { w, h } = fieldPixelSize(TILE_W, TILE_H);
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
      <div className={`flex items-start gap-3 w-full ${inline ? "justify-start" : "justify-center"}`}>
      <div
        className="relative shrink-0 rounded-xl overflow-hidden"
        style={{
          width: w + 24, height: h + 24, padding: 12,
          background: "radial-gradient(120% 90% at 50% 50%, #1a263f 0%, #0a1020 75%)",
          border: "1px solid rgba(212,175,55,0.32)",
          boxShadow: "inset 0 1px 0 rgba(231,198,107,0.1), inset 0 0 60px -30px rgba(212,175,55,0.5), 0 26px 70px -34px rgba(0,0,0,0.9)",
        }}
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

      {suppressRecap ? null : recapOpen ? (
        <CombatRecapTabs units={a.units} label={t.cs_your_team} onClose={() => setRecapOpen(false)} />
      ) : (
        <button
          onClick={() => setRecapOpen(true)}
          title={t.cs_show_recap}
          className="gilded self-stretch w-7 shrink-0 rounded-xl flex flex-col items-center justify-center gap-1.5 text-amber-200/70 hover:text-amber-100 transition-colors"
        >
          <span><BarChart3 size={14} /></span>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-extrabold uppercase tracking-wider">{t.cs_recap}</span>
        </button>
      )}
      </div>

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
  unit, x, y, hpFrac, manaFrac, lunge, flash, cast, faceLeft,
}: {
  unit: FrameUnit; x: number; y: number; hpFrac: number; manaFrac: number;
  lunge: { dx: number; dy: number }; flash: string | null; cast: string | null; faceLeft: boolean;
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
  // The sprite is the star: nearly planning-board size (78px) with team identity from a soft
  // back-glow + the feet ring rather than a hard disc, so it reads as a Pokémon, not a token.
  return (
    <div
      className="absolute"
      style={{ left: x - 41, top: y - 57, width: 82, transform: `translate(${lunge.dx}px, ${lunge.dy}px) scale(${castScale})`, transition: "transform 80ms ease-out" }}
    >
      {/* HP bar — team-coloured (green ally / red enemy), glossy fill, crisp dark frame. */}
      <div className={`h-[7px] w-full rounded-[3px] bg-black/80 overflow-hidden mb-[3px] ${low ? "animate-pulse" : ""}`} style={{ outline: "1px solid rgba(0,0,0,0.55)" }}>
        <div className="h-full rounded-[3px] transition-[width] duration-100" style={{ width: `${hpFrac * 100}%`, background: hpBar, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 2px rgba(0,0,0,0.28)" }} />
      </div>
      {/* Mana bar — glows + pulses when full (a cast is coming). */}
      <div className={`h-[4px] w-[85%] mx-auto rounded-full bg-black/70 overflow-hidden mb-1 ${manaFull ? "animate-pulse" : ""}`} style={manaFull ? { boxShadow: "0 0 7px 1px #38bdf8dd" } : undefined}>
        <div className="h-full transition-[width] duration-100" style={{ width: `${manaFrac * 100}%`, background: manaFull ? "#bae6fd" : "#38bdf8" }} />
      </div>
      {/* Grounding "feet" ellipse — team-coloured, sits under the sprite. */}
      <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%] pointer-events-none" style={{ bottom: -2, width: 60, height: 15, background: `radial-gradient(ellipse at center, ${ring}77, transparent 72%)` }} />
      <div className="relative mx-auto flex items-end justify-center" style={{ width: 78, height: 78 }}>
        {/* Soft team aura behind the mon (stronger for mega) — replaces the hard ring disc. */}
        <span className="absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle at 50% 60%, ${ring}${unit.mega ? "55" : "2e"}, transparent 66%)` }} />
        {/* Cast wind-up: a charging aura + an expanding ring in the move's colour, telegraphing
            the ability the instant before it fires. */}
        {cast && <span className="absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${cast}88, transparent 62%)` }} />}
        {cast && <span className="absolute inset-[-7px] rounded-full pointer-events-none combat-cast" style={{ border: `3px solid ${cast}`, boxShadow: `0 0 18px 3px ${cast}` }} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={spriteUrl(unit.dex)}
          alt=""
          width={78}
          height={78}
          className="relative drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]"
          style={{ imageRendering: "pixelated", transform: flip ? "scaleX(-1)" : "none", filter: cast ? `brightness(1.3) drop-shadow(0 0 11px ${cast})` : unit.disabled ? "brightness(1.25) saturate(0.4) drop-shadow(0 0 7px #7dd3fc)" : unit.burning ? "saturate(1.45) drop-shadow(0 0 7px #f97316)" : `drop-shadow(0 0 6px ${ring}88)` }}
          draggable={false}
        />
        {flash && <span key={flash} className="absolute inset-0 combat-hitflash" style={{ background: "radial-gradient(circle, #fff, #ffffff00 70%)" }} />}
        {unit.mega && (
          <span className="absolute top-0 -right-1 text-[9px] font-bold bg-fuchsia-500 text-black rounded px-0.5 leading-tight shadow">M</span>
        )}
        {unit.disabled && <span className="absolute top-0 -left-1 text-sky-300 drop-shadow"><SnowIcon size={14} /></span>}
        {unit.burning && !unit.disabled && <span className="absolute top-0.5 -left-0.5 w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.7)]" />}
      </div>
    </div>
  );
}

function Corpse({ unit }: { unit: FrameUnit }) {
  const p = hexToPixel({ c: unit.c, r: unit.r }, TILE_W, TILE_H);
  return (
    <>
      {/* One-shot dissipation puff at the moment of death (plays once on mount). */}
      <span className="absolute pointer-events-none rounded-full combat-burst" style={{ left: p.x - 26, top: p.y - 26, width: 52, height: 52, background: "radial-gradient(circle, rgba(226,232,240,0.55), rgba(148,163,184,0) 70%)" }} />
      <div key={unit.id} className="absolute pointer-events-none combat-die" style={{ left: p.x - 23, top: p.y - 23 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteUrl(unit.dex)} alt="" width={46} height={46} style={{ imageRendering: "pixelated", filter: "grayscale(1) brightness(0.6)" }} draggable={false} />
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
function AbilityFx({ x, y, tx, ty, moveType, shape, eff }: { x: number; y: number; tx: number; ty: number; moveType: PokeType; shape: "single" | "splash" | "line"; eff: number }) {
  const color = TYPE_COLOR[moveType] ?? "#a78bfa";
  const sup = eff > 1;        // super-effective → a bigger, brighter, double-ring hit
  const boost = sup ? 1.5 : 1;
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
