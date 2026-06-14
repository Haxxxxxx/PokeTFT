"use client";

import { useDraggable } from "@dnd-kit/core";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR } from "@/game/ui";
import { useUi } from "@/game/store/uiStore";
import { useGame } from "@/game/store/gameStore";
import { MEGA_STONE, canMega, isMegaActive } from "@/game/data/mega";
import { StarIcon, MegaIcon } from "./icons";
import type { UnitInstance } from "@/game/types";

export function Stars({ star }: { star: number }) {
  return (
    <div className="flex justify-center gap-px -mt-1 leading-none text-amber-300 drop-shadow">
      {Array.from({ length: star }).map((_, i) => (
        <StarIcon key={i} size={9} />
      ))}
    </div>
  );
}

export function UnitChip({ unit, size = 56, interactive = true }: { unit: UnitInstance; size?: number; interactive?: boolean }) {
  const def = getDef(unit.defId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: unit.iid, disabled: !interactive });
  const setInspect = useUi((s) => s.setInspect);
  const armedItem = useUi((s) => s.armedItem);
  const armItem = useUi((s) => s.armItem);
  const equipItem = useGame((s) => s.equipItem);
  const dex = def.dex[unit.star - 1];
  const color = COST_COLOR[def.cost];

  const megaReady = isMegaActive(unit.defId, unit.items);
  const canEquipArmed = interactive && armedItem === MEGA_STONE && canMega(unit.defId) && unit.items.length < 3;

  function onClick() {
    if (interactive && armedItem) {
      if (canEquipArmed) {
        equipItem(unit.iid, armedItem);
        armItem(null);
      }
      return;
    }
    setInspect(unit.defId, unit.star);
  }

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      onClick={onClick}
      style={{
        width: size, height: size,
        borderColor: megaReady ? "#f0abfc" : color,
        boxShadow: megaReady ? "0 0 8px #f0abfcaa" : `0 0 6px ${color}66`,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`relative rounded-md border-2 bg-slate-900/80 select-none touch-none flex items-center justify-center
        ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        ${canEquipArmed ? "ring-2 ring-fuchsia-400 animate-pulse" : ""}`}
      title={megaReady ? `${def.stageNames[unit.star - 1]} · Mega ready` : `${def.stageNames[unit.star - 1]} · click for details`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spriteUrl(dex)}
        alt={def.name}
        width={size - 8}
        height={size - 8}
        className="image-render-pixel pointer-events-none"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <div className="absolute top-0 left-0 right-0">
        <Stars star={unit.star} />
      </div>
      {unit.items.includes(MEGA_STONE) && (
        <span className={`absolute bottom-0.5 right-0.5 ${megaReady ? "text-fuchsia-300" : "text-slate-500"}`} title="Mega Stone">
          <MegaIcon size={12} />
        </span>
      )}
    </div>
  );
}
