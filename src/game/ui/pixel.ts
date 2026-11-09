/**
 * Pixel-art scaling.
 *
 * Every mon sprite is a 96x96 PNG. Nearest-neighbour upscaling only looks
 * clean at INTEGER multiples of the source: at 1.72x (say a 165px render of a
 * 96px source) some source pixels land on two screen pixels and their
 * neighbours land on one, so edges come out ragged and the whole board reads
 * as mushy rather than crisp.
 *
 * Snapping the rendered size to the nearest whole multiple fixes it outright —
 * each source pixel becomes exactly N screen pixels. The unit is then a little
 * larger or smaller than the layout asked for, which is a trade worth making:
 * sprite art that is slightly off-size still looks deliberate, sprite art at a
 * fractional scale just looks broken.
 */

/** Native edge length of the mon sprites in `public/sprites`. */
export const SPRITE_SOURCE = 96;

/**
 * Snap a desired on-screen size to a whole multiple of the source resolution —
 * but only when that snap stays within `maxSize`.
 *
 * The cap is the important half. Snapping alone is unbounded: the smallest
 * board tile is 34px, which wants a ~52px sprite, and the nearest whole
 * multiple is 96 — nearly 3.4x the hex, so every unit would bury its
 * neighbours on a phone. It also steps discontinuously, so a one-pixel change
 * in viewport width could double every sprite.
 *
 * So: take the largest whole multiple that fits the cap, and if even 1x
 * overflows it, fall back to the exact requested size. That trades crispness
 * for correct scale precisely where crispness matters least — a 34px tile is
 * already too small to show off pixel edges, while a unit 3x its cell is
 * unusable at any size.
 *
 * @param desired  the size the layout would like, in CSS px
 * @param maxSize  the largest size that still reads correctly in the layout
 * @param source   source edge length (defaults to the mon sprite's 96)
 */
export function crispSize(desired: number, maxSize: number, source: number = SPRITE_SOURCE): number {
  const snapped = Math.max(1, Math.round(desired / source)) * source;
  if (snapped <= maxSize) return snapped;
  const fitted = Math.floor(maxSize / source) * source;
  return fitted >= source ? fitted : Math.round(desired);
}
