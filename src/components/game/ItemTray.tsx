"use client";

import { useEffect } from "react";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { MEGA_STONE } from "@/game/data/mega";
import { MegaIcon } from "./icons";

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

  const stones = items.filter((i) => i === MEGA_STONE).length;
  if (items.length === 0) return null;
  const armed = armedItem === MEGA_STONE;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Items</span>
        {stones > 0 && (
          <button
            onClick={() => armItem(MEGA_STONE)}
            style={{ borderColor: armed ? "#f0abfc" : "#5b21b6" }}
            className={`relative w-11 h-11 rounded-lg border-2 flex items-center justify-center text-fuchsia-300 transition-all
              ${armed ? "bg-fuchsia-500/20 ring-2 ring-fuchsia-400" : "bg-slate-900 hover:bg-slate-800"}`}
            title="Mega Stone — click, then click a Mega-capable mon"
          >
            <MegaIcon size={22} />
            {stones > 1 && (
              <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-slate-800 border border-slate-600 rounded px-1 leading-tight">
                {stones}
              </span>
            )}
          </button>
        )}
      </div>
      {armed && (
        <span className="text-xs font-semibold text-fuchsia-300 animate-pulse">
          Click a Mega-capable mon to equip · Esc to cancel
        </span>
      )}
    </div>
  );
}
