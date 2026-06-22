"use client";

import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL, RARITY_COLOR, isEmblem } from "@/game/data/itemPool";
import { Hammer, Sparkles, BookOpen } from "lucide-react";
import { MegaIcon } from "./icons";
import { ItemGlyph } from "./ItemGlyph";
import { RecipeBook } from "./RecipeBook";
import { useT } from "@/lib/i18n";

const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** A draggable inventory item. Click opens its details (consult); drag it onto a
 *  board/bench mon to equip it. */
function ItemButton({ id, n, selected, onClick }: { id: string; n: number; selected: boolean; onClick: () => void }) {
  const t = useT();
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
      title={isMega ? t.it_mega_stone : def?.name ?? id}
    >
      <span className="text-base shrink-0">{isMega ? <MegaIcon size={18} /> : <ItemGlyph id={id} size={16} />}</span>
      <span className="text-[10px] font-semibold text-slate-200 truncate flex-1">{isMega ? t.it_mega_stone : def?.name ?? id}</span>
      {n > 1 && <span className="text-[9px] font-bold text-slate-400 shrink-0">×{n}</span>}
    </button>
  );
}

/** Right-rail inventory list. Click an item to consult it; drag it onto a mon to
 *  equip it. */
export function ItemsPanel() {
  const t = useT();
  const items = useGame((s) => s.items);
  const reforgeItem = useGame((s) => s.reforgeItem);
  const forgeEmblem = useGame((s) => s.forgeEmblem);
  const inspectedItem = useUi((s) => s.inspectedItem);
  const setInspectedItem = useUi((s) => s.setInspectedItem);
  const [recipesOpen, setRecipesOpen] = useState(false);

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
    <div data-inspectable className="gilded rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] uppercase tracking-wide text-amber-200/60 font-bold">{t.sh_items_title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRecipesOpen(true)}
            className="flex items-center gap-1 text-[10px] font-bold text-amber-200/70 hover:text-amber-200"
            title={t.it_recipes_title}
          >
            <BookOpen size={12} /> {t.it_recipes}
          </button>
          <span className="text-[10px] text-slate-500">{items.length}</span>
        </div>
      </div>
      {recipesOpen && <RecipeBook onClose={() => setRecipesOpen(false)} />}
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
          {/* Anvil — reforge a selected completed item / emblem into a random other,
              or forge a completed item into a Spatula emblem (trait grantor). */}
          {inspectedItem && ITEM_BY_ID[inspectedItem] && ITEM_BY_ID[inspectedItem].kind !== "component" && inspectedItem !== MEGA_STONE && (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => reforgeItem(inspectedItem)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-900/50 border border-slate-700 text-[10px] font-bold text-amber-200"
                title={t.it_reforge_t}
              >
                <Hammer size={12} /> {t.it_reforge}
              </button>
              {!isEmblem(inspectedItem) && (
                <button
                  onClick={() => forgeEmblem(inspectedItem)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-fuchsia-900/50 border border-slate-700 text-[10px] font-bold text-fuchsia-200"
                  title={t.it_forge_t}
                >
                  <Sparkles size={12} /> {t.it_forge_emblem}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
