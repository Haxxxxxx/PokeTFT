"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/game/store/gameStore";
import { computeTraits } from "@/game/engine/synergies";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { TYPE_COLOR, COST_COLOR } from "@/game/ui";
import { TraitGlyph } from "./TraitGlyph";
import { getDef, spriteUrl } from "@/game/data/mons";
import { EMBLEM_TRAIT } from "@/game/data/itemPool";
import { useT } from "@/lib/i18n";

import type { UnitInstance } from "@/game/types";

type Trait = ReturnType<typeof computeTraits>[number];

export function TraitPanel({ units: override }: { units?: UnitInstance[] } = {}) {
  const tr = useT();
  const storeUnits = useGame((s) => s.units);
  const unitsByCost = useGame((s) => s.unitsByCost);
  const units = override ?? storeUnits;
  const board = units.filter((u) => u.pos !== null);
  const traits = computeTraits(board);

  // Full roster of the active generations, for the "who has this trait" tooltip.
  const rosterIds = useMemo(
    () => [1, 2, 3, 4, 5].flatMap((c) => unitsByCost[c as 1 | 2 | 3 | 4 | 5] ?? []),
    [unitsByCost],
  );
  const membersFor = (key: string) => {
    const native = rosterIds
      .map(getDef)
      .filter((d) => (d.types as string[]).includes(key) || ((d.roles as string[] | undefined) ?? []).includes(key));
    const nativeIds = new Set(native.map((d) => d.id));
    // Board mons that gained this trait via an emblem (not native carriers) belong in
    // the table too — so an emblem'd unit shows up under the synergy it now grants.
    const seen = new Set<string>();
    const viaEmblem = board
      .filter((u) => (u.items ?? []).some((it) => EMBLEM_TRAIT[it] === key))
      .map((u) => getDef(u.defId))
      .filter((d) => !nativeIds.has(d.id) && !seen.has(d.id) && seen.add(d.id));
    return [...native, ...viaEmblem].sort((a, b) => a.cost - b.cost);
  };

  // How many carriers of each trait the active region pool even HAS — so a synergy
  // that can't reach its next tier in this region (e.g. only 1 Dragon in Kanto) is
  // shown as capped instead of dangling an impossible breakpoint.
  const poolCountByTrait = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of rosterIds) {
      const d = getDef(id);
      for (const k of [...(d.types as string[]), ...((d.roles as string[] | undefined) ?? [])]) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rosterIds]);

  // Hovered row → a portaled tooltip (escapes the scroll container so it's never
  // clipped, even when the synergy list is long enough to scroll).
  const [hover, setHover] = useState<{ key: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openHover = (key: string, top: number, left: number) => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setHover({ key, top, left });
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHover(null), 160);
  };
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const hovered = hover ? traits.find((t) => t.key === hover.key) : null;

  return (
    <div className="gilded w-full h-full min-h-0 flex flex-col p-3 rounded-xl">
      <h2 className="text-xs uppercase tracking-wide text-amber-200/60 mb-2 shrink-0">{tr.tp_synergies}</h2>
      {traits.length === 0 && <p className="text-xs text-slate-500">{tr.tp_place_mons}</p>}
      {/* Scrolls when the list gets long. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
        {traits.map((t) => {
          const color = (TYPE_COLOR as Record<string, string>)[t.key] ?? "#64748b";
          const active = t.tier > 0;
          const nextBp = t.breakpoints.find((b) => b > t.count);
          const poolMax = poolCountByTrait.get(t.key) ?? 0;
          const capped = nextBp != null && nextBp > poolMax; // next tier unreachable in this region
          return (
            <div
              key={t.key}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); openHover(t.key, r.top, r.right + 8); }}
              onMouseLeave={scheduleClose}
              className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-help shrink-0 ${active ? "bg-slate-800" : "bg-slate-900/40 opacity-60"}`}
            >
              <span
                style={{ background: active ? color : "transparent", borderColor: color, boxShadow: active ? `0 0 6px -1px ${color}` : "none" }}
                className="w-6 h-6 rounded border flex items-center justify-center"
              >
                <TraitGlyph traitKey={t.key} size={13} />
              </span>
              <span className="text-xs font-semibold flex-1">{t.label}</span>
              {active && <span style={{ background: color }} className="text-[9px] font-bold px-1 rounded text-black/80">{t.tier}</span>}
              {capped && !active && <span className="text-[8px] font-bold uppercase tracking-wide text-slate-600" title={`${tr.tp_cap_only} ${poolMax} ${tr.tp_cap_rest}`}>max {poolMax}</span>}
              <span className="text-[11px] text-slate-400">{t.count}{nextBp ? `/${nextBp}` : " ✓"}</span>
            </div>
          );
        })}
      </div>
      {hovered && hover && createPortal(
        <TraitTooltip t={hovered} top={hover.top} left={hover.left} members={membersFor(hovered.key)} board={board} onEnter={cancelClose} onLeave={scheduleClose} />,
        document.body,
      )}
    </div>
  );
}

/** Portaled hover card for a synergy: progress, tiers, and the roster carrying it. */
function TraitTooltip({ t, top, left, members, board, onEnter, onLeave }: { t: Trait; top: number; left: number; members: ReturnType<typeof getDef>[]; board: UnitInstance[]; onEnter: () => void; onLeave: () => void }) {
  const color = (TYPE_COLOR as Record<string, string>)[t.key] ?? "#64748b";
  const nextBp = t.breakpoints.find((b) => b > t.count);
  const desc = TRAITS_BY_KEY[t.key]?.description ?? "";
  const onBoard = new Set(board.map((u) => u.defId));
  const ownedCount = members.filter((d) => onBoard.has(d.id)).length;
  // The mon the cursor is on inside the roster grid → its name shows in a reserved line so you
  // always know who you're looking at (the sprites alone read as tiny silhouettes).
  const [hoverMon, setHoverMon] = useState<{ name: string; cost: number } | null>(null);
  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ position: "fixed", top, left, borderColor: color }} className="z-[80] w-[260px] p-3 rounded-lg border bg-[#0d1426] text-slate-100 shadow-2xl">
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ borderColor: color }} className="w-5 h-5 rounded border flex items-center justify-center"><TraitGlyph traitKey={t.key} size={12} /></span>
        <span className="font-bold text-sm">{t.label}</span>
        <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color }}>{t.count}{nextBp ? `/${nextBp}` : ""}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t.count / (nextBp ?? t.count)) * 100)}%`, background: color }} />
        </div>
        <span className="text-[9px] text-slate-500">{nextBp ? `${nextBp - t.count} to ${nextBp}` : "MAX"}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-snug mb-2">{desc}</p>
      <div className="flex flex-col gap-1.5">
        {(TRAITS_BY_KEY[t.key]?.tiers ?? []).map((tier) => {
          const reached = t.count >= tier.count;
          return (
            <div key={tier.count} className={`flex items-start gap-2 text-[11px] leading-snug ${reached ? "text-slate-100" : "text-slate-500"}`}>
              <span style={{ background: reached ? color : "transparent", borderColor: color }} className="mt-px w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[9px] font-bold text-black">{tier.count}</span>
              <span className={reached ? "font-medium" : ""}>{tier.effect}</span>
            </div>
          );
        })}
      </div>
      {members.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-slate-700/60">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              <span style={{ color }} className="font-bold">{ownedCount}</span> / {members.length} mons
            </span>
            {/* Reserved line: the hovered mon's name + cost, so silhouettes are identifiable. */}
            <span className="text-[11px] font-semibold truncate min-w-0" style={{ color: hoverMon ? COST_COLOR[hoverMon.cost as keyof typeof COST_COLOR] : undefined }}>
              {hoverMon ? `${hoverMon.name} · ${hoverMon.cost}g` : <span className="text-slate-600 font-normal">{"—"}</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            {members.map((d) => {
              const owned = onBoard.has(d.id);
              return (
                <span
                  key={d.id}
                  title={`${d.name} · ${d.cost}g`}
                  onMouseEnter={() => setHoverMon({ name: d.name, cost: d.cost })}
                  onMouseLeave={() => setHoverMon((h) => (h?.name === d.name ? null : h))}
                  style={{ borderColor: COST_COLOR[d.cost] }}
                  className={`relative w-10 h-10 rounded-md border bg-black/40 flex items-center justify-center overflow-hidden transition-transform hover:scale-110 hover:z-10 ${owned ? "" : "opacity-45 grayscale"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={spriteUrl(d.dex[0])} alt={d.name} width={36} height={36} style={{ imageRendering: "pixelated" }} loading="lazy" draggable={false} />
                  {owned && <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: color }} />}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
