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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How early to fire the task before the deadline, so the (possibly cold-starting)
 *  function is already warm and ready to commit the transition AT the deadline. */
const WARM_LEAD_MS = 2500;

/** Schedule the next transition, firing ~WARM_LEAD_MS before the deadline (deduped by
 *  the deadline-keyed id). The queue name MUST include the region — `taskQueue("name")`
 *  alone defaults to us-central1 and the europe-west1 queue isn't found → INTERNAL. */
async function scheduleNext(code: string, deadline: number): Promise<void> {
  const queue = getFunctions().taskQueue(`locations/${REGION}/functions/runTransition`);
  const fireAt = Math.max(Date.now() + 100, deadline - WARM_LEAD_MS);
  try {
    await queue.enqueue({ code }, { scheduleTime: new Date(fireAt), id: `${code}-${deadline}` });
  } catch (e: unknown) {
    // ALREADY_EXISTS = this exact transition is already queued (our dedup id) — fine.
    const msg = String((e as { message?: string })?.message ?? e);
    if (msg.includes("ALREADY_EXISTS") || msg.includes("already-exists")) return;
    throw e;
  }
}

/** Fires at a phase deadline: run the transition, then schedule the next. */
export const runTransition = onTaskDispatched(
  { region: REGION, retryConfig: { maxAttempts: 3, minBackoffSeconds: 1 }, rateLimits: { maxConcurrentDispatches: 50 } },
  async (req) => {
    const code = String(req.data?.code ?? "");
    if (!code) return;
    let room = await freshRoom(code);
    if (!room?.meta || !room.meta.serverDriven || room.meta.phase === "over") return; // not ours / finished

    // We fired ~WARM_LEAD_MS early to absorb cold-start. Wait out whatever's left so the
    // transition commits right at the deadline (the timer reaches 0 cleanly), then re-read.
    const wait = room.meta.deadline - Date.now();
    if (wait > 0) {
      await sleep(Math.min(wait, WARM_LEAD_MS + 1500));
      room = await freshRoom(code);
      if (!room?.meta || !room.meta.serverDriven || room.meta.phase === "over") return;
    }

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

/** Client calls this when every alive player has already picked their carousel reward,
 *  to end the round early instead of waiting out the timer. Brings the deadline to now
 *  and fires the transition immediately. */
export const finishEarly = onCall({ region: REGION }, async (req) => {
  const code = String(req.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "code required");
  const room = await freshRoom(code);
  if (!room?.meta?.serverDriven || room.meta.phase !== "carousel") return { ok: false };
  const now = Date.now();
  await adb.ref(`games/${code}/meta`).update({ deadline: now });
  await scheduleNext(code, now); // fireAt clamps to now+100 → resolves right away
  return { ok: true };
});
