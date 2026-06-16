/**
 * Client → dedicated server bridge (#110 Phase 2). Calls the `kickoff` callable to
 * bootstrap the server-driven transition loop after a match starts. Client-only — the
 * Functions bundle never imports this.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";

/** Tell the server to start driving this game (no-op/logged on failure so a missing
 *  deployment never blocks the match — the host-loop only steps down once serverDriven). */
export async function kickoffServerGame(code: string): Promise<void> {
  try {
    db(); // ensure the default Firebase app is initialised
    const fns = getFunctions(undefined, "europe-west1");
    await httpsCallable(fns, "kickoff")({ code });
  } catch (e) {
    console.error("[kickoff] server-driven start failed", e);
  }
}

/** Ask the server to end the current carousel early (everyone already picked). */
export async function finishCarouselEarly(code: string): Promise<void> {
  try {
    db();
    const fns = getFunctions(undefined, "europe-west1");
    await httpsCallable(fns, "finishEarly")({ code });
  } catch (e) {
    console.error("[finishEarly]", e);
  }
}
