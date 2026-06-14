"use client";

import { useDraggable } from "@dnd-kit/core";
import { getDef, spriteUrl } from "@/game/data/mons";
import { COST_COLOR } from "@/game/ui";
import { useUi } from "@/game/store/uiStore";
import { StarIcon } from "./icons";
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

export function UnitChip({ unit, size = 56 }: { unit: UnitInstance; size?: number }) {
  const def = getDef(unit.defId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: unit.iid });
  const setInspect = useUi((s) => s.setInspect);
  const dex = def.dex[unit.star - 1];
  const color = COST_COLOR[def.cost];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => setInspect(unit.defId, unit.star)}
      style={{ width: size, height: size, borderColor: color, boxShadow: `0 0 6px ${color}66`, opacity: isDragging ? 0.4 : 1 }}
      className="relative rounded-md border-2 bg-slate-900/80 cursor-grab active:cursor-grabbing select-none touch-none flex items-center justify-center"
      title={`${def.stageNames[unit.star - 1]} · click for details`}
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
    </div>
  );
}
