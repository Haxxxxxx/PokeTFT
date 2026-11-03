/**
 * Responsive layout engine for the in-game screen.
 *
 * Replaces the old approach — one fixed 1760x1190 canvas uniformly `transform:
 * scale()`d to fit — which shrank EVERYTHING together. On a phone in landscape
 * that scale lands near 0.32, so an 11px label renders at ~3.5px and a hex
 * token becomes un-tappable. Nothing reflowed; it just got small.
 *
 * Here the board is the hero: it takes every pixel left over after the chrome,
 * and the chrome itself gets thinner as the viewport shrinks (rails collapse to
 * drawers, the bench and shop get shorter). The hex math already accepts a tile
 * size as a parameter — `hexToPixel(hex, tileW, tileH)` — so a computed tile
 * flows straight through with no geometry changes.
 *
 * Pure functions, no React, no DOM: unit-testable in `test/layout.ts`.
 */

import { FIELD, fieldPixelSize, rowsPixelHeight } from "../engine/hex";

/**
 * Chrome budget tier, chosen from viewport HEIGHT. The in-game screen is
 * landscape-only (matching TFT Mobile), so height is always the binding
 * constraint — a 844x390 phone has width to spare and no vertical room at all.
 */
export type Density = "compact" | "medium" | "full";

export type GameLayout = {
  density: Density;
  /** True when the side rails must collapse into overlay drawers. */
  railsAsDrawers: boolean;
  viewport: { w: number; h: number };
  /** Hex tile size, fed to hexToPixel/fieldPixelSize. */
  tile: { w: number; h: number };
  /** Inner pixel size of the FULL 7x8 field at this tile size (combat view). */
  field: { w: number; h: number };
  /** Full field plus the board's own padding/border. */
  boardBox: { w: number; h: number };
  /**
   * Field rows shown while PLANNING. A phone in landscape cannot fit all 8 rows
   * plus the bench and shop at a tappable tile size (it needs ~440px of height
   * and has ~390), so compact windows the field to the ally half plus one enemy
   * row of context. Desktop and tablet always show all 8.
   */
  planningRows: number;
  /** Board box while planning, using `planningRows`. */
  planningBox: { w: number; h: number };
  /**
   * True when the bench and shop must yield the screen during combat. Only
   * compact needs this, and it is what lets the full 8-row field fit there at
   * the same tile size — so the board still never changes scale between phases.
   */
  hideBottomInCombat: boolean;
  /** Height of the top strip (round tracker + stage/round + timer). */
  topH: number;
  /** Edge length of one bench slot, and the bench strip's total height. */
  benchSlot: number;
  benchH: number;
  /** Height of the shop strip (controls + 5 cards). */
  shopH: number;
  /** Rail widths. 0 means "not rendered inline" — see railsAsDrawers. */
  leftRail: number;
  rightRail: number;
  /** Gap between zones and the shell's outer padding. */
  gap: number;
  pad: number;
  /**
   * Arena tilt in degrees — the board is drawn as a 3D plane raked away from the
   * camera (TFT's look) with the units counter-rotated so they stand upright on
   * it. Purely visual: tilting only COMPRESSES the board's projected height
   * (by ~cos(tilt)), so the layout math above stays a safe upper bound and can
   * never overflow because of it.
   */
  tilt: number;
  /** CSS `perspective` distance for the arena, in px. Larger = flatter. */
  perspective: number;
  /**
   * Multiplier for chrome typography and icon sizes. 1 = the current desktop
   * design. Never drops below 0.8 — below that text stops being readable, so we
   * take space from the board instead of shrinking the words further.
   */
  font: number;
};

/** The field's size in TILE UNITS — `fieldPixelSize` at a 1x1 tile gives the
 *  multipliers directly (7.5 wide, 6.25 tall for a 7x8 pointy-top field), so
 *  this stays correct automatically if FIELD or ROW_STEP ever change. */
const FIELD_UNITS = fieldPixelSize(1, 1);

/** Tile aspect (h/w) carried over from the original 106x100 design tile. */
export const TILE_ASPECT = 100 / 106;

/** Padding + border the Board draws around the field itself. */
const BOARD_CHROME = 28;

/** Below this the hex tokens stop being reliably tappable with a thumb. */
const MIN_TILE_W = 34;
/** Above this the board stops reading as a board on huge monitors. */
const MAX_TILE_W = 118;

type Tier = {
  topH: number;
  benchSlot: number;
  shopH: number;
  leftRail: number;
  rightRail: number;
  gap: number;
  pad: number;
  font: number;
  railsAsDrawers: boolean;
  tilt: number;
  perspective: number;
};

/**
 * Per-density chrome budget.
 *
 * `compact` is a phone in landscape (<=480px tall). Both rails become drawers:
 * traits open from the left edge, the player list from the right. The right
 * rail keeps a slim always-on strip of player avatars, because knowing who is
 * alive and hurt is the one scouting read you need every single round.
 */
const TIERS: Record<Density, Tier> = {
  // Tilt stays gentle on small screens: a hard rake shrinks the far rows most,
  // and on a phone those tokens are already at the edge of being tappable.
  compact: { topH: 32, benchSlot: 44, shopH: 86, leftRail: 0, rightRail: 48, gap: 4, pad: 4, font: 0.8, railsAsDrawers: true, tilt: 24, perspective: 1400 },
  medium: { topH: 48, benchSlot: 66, shopH: 128, leftRail: 188, rightRail: 188, gap: 8, pad: 8, font: 0.9, railsAsDrawers: false, tilt: 30, perspective: 1500 },
  full: { topH: 56, benchSlot: 92, shopH: 158, leftRail: 260, rightRail: 300, gap: 12, pad: 10, font: 1, railsAsDrawers: false, tilt: 34, perspective: 1700 },
};

/** Rows shown while planning when the full field can't fit: the ally half plus
 *  one enemy row of context, so you still see what you're lining up against. */
const WINDOWED_ROWS = 5;

/**
 * Tile size below which showing all 8 rows during planning stops being worth it
 * — past here the tokens are too small to drag confidently, so we'd rather
 * window the field and keep them big.
 */
const COMFORTABLE_TILE = 52;

export function densityFor(vh: number): Density {
  if (vh < 500) return "compact";
  if (vh < 780) return "medium";
  return "full";
}

/** Bench strip height = one slot plus the strip's own padding. */
function benchHeightFor(slot: number, pad: number): number {
  return slot + pad * 2 + 4;
}

/**
 * Compute the whole in-game layout for a viewport.
 *
 * Strategy: subtract the chrome from the viewport, give the board every
 * remaining pixel, then derive the tile size from that box — bounded on both
 * sides so the board never becomes untappable or absurd.
 */
export function computeGameLayout(vw: number, vh: number): GameLayout {
  const density = densityFor(vh);
  const tier = TIERS[density];
  const { topH, benchSlot, shopH, leftRail, rightRail, gap, pad, font, railsAsDrawers, tilt, perspective } = tier;

  const benchH = benchHeightFor(benchSlot, pad);

  // Horizontal: in drawer mode the traits rail costs nothing (it overlays), but
  // the slim player-avatar strip stays in flow on the right.
  const hChrome = railsAsDrawers
    ? rightRail + gap + pad * 2
    : leftRail + rightRail + gap * 2 + pad * 2;
  const availW = Math.max(120, vw - hChrome);
  const fromW = (availW - BOARD_CHROME) / FIELD_UNITS.w;

  const fullUnitsH = rowsPixelHeight(FIELD.rows, 1);
  const windowUnitsH = rowsPixelHeight(WINDOWED_ROWS, 1);
  const bottomH = benchH + shopH + gap * 2;

  /** Largest tile that fits `rows` of field in `vh` minus the given chrome. */
  const tileFor = (unitsH: number, chrome: number) =>
    (Math.max(80, vh - chrome) - BOARD_CHROME) / (unitsH * TILE_ASPECT);

  // Preferred arrangement: all 8 rows visible in BOTH phases, bench and shop
  // always on screen. The tile must satisfy planning and combat alike so the
  // board never changes scale mid-match.
  const idealChrome = topH + bottomH + gap + pad * 2;
  const idealTile = Math.min(fromW, tileFor(fullUnitsH, idealChrome));

  // If that would make the tokens too small to drag, reorganize instead of
  // shrinking: window the field while planning, and let the bench and shop
  // yield the screen during combat. This is adaptive rather than keyed to a
  // density tier, so there's no cliff where the board suddenly halves.
  const windowed = idealTile < COMFORTABLE_TILE;

  const planningRows = windowed ? WINDOWED_ROWS : FIELD.rows;
  const hideBottomInCombat = windowed;

  const planTile = tileFor(windowed ? windowUnitsH : fullUnitsH, topH + bottomH + gap + pad * 2);
  const fightTile = tileFor(fullUnitsH, hideBottomInCombat ? topH + gap + pad * 2 : topH + bottomH + gap + pad * 2);

  // Windowing is a RECOVERY, not a size bonus: it buys back a comfortable tile
  // and stops there. Without this cap a cramped viewport could hand out a larger
  // board than a roomier one — so growing the window would shrink the board.
  const rawTile = windowed
    ? Math.min(fromW, planTile, fightTile, COMFORTABLE_TILE)
    : Math.min(fromW, idealTile);

  const tileW = clamp(Math.floor(rawTile), MIN_TILE_W, MAX_TILE_W);
  const tileH = Math.round(tileW * TILE_ASPECT);

  const field = fieldPixelSize(tileW, tileH);
  const planningH = rowsPixelHeight(planningRows, tileH);

  return {
    density,
    railsAsDrawers,
    viewport: { w: vw, h: vh },
    tile: { w: tileW, h: tileH },
    field,
    boardBox: { w: field.w + BOARD_CHROME, h: field.h + BOARD_CHROME },
    planningRows,
    planningBox: { w: field.w + BOARD_CHROME, h: planningH + BOARD_CHROME },
    hideBottomInCombat,
    topH,
    benchSlot,
    benchH,
    shopH,
    leftRail,
    rightRail,
    gap,
    pad,
    font,
    tilt,
    perspective,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Scale a design-pixel chrome value by the layout's font multiplier. */
export function fs(layout: GameLayout, px: number): number {
  return Math.max(8, Math.round(px * layout.font));
}
