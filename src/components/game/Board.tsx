"use client";

import { useDroppable } from "@dnd-kit/core";
import { BOARD } from "@/game/config";
import { useGame } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

function DroppableCell({ col, row, unit }: { col: number; row: number; unit?: UnitInstance }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${col}-${row}` });
  const offset = row % 2 === 1 ? 32 : 0;
  return (
    <div
      ref={setNodeRef}
      style={{ marginLeft: offset }}
      className={`w-[64px] h-[64px] rounded-md border flex items-center justify-center transition-colors
        ${isOver ? "border-emerald-400 bg-emerald-400/10" : "border-slate-700/60 bg-slate-800/30"}`}
    >
      {unit && <UnitChip unit={unit} />}
    </div>
  );
}

function StaticCell({ row, unit }: { row: number; unit?: UnitInstance }) {
  const offset = row % 2 === 1 ? 32 : 0;
  return (
    <div
      style={{ marginLeft: offset }}
      className="w-[64px] h-[64px] rounded-md border border-slate-700/40 bg-slate-800/20 flex items-center justify-center"
    >
      {unit && <UnitChip unit={unit} interactive={false} />}
    </div>
  );
}

export function Board({ units, interactive = true }: { units?: UnitInstance[]; interactive?: boolean }) {
  const storeUnits = useGame((s) => s.units);
  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r);

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-gradient-to-b from-slate-900/60 to-slate-950/60 border border-slate-700/50">
      {Array.from({ length: BOARD.rows }).map((_, row) => (
        <div key={row} className="flex gap-1.5">
          {Array.from({ length: BOARD.cols }).map((_, col) =>
            interactive ? (
              <DroppableCell key={col} col={col} row={row} unit={unitAt(col, row)} />
            ) : (
              <StaticCell key={col} row={row} unit={unitAt(col, row)} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
