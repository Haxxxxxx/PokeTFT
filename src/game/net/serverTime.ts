import { ref, onValue } from "firebase/database";
import { db } from "./firebase";

/**
 * Tracks the offset between this client's clock and the Firebase server clock,
 * so every client can agree on "now". This is what aligns the round timer
 * across players on different machines/networks.
 */
let offset = 0;
let started = false;

export function startServerTime(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  onValue(ref(db(), ".info/serverTimeOffset"), (snap) => {
    offset = (snap.val() as number) ?? 0;
  });
}

/** Server-aligned current time in ms. */
export function serverNow(): number {
  return Date.now() + offset;
}
