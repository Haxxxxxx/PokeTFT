/** Double Up co-op transfers (Phase 2). A teammate can hand gold or a bench unit to their
 *  partner. Economy is PRIVATE per-uid (priv/{code}/{uid}, self-write only), so a transfer
 *  can't be written straight into the partner's econ. Instead the sender posts a pending
 *  transfer to a shared, team-gated mailbox the RECIPIENT reads, applies to their own econ,
 *  and deletes:
 *
 *    games/{code}/transfers/{toUid}/{pushId} = { kind:"gold"|"unit", from, gold?, unit? }
 *
 *  RTDB rules gate writes to same-team senders (and let the recipient clear their own box),
 *  so nobody can inject gold/units into a stranger's game. */
import { ref, push, remove, onChildAdded, off } from "firebase/database";
import { db } from "./firebase";
import type { UnitInstance } from "../types";

export type CoopTransfer =
  | { kind: "gold"; from: string; gold: number }
  | { kind: "unit"; from: string; unit: { defId: string; star: number; items: string[] } };

const boxRef = (code: string, toUid: string) => ref(db(), `games/${code}/transfers/${toUid}`);

/** Send gold to a partner (the caller has already deducted it from their own econ). */
export async function sendGold(code: string, toUid: string, fromUid: string, gold: number): Promise<void> {
  if (!(gold > 0)) return;
  await push(boxRef(code, toUid), { kind: "gold", from: fromUid, gold: Math.round(gold) });
}

/** Send a bench unit to a partner (the caller has already removed it from their own bench). */
export async function sendUnit(code: string, toUid: string, fromUid: string, unit: { defId: string; star: number; items: string[] }): Promise<void> {
  await push(boxRef(code, toUid), {
    kind: "unit", from: fromUid,
    unit: { defId: unit.defId, star: unit.star, items: Array.isArray(unit.items) ? unit.items : [] },
  });
}

/** Subscribe to transfers addressed to me. `onTransfer` receives each one once; the caller
 *  applies it then we delete it (at-least-once: applying must tolerate a rare double-fire,
 *  but child_added per push id won't re-fire for the same id). Returns an unsubscribe fn. */
export function subscribeTransfers(code: string, myUid: string, onTransfer: (t: CoopTransfer) => void): () => void {
  const r = boxRef(code, myUid);
  const handler = onChildAdded(r, (snap) => {
    const val = snap.val() as CoopTransfer | null;
    if (val && (val.kind === "gold" || val.kind === "unit")) {
      try { onTransfer(val); } finally { remove(snap.ref).catch(() => {}); }
    } else {
      remove(snap.ref).catch(() => {}); // malformed → drop it
    }
  });
  return () => off(r, "child_added", handler);
}

/** Coerce a (possibly RTDB-mangled) bench unit into a portable transfer snapshot. */
export function toTransferUnit(u: UnitInstance): { defId: string; star: number; items: string[] } {
  return { defId: u.defId, star: u.star, items: Array.isArray(u.items) ? u.items : [] };
}
