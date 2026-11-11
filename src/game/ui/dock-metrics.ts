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

/** Legibility ceiling. Above this, a rail panel's text stops looking like
 *  chrome and starts competing with the board for attention. */
const MAX_LABEL_PX = 13;
const MAX_BODY_PX = 15;
const MAX_BUTTON_PX = 16;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * The pension dock, which now lives in the right rail beneath the trainers
 * ladder rather than floating over the arena.
 *
 * It used to be sized against the bench slot, because both hold exactly one
 * mon. On the rail that neighbour is gone: what it must sit beside now is the
 * trainers list, so it is sized against the rail's own width — which the
 * layout engine already solves against the viewport, exactly as the bench slot
 * was. The discipline is unchanged and it is the whole point of this file: a
 * proportion of something the engine computes, never a pixel count.
 *
 * Text is the exception, and deliberately so. It is clamped at BOTH ends: a
 * floor because below it nothing is readable, and a ceiling because the rail
 * grows to 214px on a desktop and type scaled linearly to that width reads as
 * a headline inside what is meant to be chrome.
 */
export function pensionRailMetrics(railW: number, font: number) {
  const pad = Math.max(4, Math.round(railW * 0.045));
  const inner = Math.max(1, railW - pad * 2);
  return {
    /** Outer width — the rail's, since the dock is a full-width rail panel. */
    w: railW,
    /** Inner padding of the panel. */
    pad,
    /** Content width inside that padding. */
    inner,
    /** The art well the mon sits in. */
    art: Math.round(inner * 0.62),
    /** The sprite inside that well. */
    preview: Math.round(inner * 0.56),
    /** The paw glyph shown when the dock is empty. */
    icon: Math.round(inner * 0.3),
    /** Section label ("PENSION") and secondary lines. */
    label: clamp(Math.round(inner * 0.085 * font), MIN_LABEL_PX, MAX_LABEL_PX),
    /** Mon name and countdown. */
    body: clamp(Math.round(inner * 0.095 * font), MIN_LABEL_PX, MAX_BODY_PX),
    /** Collect button. */
    button: clamp(Math.round(inner * 0.105 * font), MIN_BUTTON_PX, MAX_BUTTON_PX),
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
