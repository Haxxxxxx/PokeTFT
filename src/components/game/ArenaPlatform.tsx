"use client";

/**
 * The raised slab the hexes sit on, shared by the 3D planning board and the 3D
 * combat field.
 *
 * Without it the 3D views read as hexes floating in space, which is a step
 * BACKWARDS from the CSS board — that one has extruded walls and a carved rim.
 * This restores the same silhouette with real geometry: a slab with genuine
 * thickness, a slightly proud rim around it, and a darker underside so the edge
 * catches light the way a cut stone block would.
 */

import { FIELD_SIZE, HEX_R } from "@/game/ui/hex3d";

/** How far the platform extends past the hex field on every side. */
const MARGIN = HEX_R * 0.9;
/** Slab thickness in world units. */
const THICK = 0.42;

export function ArenaPlatform({
  depthBias = 0,
}: {
  /** Extra depth to cover, e.g. the bench strip in front of the field. */
  depthBias?: number;
}) {
  const w = FIELD_SIZE.w + MARGIN * 2;
  const d = FIELD_SIZE.h + MARGIN * 2 + depthBias;
  // Centre shifts toward the camera by half the extra depth so the slab grows
  // forward (under the bench) rather than symmetrically.
  const z = depthBias / 2;

  return (
    <group position={[0, 0, z]}>
      {/* Body of the slab, sitting just below the hex tops. */}
      <mesh position={[0, -THICK / 2 - 0.01, 0]} receiveShadow castShadow>
        <boxGeometry args={[w, THICK, d]} />
        <meshStandardMaterial color="#111a2e" roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Proud rim — a thin lip around the top edge, which is what reads as
          "carved" rather than "a box with tiles on it". */}
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[w + 0.14, 0.08, d + 0.14]} />
        <meshStandardMaterial color="#2a3a57" roughness={0.8} metalness={0.08} />
      </mesh>
    </group>
  );
}
