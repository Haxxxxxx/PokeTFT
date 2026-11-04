/**
 * World-space geometry for the 3D arena spike.
 *
 * Reuses the SAME hex math as the DOM board (`src/game/engine/hex.ts`) so the
 * two renderers can never disagree about where a cell is. The only new thing
 * here is the mapping from the engine's 2D pixel space into three.js world
 * units, and the inverse — turning a pointer hit on the ground plane back into
 * a cell, which is what makes drag cheap (no per-tile raycast).
 */

import { FIELD, ALLY_ROW0, hexToPixel, fieldPixelSize, ROW_STEP } from "@/game/engine/hex";

/** One hex's circumradius in world units. Everything else derives from this. */
export const HEX_R = 0.5;

/** Pointy-top hex: width = sqrt(3)*R, vertical row step = 1.5*R. */
export const HEX_W = Math.sqrt(3) * HEX_R;
export const HEX_H = 2 * HEX_R;

/** Tile "pixel" size that makes the engine's math line up with our world units. */
const TILE_W = HEX_W;
const TILE_H = HEX_H / ROW_STEP / (1 / ROW_STEP); // == HEX_H; kept explicit for clarity

/** Field extent in world units, so the board can be centred on the origin. */
export const FIELD_SIZE = fieldPixelSize(TILE_W, HEX_H);

/** Centre of cell (c, r) in world space. Y is up; the board lies on XZ. */
export function cellToWorld(c: number, r: number): [number, number, number] {
  const { x, y } = hexToPixel({ c, r }, TILE_W, HEX_H);
  return [x - FIELD_SIZE.w / 2, 0, y - FIELD_SIZE.h / 2];
}

/**
 * Inverse of `cellToWorld`: nearest cell to a world-space point on the ground.
 *
 * Drag uses this instead of raycasting every tile. One raycast against a single
 * invisible ground plane gives a point; this turns that point into a cell in
 * constant time. With 56 cells the difference is academic, but it also means
 * the tile meshes can be a single instanced draw call with no per-tile event
 * handlers — which is the part that actually matters for frame time.
 */
export function worldToCell(wx: number, wz: number): { c: number; r: number } | null {
  const py = wz + FIELD_SIZE.h / 2;
  const r = Math.round((py - HEX_H / 2) / (HEX_H * ROW_STEP));
  const rc = Math.max(0, Math.min(FIELD.rows - 1, r));
  const px = wx + FIELD_SIZE.w / 2;
  const c = Math.round((px - TILE_W / 2 - (rc & 1 ? TILE_W / 2 : 0)) / TILE_W);
  const cc = Math.max(0, Math.min(FIELD.cols - 1, c));

  // Reject points that landed outside the field rather than clamping silently,
  // so a drop off the board reads as "not on a cell" instead of snapping to an
  // edge tile the player never aimed at.
  const [bx, , bz] = cellToWorld(cc, rc);
  if (Math.hypot(wx - bx, wz - bz) > HEX_R * 1.25) return null;
  return { c: cc, r: rc };
}

/** Rows the local player owns — the bottom half, same as the DOM board. */
export function isAllyRow(r: number): boolean {
  return r >= ALLY_ROW0;
}

export { FIELD, ALLY_ROW0, TILE_W, TILE_H };
