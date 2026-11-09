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
/**
 * How far above the requested size a snapped size may land before the snap is
 * abandoned. Integer multiples of a 96px source are coarse: near a ~104px tile
 * the only choices are 96 (0.98x the cell) or 192 (1.96x), so rounding to the
 * NEAREST multiple could round UP to almost double the intended size. That is
 * the "mons too big" reported from play — a crisper sprite is not worth a unit
 * rendered half again as large as it should be, so past this margin we take the
 * exact size and accept slightly softer upscaling.
 */
/**
 * How far a snapped size may stray from the requested one, in either
 * direction, before the snap is abandoned.
 *
 * Integer multiples of a 96px source are coarse. Rounding to the NEAREST
 * multiple sounds safe but is not: near a ~104px tile the choices are 96 or
 * 192, so a unit could render at 125% of its intended size (the "mons too big"
 * reported from play) or, one tile size later, at 63% of it. Both were
 * happening at different tiles, which is also why unit scale looked
 * inconsistent as the board resized.
 *
 * Within this margin a snapped size is pixel-exact and close enough to right.
 * Outside it, correct size wins and we accept slightly softer upscaling — a
 * crisper sprite is never worth a unit drawn a third too large or too small.
 */
const SNAP_TOLERANCE = 0.1;

export function crispSize(desired: number, maxSize: number, source: number = SPRITE_SOURCE): number {
  const cap = Math.max(1, maxSize);
  const target = Math.min(desired, cap);
  const snapped = Math.max(1, Math.round(target / source)) * source;
  const within = Math.abs(snapped - target) <= target * SNAP_TOLERANCE;
  if (within && snapped <= cap) return snapped;
  return Math.round(target);
}

