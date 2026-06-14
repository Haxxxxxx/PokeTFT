/**
 * Hex grid math for the combat battlefield (odd-r offset layout —
 * odd rows are shifted right by half a tile, matching the Board render).
 */

export type Hex = { c: number; r: number };

/** Combined battlefield: 7 columns x 8 rows (player bottom, enemy top). */
export const FIELD = { cols: 7, rows: 8 } as const;

/** Map a player's local board cell (7x4) to the bottom half of the field. */
export function allyToField(c: number, r: number): Hex {
  return { c, r: r + 4 };
}

/** Map an enemy's local board cell to the mirrored top half. */
export function enemyToField(c: number, r: number): Hex {
  return { c: FIELD.cols - 1 - c, r: 3 - r };
}

type Cube = { x: number; y: number; z: number };

function offsetToCube({ c, r }: Hex): Cube {
  const x = c - (r - (r & 1)) / 2;
  const z = r;
  return { x, y: -x - z, z };
}

export function hexDistance(a: Hex, b: Hex): number {
  const ac = offsetToCube(a);
  const bc = offsetToCube(b);
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2;
}

const EVEN_DIRS = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function neighbors({ c, r }: Hex): Hex[] {
  const dirs = r & 1 ? ODD_DIRS : EVEN_DIRS;
  const out: Hex[] = [];
  for (const [dc, dr] of dirs) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc >= 0 && nc < FIELD.cols && nr >= 0 && nr < FIELD.rows) out.push({ c: nc, r: nr });
  }
  return out;
}

/** Pixel center of a hex cell, given tile width/height. */
export function hexToPixel({ c, r }: Hex, tileW: number, tileH: number): { x: number; y: number } {
  const x = c * tileW + (r & 1 ? tileW / 2 : 0) + tileW / 2;
  const y = r * tileH * 0.82 + tileH / 2;
  return { x, y };
}

export function fieldPixelSize(tileW: number, tileH: number): { w: number; h: number } {
  return { w: FIELD.cols * tileW + tileW / 2, h: FIELD.rows * tileH * 0.82 + tileH * 0.2 };
}

export function hexKey({ c, r }: Hex): string {
  return `${c},${r}`;
}
