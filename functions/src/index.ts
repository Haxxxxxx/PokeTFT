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
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFunctions } from "firebase-admin/functions";
import { getAuth } from "firebase-admin/auth";
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
    // The deterministic task id (`code-deadline`) is intentional dedup: if a task with that id
    // already exists, this exact transition is ALREADY queued — so swallow it and return.
    // The Admin SDK surfaces this as code `functions/task-already-exists` with the message
    // "A task with ID ... already exists" (note: a SPACE, not a hyphen). The old check only
    // matched "ALREADY_EXISTS"/"already-exists", so it never caught the real error → every
    // collision re-threw → Cloud Tasks RETRIED the whole transition, churning the round loop
    // and freezing/booting games right at the first timer. Match all spellings, case-insensitive.
    const err = e as { message?: string; code?: string; errorInfo?: { code?: string } };
    const blob = `${err?.errorInfo?.code ?? ""} ${err?.code ?? ""} ${err?.message ?? e}`.toLowerCase();
    if (blob.includes("already exists") || blob.includes("already-exists") || blob.includes("already_exists")) return;
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

/**
 * Scheduled cleanup — prunes RTDB cruft so it doesn't accumulate forever. Runs every 30
 * minutes. Deliberately CONSERVATIVE: it only removes things that are clearly done or
 * long-abandoned, never anything that could be an in-progress game or an active player.
 *
 *  - Games: finished ("over") for >30 min, OR not updated in >3h (stuck/abandoned), OR a
 *    fragment node with no meta. Their /lobbies + /priv siblings go too.
 *  - Lobbies: any /lobbies entry whose game no longer exists.
 *  - Guests: anonymous "Guest-*" profiles older than 3 days that are offline and have NO
 *    history and NO friends (one-session throwaways). Removes the /users node, the
 *    /usernames claim, and best-effort the orphaned anonymous Auth record.
 */
const OVER_AGE_MS = 30 * 60_000;
const IDLE_AGE_MS = 3 * 60 * 60_000;
const GUEST_AGE_MS = 3 * 24 * 60 * 60_000;

export const pruneStale = onSchedule({ region: REGION, schedule: "every 30 minutes" }, async () => {
  const now = Date.now();
  const updates: Record<string, null> = {};

  // ── Stale games (+ their lobby/priv siblings) ──
  const games = (await adb.ref("games").get()).val() as Record<string, { meta?: { phase?: string; updatedAt?: number } }> | null;
  let prunedGames = 0;
  for (const [code, g] of Object.entries(games ?? {})) {
    const meta = g?.meta;
    const updatedAt = typeof meta?.updatedAt === "number" ? meta.updatedAt : 0;
    const stale = !meta
      || (meta.phase === "over" && now - updatedAt > OVER_AGE_MS)
      || (now - updatedAt > IDLE_AGE_MS);
    if (stale) {
      updates[`games/${code}`] = null;
      updates[`lobbies/${code}`] = null;
      updates[`priv/${code}`] = null;
      prunedGames++;
    }
  }

  // ── Orphaned lobby entries (game already gone) ──
  const lobbies = (await adb.ref("lobbies").get()).val() as Record<string, unknown> | null;
  for (const code of Object.keys(lobbies ?? {})) {
    if (!games?.[code]) updates[`lobbies/${code}`] = null;
  }

  // ── Abandoned guest profiles ──
  const users = (await adb.ref("users").get()).val() as Record<string, { usernameLower?: string; createdAt?: number; online?: boolean; history?: unknown; friends?: unknown }> | null;
  const guestUids: string[] = [];
  for (const [uid, u] of Object.entries(users ?? {})) {
    const isGuest = typeof u?.usernameLower === "string" && u.usernameLower.startsWith("guest-");
    const old = typeof u?.createdAt === "number" && now - u.createdAt > GUEST_AGE_MS;
    const empty = !u?.history && !u?.friends && u?.online !== true;
    if (isGuest && old && empty) {
      updates[`users/${uid}`] = null;
      if (u.usernameLower) updates[`usernames/${u.usernameLower}`] = null;
      guestUids.push(uid);
    }
  }

  if (Object.keys(updates).length) await adb.ref().update(updates);

  // Best-effort: delete the orphaned anonymous Auth records for swept guests (rate-limited,
  // so cap per run; the rest get caught on the next tick).
  let prunedAuth = 0;
  for (const uid of guestUids.slice(0, 50)) {
    try { await getAuth().deleteUser(uid); prunedAuth++; } catch { /* already gone / not anon */ }
  }

  logger.info(`pruneStale: removed ${prunedGames} games, ${guestUids.length} guest profiles (${prunedAuth} auth)`);
});
