import { MON_HEIGHT_M, REFERENCE_HEIGHT_M } from "./mon-heights";

/**
 * How much a species' real height is allowed to show in its rendered size.
 *
 * UnitModel used to normalise every model to one fixed height, so a Rattata
 * (0.3 m) and a Charizard (1.7 m) rendered identically. That is not a tuning
 * error — it is the renderer discarding relative scale by construction, and it
 * is why the small mons read as far too big.
 *
 * True relative scale is not the answer either: the roster spans 0.1 m
 * (Flabébé) to 20 m (Eternatus), a 200x range that would make most units
 * invisible on a hex and a few of them cover the board. So height is
 * COMPRESSED — raised to a fractional power, then clamped — which preserves
 * the ordering everyone intuitively expects (Charizard looms over Pikachu)
 * inside a range a tactics board can actually show.
 */

/**
 * Fractional exponent applied to height/reference.
 *
 * 1 would be true scale (unusable, see above); 0 would be the flat normalise
 * we are replacing. 0.38 keeps a visible gap between adjacent evolutions —
 * Charmander 0.6 m → 0.80, Charmeleon 1.1 m → 1.04, Charizard 1.7 m → 1.22 —
 * without the extremes needing the clamp to do all the work.
 */
const COMPRESSION = 0.38;

/** Nothing renders smaller than this, or it stops reading as a unit on a hex. */
const MIN_SCALE = 0.7;
/** Nothing renders larger than this, or it occludes its neighbours' hexes. */
const MAX_SCALE = 1.4;

/**
 * Relative render scale for a species, as a multiplier on MODEL_TARGET_HEIGHT.
 *
 * Unknown dex falls back to 1 — the previous behaviour — so a missing height
 * degrades to "same as before" rather than to a unit that vanishes.
 */
export function relativeModelScale(dex: number | string): number {
  // The lab renders a few non-species debug models ("fox", "duck"...) by name.
  // They have no canonical height, so they keep the flat normalise.
  if (typeof dex !== "number") return 1;
  const h = MON_HEIGHT_M[dex];
  if (!h || !Number.isFinite(h) || h <= 0) return 1;
  const raw = Math.pow(h / REFERENCE_HEIGHT_M, COMPRESSION);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}
