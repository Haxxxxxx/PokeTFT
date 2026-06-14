import { ref, update, runTransaction } from "firebase/database";
import { db } from "./firebase";
import { serverNow } from "./serverTime";
import { simulate } from "../engine/combat";
import { makeRng } from "../engine/rng";
import { generateBoard, generateCreepBoard, pickCarouselOptions } from "../engine/enemy";
import { advanceRound, stageBaseDamage, cumulativeRound, roundKind } from "../config";
import { MEGA_STONE } from "../data/mega";
import type { UnitInstance } from "../types";
import type { Room, RoomPlayer, CombatAssign, BotDifficulty } from "./roomStore";

export const PLAN_MS = 30_000;
export const COMBAT_MS = 16_000;
export const CAROUSEL_MS = 22_000;
/** If the host's heartbeat is older than this, any client may claim the host role. */
export const HOST_TIMEOUT = 3_500;

type Updates = Record<string, unknown>;

function gamePath(code: string) {
  return ref(db(), `games/${code}`);
}

/** A bot's board for a round, scaled by stage progress and difficulty. */
function botBoard(stage: number, round: number, difficulty: BotDifficulty | undefined, salt: string): UnitInstance[] {
  const cr = cumulativeRound(stage, round);
  let level = Math.min(2 + Math.floor(cr / 3), 9);
  if (difficulty === "easy") level = Math.max(1, level - 2);
  else if (difficulty === "hard") level = Math.min(9, level + 1);
  const count = Math.min(level, 8);
  let seed = 0;
  for (let i = 0; i < salt.length; i++) seed = (seed * 31 + salt.charCodeAt(i)) >>> 0;
  return generateBoard(level, count, seed + cr);
}

/** Deterministic shuffle for pairings. */
function shuffled<T>(arr: T[], seed: number): T[] {
  const rng = makeRng(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function board(p: RoomPlayer | undefined): UnitInstance[] {
  const b = p?.board;
  const arr = Array.isArray(b) ? b : b ? Object.values(b) : [];
  return (arr as UnitInstance[]).filter((u) => u && u.pos);
}

/** Players still in the game (alive). Disconnected-but-alive players still fight
 *  with their last board — no free dodge. */
function alivePlayers(room: Room): RoomPlayer[] {
  return Object.values(room.players ?? {}).filter((p) => p.alive);
}

/** Host: start the match — reset every player and open round 1 planning. */
export async function beginMatch(code: string, room: Room): Promise<void> {
  const hp = room.rules?.startingHp ?? 100;
  const u: Updates = {
    "meta/phase": "planning",
    "meta/stage": 1,
    "meta/round": 1,
    "meta/deadline": serverNow() + PLAN_MS,
    "meta/hostBeat": serverNow(),
    combat: null,
  };
  for (const p of Object.values(room.players ?? {})) {
    if (!p.connected) continue;
    u[`players/${p.uid}/hp`] = hp;
    u[`players/${p.uid}/level`] = 1;
    u[`players/${p.uid}/alive`] = true;
    u[`players/${p.uid}/place`] = null;
    u[`players/${p.uid}/streak`] = 0;
    u[`players/${p.uid}/board`] = null;
    u[`players/${p.uid}/save`] = null;
  }
  await update(gamePath(code), u);
}

/** RTDB rejects any `undefined` in a write (it accepts `null`). A holey shop
 *  array (`shop[0] === undefined` after a buy) or a missing field would throw,
 *  killing the sync. Round-trip through JSON to coerce every `undefined` to
 *  `null` and drop undefined object props. */
function rtdbSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

/** Client: push my on-board units + economy snapshot so the host can resolve
 *  combat and a refresh can rehydrate. */
export async function syncBoard(code: string, uid: string, units: UnitInstance[], save?: unknown): Promise<void> {
  const onBoard = rtdbSafe(units.filter((un) => un.pos !== null));
  await update(ref(db(), `games/${code}/players/${uid}`), { board: onBoard, ...(save ? { save: rtdbSafe(save) } : {}) });
}

/** Host: write a liveness heartbeat so migration only triggers on a real stall. */
export async function heartbeat(code: string): Promise<void> {
  await update(ref(db(), `games/${code}/meta`), { hostBeat: serverNow() });
}

function assign(combat: Record<string, CombatAssign>, room: Room, aUid: string, bUid: string, stage: number, ghost: boolean) {
  const ba = board(room.players[aUid]);
  const bb = board(room.players[bUid]);
  const r = simulate(ba, bb);
  const draw = r.winner === "draw";
  const aWon = r.winner === "ally";
  const bWon = r.winner === "enemy";
  combat[aUid] = {
    oppUid: bUid,
    oppName: (room.players[bUid]?.name ?? "Rival") + (ghost ? " (ghost)" : ""),
    ghost,
    won: aWon,
    survivors: aWon || draw ? 0 : r.survivors,
    dmg: aWon || draw ? 0 : stageBaseDamage(stage) + r.survivors,
    selfBoard: ba,
    oppBoard: bb,
  };
  if (!ghost) {
    combat[bUid] = {
      oppUid: aUid,
      oppName: room.players[aUid]?.name ?? "Rival",
      ghost: false,
      won: bWon,
      survivors: bWon || draw ? 0 : r.survivors,
      dmg: bWon || draw ? 0 : stageBaseDamage(stage) + r.survivors,
      selfBoard: bb,
      oppBoard: ba,
    };
  }
}

/** Atomically claim a phase transition so exactly ONE client resolves a round,
 *  even if two clients briefly believe they are the host. Returns true if we won. */
async function claimTransition(code: string, fromPhase: string, expectedDeadline: number): Promise<boolean> {
  const res = await runTransaction(ref(db(), `games/${code}/meta`), (m) => {
    if (m && m.phase === fromPhase && (m.deadline ?? 0) === expectedDeadline && serverNow() >= expectedDeadline) {
      m.deadline = serverNow() + 60_000; // lock: park the deadline so no one else claims
      return m;
    }
    return; // abort — already claimed/changed
  });
  return res.committed && (res.snapshot.child("deadline").val() as number) > expectedDeadline + 30_000;
}

/** Host: decide what a planning round opens into (PvP / PvE / carousel). */
export async function resolveRoundStart(code: string, room: Room): Promise<void> {
  if (roundKind(room.meta.stage, room.meta.round) === "carousel") return startCarousel(code, room);
  return startCombat(code, room);
}

/** Host: planning → combat (PvP pairing or PvE creeps). Freezes boards. */
export async function startCombat(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "planning", room.meta.deadline))) return;
  const stage = room.meta.stage;
  const kind = roundKind(stage, room.meta.round);
  const alive = alivePlayers(room);

  // Bots get a fresh host-generated board each round (humans synced their own).
  for (const p of alive) {
    if (p.isBot) room.players[p.uid] = { ...p, board: botBoard(stage, room.meta.round, p.botDifficulty, p.uid) };
  }

  const combat: Record<string, CombatAssign> = {};

  if (kind === "pve") {
    // Everyone fights wild creeps — no HP loss, a breather to build.
    for (const p of alive) {
      const self = board(room.players[p.uid]);
      const creeps = generateCreepBoard(stage, stage * 97 + room.meta.round * 13 + p.uid.length);
      const r = simulate(self, creeps);
      combat[p.uid] = { oppUid: p.uid, oppName: "Wild Pokémon", ghost: true, pve: true, won: r.winner === "ally", survivors: 0, dmg: 0, selfBoard: self, oppBoard: creeps };
    }
  } else {
    const order = shuffled(alive.map((p) => p.uid).sort(), stage * 131 + room.meta.round);
    // Avoid an immediate rematch when there's someone else to swap with.
    for (let i = 0; i + 1 < order.length; i += 2) {
      if (room.players[order[i]]?.lastOpp === order[i + 1] && i + 2 < order.length) {
        [order[i + 1], order[i + 2]] = [order[i + 2], order[i + 1]];
      }
    }
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i];
      if (i + 1 < order.length) assign(combat, room, a, order[i + 1], stage, false);
      else if (order.length > 1) assign(combat, room, a, order[i - 1], stage, true); // odd → ghost
      else combat[a] = { oppUid: a, oppName: "—", ghost: true, won: true, survivors: 0, dmg: 0, selfBoard: board(room.players[a]), oppBoard: [] };
    }
  }

  const u: Updates = { "meta/phase": "combat", "meta/deadline": serverNow() + COMBAT_MS, "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow() };
  for (const uid of Object.keys(combat)) {
    u[`combat/${uid}`] = combat[uid];
    if (!combat[uid].pve && !combat[uid].ghost) u[`players/${uid}/lastOpp`] = combat[uid].oppUid;
  }
  for (const p of alive) if (p.isBot) u[`players/${p.uid}/board`] = room.players[p.uid].board; // persist for replay
  await update(gamePath(code), u);
}

/** Host: planning → carousel. Offers each human a free pick (+ a Mega Stone). */
export async function startCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "planning", room.meta.deadline))) return;
  const carousel: Record<string, string[]> = {};
  for (const p of alivePlayers(room)) {
    if (p.isBot) continue;
    carousel[p.uid] = [MEGA_STONE, ...pickCarouselOptions(room.meta.stage, room.meta.stage * 31 + room.meta.round * 7 + p.uid.length, 4)];
  }
  await update(gamePath(code), {
    "meta/phase": "carousel", "meta/deadline": serverNow() + CAROUSEL_MS,
    "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow(),
    combat: null, carousel,
  });
}

/** Host: carousel → next planning round. */
export async function endCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "carousel", room.meta.deadline))) return;
  const next = advanceRound(room.meta.stage, room.meta.round);
  await update(gamePath(code), {
    "meta/phase": "planning", "meta/stage": next.stage, "meta/round": next.round,
    "meta/deadline": serverNow() + PLAN_MS, "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow(),
    carousel: null,
  });
}

/** Host: combat → next planning (or game over). Applies HP, eliminations, placement. */
export async function endCombat(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "combat", room.meta.deadline))) return;
  const combat = room.combat ?? {};
  const u: Updates = {};
  const aliveUids = alivePlayers(room).map((p) => p.uid);
  const hpAfter: Record<string, number> = {};

  for (const uid of aliveUids) {
    const p = room.players[uid];
    if (!p) continue;
    const c = combat[uid];
    const hp = Math.max(0, p.hp - (c?.dmg ?? 0));
    hpAfter[uid] = hp;
    u[`players/${uid}/hp`] = hp;
    if (c) {
      const s = p.streak ?? 0;
      u[`players/${uid}/streak`] = c.won ? (s >= 0 ? s + 1 : 1) : (s <= 0 ? s - 1 : -1);
    }
  }

  let surviving = aliveUids.filter((uid) => hpAfter[uid] > 0);
  let dead = aliveUids.filter((uid) => hpAfter[uid] <= 0);

  // Everyone died this round (mutual KO): the one with the most pre-damage HP wins.
  if (surviving.length === 0 && dead.length > 0) {
    const winner = [...dead].sort((a, b) => (room.players[b]?.hp ?? 0) - (room.players[a]?.hp ?? 0))[0];
    surviving = [winner];
    dead = dead.filter((uid) => uid !== winner);
    u[`players/${winner}/hp`] = 1;
  }

  for (const uid of dead) {
    u[`players/${uid}/alive`] = false;
    u[`players/${uid}/place`] = surviving.length + 1;
  }

  if (surviving.length <= 1) {
    if (surviving.length === 1) u[`players/${surviving[0]}/place`] = 1;
    u["meta/phase"] = "over";
  } else {
    const next = advanceRound(room.meta.stage, room.meta.round);
    u["meta/phase"] = "planning";
    u["meta/stage"] = next.stage;
    u["meta/round"] = next.round;
    u["meta/deadline"] = serverNow() + PLAN_MS;
    u["combat"] = null;
  }
  u["meta/hostBeat"] = serverNow();
  u["meta/updatedAt"] = serverNow();
  await update(gamePath(code), u);
}

/** Any client: claim the host role if the current host's heartbeat has gone
 *  stale (dropped OR backgrounded tab). Race-free via a transaction on meta. */
export async function maybeClaimHost(code: string, room: Room, myUid: string): Promise<void> {
  const meta = room.meta;
  const beat = meta?.hostBeat ?? 0;
  const host = room.players?.[meta?.hostUid];
  const hostHealthy = host?.connected && serverNow() - beat < HOST_TIMEOUT;
  if (hostHealthy) return;

  // Only the lowest-uid connected player attempts (reduces contention; the
  // transaction is the real guarantee).
  const connected = Object.values(room.players ?? {}).filter((p) => p.connected).map((p) => p.uid).sort();
  if (connected[0] !== myUid) return;

  await runTransaction(ref(db(), `games/${code}/meta`), (m) => {
    if (!m) return m;
    if (serverNow() - (m.hostBeat ?? 0) >= HOST_TIMEOUT || !m.hostUid) {
      m.hostUid = myUid;
      m.hostBeat = serverNow();
    }
    return m;
  });
}
