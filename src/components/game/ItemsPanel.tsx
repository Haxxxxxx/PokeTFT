"use client";

import { useEffect } from "react";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL } from "@/game/data/itemPool";
import { MegaIcon } from "./icons";
import { useT } from "@/lib/i18n";

const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** Right-rail inventory list. Clicking an item opens its details in the panel
 *  below AND arms it, so the next mon you click equips it. */
export function ItemsPanel() {
  const t = useT();
  const items = useGame((s) => s.items);
  const armedItem = useUi((s) => s.armedItem);
  const armItem = useUi((s) => s.armItem);
  const inspectedItem = useUi((s) => s.inspectedItem);
  const setInspectedItem = useUi((s) => s.setInspectedItem);

  // Esc cancels equip mode + item inspection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { armItem(null); setInspectedItem(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armItem, setInspectedItem]);

  // Count each distinct item; one row per kind.
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  const distinct = [...counts.keys()];

  return (
    <div data-inspectable className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{t.sh_items_title}</h2>
        <span className="text-[10px] text-slate-500">{items.length}</span>
      </div>
      {distinct.length === 0 ? (
        <p className="text-[11px] text-slate-600 leading-relaxed">{t.it_empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {distinct.map((id) => {
            const isMega = id === MEGA_STONE;
            const def = ITEM_BY_ID[id];
            const armed = armedItem === id;
            const selected = inspectedItem === id;
            const n = counts.get(id)!;
            return (
              <button
                key={id}
                onClick={() => { setInspectedItem(selected ? null : id); armItem(armed ? null : id); }}
                style={{ borderColor: armed || selected ? "#f0abfc" : isMega ? "#5b21b6" : "#475569" }}
                className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all min-w-0
                  ${armed || selected ? "bg-fuchsia-500/15 ring-1 ring-fuchsia-400/70" : "bg-slate-900 hover:bg-slate-800"}`}
                title={isMega ? "Mega Stone" : def?.name ?? id}
              >
                <span className="text-base shrink-0">{isMega ? <MegaIcon size={18} /> : (def?.icon ?? "◆")}</span>
                <span className="text-[10px] font-semibold text-slate-200 truncate flex-1">{isMega ? "Mega Stone" : def?.name ?? id}</span>
                {n > 1 && <span className="text-[9px] font-bold text-slate-400 shrink-0">×{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      {armedItem && (
        <p className="mt-2 text-[10px] font-semibold text-fuchsia-300 leading-snug">
          {armedItem === MEGA_STONE ? t.it_equip_mega : t.it_equip_hint}
        </p>
      )}
    </div>
  );
}
