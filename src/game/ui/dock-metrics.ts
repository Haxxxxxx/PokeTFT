/**
 * Sizes for the two board-side panels that were pinned to fixed pixels while
 * everything around them scaled.
 *
 * The layout engine solves the board against the viewport and publishes a
 * density tier: the bench slot runs from 35px on a phone in landscape to 94px
 * on a desktop, and `font` from 0.8 to 1. The pension dock ignored all of it
 * and was a flat `w-[76px]`, which makes it 2.17x a bench slot on a phone and
 * 0.81x on a desktop — a 2.7x swing in how large it appears relative to its
 * own neighbours. The shop's control column was the same: a flat 150px, and
 * `font` was published but never read by anything.
 *
 * Kept as pure functions so the proportions can be asserted directly at every
 * density, which is the only way to catch this class of drift — it looks fine
 * at whatever size the author happened to be working at.
 */

/** Legibility floor. Below this, text stops being readable at any density. */
const MIN_LABEL_PX = 7;
const MIN_BUTTON_PX = 8;

/**
 * The pension dock holds exactly one mon, so it is sized against the bench
 * slot — the other thing on the board that holds exactly one mon.
 */
export function pensionDockMetrics(benchSlot: number, font: number) {
  const w = Math.round(benchSlot * 1.06);
  return {
    /** Overall width of the dock. */
    w,
    /** The art well the mon sits in. */
    art: Math.round(w * 0.74),
    /** The sprite inside that well. */
    preview: Math.round(w * 0.64),
    /** The paw glyph shown when the dock is empty. */
    icon: Math.round(w * 0.3),
    /** Section label ("PENSION"). */
    label: Math.max(MIN_LABEL_PX, Math.round(w * 0.11 * font)),
    /** Collect button / countdown text. */
    button: Math.max(MIN_BUTTON_PX, Math.round(w * 0.13 * font)),
    /** Inset from the board edge, so it does not crowd the hexes on a phone. */
    inset: Math.max(4, Math.round(benchSlot * 0.1)),
  };
}

/**
 * The shop's left-hand control column (XP, reroll, freeze, odds).
 *
 * Its width is what squeezes the card strip, and on a phone the cards are the
 * part that actually has to stay readable.
 */
export function shopControlMetrics(font: number) {
  return {
    /** Width of the control column. */
    w: Math.round(150 * font),
    /** Width of the gold readout beside it. */
    gold: Math.round(76 * font),
  };
}
