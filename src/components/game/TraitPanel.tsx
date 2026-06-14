"use client";

import { useGame } from "@/game/store/gameStore";
import { computeTraits } from "@/game/engine/synergies";
import { TRAITS_BY_KEY } from "@/game/data/traits";
import { TYPE_COLOR } from "@/game/ui";

export function TraitPanel() {
  const units = useGame((s) => s.units);
  const board = units.filter((u) => u.pos !== null);
  const traits = computeTraits(board);

  return (
    <div className="w-[220px] shrink-0 p-3 rounded-xl bg-slate-900/70 border border-slate-700/50">
      <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-2">Synergies</h2>
      {traits.length === 0 && <p className="text-xs text-slate-500">Place mons to activate traits.</p>}
      <div className="flex flex-col gap-1.5">
        {traits.map((t) => {
          const color = (TYPE_COLOR as Record<string, string>)[t.key] ?? "#64748b";
          const active = t.tier > 0;
          const nextBp = t.breakpoints.find((b) => b > t.count);
          const desc = TRAITS_BY_KEY[t.key]?.description ?? "";

          return (
            <div key={t.key} className="relative group">
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-help ${active ? "bg-slate-800" : "bg-slate-900/40 opacity-60"}`}
              >
                <span
                  style={{ background: active ? color : "transparent", borderColor: color }}
                  className="w-5 h-5 rounded border text-[10px] font-bold flex items-center justify-center text-black"
                >
                  {active ? t.tier : ""}
                </span>
                <span className="text-xs font-semibold flex-1">{t.label}</span>
                <span className="text-[11px] text-slate-400">
                  {t.count}
                  {nextBp ? `/${nextBp}` : " ✓"}
                </span>
              </div>

              {/* Hover tooltip */}
              <div
                style={{ borderColor: color }}
                className="hidden group-hover:block absolute left-full top-0 ml-2 z-40 w-[240px] p-3 rounded-lg border bg-[#0d1426] shadow-xl"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ background: color }} className="w-3 h-3 rounded-sm" />
                  <span className="font-bold text-sm">{t.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{t.count} active</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mb-2">{desc}</p>
                <div className="flex flex-col gap-1.5">
                  {(TRAITS_BY_KEY[t.key]?.tiers ?? []).map((tier) => {
                    const reached = t.count >= tier.count;
                    return (
                      <div
                        key={tier.count}
                        className={`flex items-start gap-2 text-[11px] leading-snug ${reached ? "text-slate-100" : "text-slate-500"}`}
                      >
                        <span
                          style={{ background: reached ? color : "transparent", borderColor: color }}
                          className="mt-px w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[9px] font-bold text-black"
                        >
                          {tier.count}
                        </span>
                        <span className={reached ? "font-medium" : ""}>{tier.effect}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
