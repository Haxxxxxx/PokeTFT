"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FIELD, TILE, ALLY_ROW0, HEX_CLIP, hexToPixel, fieldPixelSize } from "@/game/engine/hex";
import { useGame } from "@/game/store/gameStore";
import { UnitChip } from "./UnitChip";
import { ItemGlyph } from "./ItemGlyph";
import { useT } from "@/lib/i18n";
import type { UnitInstance } from "@/game/types";

// Same tessellation + tile size as the combat field: the planning board IS the
// bottom half of the 8-row battlefield. Rendering the whole field (your 4 rows
// live + the enemy's 4 rows dimmed) means your board sits in the exact same
// pixels in both phases — nothing jumps when planning flips to combat.
const TILE_W = TILE.w;
const TILE_H = TILE.h;

function HexCell({ c, r, unit, interactive }: { c: number; r: number; unit?: UnitInstance; interactive: boolean }) {
  // `r` is a FIELD row (0..7). Your droppable cells are the bottom 4 rows; their
  // local board coordinate is `r - ALLY_ROW0` (0..3), matching the store + onDragEnd.
  const ally = r >= ALLY_ROW0;
  const localR = r - ALLY_ROW0;
  const droppable = interactive && ally;
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${c}-${localR}`, disabled: !droppable });
  const { x, y } = hexToPixel({ c, r }, TILE_W, TILE_H);
  // Your half tints teal, the enemy half a soft rose; hovering a drop target brightens.
  const tint = ally
    ? {
        bg: isOver ? "rgba(52,211,153,0.24)" : "rgba(52,211,153,0.07)",
        ring: isOver ? "rgba(52,211,153,0.8)" : "rgba(52,211,153,0.22)",
        glow: isOver ? "0 0 14px 1px rgba(52,211,153,0.4)" : "inset 0 0 9px rgba(52,211,153,0.08)",
      }
    : {
        bg: "rgba(251,113,133,0.05)",
        ring: "rgba(251,113,133,0.14)",
        glow: "inset 0 0 8px rgba(251,113,133,0.06)",
      };
  return (
    <>
      <div
        ref={droppable ? setNodeRef : undefined}
        className="absolute transition-all"
        style={{
          left: x - TILE_W / 2,
          top: y - TILE_H / 2,
          width: TILE_W - 3,
          height: TILE_H - 3,
          clipPath: HEX_CLIP,
          background: tint.bg,
          boxShadow: `inset 0 0 0 1.5px ${tint.ring}, ${tint.glow}`,
        }}
      />
      {unit && (
        <div className="absolute flex items-center justify-center pointer-events-none" style={{ left: x - TILE_W / 2, top: y - TILE_H / 2, width: TILE_W, height: TILE_H }}>
          {/* The pulsing feet-glow is an infinite GPU animation per unit — only run it on YOUR
              own interactive planning board, not on spectated/dimmed boards (toaster perf). */}
          {interactive && <span className={`unit-glow ${ally ? "" : "enemy"}`} />}
          {/* Upper rows paint ABOVE lower rows so a mon below never covers the
              item pips in the bottom-right corner of the mon above it. */}
          <div className="pointer-events-auto relative" style={{ zIndex: FIELD.rows - r }}>
            <UnitChip unit={unit} size={TILE_W - 6} interactive={interactive} shape="hex" />
          </div>
        </div>
      )}
    </>
  );
}

function BoardBase({ units, interactive = true }: { units?: UnitInstance[]; interactive?: boolean }) {
  const t = useT();
  const storeUnits = useGame((s) => s.units);
  const drops = useGame((s) => s.drops);
  const collectDrop = useGame((s) => s.collectDrop);
  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r - ALLY_ROW0);
  // Drops are YOUR loot — only on your own live board (not when spectating a rival,
  // i.e. when an external `units` array is passed in).
  const showDrops = interactive && !units;
  const { w, h } = fieldPixelSize(TILE_W, TILE_H);
  // Divider between the enemy half (top) and your half (bottom).
  const splitY = hexToPixel({ c: 0, r: ALLY_ROW0 }, TILE_W, TILE_H).y - TILE_H / 2;

  return (
    <div
      className="relative rounded-xl border border-slate-700/50"
      style={{
        width: w + 28,
        height: h + 28,
        padding: 14,
        background: "radial-gradient(115% 78% at 50% 88%, #1b2748 0%, #0d1729 52%, #070c18 100%)",
        boxShadow: "inset 0 1px 0 rgba(148,163,184,0.08), inset 0 -28px 60px -30px rgba(56,189,248,0.18), 0 18px 50px -24px rgba(0,0,0,0.8)",
      }}
    >
      <div className="absolute" style={{ left: 14, top: 14, width: w, height: h }}>
        {/* Enemy half cue — your opponent's army drops in here for combat. */}
        <span className="absolute left-1/2 -translate-x-1/2 top-1 text-[9px] font-bold uppercase tracking-[0.18em] text-rose-300/30 pointer-events-none">
          {t.net_enemy}
        </span>
        <div className="absolute pointer-events-none" style={{ left: 0, top: splitY, width: w, height: 1, background: "linear-gradient(90deg, transparent, rgba(148,163,184,0.28), transparent)" }} />
        {Array.from({ length: FIELD.rows }).flatMap((_, r) =>
          Array.from({ length: FIELD.cols }).map((_, c) => (
            <HexCell key={`${c}-${r}`} c={c} r={r} unit={r >= ALLY_ROW0 ? unitAt(c, r) : undefined} interactive={interactive} />
          )),
        )}
        {/* Loot drops — sit where the creep fell (field coords); click to collect. */}
        {showDrops && drops.map((d) => {
          const { x, y } = hexToPixel({ c: d.cell[0], r: d.cell[1] }, TILE_W, TILE_H);
          return (
            <button
              key={d.id}
              onClick={() => collectDrop(d.id)}
              title="Collect item"
              className="absolute z-20 flex items-center justify-center rounded-full bg-amber-400/90 hover:bg-amber-300 text-black shadow-[0_0_14px_4px_rgba(251,191,36,0.5)] animate-bounce"
              style={{ left: x - 16, top: y - 16, width: 32, height: 32 }}
            >
              <ItemGlyph id={d.itemId} size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Memoized — only re-renders when its props (units/interactive) actually change, not on
 *  every parent render (e.g. each unit placement / room tick). */
export const Board = memo(BoardBase);
