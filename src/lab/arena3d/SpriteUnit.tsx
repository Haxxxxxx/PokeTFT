"use client";

/**
 * A pixel sprite standing in the 3D arena — the "HD-2D" approach.
 *
 * WHY THIS AND NOT 3D MODELS
 *
 * We already have complete Pokédex coverage as sprites (1,025 of them, mirrored
 * into public/sprites). There is no licensed source of Pokémon 3D models — the
 * only ones that exist are extractions from the retail games — so models would
 * mean sourcing hundreds of inconsistent rips AND still ending up with gaps.
 * Sprites are therefore both the safer and the MORE complete option.
 *
 * What they lack is grounding: a flat pixel pasted on a tilted board reads as a
 * sticker. This fixes that the way HD-2D games do:
 *   · the sprite is a billboard, always facing the camera, so it never skews
 *     with the board's rake
 *   · it still casts a real shadow onto the arena floor
 *   · nearest-neighbour filtering, so pixels stay crisp instead of going soft
 *   · a contact shadow under the feet, pinned to the ground plane
 *
 * The result keeps every Pokémon, needs no new assets, and sits in the same lit
 * scene as everything else.
 */

import { useMemo } from "react";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";

/** How tall a unit stands, in world units (hex circumradius is 0.5). */
const UNIT_H = 0.85;

export function SpriteUnit({
  dex, position, dimmed,
}: {
  dex: number;
  position: [number, number, number];
  dimmed?: boolean;
}) {
  const tex = useTexture(`/sprites/${dex}.png`);

  useMemo(() => {
    // Nearest-neighbour: pixel art must not be interpolated or it turns to
    // mush the moment the camera scales it.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return null;
  }, [tex]);

  return (
    <group position={position}>
      {/* Contact shadow, flat on the ground — this is what stops the sprite
          reading as a sticker floating above the board. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.02]}>
        <circleGeometry args={[0.26, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.42} depthWrite={false} />
      </mesh>

      {/* Billboard: always square to the camera, so the rake never skews it.
          Anchored at the feet by lifting it half its height. */}
      <Billboard position={[0, UNIT_H / 2 + 0.02, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <mesh castShadow>
          <planeGeometry args={[UNIT_H, UNIT_H]} />
          <meshBasicMaterial
            map={tex}
            transparent
            alphaTest={0.5}
            toneMapped={false}
            opacity={dimmed ? 0.55 : 1}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  );
}
