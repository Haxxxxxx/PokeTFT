"use client";

import { useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL, RARITY_COLOR } from "@/game/data/itemPool";
import { MegaIcon } from "./icons";
import { useT } from "@/lib/i18n";

const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** A draggable inventory item. Click opens its details (consult); drag it onto a
 *  board/bench mon to equip it. */
function ItemButton({ id, n, selected, onClick }: { id: string; n: number; selected: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `equip-${id}`, data: { itemId: id } });
  const isMega = id === MEGA_STONE;
  const def = ITEM_BY_ID[id];
  const rarityColor = isMega ? "#c084fc" : def ? RARITY_COLOR[def.rarity] : "#475569";
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{ borderColor: selected ? "#f0abfc" : rarityColor, opacity: isDragging ? 0.4 : 1 }}
      className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all min-w-0 cursor-grab active:cursor-grabbing touch-none
        ${selected ? "bg-fuchsia-500/15 ring-1 ring-fuchsia-400/70" : "bg-slate-900 hover:bg-slate-800"}`}
      title={isMega ? "Mega Stone" : def?.name ?? id}
    >
      <span className="text-base shrink-0">{isMega ? <MegaIcon size={18} /> : (def?.icon ?? "◆")}</span>
      <span className="text-[10px] font-semibold text-slate-200 truncate flex-1">{isMega ? "Mega Stone" : def?.name ?? id}</span>
      {n > 1 && <span className="text-[9px] font-bold text-slate-400 shrink-0">×{n}</span>}
    </button>
  );
}

/** Right-rail inventory list. Click an item to consult it; drag it onto a mon to
 *  equip it. */
export function ItemsPanel() {
  const t = useT();
  const items = useGame((s) => s.items);
  const inspectedItem = useUi((s) => s.inspectedItem);
  const setInspectedItem = useUi((s) => s.setInspectedItem);

  // Esc closes the item inspection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setInspectedItem(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setInspectedItem]);

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
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {distinct.map((id) => (
              <ItemButton
                key={id}
                id={id}
                n={counts.get(id)!}
                selected={inspectedItem === id}
                onClick={() => setInspectedItem(inspectedItem === id ? null : id)}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-snug">{t.it_drag_equip}</p>
        </>
      )}
    </div>
  );
}
