"use client";

import { useDroppable } from "@dnd-kit/core";
import { useGame, BENCH_SIZE } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

/** A single bench slot — its own drop target so you can drag a bench unit onto
 *  another slot (swap) or an empty one (move), and drop board units back here. */
function BenchSlot({ index, unit }: { index: number; unit?: UnitInstance }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bench-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`w-[72px] h-[72px] rounded-md border flex items-center justify-center transition-colors
        ${isOver ? "border-sky-400 bg-sky-400/15" : "border-slate-700/50 bg-slate-800/30"}`}
    >
      {unit && <UnitChip unit={unit} size={68} />}
    </div>
  );
}

export function Bench() {
  const units = useGame((s) => s.units);
  const bench = units.filter((u) => u.pos === null);
  // Outer drop target: dropping a board unit anywhere on the bench benches it.
  const { setNodeRef, isOver } = useDroppable({ id: "bench" });

  return (
    <div
      ref={setNodeRef}
      className={`flex gap-1.5 p-2 rounded-xl border transition-colors
        ${isOver ? "border-sky-400/60 bg-sky-400/5" : "border-slate-700/60 bg-slate-900/50"}`}
    >
      {Array.from({ length: BENCH_SIZE }).map((_, i) => (
        <BenchSlot key={i} index={i} unit={bench[i]} />
      ))}
    </div>
  );
}
