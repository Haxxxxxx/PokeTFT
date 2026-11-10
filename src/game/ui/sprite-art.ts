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
