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
 * Snap a desired on-screen size to a whole multiple of the source resolution.
 *
 * @param desired  the size the layout would like, in CSS px
 * @param source   source edge length (defaults to the mon sprite's 96)
 */
export function crispSize(desired: number, source: number = SPRITE_SOURCE): number {
  const scale = Math.max(1, Math.round(desired / source));
  return scale * source;
}

/**
 * The same snap expressed as the integer scale factor, for callers that need
 * to derive other sizes (item pips, stars) from the same multiple.
 */
export function crispScale(desired: number, source: number = SPRITE_SOURCE): number {
  return Math.max(1, Math.round(desired / source));
}
