/** "Clone" bot support — a bot that replays YOUR last game's boards, round by round.
 *
 *  After a game, the client saves a compact per-round snapshot of its own boards to
 *  users/{uid}/ghost. When a host adds a Clone bot, beginMatch copies the host's ghost into
 *  games/{code}/ghost so the authoritative loop (host client AND Cloud Functions) can field
 *  the clone's board for the matching cumulative round. Pure data + deterministic lookup. */
import { ref, get, set } from "firebase/database";
import { db } from "./firebase";
import type { UnitInstance } from "../types";

/** One unit in a snapshot, compacted: defId, star, col, row, items. */
export type GhostUnit = { d: string; s: number; c: number; r: number; i?: string[] };
/** Per-cumulative-round board snapshots from a finished game. */
export type GhostData = { ts: number; gens?: number[]; snaps: Record<number, GhostUnit[]> };

const MAX_SNAPS = 40; // a full game is ~30-40 cumulative rounds

export function serializeBoard(units: UnitInstance[]): GhostUnit[] {
  return units
    .filter((u) => u.pos)
    .map((u) => ({ d: u.defId, s: u.star, c: u.pos![0], r: u.pos![1], i: Array.isArray(u.items) && u.items.length ? u.items : undefined }));
}

/** Save this game's per-round snapshots as the player's ghost (overwrites the previous one). */
export async function saveGhost(uid: string, snaps: Record<number, GhostUnit[]>, gens?: number[]): Promise<void> {
  const entries = Object.entries(snaps).slice(-MAX_SNAPS);
  if (!entries.length) return;
  await set(ref(db(), `users/${uid}/ghost`), { ts: Date.now(), gens: gens ?? null, snaps: Object.fromEntries(entries) }).catch(() => {});
}

/** Read a player's saved ghost (for the host to seed a Clone bot at match start). */
export async function loadGhost(uid: string): Promise<GhostData | null> {
  const snap = await get(ref(db(), `users/${uid}/ghost`)).catch(() => null);
  return snap && snap.exists() ? (snap.val() as GhostData) : null;
}

/** Pick the ghost board for a cumulative round: the snapshot at `cr`, else the nearest
 *  EARLIER one (so early rounds field an early board, late rounds the developed one), else
 *  the earliest available. Returns UnitInstances ready for the sim, or null if no ghost. */
export function ghostBoardForRound(ghost: GhostData | null | undefined, cr: number): UnitInstance[] | null {
  if (!ghost?.snaps) return null;
  const keys = Object.keys(ghost.snaps).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!keys.length) return null;
  let pick = keys[0];
  for (const k of keys) { if (k <= cr) pick = k; else break; }
  const board = ghost.snaps[pick] ?? ghost.snaps[String(pick) as unknown as number];
  if (!board || !board.length) return null;
  return board.map((g, i) => ({
    iid: `clone${cr}_${i}`,
    defId: g.d,
    star: (g.s === 2 || g.s === 3 ? g.s : 1) as UnitInstance["star"],
    pos: [g.c, g.r] as [number, number],
    items: Array.isArray(g.i) ? g.i : [],
  }));
}
