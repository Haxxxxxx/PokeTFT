"use client";

import { useDraggable } from "@dnd-kit/core";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR } from "@/game/ui";
import { useUi } from "@/game/store/uiStore";
import { useGame } from "@/game/store/gameStore";
import { MEGA_STONE, canMega, isMegaActive } from "@/game/data/mega";
import { ITEM_POOL } from "@/game/data/itemPool";
import { StarIcon, MegaIcon } from "./icons";
import type { UnitInstance } from "@/game/types";

const ITEM_ICON = Object.fromEntries(ITEM_POOL.map((i) => [i.id, i.icon]));

/** Small icons of the items a unit is holding, pinned to the token corner. */
function ItemPips({ items, megaReady }: { items: string[]; megaReady: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="absolute bottom-0.5 right-0.5 flex gap-px pointer-events-none">
      {items.map((id, i) => id === MEGA_STONE ? (
        <span key={i} className={megaReady ? "text-fuchsia-300" : "text-slate-400"} title="Mega Stone"><MegaIcon size={11} /></span>
      ) : (
        <span key={i} className="text-[10px] leading-none drop-shadow" title={id}>{ITEM_ICON[id] ?? "◆"}</span>
      ))}
    </div>
  );
}

export function Stars({ star }: { star: number }) {
  return (
    <div className="flex justify-center gap-px -mt-1 leading-none text-amber-300 drop-shadow">
      {Array.from({ length: star }).map((_, i) => (
        <StarIcon key={i} size={9} />
      ))}
    </div>
  );
}

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export function UnitChip({ unit, size = 56, interactive = true, shape = "square" }: { unit: UnitInstance; size?: number; interactive?: boolean; shape?: "square" | "hex" }) {
  const def = getDef(unit.defId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: unit.iid, disabled: !interactive });
  const setInspect = useUi((s) => s.setInspect);
  const armedItem = useUi((s) => s.armedItem);
  const armItem = useUi((s) => s.armItem);
  const equipItem = useGame((s) => s.equipItem);
  const deployUnit = useGame((s) => s.deployUnit);
  const dex = def.dex[unit.star - 1];
  const color = COST_COLOR[def.cost];

  // RTDB strips empty arrays, so a rehydrated unit can arrive without `items`.
  const heldItems = unit.items ?? [];
  const megaReady = isMegaActive(unit.defId, heldItems);
  // Any held item can be equipped (max 3); the Mega Stone also needs a Mega-capable mon.
  const canEquipArmed = interactive && !!armedItem && heldItems.length < 3 && (armedItem === MEGA_STONE ? canMega(unit.defId) : true);

  function onClick() {
    if (interactive && armedItem) {
      if (canEquipArmed) {
        equipItem(unit.iid, armedItem);
        armItem(null);
      }
      return;
    }
    setInspect(unit.defId, unit.star, unit.iid);
  }

  // Double-click a bench unit to quick-deploy it onto the first free board cell.
  function onDoubleClick() {
    if (interactive && unit.pos === null) deployUnit(unit.iid);
  }

  const ring = megaReady ? "#f0abfc" : color;
  const title = megaReady ? `${def.stageNames[unit.star - 1]} · Mega ready` : `${def.stageNames[unit.star - 1]} · click for details`;
  const sprite = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(dex)}
      alt={def.name}
      width={size - 8}
      height={size - 8}
      className="image-render-pixel pointer-events-none"
      style={{ imageRendering: "pixelated" }}
      draggable={false}
    />
  );

  // Hex token (on the board) — the colored token follows the hexagonal cell.
  if (shape === "hex") {
    return (
      <div
        ref={interactive ? setNodeRef : undefined}
        {...(interactive ? listeners : {})}
        {...(interactive ? attributes : {})}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{ width: size, height: size, opacity: isDragging ? 0.4 : 1 }}
        className={`relative select-none touch-none ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${canEquipArmed ? "animate-pulse" : ""}`}
        title={title}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ clipPath: HEX_CLIP, background: "rgba(15,23,42,0.85)", boxShadow: `inset 0 0 0 2px ${ring}, inset 0 0 10px ${ring}55` }}
        >
          {sprite}
        </div>
        <div className="absolute -top-1 inset-x-0 flex justify-center pointer-events-none">
          <Stars star={unit.star} />
        </div>
        <ItemPips items={heldItems} megaReady={megaReady} />
      </div>
    );
  }

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        width: size, height: size,
        borderColor: ring,
        boxShadow: megaReady ? "0 0 8px #f0abfcaa" : `0 0 6px ${color}66`,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`relative rounded-md border-2 bg-slate-900/80 select-none touch-none flex items-center justify-center
        ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        ${canEquipArmed ? "ring-2 ring-fuchsia-400 animate-pulse" : ""}`}
      title={title}
    >
      {sprite}
      <div className="absolute top-0 left-0 right-0">
        <Stars star={unit.star} />
      </div>
      <ItemPips items={heldItems} megaReady={megaReady} />
    </div>
  );
}
