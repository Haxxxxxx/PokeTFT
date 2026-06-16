/**
 * PokéTFT authoritative game loop — #110 Phase 2 (Cloud Functions + Cloud Tasks).
 *
 * Instead of a 24/7 process polling deadlines, each phase transition is SCHEDULED as a
 * Cloud Task for the exact moment its deadline elapses. The task runs the SAME
 * `match.ts` transition the client host uses (via a firebase-admin DbAdapter), then
 * schedules the next one — a self-perpetuating loop with no always-on instance.
 *
 * Only games with `meta.serverDriven === true` are driven here; the client stops
 * hosting those (so a game runs even with zero players connected). Reversible by
 * clearing the flag. RTDB stays the store/transport — this is just the authoritative
 * writer.
 *
 * Build: esbuild bundles match.ts + the engine + the (unused-at-runtime) web SDK into
 * one file; firebase-admin/functions stay external (provided by the runtime).
 */
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFunctions } from "firebase-admin/functions";
import { logger } from "firebase-functions/v2";

import { setDbAdapter } from "../../src/game/net/db-adapter";
import { resolveRoundStart, endCombat, endCarousel } from "../../src/game/net/match";
import type { Room } from "../../src/game/net/roomStore";

initializeApp();
const adb = getDatabase();
const REGION = "europe-west1"; // match your Cloud Run/Functions region

// ── Route match.ts's DB access to firebase-admin (the Phase-0 adapter seam). ──
setDbAdapter({
  async get(path) {
    const s = await adb.ref(path).get();
    return s.exists() ? s.val() : null;
  },
  async update(path, value) {
    await adb.ref(path).update(value);
  },
  async transaction(path, fn) {
    const res = await adb.ref(path).transaction((cur) => fn(cur) as unknown);
    return { committed: res.committed, value: res.snapshot.exists() ? res.snapshot.val() : null };
  },
});

async function freshRoom(code: string): Promise<Room | null> {
  const s = await adb.ref(`games/${code}`).get();
  return s.exists() ? ({ ...(s.val() as Room), code }) : null;
}

/** Schedule the next transition for `code` at its current deadline (deduped by id). */
async function scheduleNext(code: string, deadline: number): Promise<void> {
  const queue = getFunctions().taskQueue("runTransition");
  await queue.enqueue({ code }, { scheduleTime: new Date(deadline), id: `${code}-${deadline}` });
}

/** Fires at a phase deadline: run the transition, then schedule the next. */
export const runTransition = onTaskDispatched(
  { region: REGION, retryConfig: { maxAttempts: 3, minBackoffSeconds: 1 }, rateLimits: { maxConcurrentDispatches: 50 } },
  async (req) => {
    const code = String(req.data?.code ?? "");
    if (!code) return;
    let room = await freshRoom(code);
    if (!room?.meta || !room.meta.serverDriven || room.meta.phase === "over") return; // not ours / finished

    const phase = room.meta.phase;
    try {
      if (phase === "planning") await resolveRoundStart(code, room);
      else if (phase === "combat") await endCombat(code, room);
      else if (phase === "carousel") await endCarousel(code, room);
      else return;
    } catch (e) {
      logger.error(`runTransition ${code} (${phase}) failed`, e);
      throw e; // let Cloud Tasks retry
    }

    // Chain the next transition at the new deadline.
    room = await freshRoom(code);
    if (room?.meta && room.meta.serverDriven && room.meta.phase !== "over") {
      await scheduleNext(code, room.meta.deadline);
    }
  },
);

/** Client calls this once after starting a server-driven match to bootstrap the loop. */
export const kickoff = onCall({ region: REGION }, async (req) => {
  const code = String(req.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "code required");
  const room = await freshRoom(code);
  if (!room?.meta?.serverDriven) throw new HttpsError("failed-precondition", "game is not server-driven");
  await scheduleNext(code, room.meta.deadline);
  return { ok: true };
});
