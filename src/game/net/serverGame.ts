/**
 * Client → dedicated server bridge (#110 Phase 2). Calls the `kickoff` callable to
 * bootstrap the server-driven transition loop after a match starts. Client-only — the
 * Functions bundle never imports this.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";

/** Tell the server to start driving this game (no-op/logged on failure so a missing
 *  deployment never blocks the match — the host-loop only steps down once serverDriven).
 *  Retries a few times because this is the ONE call that bootstraps the whole server
 *  chain: a cold-starting Function can reject the first hit, and if the kickoff never
 *  lands the game falls back to the slower client host-loop for every round. */
export async function kickoffServerGame(code: string): Promise<void> {
  db(); // ensure the default Firebase app is initialised
  const fns = getFunctions(undefined, "europe-west1");
  const call = httpsCallable(fns, "kickoff");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await call({ code });
      return;
    } catch (e) {
      console.error(`[kickoff] attempt ${attempt + 1} failed`, e);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
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
