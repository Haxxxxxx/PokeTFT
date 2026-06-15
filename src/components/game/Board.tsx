"use client";

import { useDroppable } from "@dnd-kit/core";
import { FIELD, TILE, ALLY_ROW0, hexToPixel, fieldPixelSize } from "@/game/engine/hex";
import { useGame } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import type { UnitInstance } from "@/game/types";

// Same tessellation + tile size as the combat field: the planning board IS the
// bottom half of the 8-row battlefield. Rendering the whole field (your 4 rows
// live + the enemy's 4 rows dimmed) means your board sits in the exact same
// pixels in both phases — nothing jumps when planning flips to combat.
const TILE_W = TILE.w;
const TILE_H = TILE.h;
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

function HexCell({ c, r, unit, interactive }: { c: number; r: number; unit?: UnitInstance; interactive: boolean }) {
  // `r` is a FIELD row (0..7). Your droppable cells are the bottom 4 rows; their
  // local board coordinate is `r - ALLY_ROW0` (0..3), matching the store + onDragEnd.
  const ally = r >= ALLY_ROW0;
  const localR = r - ALLY_ROW0;
  const droppable = interactive && ally;
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${c}-${localR}`, disabled: !droppable });
  const { x, y } = hexToPixel({ c, r }, TILE_W, TILE_H);
  const tint = ally
    ? { bg: isOver ? "rgba(52,211,153,0.24)" : "rgba(52,211,153,0.06)", ring: isOver ? "rgba(52,211,153,0.7)" : "rgba(52,211,153,0.16)" }
    : { bg: "rgba(251,113,133,0.04)", ring: "rgba(251,113,133,0.1)" };
  return (
    <>
      <div
        ref={droppable ? setNodeRef : undefined}
        className="absolute transition-colors"
        style={{
          left: x - TILE_W / 2,
          top: y - TILE_H / 2,
          width: TILE_W - 3,
          height: TILE_H - 3,
          clipPath: HEX_CLIP,
          background: tint.bg,
          boxShadow: `inset 0 0 0 1px ${tint.ring}`,
        }}
      />
      {unit && (
        <div className="absolute flex items-center justify-center pointer-events-none" style={{ left: x - TILE_W / 2, top: y - TILE_H / 2, width: TILE_W, height: TILE_H }}>
          <div className="pointer-events-auto">
            <UnitChip unit={unit} size={TILE_W - 6} interactive={interactive} shape="hex" />
          </div>
        </div>
      )}
    </>
  );
}

export function Board({ units, interactive = true }: { units?: UnitInstance[]; interactive?: boolean }) {
  const storeUnits = useGame((s) => s.units);
  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r - ALLY_ROW0);
  const { w, h } = fieldPixelSize(TILE_W, TILE_H);
  // Divider between the enemy half (top) and your half (bottom).
  const splitY = hexToPixel({ c: 0, r: ALLY_ROW0 }, TILE_W, TILE_H).y - TILE_H / 2;

  return (
    <div
      className="relative rounded-2xl border border-slate-700/50"
      style={{
        width: w + 28,
        height: h + 28,
        padding: 14,
        background: "radial-gradient(120% 80% at 50% 80%, #16213c 0%, #0a1020 82%)",
      }}
    >
      <div className="absolute" style={{ left: 14, top: 14, width: w, height: h }}>
        {/* Enemy half cue — your opponent's army drops in here for combat. */}
        <span className="absolute left-1/2 -translate-x-1/2 top-1 text-[9px] font-bold uppercase tracking-[0.25em] text-rose-300/30 pointer-events-none">
          ⚔ Enemy
        </span>
        <div className="absolute pointer-events-none" style={{ left: 0, top: splitY, width: w, height: 1, background: "linear-gradient(90deg, transparent, rgba(148,163,184,0.28), transparent)" }} />
        {Array.from({ length: FIELD.rows }).flatMap((_, r) =>
          Array.from({ length: FIELD.cols }).map((_, c) => (
            <HexCell key={`${c}-${r}`} c={c} r={r} unit={r >= ALLY_ROW0 ? unitAt(c, r) : undefined} interactive={interactive} />
          )),
        )}
      </div>
    </div>
  );
}
