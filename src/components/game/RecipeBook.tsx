"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { COMPONENTS, RECIPES, combineKey, ITEM_BY_ID, RARITY_COLOR, isEmblem } from "@/game/data/itemPool";
import { useAppStore } from "@/game/store/appStore";
import { ItemGlyph } from "./ItemGlyph";

/** A recipe browser: pick a base component on the left and see every item it can be
 *  combined into (which partner makes what). Mirrors the TFT item cheat-sheet — and
 *  surfaces the Spatula → Emblem crafts so players discover them. */
export function RecipeBook({ onClose }: { onClose: () => void }) {
  const lang = useAppStore((s) => s.settings.language);
  const fr = lang === "fr";
  const [base, setBase] = useState<string>(COMPONENTS[0]?.id ?? "c-ad");

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (id: string) => (fr ? ITEM_BY_ID[id]?.nameFr : ITEM_BY_ID[id]?.name) ?? id;
  const color = (id: string) => RARITY_COLOR[ITEM_BY_ID[id]?.rarity ?? "common"] ?? "#94a3b8";

  // Every recipe this base takes part in: partner component → result item.
  const results = COMPONENTS
    .map((p) => ({ partner: p.id, result: RECIPES[combineKey(base, p.id)] }))
    .filter((r): r is { partner: string; result: string } => Boolean(r.result));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="gilded rounded-xl p-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wide text-amber-200/80 font-bold">
            {fr ? "Recettes d'objets" : "Item Recipes"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" title={fr ? "Fermer" : "Close"} aria-label={fr ? "Fermer" : "Close"}>
            <X size={18} />
          </button>
        </div>

        {/* Base components — click one to see what it builds. */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {COMPONENTS.map((c) => {
            const selected = base === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setBase(c.id)}
                style={{ borderColor: selected ? "#f0abfc" : color(c.id) }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all
                  ${selected ? "bg-fuchsia-500/15 ring-1 ring-fuchsia-400/70" : "bg-slate-900 hover:bg-slate-800"}`}
                title={name(c.id)}
              >
                <span style={{ color: color(c.id) }}><ItemGlyph id={c.id} size={16} /></span>
                <span className="text-[11px] font-semibold text-slate-200">{name(c.id)}</span>
              </button>
            );
          })}
        </div>

        {/* Results: base + partner = result. */}
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-2">
          {fr ? `${name(base)} fabrique` : `${name(base)} builds`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {results.map(({ partner, result }) => (
            <div
              key={partner}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800"
            >
              <span style={{ color: color(base) }} className="shrink-0"><ItemGlyph id={base} size={14} /></span>
              <span className="text-slate-500 text-xs shrink-0">+</span>
              <span style={{ color: color(partner) }} className="shrink-0"><ItemGlyph id={partner} size={14} /></span>
              <span className="text-[10px] text-slate-400 truncate min-w-0">{name(partner)}</span>
              <span className="text-slate-500 text-xs shrink-0 ml-auto">=</span>
              <span style={{ color: color(result) }} className="shrink-0">
                <ItemGlyph id={result} size={16} />
              </span>
              <span
                className="text-[11px] font-semibold truncate min-w-0 max-w-[7rem]"
                style={{ color: isEmblem(result) ? "#e9d5ff" : "#e2e8f0" }}
                title={name(result)}
              >
                {name(result)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
