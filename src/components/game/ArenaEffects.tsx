"use client";

import { useMemo } from "react";
import type { ArenaEffect } from "@/game/ui/arena-variants";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";

/**
 * The ambient layer that gives an arena variant its weather.
 *
 * Particles are POSITIONED DETERMINISTICALLY from their index, not from
 * Math.random(). A random layout would be re-rolled on every render the board
 * does — and the board re-renders on every unit placement, every gold tick and
 * every phase change — so the weather would visibly teleport while you played.
 * A hash of the index gives the same scatter every time while still looking
 * unordered.
 *
 * The particles sit UNDER the hexes (the layer is painted before them) so the
 * arena has weather rather than the units having confetti thrown at them.
 */

/** Integer hash → [0,1). Cheap, stable, and good enough for a scatter. */
function rand(i: number, salt: number): number {
  let h = Math.imul(i + salt * 0x9e37, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Per-effect tuning. Count is deliberately modest: this runs behind a board
 *  that is already compositing a perspective-transformed 3D-ish scene, and the
 *  effect is meant to be felt rather than counted. */
const SPEC: Record<ArenaEffect, { n: number; dur: [number, number]; size: [number, number] }> = {
  dust:   { n: 14, dur: [16, 30], size: [2, 3.5] },
  ember:  { n: 18, dur: [5, 10],  size: [2, 4] },
  rain:   { n: 26, dur: [0.9, 1.7], size: [1, 1.6] },
  snow:   { n: 20, dur: [7, 14],  size: [2.5, 4.5] },
  spark:  { n: 16, dur: [1.4, 3],  size: [1.5, 3] },
  pollen: { n: 18, dur: [9, 18],  size: [2, 4] },
  bubble: { n: 14, dur: [6, 12],  size: [3, 6] },
  wind:   { n: 12, dur: [2.4, 5],  size: [1.5, 2.5] },
  mote:   { n: 18, dur: [6, 13],  size: [2, 4] },
  wisp:   { n: 12, dur: [10, 20], size: [3, 6] },
};

export function ArenaEffects({ effect, accent }: { effect: ArenaEffect; accent: string }) {
  const reduced = usePrefersReducedMotion();
  const spec = SPEC[effect] ?? SPEC.dust;

  const bits = useMemo(() => {
    const out: { left: number; top: number; size: number; dur: number; delay: number; drift: number }[] = [];
    for (let i = 0; i < spec.n; i++) {
      const d = rand(i, 1);
      out.push({
        left: rand(i, 2) * 100,
        top: rand(i, 3) * 100,
        size: spec.size[0] + rand(i, 4) * (spec.size[1] - spec.size[0]),
        dur: spec.dur[0] + d * (spec.dur[1] - spec.dur[0]),
        // Negative delay starts each particle mid-flight, so the field is
        // already populated on the first frame instead of every particle
        // marching in from the same edge together.
        delay: -rand(i, 5) * (spec.dur[0] + d * (spec.dur[1] - spec.dur[0])),
        drift: (rand(i, 6) - 0.5) * 2,
      });
    }
    return out;
  }, [spec]);

  // Reduced motion gets the palette and none of the movement. Returning null
  // rather than a frozen layer: a static scatter of dots over the board is
  // visual noise with no purpose once it cannot move.
  if (reduced) return null;

  return (
    <span className={`arena-fx arena-fx-${effect}`} aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="arena-fx-bit"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: effect === "rain" ? b.size * 9 : b.size,
            color: accent,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            ["--drift" as string]: `${b.drift * 18}px`,
          }}
        />
      ))}
    </span>
  );
}
