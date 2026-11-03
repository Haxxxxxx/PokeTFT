"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FIELD, ALLY_ROW0, HEX_CLIP, hexToPixel, fieldPixelSize, rowsPixelHeight } from "@/game/engine/hex";
import { boardSizeForLevel } from "@/game/config";
import { useGame, BENCH_SIZE, resolveBenchSlots } from "@/game/store/gameStore";
import { useGameLayout } from "./LayoutProvider";
import { UnitChip } from "./UnitChip";
import { ItemGlyph } from "./ItemGlyph";
import { useT } from "@/lib/i18n";
import type { UnitInstance } from "@/game/types";

/**
 * The arena.
 *
 * Two changes from the old flat board:
 *
 * 1. RESPONSIVE — the tile size comes from the layout engine instead of a fixed
 *    106px module constant, so the board is sized from the real viewport. The
 *    hex math already took tile dimensions as parameters, so the geometry is
 *    unchanged; only where the numbers come from moved.
 *
 * 2. 3D — the field is a plane raked away from the camera (TFT's look). The
 *    tilt lives on a wrapper; every unit is counter-rotated by the same angle so
 *    it stands upright on the tilted ground rather than lying flat on it.
 *
 * Drag-and-drop under the tilt: `getBoundingClientRect()` on a 3D-transformed
 * element returns the PROJECTED axis-aligned box, which makes rect-intersection
 * collision unreliable. The DndContext therefore uses `closestCenter`, whose
 * projected centers stay correctly ordered under perspective.
 */

/** Rows to render. Planning may window the field on small screens (ally half
 *  plus one enemy row); combat always shows all 8. */
function rowRange(rows: number): { from: number; to: number } {
  if (rows >= FIELD.rows) return { from: 0, to: FIELD.rows };
  // Window from the BOTTOM — keep the ally half, trim enemy rows off the top.
  return { from: FIELD.rows - rows, to: FIELD.rows };
}

function HexCell({
  c, r, unit, interactive, tileW, tileH, yOffset, tilt,
}: {
  c: number; r: number; unit?: UnitInstance; interactive: boolean;
  tileW: number; tileH: number; yOffset: number; tilt: number;
}) {
  // `r` is a FIELD row (0..7). Droppable cells are the bottom 4 rows; their
  // local board coordinate is `r - ALLY_ROW0` (0..3), matching the store.
  const ally = r >= ALLY_ROW0;
  const localR = r - ALLY_ROW0;
  const droppable = interactive && ally;
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${c}-${localR}`, disabled: !droppable });
  const { x, y } = hexToPixel({ c, r }, tileW, tileH);
  const top = y - tileH / 2 - yOffset;

  const tint = ally
    ? {
        bg: isOver ? "rgba(52,211,153,0.28)" : "rgba(52,211,153,0.07)",
        ring: isOver ? "rgba(52,211,153,0.85)" : "rgba(52,211,153,0.22)",
        glow: isOver ? "0 0 18px 2px rgba(52,211,153,0.45)" : "inset 0 0 9px rgba(52,211,153,0.08)",
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
        className="absolute hex-cell"
        style={{
          left: x - tileW / 2,
          top,
          width: tileW - 3,
          height: tileH - 3,
          clipPath: HEX_CLIP,
          background: tint.bg,
          boxShadow: `inset 0 0 0 1.5px ${tint.ring}, ${tint.glow}`,
        }}
      />
      {unit && (
        <div
          className="absolute flex items-end justify-center pointer-events-none"
          style={{ left: x - tileW / 2, top, width: tileW, height: tileH }}
        >
          {/* Contact shadow: an ellipse lying FLAT on the tilted ground. This is
              what actually sells "standing on" rather than "floating above" —
              so it must NOT be counter-rotated with the unit. */}
          <span
            className="absolute pointer-events-none unit-contact"
            style={{
              width: tileW * 0.56,
              height: tileW * 0.2,
              bottom: tileH * 0.22,
            }}
          />
          {/* Feet glow also lies flat on the ground. Infinite GPU animation, so
              only on your own interactive board. */}
          {interactive && <span className={`unit-glow ${ally ? "" : "enemy"}`} />}
          {/* Counter-rotate so the token stands upright on the raked plane.
              Anchored at the bottom edge so it looks planted in its hex rather
              than hovering above it. Upper rows paint above lower rows. */}
          <div
            className="pointer-events-auto relative unit-stand"
            style={{
              zIndex: FIELD.rows - r,
              transform: `rotateX(${-tilt}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            <UnitChip unit={unit} size={tileW - 6} interactive={interactive} shape="hex" />
          </div>
        </div>
      )}
    </>
  );
}

/** One bench slab at the arena's near edge. Same plane, same rake as the hexes
 *  — which is the point: in TFT the bench is part of the platform, not a
 *  separate widget floating beneath it. */
function BenchSlab({
  index, unit, interactive, canDeploy, size, tilt,
}: {
  index: number; unit: UnitInstance | null; interactive: boolean; canDeploy: boolean;
  size: number; tilt: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bench-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`relative shrink-0 flex items-end justify-center bench-slab${isOver ? " is-over" : ""}`}
      style={{ width: size, height: size }}
    >
      {unit && (
        <>
          <span
            className="absolute pointer-events-none unit-contact"
            style={{ width: size * 0.56, height: size * 0.18, bottom: size * 0.1 }}
          />
          <div
            className="relative unit-stand"
            style={{ transform: `rotateX(${-tilt}deg)`, transformOrigin: "bottom center" }}
          >
            <UnitChip unit={unit} size={size - 8} interactive={interactive} canDeploy={canDeploy} />
          </div>
        </>
      )}
    </div>
  );
}

function BoardBase({
  units,
  interactive = true,
  rows,
  withBench = false,
  benchInteractive = true,
  benchCanDeploy = true,
}: {
  units?: UnitInstance[];
  interactive?: boolean;
  /** Field rows to show. Defaults to the full 8-row battlefield. */
  rows?: number;
  /** Render the bench as slabs on the platform's near edge. */
  withBench?: boolean;
  benchInteractive?: boolean;
  benchCanDeploy?: boolean;
}) {
  const t = useT();
  const layout = useGameLayout();
  const storeUnits = useGame((s) => s.units);
  const drops = useGame((s) => s.drops);
  const collectDrop = useGame((s) => s.collectDrop);
  const level = useGame((s) => s.level);

  const tileW = layout.tile.w;
  const tileH = layout.tile.h;
  const tilt = layout.tilt;

  const source = units ?? storeUnits;
  const board = source.filter((u) => u.pos !== null);
  const unitAt = (c: number, r: number) => board.find((u) => u.pos?.[0] === c && u.pos?.[1] === r - ALLY_ROW0);
  const showDrops = interactive && !units;

  const shownRows = Math.min(FIELD.rows, Math.max(1, rows ?? FIELD.rows));
  const { from, to } = rowRange(shownRows);

  const full = fieldPixelSize(tileW, tileH);
  // Vertical offset so the windowed slice starts at the top of the plane.
  const yOffset = hexToPixel({ c: 0, r: from }, tileW, tileH).y - tileH / 2;
  const innerH = rowsPixelHeight(shownRows, tileH);
  const innerW = full.w;

  const pad = 14;
  const splitY = hexToPixel({ c: 0, r: ALLY_ROW0 }, tileW, tileH).y - tileH / 2 - yOffset;

  // Platform thickness, proportional to the tile so the slab reads the same at
  // every board size.
  const wallT = Math.max(10, Math.round(tileW * 0.26));

  // Bench slabs live ON the platform at its near edge (TFT puts them there), so
  // their height is part of the arena rather than a separate zone below it.
  const benchSlots = withBench ? resolveBenchSlots(source) : [];
  const benchSize = Math.round(Math.min(tileW * 0.82, (innerW - (BENCH_SIZE - 1) * 6) / BENCH_SIZE));
  const benchStripH = withBench ? benchSize + 12 : 0;

  // Board capacity, ghosted on the floor. Only on your OWN live board — on a
  // scouted rival's board it would be their number shown over your context.
  const capacity = boardSizeForLevel(level);
  const boardCount = board.length;
  const showCapacity = interactive && !units;

  return (
    <div
      className="relative arena-frame"
      style={{
        width: innerW + pad * 2,
        height: innerH + benchStripH + pad * 2,
        padding: pad,
        perspective: `${layout.perspective}px`,
        // Centered: an off-center origin skews the rake so one half of the
        // board foreshortens harder than the other.
        perspectiveOrigin: "50% 50%",
      }}
    >
      {/* Backdrop behind the arena — a lit horizon so the platform reads as
          sitting IN something rather than floating on flat black. */}
      <div className="absolute inset-0 arena-backdrop pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 arena-plane"
        style={{
          transform: `rotateX(${tilt}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* The platform: a carved slab with real thickness. The three extruded
            walls are what make it a raised arena instead of a flat tilted
            rectangle — each is a face rotated out of the plane at an edge. */}
        <div className="absolute inset-0 rounded-2xl arena-slab" style={{ transformStyle: "preserve-3d" }}>
          <span
            className="arena-wall arena-wall-front"
            style={{ height: wallT, transformOrigin: "50% 0%", transform: "rotateX(-90deg)" }}
            aria-hidden
          />
          <span
            className="arena-wall arena-wall-side"
            style={{ width: wallT, left: 0, transformOrigin: "100% 50%", transform: "rotateY(90deg)" }}
            aria-hidden
          />
          <span
            className="arena-wall arena-wall-side"
            style={{ width: wallT, right: 0, transformOrigin: "0% 50%", transform: "rotateY(-90deg)" }}
            aria-hidden
          />
        </div>

        {/* Board capacity, ghosted large across the floor — TFT's "6/6". Lies on
            the plane so it takes the rake with everything else. */}
        {showCapacity && (
          <div
            className="absolute inset-0 grid place-items-center pointer-events-none select-none arena-capacity"
            style={{ fontSize: Math.round(tileW * 1.15) }}
            aria-hidden
          >
            <span className={boardCount >= capacity ? "is-full" : undefined}>
              {boardCount}/{capacity}
            </span>
          </div>
        )}
        <div className="absolute" style={{ left: pad, top: pad, width: innerW, height: innerH }}>
          {from === 0 && (
            <span className="absolute left-1/2 -translate-x-1/2 top-1 text-[9px] font-bold uppercase tracking-[0.18em] text-rose-300/30 pointer-events-none">
              {t.net_enemy}
            </span>
          )}
          {/* Midline between the enemy half and yours. */}
          {splitY > 0 && splitY < innerH && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: splitY,
                width: innerW,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(148,163,184,0.32), transparent)",
              }}
            />
          )}
          {Array.from({ length: to - from }).flatMap((_, i) => {
            const r = from + i;
            return Array.from({ length: FIELD.cols }).map((_, c) => (
              <HexCell
                key={`${c}-${r}`}
                c={c}
                r={r}
                unit={r >= ALLY_ROW0 ? unitAt(c, r) : undefined}
                interactive={interactive}
                tileW={tileW}
                tileH={tileH}
                yOffset={yOffset}
                tilt={tilt}
              />
            ));
          })}
          {/* Loot drops — stand upright like units so they stay readable. */}
          {showDrops && drops.map((d) => {
            const { x, y } = hexToPixel({ c: d.cell[0], r: d.cell[1] }, tileW, tileH);
            const dTop = y - yOffset;
            if (dTop < -tileH || dTop > innerH + tileH) return null;
            const size = Math.max(24, Math.round(tileW * 0.3));
            return (
              <button
                key={d.id}
                onClick={() => collectDrop(d.id)}
                title={t.it_collect}
                className="absolute z-20 flex items-center justify-center rounded-full bg-amber-400/90 hover:bg-amber-300 text-black shadow-[0_0_14px_4px_rgba(251,191,36,0.5)] animate-bounce"
                style={{
                  left: x - size / 2,
                  top: dTop - size / 2,
                  width: size,
                  height: size,
                  transform: `rotateX(${-tilt}deg)`,
                }}
              >
                <ItemGlyph id={d.itemId} size={Math.round(size * 0.56)} />
              </button>
            );
          })}
        </div>

        {/* ── Bench: slabs set into the platform's near edge ──
            Inside the same tilted plane as the hexes, so it rakes with the
            board and reads as part of the arena rather than a widget parked
            underneath it. Drop ids are unchanged (`bench-N`), so all existing
            drag logic keeps working. */}
        {withBench && (
          <div
            className="absolute flex items-end justify-center gap-1.5"
            style={{ left: pad, top: pad + innerH, width: innerW, height: benchStripH }}
          >
            {Array.from({ length: BENCH_SIZE }).map((_, i) => (
              <BenchSlab
                key={i}
                index={i}
                unit={benchSlots[i] ?? null}
                interactive={benchInteractive}
                canDeploy={benchCanDeploy}
                size={benchSize}
                tilt={tilt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Memoized — only re-renders when its props actually change, not on every
 *  parent render (e.g. each unit placement / room tick). */
export const Board = memo(BoardBase);
