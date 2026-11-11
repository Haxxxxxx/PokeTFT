"use client";

import { useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useGame } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { useAppStore } from "@/game/store/appStore";
import { MEGA_STONE } from "@/game/data/mega";
import { ITEM_POOL, RARITY_COLOR } from "@/game/data/itemPool";
import { BookOpen } from "lucide-react";
import { MegaIcon } from "./icons";
import { ItemGlyph } from "./ItemGlyph";
import { RecipeBook } from "./RecipeBook";
import { useT } from "@/lib/i18n";

const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i]));

/** A draggable inventory item. Click opens its details (consult); drag it onto a
 *  board/bench mon to equip it. */
function ItemButton({ id, n, selected, onClick }: { id: string; n: number; selected: boolean; onClick: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `equip-${id}`, data: { itemId: id } });
  const isMega = id === MEGA_STONE;
  const def = ITEM_BY_ID[id];
  const name = isMega ? t.it_mega_stone : (lang === "fr" ? def?.nameFr : def?.name) ?? id;
  const rarityColor = isMega ? "#c084fc" : def ? RARITY_COLOR[def.rarity] : "#475569";
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{ borderColor: selected ? "#f0abfc" : rarityColor, opacity: isDragging ? 0.4 : 1 }}
      // The NAME is gone from the row. In a narrow rail every name truncated to
      // an unreadable fragment ("Bracelet Fo…", "Cristal Ps…"), which is what
      // "we can't read the items properly" was: the one piece of text present
      // was the piece that did not fit. The glyph now carries the identity —
      // it is painted in the item's two component colours — so the row shows
      // the glyph and the count, and the full name is one click away in the
      // detail card (and in the tooltip).
      className={`relative flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing touch-none
        ${selected ? "bg-fuchsia-500/15 ring-1 ring-fuchsia-400/70" : "bg-slate-900 hover:bg-slate-800"}`}
      title={name}
      aria-label={name}
    >
      <span className="shrink-0">{isMega ? <MegaIcon size={22} /> : <ItemGlyph id={id} size={22} />}</span>
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
  const [recipesOpen, setRecipesOpen] = useState(false);

  // Esc closes the item inspection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setInspectedItem(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setInspectedItem]);

  // Catches an item dragged back out of play. See the note on the root below.
  const { setNodeRef: setPanelRef, isOver: panelOver } = useDroppable({ id: "items" });

  // Count each distinct item; one row per kind.
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  const distinct = [...counts.keys()];

  return (
    // The panel is itself a DROP TARGET, which it was not: it had a draggable
    // per item and nothing to catch one coming back. Releasing an item over
    // the panel therefore matched no droppable under the pointer, fell through
    // to nearest-centre, and equipped whichever mon happened to be closest —
    // so putting an item back silently handed it to a neighbour.
    //
    // Catching it here makes "drop it where you got it" mean cancel.
    <div ref={setPanelRef} data-inspectable className={`gilded rounded-xl p-3 transition-shadow ${panelOver ? "ring-2 ring-gold-300/70 ring-inset" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] uppercase tracking-wide text-gold-200/60 font-bold">{t.sh_items_title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRecipesOpen(true)}
            className="flex items-center gap-1 text-[10px] font-bold text-gold-200/70 hover:text-gold-200"
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
          {/* Bounded at source too, not just by the rail. The hint underneath
              ("drag onto a mon to equip") is the only place the game says how
              items are used, and an unbounded grid pushed it out of sight
              exactly when the player had enough items to need it. */}
          <div className="grid grid-cols-2 gap-1.5 max-h-[34vh] overflow-y-auto">
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
