"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/game/store/gameStore";
import { computeTraits } from "@/game/engine/synergies";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { TYPE_COLOR, COST_COLOR, TRAIT_ICON } from "@/game/ui";
import { getDef, spriteUrl } from "@/game/data/mons";

import type { UnitInstance } from "@/game/types";

type Trait = ReturnType<typeof computeTraits>[number];

export function TraitPanel({ units: override }: { units?: UnitInstance[] } = {}) {
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
  const membersFor = (key: string) =>
    rosterIds
      .map(getDef)
      .filter((d) => (d.types as string[]).includes(key) || ((d.roles as string[] | undefined) ?? []).includes(key))
      .sort((a, b) => a.cost - b.cost);

  // Hovered row → a portaled tooltip (escapes the scroll container so it's never
  // clipped, even when the synergy list is long enough to scroll).
  const [hover, setHover] = useState<{ key: string; top: number; left: number } | null>(null);
  const hovered = hover ? traits.find((t) => t.key === hover.key) : null;

  return (
    <div className="w-full h-full min-h-0 flex flex-col p-3 rounded-xl bg-slate-900/70 border border-slate-700/50">
      <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-2 shrink-0">Synergies</h2>
      {traits.length === 0 && <p className="text-xs text-slate-500">Place mons to activate traits.</p>}
      {/* Scrolls when the list gets long. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
        {traits.map((t) => {
          const color = (TYPE_COLOR as Record<string, string>)[t.key] ?? "#64748b";
          const active = t.tier > 0;
          const nextBp = t.breakpoints.find((b) => b > t.count);
          return (
            <div
              key={t.key}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ key: t.key, top: r.top, left: r.right + 8 }); }}
              onMouseLeave={() => setHover((h) => (h?.key === t.key ? null : h))}
              className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-help shrink-0 ${active ? "bg-slate-800" : "bg-slate-900/40 opacity-60"}`}
            >
              <span
                style={{ background: active ? color : "transparent", borderColor: color, boxShadow: active ? `0 0 6px -1px ${color}` : "none" }}
                className="w-6 h-6 rounded border flex items-center justify-center text-[11px] leading-none"
              >
                {TRAIT_ICON[t.key] ?? "◆"}
              </span>
              <span className="text-xs font-semibold flex-1">{t.label}</span>
              {active && <span style={{ background: color }} className="text-[9px] font-bold px-1 rounded text-black/80">{t.tier}</span>}
              <span className="text-[11px] text-slate-400">{t.count}{nextBp ? `/${nextBp}` : " ✓"}</span>
            </div>
          );
        })}
      </div>
      {hovered && hover && createPortal(
        <TraitTooltip t={hovered} top={hover.top} left={hover.left} members={membersFor(hovered.key)} board={board} />,
        document.body,
      )}
    </div>
  );
}

/** Portaled hover card for a synergy: progress, tiers, and the roster carrying it. */
function TraitTooltip({ t, top, left, members, board }: { t: Trait; top: number; left: number; members: ReturnType<typeof getDef>[]; board: UnitInstance[] }) {
  const color = (TYPE_COLOR as Record<string, string>)[t.key] ?? "#64748b";
  const nextBp = t.breakpoints.find((b) => b > t.count);
  const desc = TRAITS_BY_KEY[t.key]?.description ?? "";
  const onBoard = new Set(board.map((u) => u.defId));
  const ownedCount = members.filter((d) => onBoard.has(d.id)).length;
  return (
    <div style={{ position: "fixed", top, left, borderColor: color }} className="z-[80] w-[240px] p-3 rounded-lg border bg-[#0d1426] text-slate-100 shadow-2xl pointer-events-none">
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ borderColor: color }} className="w-5 h-5 rounded border flex items-center justify-center text-[12px] leading-none">{TRAIT_ICON[t.key] ?? "◆"}</span>
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
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">
            <span style={{ color }} className="font-bold">{ownedCount}</span> / {members.length} mons
          </div>
          <div className="flex flex-wrap gap-1 max-h-[160px] overflow-y-auto">
            {members.map((d) => {
              const owned = onBoard.has(d.id);
              return (
                <span key={d.id} title={`${d.name} · ${d.cost}g`} style={{ borderColor: COST_COLOR[d.cost] }} className={`relative w-7 h-7 rounded-md border bg-black/40 flex items-center justify-center overflow-hidden ${owned ? "" : "opacity-45 grayscale"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={spriteUrl(d.dex[0])} alt={d.name} width={24} height={24} style={{ imageRendering: "pixelated" }} draggable={false} />
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
