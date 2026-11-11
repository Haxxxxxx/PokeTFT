/**
 * Combat feedback sized against the tile instead of in fixed pixels.
 *
 * Every blast, ring, beam and damage number was a literal: a 220px shockwave,
 * a 120px core, a 46px impact, an 18px offset, 13/18/25px numerals. The board
 * is responsive — the tile runs from about 35px on a phone in landscape to
 * about 95px on a desktop — so a 220px blast is 6.3 tiles wide on a phone and
 * 2.3 on a desktop. The same effect reads as a screen-filling flash in one
 * place and a modest ring in the other, and the numbers swamp a small board
 * while getting lost on a large one.
 *
 * The fractions below are the original constants divided by REFERENCE_TILE, so
 * a desktop board looks exactly as it did and every smaller board is corrected
 * toward it rather than away.
 */

/** The tile the original pixel constants were tuned against. */
const REFERENCE_TILE = 100;

/** Keeps a hairline visible at any density. */
const minPx = (n: number) => Math.max(1, Math.round(n));

export function combatFxMetrics(tileW: number) {
  const u = tileW / REFERENCE_TILE; // one "reference pixel"
  return {
    /** Board-wide blast: the shockwave ring and its bright core. */
    blastRing: 220 * u,
    blastCore: 120 * u,
    /** The extra ring drawn when a hit is super-effective. */
    supRing: 104 * u,
    /** Splash: ring + core on the target. */
    splashRing: 64 * u,
    splashCore: 52 * u,
    /** Single-target impact. */
    single: 46 * u,
    /** Beam: a minimum length so a point-blank shot is still visible, plus
     *  overshoot past the target, plus its thickness. */
    beamMin: 40 * u,
    beamOvershoot: 30 * u,
    beamThickness: Math.max(3, 8 * u),
    /** Ring stroke widths. Floored so they never vanish on a small board. */
    stroke: minPx(3 * u),
    strokeSup: minPx(4 * u),
    strokeThin: minPx(2 * u),
    /** Damage numbers: how far above the cell they start, how large they are,
     *  and how wide the deterministic fan-out spreads. */
    dmgRise: 18 * u,
    // Floored at 9px: below that a number stops being readable at all, and an
    // unreadable number is worse than a slightly oversized one.
    dmgFont: Math.max(9, 13 * u),
    dmgFontSup: Math.max(10, 18 * u),
    dmgFontCrit: Math.max(12, 25 * u),
    dmgSpread: 36 * u,
    /**
     * How far a unit steps into the thing it is hitting.
     *
     * Was a flat 13px, which is 28% of a tile on a phone and 11% on a desktop
     * — a lurch on one board and almost invisible on the other.
     */
    lunge: 13 * u,
  };
}

/**
 * The shape of a strike over its frame.
 *
 * The lunge used to be binary: full reach for the whole attack frame, then
 * back to zero. With a CSS transition smoothing the edges that reads as a
 * jump-and-return, not a hit — there is no moment of impact in it, because the
 * unit spends the entire frame already extended.
 *
 * sin(pi * t) gives 0 at the start, peak at the middle and 0 again at the end,
 * so the unit drives in and recovers within the frame and the peak lands where
 * the damage number and the hit flash already fire. Cheap, and it is the whole
 * difference between "moved" and "struck".
 */
export function lungeCurve(frac: number): number {
  const t = Math.min(1, Math.max(0, frac));
  return Math.sin(Math.PI * t);
}
