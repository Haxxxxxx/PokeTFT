import { ref, get, update, runTransaction } from "firebase/database";
import { db } from "./firebase";
import { serverNow } from "./serverTime";
import { simulate } from "../engine/combat";
import { makeRng } from "../engine/rng";
import { generatePlayerLikeBoard, generateCreepBoard, pickCarouselOptions } from "../engine/enemy";
import { unitsForGenerations } from "../data/mons";
import { advanceRound, stageBaseDamage, cumulativeRound, roundKind } from "../config";
import { MEGA_STONE } from "../data/mega";
import { COMPONENT_IDS } from "../data/items";
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

/** FNV-1a string hash → 32-bit uint. Used to fold stable identifiers (game code,
 *  uid) into deterministic-but-varied seeds. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The roster (unit ids) the room's selected generations allow — so AI/creeps/
 *  carousel only ever use the same mons the players can roll. */
function rosterFor(room: Room): string[] {
  return unitsForGenerations(room.rules?.generations ?? [1]);
}

/** A bot's board for a round, scaled by stage progress and difficulty. */
function botBoard(stage: number, round: number, difficulty: BotDifficulty | undefined, salt: string, allowed: string[]): UnitInstance[] {
  const cr = cumulativeRound(stage, round);
  let seed = 0;
  for (let i = 0; i < salt.length; i++) seed = (seed * 31 + salt.charCodeAt(i)) >>> 0;
  // Economy-realistic: a board a real player could actually build at this round.
  return generatePlayerLikeBoard(stage, round, difficulty, seed + cr, allowed);
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
    u[`players/${p.uid}/carouselPicked`] = null;
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
  // The boards are written into the combat node, so they must be RTDB-safe:
  // a single unit with an undefined field (e.g. items) would make the whole
  // combat update() reject → clients stuck on the planning board / desync.
  const sa = rtdbSafe(ba);
  const sb = rtdbSafe(bb);
  combat[aUid] = {
    oppUid: bUid,
    oppName: (room.players[bUid]?.name ?? "Rival") + (ghost ? " (ghost)" : ""),
    ghost,
    won: aWon,
    survivors: aWon || draw ? 0 : r.survivors,
    dmg: aWon || draw ? 0 : stageBaseDamage(stage) + r.survivors,
    selfBoard: sa,
    oppBoard: sb,
  };
  if (!ghost) {
    combat[bUid] = {
      oppUid: aUid,
      oppName: room.players[aUid]?.name ?? "Rival",
      ghost: false,
      won: bWon,
      survivors: bWon || draw ? 0 : r.survivors,
      dmg: bWon || draw ? 0 : stageBaseDamage(stage) + r.survivors,
      selfBoard: sb,
      oppBoard: sa,
      // B is the "enemy" side of the canonical simulate(ba, bb): B replays the
      // exact same call and mirrors the view, so both screens share one outcome.
      flip: true,
    };
  }
}

/** Re-read the authoritative room from RTDB. After a host migration the caller's
 *  React snapshot can be stale (wrong HP, missing combat), so resolution should
 *  compute from a fresh read, not the passed-in `room`. */
async function freshRoom(code: string): Promise<Room | null> {
  try {
    const snap = await get(gamePath(code));
    return snap.exists() ? (snap.val() as Room) : null;
  } catch {
    return null;
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

/** Build the (deterministic) combat assignments + bot-board persistence for the
 *  current round. Factored out of startCombat so endCombat can re-resolve a round
 *  if it ever finds an empty/missing combat map (e.g. after a host migration),
 *  rather than silently applying zero damage. Same room + stage/round always
 *  yields the same pairings and outcomes. */
function buildCombat(room: Room): { combat: Record<string, CombatAssign>; botBoards: Record<string, UnitInstance[]> } {
  const stage = room.meta.stage;
  const kind = roundKind(stage, room.meta.round);
  const alive = alivePlayers(room);
  const allowed = rosterFor(room);
  const botBoards: Record<string, UnitInstance[]> = {};

  // Bots get a deterministic host-generated board each round (humans synced theirs).
  for (const p of alive) {
    if (p.isBot) {
      const b = botBoard(stage, room.meta.round, p.botDifficulty, p.uid, allowed);
      room.players[p.uid] = { ...p, board: b };
      botBoards[p.uid] = b;
    }
  }

  const combat: Record<string, CombatAssign> = {};
  if (kind === "pve") {
    // Everyone fights wild creeps — no HP loss, a breather to build.
    for (const p of alive) {
      const self = board(room.players[p.uid]);
      const creeps = generateCreepBoard(stage, room.meta.round, stage * 97 + room.meta.round * 13 + p.uid.length, allowed);
      const r = simulate(self, creeps);
      combat[p.uid] = { oppUid: p.uid, oppName: "Wild Pokémon", ghost: true, pve: true, won: r.winner === "ally", survivors: 0, dmg: 0, selfBoard: rtdbSafe(self), oppBoard: rtdbSafe(creeps) };
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
      else combat[a] = { oppUid: a, oppName: "—", ghost: true, won: true, survivors: 0, dmg: 0, selfBoard: rtdbSafe(board(room.players[a])), oppBoard: [] };
    }
  }
  return { combat, botBoards };
}

/** Host: planning → combat (PvP pairing or PvE creeps). Freezes boards. */
export async function startCombat(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "planning", room.meta.deadline))) return;
  room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
  const { combat, botBoards } = buildCombat(room);

  const u: Updates = { "meta/phase": "combat", "meta/deadline": serverNow() + COMBAT_MS, "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow() };
  for (const uid of Object.keys(combat)) {
    u[`combat/${uid}`] = combat[uid];
    if (!combat[uid].pve && !combat[uid].ghost) u[`players/${uid}/lastOpp`] = combat[uid].oppUid;
  }
  for (const uid of Object.keys(botBoards)) u[`players/${uid}/board`] = botBoards[uid]; // persist for replay
  await update(gamePath(code), u);
}

/** Host: planning → carousel. Offers each human a free pick (a held item + units). */
export async function startCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "planning", room.meta.deadline))) return;
  room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
  // Item rewards: a Mega Stone plus item components players combine into the
  // completed items the lobby enabled. Offering components (not finished items)
  // is what makes the carousel a build-toward-a-recipe decision.
  const itemPool = [MEGA_STONE, ...COMPONENT_IDS];
  const carousel: Record<string, string[]> = {};
  // Per-GAME entropy: the room code is unique to each match, so folding it in
  // makes carousels differ from game to game (they used to seed only on
  // stage/round/uid.length, which is identical across every game). The host
  // writes this once, so it just needs to vary — not be client-reproducible.
  const gameSeed = hashStr(code);
  for (const p of alivePlayers(room)) {
    if (p.isBot) continue;
    const salt = (gameSeed ^ hashStr(p.uid) ^ Math.imul(room.meta.stage * 31 + room.meta.round * 7 + 1, 2654435761)) >>> 0;
    // Rotate which item is offered per player/round so it varies but stays sync-free (host-written).
    const item = itemPool[(salt >>> 3) % itemPool.length];
    carousel[p.uid] = [item, ...pickCarouselOptions(room.meta.stage, salt, 4, rosterFor(room))];
  }
  await update(gamePath(code), {
    "meta/phase": "carousel", "meta/deadline": serverNow() + CAROUSEL_MS,
    "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow(),
    combat: null, carousel,
  });
}

/** Client: mark that I've taken my carousel pick this round (so the host can end
 *  the carousel as soon as everyone has chosen). */
export async function markCarouselPicked(code: string, uid: string, key: string): Promise<void> {
  await update(ref(db(), `games/${code}/players/${uid}`), { carouselPicked: key });
}

/** Host: if every alive human has already picked this carousel, end it early
 *  instead of waiting out the timer. Implemented by parking the deadline to now
 *  so the normal endCarousel path fires on the next host tick. */
export async function finishCarouselEarlyIfReady(code: string, room: Room): Promise<void> {
  if (room.meta?.phase !== "carousel") return;
  if (serverNow() >= room.meta.deadline) return; // already ending
  const key = `${room.meta.stage}-${room.meta.round}`;
  const humans = alivePlayers(room).filter((p) => !p.isBot && p.connected);
  if (humans.length === 0 || !humans.every((p) => p.carouselPicked === key)) return;
  await update(ref(db(), `games/${code}/meta`), { deadline: serverNow(), updatedAt: serverNow() });
}

/** Host: carousel → next planning round. */
export async function endCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "carousel", room.meta.deadline))) return;
  room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
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
  room = (await freshRoom(code)) ?? room; // authoritative HP/combat (migration-safe)
  let combat = room.combat ?? {};
  const u: Updates = {};
  const aliveUids = alivePlayers(room).map((p) => p.uid);

  // Defensive: if a migration left us with no combat results for the alive
  // players, re-resolve the round deterministically from the frozen boards
  // instead of applying zero damage (which would silently void the round).
  if (aliveUids.length > 0 && !aliveUids.some((uid) => combat[uid])) {
    combat = buildCombat(room).combat;
  }
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

/** End screen → rematch: send the whole room back to the pre-game lobby. Resets
 *  every player's match state (the next start re-rolls fresh) and clears the
 *  finished game. Any player may trigger it — everyone returns to the lobby
 *  together the moment the shared phase flips. */
export async function returnToLobby(code: string, room: Room): Promise<void> {
  const hp = room.rules?.startingHp ?? 100;
  const u: Updates = {
    "meta/phase": "lobby",
    "meta/updatedAt": serverNow(),
    "meta/hostBeat": serverNow(),
    combat: null,
    carousel: null,
  };
  for (const p of Object.values(room.players ?? {})) {
    u[`players/${p.uid}/hp`] = hp;
    u[`players/${p.uid}/alive`] = true;
    u[`players/${p.uid}/place`] = null;
    u[`players/${p.uid}/streak`] = 0;
    u[`players/${p.uid}/level`] = 1;
    u[`players/${p.uid}/board`] = null;
    u[`players/${p.uid}/save`] = null;
    u[`players/${p.uid}/lastOpp`] = null;
    u[`players/${p.uid}/carouselPicked`] = null;
  }
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

  // Only a connected HUMAN can be host — a bot can't drive the round loop, so a
  // bot holding the role would wedge the game forever. Lowest-uid attempts.
  const humans = Object.values(room.players ?? {}).filter((p) => p.connected && !p.isBot).map((p) => p.uid).sort();

  // No human left at all → abandon the game so it doesn't hang in RTDB forever.
  if (humans.length === 0) {
    if (meta?.phase !== "over") {
      await update(gamePath(code), { "meta/phase": "over", "meta/updatedAt": serverNow() }).catch(() => {});
    }
    return;
  }
  if (humans[0] !== myUid) return;

  await runTransaction(ref(db(), `games/${code}/meta`), (m) => {
    if (!m) return m;
    if (serverNow() - (m.hostBeat ?? 0) >= HOST_TIMEOUT || !m.hostUid) {
      m.hostUid = myUid;
      m.hostBeat = serverNow();
    }
    return m;
  });
}
