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
 * What a sprite lacks is grounding: a flat image pasted on a raked board reads
 * as a sticker. This fixes that the way HD-2D games do:
 *   · billboarded, so it always faces the camera and never skews with the rake
 *   · a contact shadow pinned flat to the floor under its feet
 *   · nearest-neighbour filtering, so pixels stay crisp instead of going soft
 *   · lit by the same scene as everything else
 *
 * Keeps every Pokémon, needs no new assets, and sits in the real 3D arena.
 */

import { useEffect } from "react";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * Plane size in world units. A hex is 1.0 across its points, so this
 * deliberately OVERFLOWS the cell.
 *
 * PokéAPI frames are 96x96 with the creature occupying roughly half, so a plane
 * sized to the hex draws a mon at about half its hex — Caterpie came out a
 * quarter the size of the tile it stood on. Oversizing cancels that padding,
 * exactly as the CSS board does with its 1.85x sprite.
 */
const UNIT_H = 1.45;

/**
 * Star tier, as a base glow: bronze / silver / gold.
 *
 * Tier is the single most important thing to read on a board at a glance — a
 * 3-star unit is the whole point of a comp — and the CSS board communicated it
 * with tiny star glyphs that vanish at board scale. A coloured pool under the
 * feet reads instantly, even in peripheral vision, and scales with the tier so
 * a 3-star is unmistakable.
 */
const TIER = {
  1: { colour: "#c8761f", radius: 0.21, glow: 0.75 },  // bronze
  2: { colour: "#9fb6d4", radius: 0.25, glow: 0.85 },  // silver (cool, so it
  3: { colour: "#ffc21e", radius: 0.3, glow: 1 },      // gold     never reads white)
} as const;

export function SpriteUnit({
  dex, position, dimmed, star = 1, flash, tint,
}: {
  dex: number;
  position: [number, number, number];
  dimmed?: boolean;
  /** 1..3 — drives the bronze/silver/gold base glow. */
  star?: 1 | 2 | 3;
  /** Blown out white for an instant when the unit takes a hit. */
  flash?: boolean;
  /** Status colouring (burning, frozen, casting) applied to the sprite. */
  tint?: string;
}) {
  const tier = TIER[star] ?? TIER[1];
  const tex = useTexture(`/sprites/${dex}.png`);

  useEffect(() => {
    // Nearest-neighbour: pixel art must not be interpolated, or the camera
    // scaling it turns every edge to mush.
    //
    // Unlike the DOM board, a textured plane sits at varying depth, so its
    // on-screen size can't be snapped to a whole multiple of the 96px source
    // the way crispSize() does there. Rendering the canvas at dpr 2 is the
    // lever that's left: it halves the sampling error on the fractional scale
    // that's unavoidable here. A three Texture is an imperative
    // object — configuring sampling IS mutation, there's no declarative
    // alternative, so the compiler's immutability rule is opted out of here
    // rather than worked around.
    /* eslint-disable react-hooks/immutability */
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  }, [tex]);

  return (
    <group position={position}>
      {/* Contact shadow, flat on the ground — this is the cue that stops the
          sprite reading as a sticker floating above the board. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.03]}>
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>

      {/* Tier pool. Additive so it reads as light cast on the stone rather than
          a painted decal, and drawn above the contact shadow so the shadow
          grounds the unit while the glow announces its rank. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0.03]}>
        <ringGeometry args={[tier.radius * 0.52, tier.radius, 32]} />
        {/* NORMAL blending, not additive: additive over a lit floor just adds
            toward white, so bronze/silver/gold all came out as the same pale
            ring. Normal lets the tier colour actually win. */}
        <meshBasicMaterial
          color={tier.colour}
          transparent
          opacity={dimmed ? tier.glow * 0.45 : tier.glow}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      {/* No additive halo. One was here to make higher tiers "glow", but
          additive light over a lit floor drives straight to white, so bronze,
          silver and gold all arrived as the same pale disc — the exact
          distinction the ring exists to make. Tier now reads from the ring's
          colour and size alone. */}

      {/* Billboard: always square to the camera, so the board's rake never
          skews it. Lifted half its height so it stands on its feet. */}
      <Billboard position={[0, UNIT_H / 2 + 0.02, 0]}>
        <mesh castShadow>
          <planeGeometry args={[UNIT_H, UNIT_H]} />
          <meshBasicMaterial
            map={tex}
            // A status tint MULTIPLIES the sprite (white is neutral), which is
            // right for colouring — burning reads warmer, frozen cooler.
            color={tint ?? "#ffffff"}
            transparent
            // alphaTest rather than blending: it lets the sprite write depth,
            // so units correctly occlude each other instead of showing through.
            alphaTest={0.5}
            toneMapped={false}
            opacity={dimmed ? 0.55 : 1}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Hit flash is a SECOND, additive pass over the same texture. A flash
            has to ADD light; multiplying by white (the obvious one-line version)
            is a no-op and shows nothing at all. Depth-test off so it reads even
            when the unit is partly behind another. */}
        {flash && (
          <mesh>
            <planeGeometry args={[UNIT_H, UNIT_H]} />
            <meshBasicMaterial
              map={tex}
              transparent
              alphaTest={0.5}
              toneMapped={false}
              opacity={0.85}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </Billboard>
    </group>
  );
}
