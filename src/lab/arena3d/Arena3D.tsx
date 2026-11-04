"use client";

/**
 * R3F arena spike.
 *
 * Answers the three questions that actually carry risk before committing to a
 * WebGL board:
 *   1. Does a raked hex arena read like TFT once it's lit in 3D?
 *   2. Does drag-and-drop survive raycasting (the DOM board gets it for free)?
 *   3. Does it hold frame time with a full board of units?
 *
 * Deliberately isolated at /lab/arena3d — it shares the hex math with the real
 * board and nothing else, so it can be deleted without touching the game.
 *
 * Units are placeholders. Swapping in real glTF models is a `useGLTF` call per
 * unit; the point of the spike is the arena, the input model and the budget.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Instance, Instances, Environment, ContactShadows, Html } from "@react-three/drei";
import { FIELD, FIELD_SIZE, HEX_R, cellToWorld, worldToCell, isAllyRow } from "./geometry";

type Unit = { id: string; c: number; r: number; color: string; tall: number };

const ALLY_TINT = "#2ec98a";
const ENEMY_TINT = "#f2607a";

/** A starting board: six units on the ally half. */
function initialUnits(): Unit[] {
  const palette = ["#64b5f6", "#ffb74d", "#ba68c8", "#4db6ac", "#e57373", "#aed581"];
  return palette.map((color, i) => ({
    id: `u${i}`,
    c: 1 + (i % 5),
    r: 5 + Math.floor(i / 5),
    color,
    tall: 0.5 + ((i * 7) % 5) * 0.07,
  }));
}

/**
 * The hex floor, as ONE instanced draw call.
 *
 * Per-tile meshes with their own event handlers is the classic way an R3F board
 * ends up with hundreds of draw calls and a sluggish pointer. Instancing keeps
 * it at one, and input is handled by a single ground plane below.
 */
function HexFloor({ hovered }: { hovered: { c: number; r: number } | null }) {
  const cells = useMemo(() => {
    const out: { key: string; pos: [number, number, number]; ally: boolean }[] = [];
    for (let r = 0; r < FIELD.rows; r++) {
      for (let c = 0; c < FIELD.cols; c++) {
        out.push({ key: `${c}-${r}`, pos: cellToWorld(c, r), ally: isAllyRow(r) });
      }
    }
    return out;
  }, []);

  return (
    <Instances limit={cells.length} castShadow receiveShadow>
      {/* Pointy-top hex prism: a 6-sided cylinder rotated a twelfth of a turn,
          so its flats face ±X and match the column spacing of sqrt(3)·R.
          Inset to 0.86 so neighbours read as separate tiles with a groove
          between them rather than one crowded mass. */}
      <cylinderGeometry args={[HEX_R * 0.86, HEX_R * 0.86, 0.12, 6]} />
      <meshStandardMaterial roughness={0.78} metalness={0.08} />
      {cells.map((cell) => {
        const isHover = hovered && hovered.c === Number(cell.key.split("-")[0]) && hovered.r === Number(cell.key.split("-")[1]);
        return (
          <Instance
            key={cell.key}
            position={cell.pos}
            rotation={[0, Math.PI / 6, 0]}
            color={isHover ? "#8ef7c6" : cell.ally ? ALLY_TINT : ENEMY_TINT}
            scale={isHover ? 1.04 : 1}
          />
        );
      })}
    </Instances>
  );
}

/** A placeholder unit. Stands upright; swap the mesh for a glTF model later. */
function UnitMesh({
  unit, dragging, onGrab,
}: {
  unit: Unit; dragging: boolean; onGrab: (id: string, e: ThreeEvent<PointerEvent>) => void;
}) {
  const [x, , z] = cellToWorld(unit.c, unit.r);
  return (
    <group position={[x, 0.06, z]}>
      <mesh
        castShadow
        position={[0, unit.tall / 2 + 0.06, 0]}
        onPointerDown={(e) => { e.stopPropagation(); onGrab(unit.id, e); }}
      >
        <capsuleGeometry args={[HEX_R * 0.34, unit.tall * 0.7, 6, 12]} />
        <meshStandardMaterial
          color={unit.color}
          emissive={unit.color}
          emissiveIntensity={dragging ? 0.55 : 0.12}
          roughness={0.45}
          metalness={0.18}
        />
      </mesh>
    </group>
  );
}

/**
 * Input. ONE invisible ground plane takes the pointer; the hit point is mapped
 * to a cell arithmetically (see worldToCell). No per-tile raycasts, no event
 * handler per hex.
 *
 * Drag position lives in a ref and only commits to React state on drop —
 * updating state on every pointermove (20–100/s) is the standard way an R3F
 * board starts dropping frames.
 */
function Ground({
  onHover, onDrop,
}: {
  onHover: (cell: { c: number; r: number } | null) => void;
  onDrop: (cell: { c: number; r: number } | null) => void;
}) {
  const last = useRef<{ c: number; r: number } | null>(null);

  const read = (e: ThreeEvent<PointerEvent>) => worldToCell(e.point.x, e.point.z);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerMove={(e) => {
        const cell = read(e);
        const a = last.current;
        if (a?.c !== cell?.c || a?.r !== cell?.r) {
          last.current = cell;
          onHover(cell);
        }
      }}
      onPointerUp={(e) => onDrop(read(e))}
      onPointerLeave={() => { last.current = null; onHover(null); }}
    >
      <planeGeometry args={[FIELD_SIZE.w * 1.6, FIELD_SIZE.h * 1.6]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

/** Live frame-time + draw-call readout — the number the spike exists to get. */
function Stats() {
  const { gl } = useThree();
  const [txt, setTxt] = useState("…");
  const acc = useRef({ n: 0, t: 0, calls: 0, tris: 0, pCalls: 0, pTris: 0 });

  // useFrame runs BEFORE the render, and three resets gl.info after every frame
  // by default — so reading it naively reports freshly-zeroed counters (we saw
  // "1 draw call / 2 tris" for a full board). Taking ownership of the reset and
  // reading the PREVIOUS frame's totals fixes that.
  //
  // One useFrame, and crucially NO priority argument: passing a priority makes
  // the callback take over R3F's render loop, so you become responsible for
  // calling gl.render() yourself. Adding `, 1` here silently stopped the scene
  // drawing entirely while the counters kept ticking.
  // Take ownership of the counter reset ONCE, in an effect — the frame callback
  // stays read-only, which keeps it clean under the React compiler's
  // immutability rule. With autoReset off the counters accumulate, so a frame's
  // cost is the delta rather than the raw value.
  useEffect(() => {
    const info = gl.info;
    // three's renderer is an imperative object — configuring it IS mutation,
    // there is no non-mutating accessor for the counter behaviour. Restored on
    // unmount so nothing else inherits the changed setting.
    // eslint-disable-next-line react-hooks/immutability
    info.autoReset = false;
    return () => { info.autoReset = true; };
  }, [gl]);

  useFrame((_, dt) => {
    const a = acc.current;
    const calls = gl.info.render.calls;
    const tris = gl.info.render.triangles;
    a.calls = calls - a.pCalls;
    a.tris = tris - a.pTris;
    a.pCalls = calls;
    a.pTris = tris;

    a.n += 1;
    a.t += dt;
    if (a.t >= 0.5) {
      setTxt(`${Math.round(a.n / a.t)} fps · ${a.calls} draw calls · ${a.tris.toLocaleString()} tris`);
      a.n = 0;
      a.t = 0;
    }
  });
  return (
    <Html position={[0, 0, -FIELD_SIZE.h / 2 - 0.6]} center>
      <div style={{ font: "600 12px ui-monospace,monospace", color: "#9fe8c8", background: "rgba(5,10,20,.75)", padding: "4px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>
        {txt}
      </div>
    </Html>
  );
}

function Scene() {
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const onGrab = useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    // Pointer capture keeps events coming after the cursor leaves the mesh,
    // which is why this needs no transparent "drag plane" hack.
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    setDrag(id);
  }, []);

  const onDrop = useCallback((cell: { c: number; r: number } | null) => {
    setDrag((id) => {
      if (id && cell && isAllyRow(cell.r)) {
        setUnits((us) => {
          const occupied = us.find((u) => u.c === cell.c && u.r === cell.r && u.id !== id);
          return us.map((u) => {
            if (u.id === id) return { ...u, c: cell.c, r: cell.r };
            // Swap, matching the DOM board's behaviour on an occupied hex.
            if (occupied && u.id === occupied.id) {
              const from = us.find((q) => q.id === id)!;
              return { ...u, c: from.c, r: from.r };
            }
            return u;
          });
        });
      }
      return null;
    });
  }, []);

  return (
    <>
      {/* Camera rake matches the DOM arena's feel: looking down the board. */}
      <hemisphereLight args={["#bcd4ff", "#121a2c", 0.55]} />
      <directionalLight
        position={[3, 7, 4]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Environment preset="city" />

      <group rotation={[0, 0, 0]}>
        <HexFloor hovered={hover} />
        {units.map((u) => (
          <UnitMesh key={u.id} unit={u} dragging={drag === u.id} onGrab={onGrab} />
        ))}
        <Ground onHover={setHover} onDrop={onDrop} />
        <ContactShadows position={[0, 0.07, 0]} opacity={0.5} scale={FIELD_SIZE.w * 1.4} blur={2.2} far={2} />
      </group>

      <Stats />
    </>
  );
}

export function Arena3D() {
  return (
    <div className="fixed inset-0 bg-[#070c17]">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 6.4, 6.2], fov: 42 }}
        // preserveDrawingBuffer so the frame survives until a screenshot can
        // read it. Without it the back buffer is cleared after each present and
        // an automated capture lands on an empty canvas — the scene renders
        // fine (the draw-call counter proves it), the picture is just blank.
        // Costs a little memory bandwidth; fine for a spike we need to SEE.
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#070c17"]} />
        <Scene />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 text-[11px] leading-relaxed text-slate-400">
        <div className="font-bold text-slate-200">Arena 3D · spike</div>
        <div>drag a capsule onto a teal hex</div>
      </div>
    </div>
  );
}
