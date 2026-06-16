"use client";

import { useDroppable } from "@dnd-kit/core";
import { useGame, BENCH_SIZE, resolveBenchSlots } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

/** A single bench slot — its own drop target so you can drag a bench unit onto
 *  another slot (swap) or an empty one (move), and drop board units back here. */
function BenchSlot({ index, unit, interactive, canDeploy }: { index: number; unit?: UnitInstance; interactive: boolean; canDeploy: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bench-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`w-[92px] h-[92px] rounded-lg border flex items-center justify-center transition-colors
        ${isOver ? "border-sky-400 bg-sky-400/15" : "border-slate-700/50 bg-slate-800/30"}`}
    >
      {unit && <UnitChip unit={unit} size={86} interactive={interactive} canDeploy={canDeploy} />}
    </div>
  );
}

/** `interactive` = bench is draggable / sellable (planning AND combat — TFT lets you
 *  shop and sell during a fight; only the board is locked). `canDeploy` = double-click
 *  quick-deploy to the board, which is planning-only. Both go false while spectating a
 *  rival so neither can mutate your own state. */
export function Bench({ interactive = true, canDeploy = true }: { interactive?: boolean; canDeploy?: boolean }) {
  const units = useGame((s) => s.units);
  // Resolve units to their explicit bench slots (gaps allowed); new/unplaced units
  // fall into the first free slot.
  const slots = resolveBenchSlots(units);
  // Outer drop target: dropping a board unit anywhere on the bench benches it.
  const { setNodeRef, isOver } = useDroppable({ id: "bench" });

  return (
    <div
      ref={setNodeRef}
      className={`flex gap-2.5 p-2.5 rounded-xl border transition-colors
        ${isOver ? "border-sky-400/60 bg-sky-400/5" : "border-slate-700/60 bg-slate-900/50"}`}
    >
      {Array.from({ length: BENCH_SIZE }).map((_, i) => (
        <BenchSlot key={i} index={i} unit={slots[i] ?? undefined} interactive={interactive} canDeploy={canDeploy} />
      ))}
    </div>
  );
}
