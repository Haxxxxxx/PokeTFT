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
   * Combat's own geometry.
   *
   * The fight draws all 8 rows into the same column planning uses for 4, with
   * the shop and bench still on screen, so it gets a smaller tile of its own.
   * Published rather than derived at the call site so the fit is solved once,
   * here, against the height the fight actually receives.
   */
  combat: {
    tile: { w: number; h: number };
    field: { w: number; h: number };
    boardBox: { w: number; h: number };
    benchSlot: number;
    benchH: number;
    perspective: number;
    /** True when the shop and bench must yield for the fight to stay readable. */
    hidesBottom: boolean;
    /** Height reserved above the battlefield for the fight's scoreboard. */
    chromeH: number;
  };
  /** Height of the top strip (round tracker + stage/round + timer). */
  topH: number;
  /** Edge length of one bench slot, and the bench strip's total height. The
   *  strip is part of the ARENA (the slabs sit on the platform), not a separate
   *  zone below it — `planningBox.h` already includes it. */
  benchSlot: number;
  benchH: number;
  /** Gap between slabs. The board positions units from this too. */
  benchGap: number;
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

/**
 * Camera distance as a multiple of the board's width.
 *
 * Perspective distortion depends on the RATIO of camera distance to subject
 * size, not an absolute pixel value — a fixed `perspective` that looks right on
 * a laptop turns into a fish-eye on a large board, with the far rows crushed to
 * a fraction of the near ones. Scaling it with the field keeps the rake
 * consistent at every size: a long lens rather than a wide one.
 */
const PERSPECTIVE_RATIO = 3.6;

/** Below this the hex tokens stop being reliably tappable with a thumb. */
const MIN_TILE_W = 34;
/**
 * The combat field's floor. Far below MIN_TILE_W on purpose: that one is a
 * DRAGGABILITY floor, and the fight's board is locked — there is nothing on it
 * to pick up. All it has to do is stay legible while it fits.
 */
const MIN_COMBAT_TILE = 16;
/**
 * Width below which the rails stay drawers however much spare width there is.
 * A phone in landscape can technically afford 288px of rail without costing
 * the board a pixel, but a third of a phone's width is not a readable panel.
 */
const RAILS_INLINE_MIN_W = 1000;
/**
 * Height reserved for the fight's own scoreboard — the survivor line and the
 * army-strength bars that sit above the battlefield.
 *
 * It used to float `absolute top-0` over the board on the theory that the
 * battlefield stayed centred in the same box as the planning board, so the
 * layout never shifted between phases. It was drawing ON the board the whole
 * time: measured 24px onto it at 1920x1080 and 52px at 852x393. Nobody filed
 * it because the rows it covers are empty ground on a big screen. Reserved
 * rather than measured at runtime so the board does not jump when the
 * pre-fight bar comes and goes.
 */
const COMBAT_CHROME_H = 60;
/**
 * Combat tile below which the fight stops being readable, and the shop and
 * bench yield the screen for the few seconds it resolves.
 *
 * Keeping them up is worth real estate — you can buy and rearrange mid-fight —
 * but not at any price: on a 393px-tall phone, paying for the shop, the bench
 * AND the scoreboard out of the fight's own tile leaves ~17px hexes, which is
 * not a battle you can follow. So the shop stays wherever it can, and steps
 * aside only where the alternative is a fight you cannot see.
 */
const LEGIBLE_COMBAT_TILE = 24;
/**
 * Above this the board stops reading as a board on huge monitors.
 *
 * 118 was leaving a 1920x1080 desktop with the board on 44% of the screen and
 * ~520px of nothing down either side — height alone affords a 138px tile
 * there, so the ceiling, not the viewport, was what made it small. 140 puts
 * the board at roughly the width TFT itself gives one on the same monitor.
 */
const MAX_TILE_W = 140;

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
  // `perspective` here is only a FLOOR — the real value scales with the board
  // (see PERSPECTIVE_RATIO), because distortion depends on the ratio between
  // camera distance and subject size, not on an absolute pixel number.
  // Rail widths are deliberately tight. Measured against the reference, TFT
  // spends ~21% of screen width on both rails combined; ours were spending
  // ~37%, and every pixel a rail takes is a pixel the board doesn't get. The
  // rails hold short labels and small glyphs — they don't need the room.
  // Tilt was pulled right down when the camera was too close and the board
  // fish-eyed. Now that the distance scales with the field (PERSPECTIVE_RATIO),
  // a deeper rake reads as depth rather than distortion — and the reference
  // board is raked considerably harder than a timid 24°.
  // `topH` is the budget for EVERYTHING above the board: the round tracker AND
  // the HUD bar under it, plus the gap between them. There are two bars, not
  // one. Budgeting for a single bar is what let the board be solved against
  // ~20px it never had — measured: 79px of bars against a 56px budget on a
  // phone, 97 against 78, 101 against 86. The board then overflowed its column
  // UPWARD and drew straight through the HUD (worst in combat, where the field
  // is 8 rows instead of 5). These are the measured heights plus a pixel.
  compact: { topH: 80, benchSlot: 44, shopH: 86, leftRail: 0, rightRail: 48, gap: 4, pad: 4, font: 0.8, railsAsDrawers: true, tilt: 24, perspective: 1500 },
  medium: { topH: 98, benchSlot: 66, shopH: 128, leftRail: 138, rightRail: 150, gap: 8, pad: 8, font: 0.9, railsAsDrawers: false, tilt: 29, perspective: 1800 },
  full: { topH: 102, benchSlot: 92, shopH: 158, leftRail: 196, rightRail: 214, gap: 12, pad: 10, font: 1, railsAsDrawers: false, tilt: 33, perspective: 2100 },
};

/**
 * Rows shown while PLANNING.
 *
 * Planning never needs all 8. Your units only ever occupy the bottom 4, so the
 * enemy half is empty ground until combat — and unlike TFT, whose far half is a
 * painted scene worth looking at, ours is bare. Rendering it in full spends a
 * third of the board on nothing and shrinks the hexes you actually work in.
 *
 * So planning shows the ally half plus two rows of context by default, and
 * drops the context entirely when the viewport is tight. Combat still draws
 * the full field.
 */
const PLANNING_CONTEXT_ROWS = 6;
/**
 * Your half and nothing else, once the field is windowed.
 *
 * Four, not five. The context rows are EMPTY during planning — the enemy half
 * is bare ground until combat — so a fifth row shows the player nothing while
 * costing real tile size. At 375px tall that row is the difference between a
 * 33px tile with 24px bench slabs and a 39px tile with 29px slabs, and the
 * slabs are what you have to drop a mon onto with a thumb.
 *
 * It is also the only count that keeps the tile monotonic in the viewport.
 * Switching between five and four rows on a threshold meant a slightly SMALLER
 * phone could be handed a bigger board than a slightly larger one, which is
 * the same trap the COMFORTABLE_TILE cap below exists to avoid.
 */
const WINDOWED_ROWS = 4;

/**
 * Tile size below which showing all 8 rows during planning stops being worth it
 * — past here the tokens are too small to drag confidently, so we'd rather
 * window the field and keep them big.
 */
const COMFORTABLE_TILE = 68;

/**
 * Bench geometry. The slabs sit ON the platform, spanning the field's width, so
 * their size is DERIVED from that width rather than guessed as a ratio of the
 * tile — at a guessed 0.82 the nine slabs plus gaps came out wider than the
 * board they sit on. The strip's height is therefore part of the arena.
 */
/**
 * The bench's own metrics.
 *
 * Exported because the BOARD has to lay the slabs and the mons standing on
 * them out from the same numbers. They used to be private here and hardcoded
 * there — three separate copies of the gap and two separate constants for the
 * slot count — so changing one moved the slabs while the units stayed put, or
 * the reverse. Nothing enforced that they agreed; they happened to.
 */
export const BENCH_SLOTS = 9;
export const BENCH_GAP = 4;
const BENCH_PAD = 12;
/** Pixels held back from every tile solve, to absorb integer rounding. */
const FIT_SLACK = 4;
/** Slab edge per unit of tile: nine slabs share the field's 7.5-tile width. */
const BENCH_TILE_RATIO = FIELD_UNITS.w / BENCH_SLOTS;
/** Constant the gaps subtract from that span, folded into the tile solve. */
const BENCH_GAP_OFFSET = ((BENCH_SLOTS - 1) * BENCH_GAP) / BENCH_SLOTS;

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
  // leftRail/rightRail/railsAsDrawers are decided below, from width as well as
  // density — see "Do the rails have to hide?".
  const { topH, benchSlot, shopH, gap, pad, font, tilt, perspective } = tier;

  // Placeholder; recomputed from the solved tile below, since the slabs are
  // sized from it (they live on the platform).
  let benchH = benchHeightFor(benchSlot, pad);

  const fullUnitsH = rowsPixelHeight(FIELD.rows, 1);
  const contextUnitsH = rowsPixelHeight(PLANNING_CONTEXT_ROWS, 1);

  // Vertical chrome that is ALWAYS present: the top strip and the shop, with a
  // gap on either side of the arena. The bench is deliberately NOT here — it
  // renders on the platform, so its height belongs to the arena. Counting it
  // both places (as this did) silently squeezed the board.
  const chromeBase = topH + shopH + gap * 2 + pad * 2;
  const availH = Math.max(80, vh - chromeBase);

  /** Largest tile fitting `rows` of field, plus the bench strip when shown. */
  const tileFor = (unitsH: number, avail: number, withBench: boolean, slack: number = FIT_SLACK) => {
    // FIT_SLACK absorbs rounding. The tile is solved as a real number, but the
    // board is laid out from `tileH = round(tileW * TILE_ASPECT)`, which can
    // round UP — and that half-pixel is multiplied by 6.25 rows of field, so a
    // solve that fits exactly can still render ~3px too tall. Cheaper to give
    // the fit a few pixels than to discover it one viewport at a time.
    const fixed = BOARD_CHROME + slack + (withBench ? BENCH_PAD - BENCH_GAP_OFFSET : 0);
    const perTile = unitsH * TILE_ASPECT + (withBench ? BENCH_TILE_RATIO : 0);
    return (avail - fixed) / perTile;
  };

  // ── Do the rails have to hide? ──────────────────────────────────────────
  //
  // Density keys on HEIGHT alone, which is right for how much VERTICAL chrome
  // a screen can afford but says nothing about width. A short, wide window —
  // a half-screen laptop at 1043x469 — was being handed the phone treatment
  // and hiding its synergies and items behind a button while 580px of screen
  // sat empty on either side of the board.
  //
  // The board is a fixed-aspect object pinned by HEIGHT here, so width past
  // what the tile needs can never become a bigger board. If the rails fit in
  // width the board was never going to use, they cost it nothing and belong
  // on screen. Below RAILS_INLINE_MIN_W they stay drawers: 288px of rail on a
  // phone is a third of the screen, and the panels would be too cramped to
  // read even though the board would survive it.
  const heightCeil = Math.min(
    COMFORTABLE_TILE,
    Math.max(tileFor(rowsPixelHeight(WINDOWED_ROWS, 1), availH, true), tileFor(contextUnitsH, availH, true)),
  );
  const railWidth = TIERS.medium.leftRail + TIERS.medium.rightRail + gap * 2 + pad * 2;
  const tileIfRailsInline = (Math.max(120, vw - railWidth) - BOARD_CHROME) / FIELD_UNITS.w;
  const promoteRails =
    tier.railsAsDrawers && vw >= RAILS_INLINE_MIN_W && tileIfRailsInline >= heightCeil;

  const railsAsDrawers = tier.railsAsDrawers && !promoteRails;
  const leftRail = promoteRails ? TIERS.medium.leftRail : tier.leftRail;
  const rightRail = promoteRails ? TIERS.medium.rightRail : tier.rightRail;

  // Horizontal: in drawer mode the traits rail costs nothing (it overlays), but
  // the slim player-avatar strip stays in flow on the right.
  const hChrome = railsAsDrawers
    ? rightRail + gap + pad * 2
    : leftRail + rightRail + gap * 2 + pad * 2;
  const availW = Math.max(120, vw - hChrome);
  const fromW = (availW - BOARD_CHROME) / FIELD_UNITS.w;

  // Preferred arrangement, solved for both phases at once so the tile is the
  // same in each and the arena never changes scale mid-match:
  //   planning — ally half + 2 context rows, plus bench slabs on the platform
  //   combat   — the full 8-row field, no bench (the fight view draws none)
  // `withBench` is true for the combat term too. Combat keeps a bench — it is
  // a different component (CombatBench), but it sits in the same column under
  // the field and costs the same height, so solving the fight as if the field
  // had the column to itself overstated the height by a whole bench strip. The
  // arena was then centred in a box one bench shorter than it was sized for,
  // which pushed ~40px of it up over the HUD at every desktop size.
  // PLANNING's own best tile. The eight-row term that used to be in here left
  // when combat got a tile of its own — leaving it meant the fight's needs
  // still set the size of a board the fight does not use, which is the exact
  // thing that was supposed to stop. On a 1920x1080 desktop it was holding the
  // tile at 109px when planning alone affords the 118px ceiling.
  const idealTile = Math.min(
    fromW,
    tileFor(contextUnitsH, availH, true),
  );

  // If that leaves the tokens too small to drag comfortably, reorganize instead
  // of shrinking: window the field while planning. Adaptive rather than keyed
  // to a density tier, so there's no cliff where the board suddenly halves.
  //
  // Decided WITHOUT the fit slack. Those few pixels are a rounding margin, not
  // a reason to rearrange the screen — counting them here pushed a 1280x800
  // laptop from 68.3 to 67.7 against a threshold of 68, which windowed its
  // planning board and took the shop away mid-fight over a third of a pixel.
  // Decided on planning alone, for the same reason: windowing exists to keep
  // the tile you DRAG on comfortable, and combat is solved separately.
  const windowed = Math.min(
    fromW,
    tileFor(contextUnitsH, availH, true, 0),
  ) < COMFORTABLE_TILE;

  const planningRows = windowed ? WINDOWED_ROWS : PLANNING_CONTEXT_ROWS;

  const planTile = tileFor(rowsPixelHeight(planningRows, 1), availH, true);

  // Windowing is a RECOVERY, not a size bonus: it buys back a comfortable tile
  // and stops there. Without this cap a cramped viewport could hand out a larger
  // board than a roomier one — so growing the window would shrink the board.
  const rawTile = windowed
    ? Math.min(fromW, planTile, COMFORTABLE_TILE)
    : Math.min(fromW, idealTile);

  const tileW = clamp(Math.floor(rawTile), MIN_TILE_W, MAX_TILE_W);
  const tileH = Math.round(tileW * TILE_ASPECT);

  const field = fieldPixelSize(tileW, tileH);
  const planningH = rowsPixelHeight(planningRows, tileH);
  // Bench slabs are sized from the solved tile, and their strip is part of the
  // planning arena's height.
  // Derived from the field's actual width so the row can never be wider than
  // the platform. FLOOR, not round: the tile was solved against the exact
  // ratio, so rounding up can push the arena a fraction past the viewport (it
  // did — an iPad Pro overflowed by half a pixel).
  const benchSlabSize = Math.floor((field.w - (BENCH_SLOTS - 1) * BENCH_GAP) / BENCH_SLOTS);
  const benchStripH = benchSlabSize + BENCH_PAD;
  benchH = benchStripH;

  // ── Combat solves its OWN tile ──────────────────────────────────────────
  //
  // The board used to be one size for both phases, which reads better but is
  // only affordable when something gives during the fight. Nothing does now:
  // the shop and the bench both stay up while combat resolves (you can buy and
  // rearrange mid-fight, and a mon bought into a bench you cannot see is just
  // lost). So combat is bidding for the same column as planning while drawing
  // EIGHT rows against planning's four — it cannot have the same tile and fit.
  //
  // Tying planning to combat's constraint made the whole game's board small;
  // the fight shrinking for the few seconds it is on screen costs much less.
  // Capped at the planning tile so the board never GROWS into a fight.
  // Try it with the shop and bench up, paying for the scoreboard too.
  const withBottom = availH - COMBAT_CHROME_H;
  const tileWithBottom = Math.min(fromW, tileFor(fullUnitsH, withBottom, true));
  // Only if that leaves a fight you cannot read does the bottom step aside.
  const combatHidesBottom = tileWithBottom < LEGIBLE_COMBAT_TILE;
  const combatAvail = combatHidesBottom
    ? Math.max(80, vh - (topH + gap + pad * 2)) - COMBAT_CHROME_H
    : withBottom;

  const rawCombatTile = Math.min(fromW, tileFor(fullUnitsH, combatAvail, !combatHidesBottom));
  // MIN_TILE_W is a draggability floor and the combat field is locked — there
  // is nothing to drag on it — so it does not apply. Fitting does.
  const combatTileW = clamp(Math.floor(rawCombatTile), MIN_COMBAT_TILE, tileW);
  const combatTileH = Math.round(combatTileW * TILE_ASPECT);
  const combatField = fieldPixelSize(combatTileW, combatTileH);
  const combatSlab = Math.floor((combatField.w - (BENCH_SLOTS - 1) * BENCH_GAP) / BENCH_SLOTS);

  return {
    density,
    railsAsDrawers,
    viewport: { w: vw, h: vh },
    tile: { w: tileW, h: tileH },
    field,
    boardBox: { w: field.w + BOARD_CHROME, h: field.h + BOARD_CHROME },
    planningRows,
    // Includes the bench strip: during planning the arena IS field + slabs.
    planningBox: { w: field.w + BOARD_CHROME, h: planningH + BOARD_CHROME + benchStripH },
    combat: {
      tile: { w: combatTileW, h: combatTileH },
      field: combatField,
      boardBox: { w: combatField.w + BOARD_CHROME, h: combatField.h + BOARD_CHROME },
      benchSlot: combatSlab,
      benchH: combatSlab + BENCH_PAD,
      hidesBottom: combatHidesBottom,
      chromeH: COMBAT_CHROME_H,
      perspective: Math.round(Math.max(perspective, combatField.w * PERSPECTIVE_RATIO)),
    },
    topH,
    benchSlot: benchSlabSize,
    benchH,
    benchGap: BENCH_GAP,
    shopH,
    leftRail,
    rightRail,
    gap,
    pad,
    font,
    tilt,
    // Scale the camera distance with the board so the rake reads the same on a
    // phone and an ultrawide; the tier value is only a floor.
    perspective: Math.round(Math.max(perspective, field.w * PERSPECTIVE_RATIO)),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Scale a design-pixel chrome value by the layout's font multiplier. */
export function fs(layout: GameLayout, px: number): number {
  return Math.max(8, Math.round(px * layout.font));
}
