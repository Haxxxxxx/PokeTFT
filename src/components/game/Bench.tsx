"use client";

import { useDroppable } from "@dnd-kit/core";
import { useGame, BENCH_SIZE } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";

export function Bench() {
  const units = useGame((s) => s.units);
  const bench = units.filter((u) => u.pos === null);
  const { setNodeRef, isOver } = useDroppable({ id: "bench" });

  return (
    <div
      ref={setNodeRef}
      className={`flex gap-1.5 p-2 rounded-xl border transition-colors
        ${isOver ? "border-sky-400 bg-sky-400/10" : "border-slate-700/60 bg-slate-900/50"}`}
    >
      {Array.from({ length: BENCH_SIZE }).map((_, i) => (
        <div
          key={i}
          className="w-[72px] h-[72px] rounded-md border border-slate-700/50 bg-slate-800/30 flex items-center justify-center"
        >
          {bench[i] && <UnitChip unit={bench[i]} size={68} />}
        </div>
      ))}
    </div>
  );
}
