"use client";

import { useEffect } from "react";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL } from "@/game/data/itemPool";
import { MegaIcon } from "./icons";

const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

export function ItemTray() {
  const items = useGame((s) => s.items);
  const armedItem = useUi((s) => s.armedItem);
  const armItem = useUi((s) => s.armItem);

  // Esc cancels equip mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && armItem(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armItem]);

  if (items.length === 0) return null;

  // Count each distinct item; render one armable button per kind.
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  const distinct = [...counts.keys()];

  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Items</span>
        {distinct.map((id) => {
          const isMega = id === MEGA_STONE;
          const def = ITEM_BY_ID[id];
          const armed = armedItem === id;
          const n = counts.get(id)!;
          return (
            <button
              key={id}
              onClick={() => armItem(armed ? null : id)}
              style={{ borderColor: armed ? "#f0abfc" : isMega ? "#5b21b6" : "#475569" }}
              className={`relative w-11 h-11 rounded-lg border-2 flex items-center justify-center text-lg transition-all
                ${armed ? "bg-fuchsia-500/20 ring-2 ring-fuchsia-400" : "bg-slate-900 hover:bg-slate-800"}`}
              title={isMega ? "Mega Stone — click, then a Mega-capable mon" : `${def?.name ?? id} — ${def?.effect ?? ""}`}
            >
              {isMega ? <MegaIcon size={22} /> : <span>{def?.icon ?? "◆"}</span>}
              {n > 1 && (
                <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-slate-800 border border-slate-600 rounded px-1 leading-tight">{n}</span>
              )}
            </button>
          );
        })}
      </div>
      {armedItem && (
        <span className="text-xs font-semibold text-fuchsia-300 animate-pulse">
          {armedItem === MEGA_STONE ? "Click a Mega-capable mon to equip" : "Click a mon to equip"} · Esc to cancel
        </span>
      )}
    </div>
  );
}
