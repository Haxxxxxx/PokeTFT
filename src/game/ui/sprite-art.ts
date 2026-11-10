import { SPRITE_TRIM } from "@/game/data/sprite-trim";

/**
 * Where a mon's VISIBLE art sits inside its rendered sprite box.
 *
 * Sprite frames are 96x96 and mostly transparent padding, and the amount
 * differs per species: measured across all 1072 sprites, the padding above the
 * art averages 20.6% of the frame and reaches 50%. Anything positioned
 * relative to the sprite's BOX therefore lands a different distance from the
 * mon for every mon.
 *
 * That is one bug with two faces:
 *   - on the board, a unit's star badge floated off the top of the unit;
 *   - in combat, the HP bar sat more than half a hex above its own mon, close
 *     enough to the unit in FRONT to read as that unit's bar.
 *
 * Both were anchored to the box. Anchor to `top` from here instead and the
 * badge sits on the mon's head, whoever the mon is.
 */
export function spriteArt(dex: number, renderedSize: number) {
  const [x0, y0, x1, y1] = SPRITE_TRIM[dex] ?? [0, 0, 1, 1];
  return {
    /** px from the sprite box's top edge down to the first opaque pixel. */
    top: y0 * renderedSize,
    /** px from the box's bottom edge up to the last opaque pixel. */
    bottom: (1 - y1) * renderedSize,
    /** Height of the art itself, ignoring padding. */
    height: (y1 - y0) * renderedSize,
    /** Width of the art itself, ignoring padding. */
    width: (x1 - x0) * renderedSize,
    /** Horizontal centre of the art, as px from the box's left edge. */
    centerX: ((x0 + x1) / 2) * renderedSize,
    /** How far the art's centre is from the box's centre (signed px). */
    centerOffsetX: ((x0 + x1) / 2 - 0.5) * renderedSize,
  };
}


/**
 * How tall a unit's VISIBLE art should be, as a fraction of its cell.
 *
 * An average species renders at this; the species scale moves it either side.
 */
export const TARGET_ART_HEIGHT = 0.8;

/**
 * Hard ceiling on the sprite BOX.
 *
 * Generous on purpose: the box is mostly TRANSPARENT padding, so a large one
 * does not visually cover anything — the art inside it is still the target
 * size — and the two things that could care are bounded elsewhere (the drag
 * grab zone has its own ceiling, and badges are placed from the art's position
 * inside the box, not from the box).
 *
 * At 2.4 the worst-framed sprite in the roster came out 24% under its target
 * height, which is the padding error creeping back in through the ceiling. At
 * 3.2 every species reaches its intended size.
 */
const MAX_BOX = 3.2;

/**
 * The sprite box to render, chosen so the ART inside it lands at
 * `TARGET_ART_HEIGHT * relative` of the cell.
 *
 * Sizing the FRAME -- what the code did -- means padding decides how big a mon
 * looks. Measured across all 1072 sprites the art fills anywhere from 17.7% to
 * 100% of its frame (median 58%), so at a fixed frame multiple a species whose
 * art fills 82% renders over twice the size of one filling 38%, with nothing to
 * do with how big the Pokemon actually is. That swamped the 0.7-1.4x species
 * scale entirely, which is why the ratios looked wrong on a real board.
 *
 * Sizing from the art removes padding from the equation: two species of the
 * same real height now render the same size whatever their frames look like,
 * and the only thing left driving the difference is the species scale -- which
 * is the thing that is supposed to drive it.
 */
export function spriteBoxFor(dex: number, cell: number, relative: number): number {
  const [, y0, , y1] = SPRITE_TRIM[dex] ?? [0, 0, 1, 1];
  // Floored: a sprite whose art is a tiny sliver would otherwise demand an
  // enormous box to hit the target height.
  const artHeight = Math.max(0.15, y1 - y0);
  return Math.min((cell * TARGET_ART_HEIGHT * relative) / artHeight, cell * MAX_BOX);
}
