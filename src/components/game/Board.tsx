"use client";

import { useDroppable } from "@dnd-kit/core";
import { BOARD } from "@/game/config";
import { hexToPixel } from "@/game/engine/hex";
import { useGame } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

// Same tessellation + silhouette as the combat field (the look the design is
// modeled on): pointy-top hexes, odd rows shifted, rows overlapping by 1/4.
const TILE_W = 66;
const TILE_H = 74;
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

// Board pixel extent for BOARD.cols x BOARD.rows.
const FIELD_W = BOARD.cols * TILE_W + TILE_W / 2;
const FIELD_H = (BOARD.rows - 1) * TILE_H * 0.75 + TILE_H;

function HexCell({ c, r, unit, interactive }: { c: number; r: number; unit?: UnitInstance; interactive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${c}-${r}`, disabled: !interactive });
  const { x, y } = hexToPixel({ c, r }, TILE_W, TILE_H);
  return (
    <>
      <div
        ref={interactive ? setNodeRef : undefined}
        className="absolute transition-colors"
        style={{
          left: x - TILE_W / 2,
          top: y - TILE_H / 2,
          width: TILE_W - 3,
          height: TILE_H - 3,
          clipPath: HEX_CLIP,
          background: isOver ? "rgba(52,211,153,0.22)" : "rgba(52,211,153,0.05)",
          boxShadow: `inset 0 0 0 1px ${isOver ? "rgba(52,211,153,0.65)" : "rgba(52,211,153,0.16)"}`,
        }}
      />
      {unit && (
        <div className="absolute flex items-center justify-center" style={{ left: x - TILE_W / 2, top: y - TILE_H / 2, width: TILE_W, height: TILE_H }}>
          <UnitChip unit={unit} size={TILE_W - 16} interactive={interactive} />
        </div>
      )}
    </>
  );
}

export function Board({ units, interactive = true }: { units?: UnitInstance[]; interactive?: boolean }) {
  const storeUnits = useGame((s) => s.units);
  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r);

  return (
    <div
      className="relative rounded-2xl border border-slate-700/50"
      style={{
        width: FIELD_W + 28,
        height: FIELD_H + 28,
        padding: 14,
        background: "radial-gradient(120% 90% at 50% 35%, #16213c 0%, #0a1020 78%)",
      }}
    >
      <div className="absolute" style={{ left: 14, top: 14, width: FIELD_W, height: FIELD_H }}>
        {Array.from({ length: BOARD.rows }).flatMap((_, r) =>
          Array.from({ length: BOARD.cols }).map((_, c) => (
            <HexCell key={`${c}-${r}`} c={c} r={r} unit={unitAt(c, r)} interactive={interactive} />
          )),
        )}
      </div>
    </div>
  );
}
