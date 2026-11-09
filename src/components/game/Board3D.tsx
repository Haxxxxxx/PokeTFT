"use client";

/**
 * The HD-2D planning board: the real match board, rendered in WebGL.
 *
 * A drop-in alternative to <Board /> — same footprint (sized from the layout
 * engine, so the shell never shifts when you switch), same store actions, same
 * drop semantics. Units are the existing sprites, billboarded and grounded in a
 * lit 3D arena rather than drawn on a CSS-transformed plane.
 *
 * WHY THIS ISN'T WIRED THROUGH dnd-kit
 *
 * dnd-kit resolves drops from DOM rects. Inside a canvas there are no per-hex
 * elements to measure — the board is a handful of meshes. So drag is handled
 * natively here (raycast the ground, map the hit to a cell arithmetically) and
 * committed through the SAME store actions the DOM board's onDragEnd calls:
 * moveToBoard / moveToBench / sell. The game logic is untouched; only the input
 * path differs.
 */

import { Suspense, useCallback, useMemo, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Instance, Instances, ContactShadows } from "@react-three/drei";
import { useGame, BENCH_SIZE, resolveBenchSlots } from "@/game/store/gameStore";
import { useUi } from "@/game/store/uiStore";
import { getDef } from "@/game/data/mons";
import { boardSizeForLevel } from "@/game/config";
import { FIELD, FIELD_SIZE, HEX_R, cellToWorld, worldToCell, isAllyRow, ALLY_ROW0 } from "@/game/ui/hex3d";
import { useGameLayout } from "./LayoutProvider";
import { SpriteUnit } from "./SpriteUnit";
import { ArenaPlatform } from "./ArenaPlatform";
import type { UnitInstance } from "@/game/types";

const ALLY_TINT = "#27564c";
const ENEMY_TINT = "#2b3550";
const HOVER_TINT = "#58d8a6";

/** Bench slabs sit one row below the field, on the same plane. */
const BENCH_Z = FIELD_SIZE.h / 2 + HEX_R * 1.15;

type Drag = { iid: string; from: "board" | "bench" } | null;

function HexFloor({ hover, rows }: { hover: { c: number; r: number } | null; rows: number }) {
  const from = Math.max(0, FIELD.rows - rows);
  const cells = useMemo(() => {
    const out: { key: string; c: number; r: number; pos: [number, number, number] }[] = [];
    for (let r = from; r < FIELD.rows; r++) {
      for (let c = 0; c < FIELD.cols; c++) {
        out.push({ key: `${c}-${r}`, c, r, pos: cellToWorld(c, r) });
      }
    }
    return out;
  }, [from]);

  return (
    <Instances limit={FIELD.cols * FIELD.rows} receiveShadow>
      <cylinderGeometry args={[HEX_R * 0.88, HEX_R * 0.88, 0.1, 6]} />
      <meshStandardMaterial roughness={0.82} metalness={0.06} />
      {cells.map((cell) => {
        const ally = isAllyRow(cell.r);
        const isHover = !!hover && hover.c === cell.c && hover.r === cell.r;
        return (
          <Instance
            key={cell.key}
            position={cell.pos}
            rotation={[0, Math.PI / 6, 0]}
            color={isHover ? HOVER_TINT : ally ? ALLY_TINT : ENEMY_TINT}
          />
        );
      })}
    </Instances>
  );
}

/** Bench row: nine slabs on the platform's near edge, same plane as the field. */
function BenchSlabs({ hover }: { hover: number | null }) {
  const w = FIELD_SIZE.w / BENCH_SIZE;
  return (
    <Instances limit={BENCH_SIZE} receiveShadow>
      <boxGeometry args={[w * 0.86, 0.08, w * 0.86]} />
      <meshStandardMaterial roughness={0.85} metalness={0.05} />
      {Array.from({ length: BENCH_SIZE }).map((_, i) => (
        <Instance
          key={i}
          position={[-FIELD_SIZE.w / 2 + w * (i + 0.5), 0, BENCH_Z]}
          color={hover === i ? HOVER_TINT : "#1d2740"}
        />
      ))}
    </Instances>
  );
}

function Scene({
  units, level, interactive, rows, onCommit,
}: {
  units: UnitInstance[];
  level: number;
  interactive: boolean;
  rows: number;
  onCommit: (drag: NonNullable<Drag>, target: { kind: "cell"; c: number; r: number } | { kind: "bench"; i: number } | null) => void;
}) {
  const [hoverCell, setHoverCell] = useState<{ c: number; r: number } | null>(null);
  const [hoverBench, setHoverBench] = useState<number | null>(null);
  // STATE, not a ref: which unit is being dragged drives rendering (the sprite
  // dims), and a ref read during render is both a purity violation and a stale
  // read — the same bug the CSS board had.
  const [drag, setDrag] = useState<Drag>(null);
  // Picking a unit up also inspects it, exactly as the DOM board's UnitChip
  // does. Without this the 3D board had NO route into the detail panel, which
  // is where held items, live stats and the Sell button live — and the S
  // sell hotkey reads the inspected unit, so selling was unreachable too.
  const setInspect = useUi((st) => st.setInspect);

  const board = units.filter((u) => u.pos !== null);
  const bench = resolveBenchSlots(units);
  const benchW = FIELD_SIZE.w / BENCH_SIZE;

  // Content spans the field plus the bench strip in front of it; shifting the
  // group back by half that span centres the WHOLE arena on the origin, so the
  // camera frames both without the bench falling out of shot.
  const centreZ = -((BENCH_Z + HEX_R * 0.6) - FIELD_SIZE.h / 2) / 2;

  /**
   * Map a ground hit to whichever drop target it lands on.
   *
   * ThreeEvent.point is in WORLD space, but the whole arena — including the
   * input plane — lives inside a group translated by centreZ, and both
   * worldToCell() and the bench test expect board-local coordinates. Feeding
   * the raw world z in shifted every drop by 0.58 of a row: it always rounded
   * a row short, the back rank could never be filled at all (it mapped onto
   * the enemy half and was silently rejected), and the bench strip sat just
   * outside its own hit test, so units could not be returned to the bench.
   */
  const readTarget = useCallback((e: ThreeEvent<PointerEvent>) => {
    const x = e.point.x;
    const z = e.point.z - centreZ;
    if (z > FIELD_SIZE.h / 2 + HEX_R * 0.4) {
      const i = Math.floor((x + FIELD_SIZE.w / 2) / benchW);
      return i >= 0 && i < BENCH_SIZE ? ({ kind: "bench", i } as const) : null;
    }
    const cell = worldToCell(x, z);
    return cell ? ({ kind: "cell", ...cell } as const) : null;
  }, [benchW, centreZ]);

  return (
    <group position={[0, 0, centreZ]}>
      {/* Lit with real lights rather than drei's <Environment>: that fetches an
          HDRI at runtime, which is fine in a spike but not something the match
          view should depend on. Key from the front-right, a cool fill from the
          far side so the back rows don't go to silhouette, plus hemisphere. */}
      <hemisphereLight args={["#cfe0ff", "#16203a", 0.95]} />
      <directionalLight position={[3, 7, 5]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3.5, 4, -4]} intensity={0.75} color="#9ec3ff" />

      <ArenaPlatform depthBias={HEX_R * 2.6} />
      <HexFloor hover={hoverCell} rows={rows} />
      <BenchSlabs hover={hoverBench} />

      {/* Board units */}
      {board.map((u) => {
        const def = getDef(u.defId);
        const [x, , z] = cellToWorld(u.pos![0], u.pos![1] + ALLY_ROW0);
        return (
          <group
            key={u.iid}
            onPointerDown={(e) => {
              setInspect(u.defId, u.star, u.iid);
              if (!interactive) return;
              e.stopPropagation();
              (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
              setDrag({ iid: u.iid, from: "board" });
            }}
          >
            <Suspense fallback={null}>
              <SpriteUnit dex={def.dex[u.star - 1]} star={u.star} position={[x, 0, z]} dimmed={drag?.iid === u.iid} />
            </Suspense>
            {/* Invisible grab volume: picking up must not depend on hitting an
                opaque pixel of a sprite that is mostly transparent padding. */}
            <mesh visible={false} position={[x, 0.42, z]}>
              <cylinderGeometry args={[HEX_R * 0.8, HEX_R * 0.8, 0.9, 10]} />
            </mesh>
          </group>
        );
      })}

      {/* Bench units */}
      {bench.map((u, i) =>
        u ? (
          <group
            key={u.iid}
            onPointerDown={(e) => {
              setInspect(u.defId, u.star, u.iid);
              if (!interactive) return;
              e.stopPropagation();
              (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
              setDrag({ iid: u.iid, from: "bench" });
            }}
          >
            <Suspense fallback={null}>
              <SpriteUnit
                dex={getDef(u.defId).dex[u.star - 1]}
                star={u.star}
                position={[-FIELD_SIZE.w / 2 + benchW * (i + 0.5), 0, BENCH_Z]}
                dimmed={drag?.iid === u.iid}
              />
            </Suspense>
            <mesh visible={false} position={[-FIELD_SIZE.w / 2 + benchW * (i + 0.5), 0.42, BENCH_Z]}>
              <cylinderGeometry args={[HEX_R * 0.8, HEX_R * 0.8, 0.9, 10]} />
            </mesh>
          </group>
        ) : null,
      )}

      {/* One ground plane takes all pointer input; targets are derived from the
          hit point arithmetically rather than by raycasting every tile. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          const t = readTarget(e);
          setHoverCell(t?.kind === "cell" && isAllyRow(t.r) ? { c: t.c, r: t.r } : null);
          setHoverBench(t?.kind === "bench" ? t.i : null);
        }}
        onPointerUp={(e) => {
          const d = drag;
          setDrag(null);
          setHoverCell(null);
          setHoverBench(null);
          if (d) onCommit(d, readTarget(e));
        }}
        // Releasing OFF the plane (over the shop, the sell zone, outside the
        // canvas) means this handler never sees pointerup. Without clearing the
        // drag here it stayed armed, and the player's next tap anywhere on the
        // board silently teleported that earlier unit to wherever they tapped.
        onPointerLeave={() => { setHoverCell(null); setHoverBench(null); setDrag(null); }}
        onPointerCancel={() => { setHoverCell(null); setHoverBench(null); setDrag(null); }}
      >
        <planeGeometry args={[FIELD_SIZE.w * 2, FIELD_SIZE.h * 2.4]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <ContactShadows position={[0, 0.06, 0]} opacity={0.45} scale={FIELD_SIZE.w * 1.5} blur={2.4} far={2.2} />

      {/* Board capacity, laid flat on the floor like the DOM board's. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, -FIELD_SIZE.h * 0.08]}>
        <planeGeometry args={[0.001, 0.001]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* (capacity text is drawn by the DOM overlay — see Board3D) */}
      <group userData={{ capacity: boardSizeForLevel(level), placed: board.length }} />
    </group>
  );
}

export function Board3D({
  interactive = true,
  rows,
}: {
  interactive?: boolean;
  /** Field rows to show, matching the DOM board's planning window. */
  rows?: number;
}) {
  const layout = useGameLayout();
  const units = useGame((s) => s.units);
  const level = useGame((s) => s.level);
  const moveToBoard = useGame((s) => s.moveToBoard);
  const moveToBench = useGame((s) => s.moveToBench);
  const reorderBench = useGame((s) => s.reorderBench);

  const shownRows = Math.min(FIELD.rows, Math.max(1, rows ?? layout.planningRows));

  const onCommit = useCallback<Parameters<typeof Scene>[0]["onCommit"]>((d, target) => {
    if (!target) return;
    if (target.kind === "bench") {
      const u = useGame.getState().units.find((x) => x.iid === d.iid);
      if (u && u.pos !== null) moveToBench(d.iid);
      reorderBench(d.iid, target.i);
      return;
    }
    // Board cells are the ALLY half only; the local board coordinate is the
    // field row minus the ally offset, exactly as the DOM board maps it.
    if (!isAllyRow(target.r)) return;
    moveToBoard(d.iid, target.c, target.r - ALLY_ROW0);
  }, [moveToBoard, moveToBench, reorderBench]);

  const placed = units.filter((u) => u.pos !== null).length;
  const capacity = boardSizeForLevel(level);

  return (
    <div
      className="relative"
      style={{ width: layout.planningBox.w, height: layout.planningBox.h }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 7.1, 7.0], fov: 38 }}
        gl={{ antialias: true }}
      >
        <Scene
          units={units}
          level={level}
          interactive={interactive}
          rows={shownRows}
          onCommit={onCommit}
        />
      </Canvas>

      {/* Capacity ghost stays in the DOM: crisp text at any size, and it keeps
          font rendering out of the GL layer. */}
      <div
        className="absolute inset-0 grid place-items-center pointer-events-none select-none arena-capacity"
        style={{ fontSize: Math.round(layout.tile.w * 1.05) }}
        aria-hidden
      >
        <span className={placed >= capacity ? "is-full" : undefined}>
          {placed}/{capacity}
        </span>
      </div>
    </div>
  );
}
