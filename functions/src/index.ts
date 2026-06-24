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
import { resolveRoundStart, endCombat, endCarousel, concede as eliminatePlayer, applyRatingFor } from "../../src/game/net/match";
import type { Room } from "../../src/game/net/roomStore";
import { generatePlayerLikeBoard } from "../../src/game/engine/enemy";
import { simulate } from "../../src/game/engine/combat";
import { accrueBatch, metaWeights, activeTraitKeys, type CompStats } from "../../src/game/engine/botBrain";
import { MODES, rosterForRoom, modeTeamBuff, modeLootScale } from "../../src/game/data/gameModes";

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
  if (!req.auth) throw new HttpsError("unauthenticated", "sign in required");
  const code = String(req.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "code required");
  const room = await freshRoom(code);
  if (!room?.meta?.serverDriven) throw new HttpsError("failed-precondition", "game is not server-driven");
  // Only a real participant may bootstrap the loop — a stranger guessing the code can't.
  const p = room.players?.[req.auth.uid];
  if (!p || p.isBot) throw new HttpsError("permission-denied", "not a player in this game");
  await scheduleNext(code, room.meta.deadline);
  return { ok: true };
});

/** Client calls this when every alive player has already picked their carousel reward,
 *  to end the round early instead of waiting out the timer. Brings the deadline to now
 *  and fires the transition immediately. */
export const finishEarly = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "sign in required");
  const code = String(req.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "code required");
  const room = await freshRoom(code);
  if (!room?.meta?.serverDriven || room.meta.phase !== "carousel") return { ok: false };
  // Only a real participant may cut the carousel short — not a stranger who guessed the code.
  const p = room.players?.[req.auth.uid];
  if (!p || p.isBot) throw new HttpsError("permission-denied", "not a player in this game");
  const now = Date.now();
  await adb.ref(`games/${code}/meta`).update({ deadline: now });
  await scheduleNext(code, now); // fireAt clamps to now+100 → resolves right away
  return { ok: true };
});

/** Forfeit: the authenticated caller surrenders at the worst currently-alive placement.
 *  The server picks the place, writes the elimination, and applies LP — the client can no
 *  longer choose its own placement or manipulate rating by picking a favourable spot. */
export const concede = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "sign in required");
  const code = String(req.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "code required");
  const uid = req.auth.uid;
  const room = await freshRoom(code);
  if (!room) throw new HttpsError("not-found", "game not found");
  const p = room.players?.[uid];
  if (!p || p.isBot) throw new HttpsError("permission-denied", "not a player in this game");
  if (!p.alive) return { ok: true }; // already eliminated — idempotent no-op
  const place = Object.values(room.players ?? {}).filter((q) => q.alive).length;
  await eliminatePlayer(code, uid, place);
  await applyRatingFor(code, room, uid, place).catch(() => {});
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
      // Before deleting an abandoned in-progress game, apply ratings for any human
      // who never got their result (closed the tab / app instead of using Concede).
      // This preserves their match history even when they skip the normal exit flow.
      if (meta?.phase && meta.phase !== "over" && meta.phase !== "lobby") {
        const room = await freshRoom(code);
        if (room) {
          const rated = ((await adb.ref(`games/${code}/rated`).get()).val() ?? {}) as Record<string, boolean>;
          const unrated = Object.values(room.players ?? {})
            .filter((p) => !p.uid.startsWith("bot-") && !rated[p.uid])
            .sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || (b.hp ?? 0) - (a.hp ?? 0));
          await Promise.all(
            unrated.map((p, i) => applyRatingFor(code, room, p.uid, i + 1).catch(() => {})),
          );
        }
      }
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

// ── Scheduled brain re-train ─────────────────────────────────────────────────
/**
 * Nightly self-play that keeps the per-mode bot meta fresh — re-deriving what wins after
 * balance changes and warming low-traffic modes that real games rarely touch. It ACCRUES
 * into the live store with a small weight (accrueBatch), so it gently anchors the meta
 * toward simulation truth WITHOUT swamping real-game learning (which carries full weight).
 *
 * Bounded to stay well inside the function timeout: ~120 lobbies × 14 modes × 28 fights.
 * Mirrors the live draft (per-mode roster + meta + Mega Madness preferMega + Treasure loot +
 * region modifier buff), so the outcomes it credits match how bots actually play each mode.
 */
const RETRAIN_LOBBIES = 120;
const RETRAIN_FLEET = 8;
const RETRAIN_STAGES = [4, 5, 6, 6];
const RETRAIN_WEIGHT = 0.1; // self-play counts ~1/10th of a real game per sample

export const retrainBrain = onSchedule(
  { region: REGION, schedule: "every 24 hours", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const base = Date.now() >>> 0; // run-to-run seed variety (fresh lobbies each night)
    let modesDone = 0, lobbiesRun = 0;
    for (const mode of MODES) {
      const metaPath = `meta_learn/byMode/${mode.id}/comp`;
      const cur = ((await adb.ref(metaPath).get()).val() as CompStats | null) ?? {};
      const weights = metaWeights(cur);                  // on-policy: draft with the live meta
      const baseRules = { mode: mode.id, ...(mode.rulesPatch ?? {}) };
      const preferMega = !!mode.flags?.megaMadness;
      const itemBudgetMult = modeLootScale(baseRules);
      const buff = modeTeamBuff(baseRules);
      const outcomes: { types: string[]; place: number; total: number }[] = [];
      for (let g = 0; g < RETRAIN_LOBBIES; g++) {
        const stage = RETRAIN_STAGES[g % RETRAIN_STAGES.length];
        const roster = rosterForRoom(baseRules, (base + g * 2654435761) >>> 0);
        if (!roster.length) break;
        const boards = [];
        for (let f = 0; f < RETRAIN_FLEET; f++) {
          const seed = (base ^ (g * 7919 + f * 104729 + 1)) >>> 0;
          boards.push(generatePlayerLikeBoard(stage, 5, "ultimate", seed, roster, undefined, undefined, { metaWeights: weights, preferMega, itemBudgetMult }));
        }
        const valid = boards.filter((b) => b.length);
        if (valid.length < 2) continue;
        const wins = valid.map(() => 0), surv = valid.map(() => 0);
        for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) {
          const r = simulate(valid[i], valid[j], buff, buff);
          if (r.winner === "ally") { wins[i]++; surv[i] += r.survivors ?? 0; }
          else if (r.winner === "enemy") { wins[j]++; surv[j] += r.survivors ?? 0; }
        }
        const order = valid.map((_, i) => i).sort((a, b) => (wins[b] - wins[a]) || (surv[b] - surv[a]));
        const place: number[] = new Array(valid.length);
        order.forEach((idx, rank) => { place[idx] = rank + 1; });
        for (let f = 0; f < valid.length; f++) {
          const types = activeTraitKeys(valid[f]);
          if (types.length) outcomes.push({ types, place: place[f], total: valid.length });
        }
        lobbiesRun++;
      }
      // Transaction-merge: re-reads the LATEST store (incl. real-game writes since we began) and
      // folds our self-play evidence on top, so nothing concurrent is lost.
      await adb.ref(metaPath).transaction((prev: CompStats | null) => accrueBatch(prev, outcomes, RETRAIN_WEIGHT));
      modesDone++;
    }
    logger.info(`retrainBrain: ${modesDone} modes, ${lobbiesRun} self-play lobbies accrued (weight ${RETRAIN_WEIGHT})`);
  },
);
