import { MON_HEIGHT_M, REFERENCE_HEIGHT_M } from "./mon-heights";
import { MON_WEIGHT_KG, REFERENCE_MASS_CBRT } from "./mon-weights";

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
 * Relative render scale for a species, blended from its height AND its mass.
 *
 * An unknown dex falls back to 1, and a species missing one of the two measures
 * uses whichever it has — so a gap degrades to "same as before" rather than to
 * a unit that vanishes.
 */
export function relativeModelScale(dex: number | string): number {
  // The lab renders a few non-species debug models ("fox", "duck"...) by name.
  // They have no canonical size, so they keep the flat normalise.
  if (typeof dex !== "number") return 1;

  const h = MON_HEIGHT_M[dex];
  const kg = MON_WEIGHT_KG[dex];
  const usableH = h && Number.isFinite(h) && h > 0;
  const usableW = kg && Number.isFinite(kg) && kg > 0;
  if (!usableH && !usableW) return 1;

  const fromHeight = usableH ? Math.pow(h / REFERENCE_HEIGHT_M, COMPRESSION) : null;
  // Linear size goes as the cube root of mass.
  const fromMass = usableW ? Math.pow(Math.cbrt(kg) / REFERENCE_MASS_CBRT, COMPRESSION) : null;

  // Geometric mean, so neither signal can run away with it. Each alone is
  // wrong in a different direction, and in opposite cases:
  //
  //   height alone  — PokeAPI measures a serpentine species along its LENGTH,
  //                   so Ekans ("2.0 m") scored 1.30 and rendered larger than
  //                   a Doduo. A coiled snake is not that big.
  //   mass alone    — a gas or balloon species weighs almost nothing. Gastly
  //                   (0.1 kg) would shrink to the floor despite being a
  //                   perfectly visible 1.3 m cloud.
  //
  // Blended, Ekans lands at 1.02 (just under Doduo's 1.06) and Gastly at 0.72,
  // while Snorlax — genuinely big by both measures — stays at 1.34.
  const raw =
    fromHeight != null && fromMass != null
      ? Math.sqrt(fromHeight * fromMass)
      : (fromHeight ?? fromMass ?? 1);

  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}
