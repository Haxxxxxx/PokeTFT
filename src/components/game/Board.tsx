"use client";

import { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FIELD, ALLY_ROW0, HEX_CLIP, hexToPixel, fieldPixelSize, rowsPixelHeight } from "@/game/engine/hex";
import { boardSizeForLevel } from "@/game/config";
import { useGame, BENCH_SIZE, resolveBenchSlots } from "@/game/store/gameStore";
import { useGameLayout } from "./LayoutProvider";
import { ArenaEffects } from "./ArenaEffects";
import { IncomeBalls } from "./IncomeBalls";
import { resolveArena } from "@/game/ui/arena-variants";
import { useAppStore } from "@/game/store/appStore";
import { UnitChip } from "./UnitChip";
import { ItemGlyph } from "./ItemGlyph";
import { useT } from "@/lib/i18n";
import type { UnitInstance } from "@/game/types";





function projectArenaScreenPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  tilt: number,
  perspective: number,
): [number, number, number] {
  const dx = x - width / 2;
  const dy = y - height / 2;
  const angle = (tilt * Math.PI) / 180;
  const depth = dy * Math.sin(angle);
  const scale = perspective / (perspective - depth);
  const screenX = width / 2 + dx * scale;
  const screenY = height / 2 + dy * Math.cos(angle) * scale;
  return [screenX, screenY, scale];
}

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
  c, r, interactive, tileW, tileH, yOffset,
}: {
  c: number; r: number; interactive: boolean;
  tileW: number; tileH: number; yOffset: number;
}) {
  // `r` is a FIELD row (0..7). Droppable cells are the bottom 4 rows; their
  // local board coordinate is `r - ALLY_ROW0` (0..3), matching the store.
  const ally = r >= ALLY_ROW0;
  const localR = r - ALLY_ROW0;
  const droppable = interactive && ally;
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${c}-${localR}`, disabled: !droppable });
  const { x, y } = hexToPixel({ c, r }, tileW, tileH);
  const top = y - tileH / 2 - yOffset;

  // Your half gets live, bright hexes; the enemy context rows get a bare
  // outline at a fraction of the strength.
  //
  // TFT hides its enemy hexes entirely during planning, and we matched that at
  // first — but TFT's far half is a painted scene worth looking at, and ours is
  // flat stone. Hiding them there made a third of the arena read as dead space
  // rather than as the other half of a playfield. A ghost outline fills it,
  // keeps the spatial read of where the enemy will stand, and still leaves no
  // doubt about which half is yours.
  const tint = {
    bg: isOver ? "rgba(52,211,153,0.3)" : "rgba(52,211,153,0.07)",
    ring: isOver ? "rgba(52,211,153,0.9)" : "rgba(52,211,153,0.26)",
    glow: isOver ? "0 0 22px 3px rgba(52,211,153,0.5)" : "inset 0 0 9px rgba(52,211,153,0.08)",
  };

  // Collision uses the registered rects, not hit testing; let pointer events reach
  // unit chips rendered as overlapping siblings on the transformed plane.
  return (
    <>
      <div
        ref={droppable ? setNodeRef : undefined}
        className={`absolute hex-cell${isOver ? " is-over" : ""}${ally ? "" : " is-enemy"}`}
        style={{
          left: x - tileW / 2,
          top,
          width: tileW - 3,
          height: tileH - 3,
          clipPath: HEX_CLIP,
          pointerEvents: "none",
          background: ally ? tint.bg : "rgba(148,163,184,0.05)",
          boxShadow: ally
            ? `inset 0 0 0 1.5px ${tint.ring}, ${tint.glow}`
            : "inset 0 0 0 1px rgba(170,196,236,0.2), inset 0 0 14px rgba(120,150,200,0.07)",
        }}
      />
    </>
  );
}

/** One bench slab at the arena's near edge. Same plane, same rake as the hexes
 *  — which is the point: in TFT the bench is part of the platform, not a
 *  separate widget floating beneath it. */
function BenchSlab({
  index, size, occupied,
}: {
  index: number; size: number; occupied: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bench-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`relative shrink-0 flex items-end justify-center bench-slab${isOver ? " is-over" : ""}`}
      style={{ width: size, height: size }}
    >
      {occupied && (
        <span
          className="absolute pointer-events-none unit-contact"
          style={{ width: size * 0.56, height: size * 0.18, bottom: size * 0.1 }}
        />
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
  // Sizes come from the layout engine, which solved the tile WITH the bench
  // strip included — computing them here independently would drift from that
  // budget and overflow the arena.
  const benchSlots = withBench ? resolveBenchSlots(source) : [];
  const benchSize = layout.benchSlot;
  const benchGap = layout.benchGap;
  const benchStripH = withBench ? layout.benchH : 0;
  const frameW = innerW + pad * 2;
  const frameH = innerH + benchStripH + pad * 2;

  // Board capacity, ghosted on the floor. Only on your OWN live board — on a
  // scouted rival's board it would be their number shown over your context.
  // The arena dresses itself from whatever board is standing on it — ours, or
  // a rival's while scouting, since that board is what is on screen.
  const arenaUnits = units ?? storeUnits;
  const arenaPin = useAppStore((st) => st.settings.arenaPin);
  const arenaEffects = useAppStore((st) => st.settings.arenaEffects);
  const arena = resolveArena(arenaUnits, arenaPin);

  const capacity = boardSizeForLevel(level);
  const boardCount = board.length;
  const showCapacity = interactive && !units;

  return (
    <div
      className="relative arena-frame arena-themed"
      data-arena={arena.key}
      style={{
        ["--arena-accent" as string]: arena.accent,
        width: innerW + pad * 2,
        height: frameH,
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
          {/* Carved lip between the arena floor and its border. */}
          <span className="arena-rail" aria-hidden />
          <span className="arena-dust" aria-hidden />
          {arenaEffects && <ArenaEffects effect={arena.effect} accent={arena.accent} />}
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
                interactive={interactive}
                tileW={tileW}
                tileH={tileH}
                yOffset={yOffset}
              />
            ));
          })}
          {board.map((unit) => {
            if (!unit.pos) return null;
            const [c, localR] = unit.pos;
            const r = localR + ALLY_ROW0;
            const { x, y } = hexToPixel({ c, r }, tileW, tileH);
            return (
              <div
                key={`ground-${unit.iid}`}
                className="absolute flex items-end justify-center pointer-events-none"
                style={{
                  left: x - tileW / 2,
                  top: y - tileH / 2 - yOffset,
                  width: tileW,
                  height: tileH,
                  zIndex: r,
                }}
              >
                <span
                  className="absolute pointer-events-none unit-contact"
                  style={{ width: tileW * 0.56, height: tileW * 0.2, bottom: tileH * 0.22 }}
                />
                {interactive && <span className="unit-glow" />}
              </div>
            );
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
                className="absolute z-20 flex items-center justify-center rounded-full bg-gold-400/90 hover:bg-gold-300 text-black shadow-[0_0_14px_4px_rgba(251,191,36,0.5)] animate-bounce"
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
            // One source for the gap: the className also carried `gap-1.5`,
            // which the inline value silently overrode — so the stylesheet said
            // 6px while the layout engine and the unit positions assumed 4.
            className="absolute flex items-end justify-center"
            style={{ left: pad, top: pad + innerH, width: innerW, height: benchStripH, gap: benchGap }}
          >
            {Array.from({ length: BENCH_SIZE }).map((_, i) => (
              <BenchSlab
                key={i}
                index={i}
                size={benchSize}
                occupied={!!benchSlots[i]}
              />
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 z-20">
        {board.map((unit) => {
          if (!unit.pos) return null;
          const [c, localR] = unit.pos;
          const { x, y } = hexToPixel({ c, r: localR + ALLY_ROW0 }, tileW, tileH);
          const [screenX, screenBottom, scale] = projectArenaScreenPoint(
            pad + x,
            pad + y + tileH / 2 - yOffset,
            frameW,
            frameH,
            tilt,
            layout.perspective,
          );
          const size = tileW - 6;
          return (
            <div
              key={unit.iid}
              className="pointer-events-auto absolute"
              style={{
                left: screenX - size / 2,
                top: screenBottom - size,
                width: size,
                height: size,
                transform: `scale(${scale})`,
                transformOrigin: "bottom center",
                zIndex: localR + ALLY_ROW0,
              }}
            >
              <UnitChip
                unit={unit}
                size={size}
                interactive={interactive}
                shape="hex"
                dragHitArea
              />
            </div>
          );
        })}
        {withBench && benchSlots.map((unit, index) => {
          if (!unit) return null;
          const benchWidth = BENCH_SIZE * benchSize + (BENCH_SIZE - 1) * benchGap;
          const benchStartX = pad + (innerW - benchWidth) / 2;
          const size = benchSize - 8;
          const [screenX, screenBottom, scale] = projectArenaScreenPoint(
            benchStartX + index * (benchSize + benchGap) + benchSize / 2,
            pad + innerH + benchStripH,
            frameW,
            frameH,
            tilt,
            layout.perspective,
          );
          return (
            <div
              key={unit.iid}
              className="pointer-events-auto absolute"
              style={{
                left: screenX - size / 2,
                top: screenBottom - size,
                width: size,
                height: size,
                zIndex: 30,
                transform: `scale(${scale})`,
                transformOrigin: "bottom center",
              }}
            >
              <UnitChip
                unit={unit}
                size={size}
                interactive={benchInteractive}
                canDeploy={benchCanDeploy}
                shape="hex"
                dragHitArea
              />
            </div>
          );
        })}
      </div>
      {/* No 3D layer. The fighting scene cannot be done in 3D with this asset
          set — 89% of the models ship with no animation clips at all and only 2%
          have an attack clip (tools/model-clip-stats.mjs), so a fight rendered
          with them is a set of frozen statues sliding around. Rather than keep a
          toggle that made planning 3D and combat 2D, the match is uniformly 2D.
          The pipeline itself is intact (UnitModel, /lab/model-sheet,
          /lab/model-poses) for when the animation gap is closed. */}

      {/* Interest, stacked down the left edge. Only on your OWN live board:
          on a scouted rival's board it would be their economy shown over your
          context, which is the same mistake the capacity counter avoids. */}
      {withBench && !units && <IncomeBalls size={benchSize} inset={Math.max(4, Math.round(benchSize * 0.1))} />}
    </div>
  );
}

/** Memoized — only re-renders when its props actually change, not on every
 *  parent render (e.g. each unit placement / room tick). */
export const Board = memo(BoardBase);
