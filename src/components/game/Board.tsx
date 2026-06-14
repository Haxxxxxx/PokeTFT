"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { BOARD } from "@/game/config";
import { useGame } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

// Pointy-top hex tile (same silhouette as the combat field) so the board reads
// as a hexagonal trapeze, not a grid of squares.
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

function HexTile({ filled, isOver, children }: { filled: boolean; isOver?: boolean; children?: ReactNode }) {
  return (
    <div
      className="w-[64px] h-[68px] flex items-center justify-center transition-colors"
      style={{
        clipPath: HEX_CLIP,
        background: isOver ? "rgba(52,211,153,0.18)" : "rgba(30,41,59,0.35)",
        boxShadow: `inset 0 0 0 2px ${isOver ? "rgba(52,211,153,0.7)" : filled ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.28)"}`,
      }}
    >
      {children}
    </div>
  );
}

function DroppableCell({ col, row, unit }: { col: number; row: number; unit?: UnitInstance }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${col}-${row}` });
  const offset = row % 2 === 1 ? 34 : 0;
  return (
    <div ref={setNodeRef} style={{ marginLeft: offset, marginTop: -10 }}>
      <HexTile filled={!!unit} isOver={isOver}>
        {unit && <UnitChip unit={unit} />}
      </HexTile>
    </div>
  );
}

function StaticCell({ row, unit }: { row: number; unit?: UnitInstance }) {
  const offset = row % 2 === 1 ? 34 : 0;
  return (
    <div style={{ marginLeft: offset, marginTop: -10 }}>
      <HexTile filled={!!unit}>
        {unit && <UnitChip unit={unit} interactive={false} />}
      </HexTile>
    </div>
  );
}

export function Board({ units, interactive = true }: { units?: UnitInstance[]; interactive?: boolean }) {
  const storeUnits = useGame((s) => s.units);
  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r);

  return (
    <div className="flex flex-col items-start px-4 pt-4 pb-1 rounded-xl bg-gradient-to-b from-slate-900/60 to-slate-950/60 border border-slate-700/50">
      {Array.from({ length: BOARD.rows }).map((_, row) => (
        <div key={row} className="flex gap-1">
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
