import { dbAdapter } from "./db-adapter";
import { serverNow } from "./serverTime";
import { simulate } from "../engine/combat";
import { makeRng } from "../engine/rng";
import { generatePlayerLikeBoard, generateCreepBoard, generateBossBoard, pickCarouselOptions } from "../engine/enemy";
import { hasDef } from "../data/mons";
import { rosterForRoom, modeTeamBuff, modeBossId, modeBossName, modeCarouselItem, isDoubleUp, assignTeams } from "../data/gameModes";
import { loadGhost, ghostBoardForRound } from "./ghost";
import { advanceRound, stageBaseDamage, cumulativeRound, roundKind } from "../config";
import { MEGA_STONE } from "../data/mega";
import { COMPONENT_IDS, EMBLEM_IDS } from "../data/items";
import { teamBuffForAugments, combineTeamBuffs, AUGMENT_BY_ID } from "../data/augments";
import type { UnitInstance } from "../types";
import type { Room, RoomPlayer, CombatAssign, BotDifficulty } from "./roomStore";

export const PLAN_MS = 30_000;
export const COMBAT_MS = 16_000;
export const CAROUSEL_MS = 22_000;
/** If the host's heartbeat is older than this, any client may claim the host role. */
export const HOST_TIMEOUT = 3_500;

type Updates = Record<string, unknown>;

function gamePath(code: string): string {
  return `games/${code}`;
}

/** FNV-1a string hash → 32-bit uint. Used to fold stable identifiers (game code,
 *  uid) into deterministic-but-varied seeds. */
function hashStr(s: string | undefined): number {
  let h = 2166136261 >>> 0;
  const str = s ?? "";
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The roster (unit ids) in play this game — the selected generations, randomly
 *  drawn down to the room's draft size, seeded by the room code so AI/creeps/
 *  carousel and every client share the identical pool. */
function rosterFor(room: Room): string[] {
  return rosterForRoom(room.rules, hashStr(room.code));
}

/** A bot's board for a round, scaled by stage progress and difficulty. The "expert"/
 *  "ultimate" tiers draft synergies + items and COUNTER-DRAFT vs `opponentBoard` (the human
 *  they're about to fight); a "clone" replays the host's last game (ghost). */
function botBoard(stage: number, round: number, difficulty: BotDifficulty | undefined, salt: string, allowed: string[], enabledItems?: string[], ghost?: Room["ghost"], opponentBoard?: UnitInstance[]): UnitInstance[] {
  const cr = cumulativeRound(stage, round);
  // Clone bot: field the host's last-game board for this cumulative round. Falls back to a
  // tough synergy board on the host's first-ever game (no ghost yet).
  if (difficulty === "clone") {
    const g = ghostBoardForRound(ghost, cr);
    if (g && g.length) return g.map((u, i) => ({ ...u, iid: `clone${salt}_${cr}_${i}` }));
    return generatePlayerLikeBoard(stage, round, "expert", (() => { let s = 0; for (let i = 0; i < salt.length; i++) s = (s * 31 + salt.charCodeAt(i)) >>> 0; return s + cr; })(), allowed, enabledItems, opponentBoard);
  }
  let seed = 0;
  for (let i = 0; i < salt.length; i++) seed = (seed * 31 + salt.charCodeAt(i)) >>> 0;
  // Economy-realistic: a board a real player could actually build at this round.
  return generatePlayerLikeBoard(stage, round, difficulty, seed + cr, allowed, enabledItems, opponentBoard);
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

/** Predict who I'll fight in the upcoming combat — the pairing is deterministic
 *  (same shuffle seed + rematch-avoidance as startCombat), so the planning UI can
 *  show it before the round resolves. Returns a display label or null (carousel
 *  round / not pairable). */
export function predictOpponent(room: Room, myUid: string): { name: string; ghost?: boolean; pve?: boolean } | null {
  const stage = room.meta?.stage, round = room.meta?.round;
  if (stage == null || round == null) return null;
  const kind = roundKind(stage, round);
  if (kind === "carousel") return null;
  if (kind === "pve") return { name: "Wild Pokémon", pve: true };
  const alive = alivePlayers(room);
  if (alive.length <= 1) return null;
  const order = shuffled(alive.map((p) => p.uid).sort(), stage * 131 + round);
  for (let i = 0; i + 1 < order.length; i += 2) {
    if (room.players[order[i]]?.lastOpp === order[i + 1] && i + 2 < order.length) {
      [order[i + 1], order[i + 2]] = [order[i + 2], order[i + 1]];
    }
  }
  const nameOf = (uid: string) => room.players[uid]?.name ?? "Rival";
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i], b = order[i + 1];
    if (a === myUid) return b ? { name: nameOf(b) } : { name: nameOf(order[i - 1]), ghost: true };
    if (b === myUid) return { name: nameOf(a) };
  }
  return null;
}

function board(p: RoomPlayer | undefined): UnitInstance[] {
  const b = p?.board;
  const arr = Array.isArray(b) ? b : b ? Object.values(b) : [];
  // Drop placed units with an unknown def id (stale/cross-roster data) so they
  // never reach simulate() — both host and client filter identically — and
  // coerce each unit's `items` to a dense array (RTDB can return it as an
  // index-keyed object, which would break the sim's `for (const id of items)`).
  // NOTE: we do NOT re-cap by board-size here. The planning client already
  // enforces the cap with the player's true level; the public players/level is
  // no longer synced (it lives in the private save), so capping by it would
  // wrongly truncate a legit board to 1 unit. The synced board is the source.
  return (arr as UnitInstance[])
    .filter((u) => u && u.pos && hasDef(u.defId))
    // Coerce items to a dense, falsy-free array EXACTLY like the client's normUnit
    // (itemsArray → .filter(Boolean)). If the host kept a null item the client dropped,
    // boardSeed would differ → host/client roll different crits → replay desync.
    .map((u) => ({ ...u, items: (Array.isArray(u.items) ? u.items : Object.values((u.items ?? {}) as Record<string, string>)).filter(Boolean) }));
}

/** A player's team-wide combat buff: their (public) combat augments folded with the
 *  game-mode's region modifier. Computed the same way on host and client → deterministic. */
function teamBuffFor(p: RoomPlayer | undefined, room: Room) {
  return combineTeamBuffs(teamBuffForAugments(p?.augments), modeTeamBuff(room.rules));
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
    "meta/serverDriven": true, // #110 — every game is server-driven (no host-loop mode)
    combat: null,
    invited: null,
    transfers: null, // clear any stale co-op transfers from a prior game
    // NOTE: `teams` is set as ONE whole-node value below (either the fresh pools or null).
    // It must NOT also appear as a separate `teams: null` key here — an update containing
    // both `teams` and `teams/0` is an ancestor/descendant path conflict the Firebase SDK
    // rejects client-side, which silently broke Double Up's start (in-memory tests don't
    // enforce that rule; caught via a live prod run).
  };
  // Double Up: pair every participant (humans + bots) into deterministic teams of 2,
  // each sharing ONE HP pool. Same uid→team mapping on host + clients (sorted uids).
  const doubleUp = isDoubleUp(room.rules);
  const teamOf = doubleUp ? assignTeams(Object.values(room.players ?? {}).filter((p) => p.connected).map((p) => p.uid)) : {};
  const teamMembers: Record<number, string[]> = {};
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
    u[`players/${p.uid}/augments`] = null; // clear public combat augments from a prior game
    if (doubleUp) {
      const t = teamOf[p.uid] ?? 0;
      u[`players/${p.uid}/teamId`] = t;
      (teamMembers[t] ??= []).push(p.uid);
    } else {
      u[`players/${p.uid}/teamId`] = null;
    }
  }
  // One shared HP pool per team (the team's "Little Legend"). A 2-player team feeds
  // damage from both boards into this single bar; the team is out when it hits 0. Written
  // as a SINGLE whole-node value (not per-`teams/{t}` keys) so it replaces any stale pools
  // AND avoids an ancestor/descendant path conflict in the same atomic update.
  if (doubleUp) {
    const teamsNode: Record<number, { hp: number; alive: boolean; place: number | null; members: string[] }> = {};
    for (const [t, members] of Object.entries(teamMembers)) teamsNode[Number(t)] = { hp, alive: true, place: null, members };
    u["teams"] = teamsNode;
  } else {
    u["teams"] = null; // FFA: ensure no stale team pools linger
  }
  // Clone bot: if any bot is a Clone, copy the HOST's saved last-game ghost into the room so
  // the authoritative loop (host + Functions) can field it. The host is whoever started the
  // match (= meta.hostUid); the clone mirrors their previous game. Whole-node write.
  const hasClone = Object.values(room.players ?? {}).some((p) => p.isBot && p.botDifficulty === "clone");
  u["ghost"] = hasClone ? ((await loadGhost(room.meta.hostUid).catch(() => null)) ?? null) : null;
  await dbAdapter().update(gamePath(code), u);
}

/** RTDB rejects any `undefined` in a write (it accepts `null`). A holey shop
 *  array (`shop[0] === undefined` after a buy) or a missing field would throw,
 *  killing the sync. Round-trip through JSON to coerce every `undefined` to
 *  `null` and drop undefined object props. */
function rtdbSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null));
}

/** Client: push my on-board units + economy snapshot. The board is PUBLIC (the
 *  host resolves combat from it and rivals legitimately spectate it), but the
 *  full economy snapshot (gold, shop roll, items, bench) is PRIVATE — written to
 *  priv/{code}/{uid}, readable only by me — so opponents can't scout my gold or
 *  shop. A refresh rehydrates my own state from there. */
export async function syncBoard(code: string, uid: string, units: UnitInstance[], save?: unknown, level?: number, augments?: string[]): Promise<void> {
  const onBoard = rtdbSafe(units.filter((un) => un.pos !== null));
  // `board` + `level` + `augments` are PUBLIC: scouting shows each rival's level (like
  // TFT), and combat augments must be public so the host AND every client resolve the
  // identical team buffs. The full econ save stays private under priv/.
  const pub: Record<string, unknown> = { board: onBoard };
  // Clamp to the valid range so a bad/edited client value can't get the whole update
  // rejected by the DB rule (level validates 1..10) — and the scoreboard stays sane.
  // isFinite guard: a NaN would survive the typeof check and get the WHOLE player update
  // (board + augments) rejected by RTDB, silently freezing this player's sync.
  if (typeof level === "number" && Number.isFinite(level)) pub.level = Math.max(1, Math.min(10, Math.round(level)));
  // Only sync KNOWN augment ids, capped at 3 — keeps the public node clean and within
  // the DB rule even if local state somehow holds junk.
  if (augments) pub.augments = rtdbSafe(augments.filter((id) => AUGMENT_BY_ID[id]).slice(0, 3));
  await dbAdapter().update(`games/${code}/players/${uid}`, pub);
  if (save) await dbAdapter().update(`priv/${code}/${uid}`, { save: rtdbSafe(save) });
}

/** Host: write a liveness heartbeat so migration only triggers on a real stall. */
export async function heartbeat(code: string): Promise<void> {
  await dbAdapter().update(`games/${code}/meta`, { hostBeat: serverNow() });
}

function assign(combat: Record<string, CombatAssign>, room: Room, aUid: string, bUid: string, stage: number, ghost: boolean) {
  // RTDB-safe the boards FIRST, then simulate THOSE for the authoritative result:
  // the clients re-sim the round-tripped boards they read back, so computing `won`
  // from the same round-tripped data guarantees the banner can't disagree with the
  // replay (the "I see a different fight / phantom loss" desync).
  const sa = rtdbSafe(board(room.players[aUid]));
  const sb = rtdbSafe(board(room.players[bUid]));
  // Combat augments buff each side's team (ghost fights use the ghost's source player).
  const r = simulate(sa, sb, teamBuffFor(room.players[aUid], room), teamBuffFor(room.players[bUid], room));
  const draw = r.winner === "draw";
  const aWon = r.winner === "ally";
  const bWon = r.winner === "enemy";
  // Draws normally cost no HP — but at the stage cap (50) a perpetual mirror-draw
  // between the last two players would loop forever (advanceRound is clamped, so
  // stage can't climb to force a finish). Chip both sides on a draw there so the
  // stalemate resolves into an elimination.
  const drawChip = draw && stage >= 50 ? 10 : 0;
  combat[aUid] = {
    oppUid: bUid,
    oppName: (room.players[bUid]?.name ?? "Rival") + (ghost ? " (ghost)" : ""),
    ghost,
    won: aWon,
    survivors: aWon || draw ? 0 : r.survivors,
    dmg: aWon ? 0 : draw ? drawChip : stageBaseDamage(stage) + r.survivorDamage,
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
      dmg: bWon ? 0 : draw ? drawChip : stageBaseDamage(stage) + r.survivorDamage,
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
    const val = await dbAdapter().get<Room>(gamePath(code));
    // RTDB stores the game UNDER its code key, so the value has no `code` field —
    // inject it, or anything reading room.code (e.g. the seeded roster draw) hits
    // undefined and the whole transition throws.
    return val ? ({ ...val, code }) : null;
  } catch {
    return null;
  }
}

/** Atomically claim a phase transition so exactly ONE client resolves a round,
 *  even if two clients briefly believe they are the host. Returns true if we won. */
async function claimTransition(code: string, fromPhase: string, expectedDeadline: number): Promise<boolean> {
  const res = await dbAdapter().transaction<{ phase?: string; deadline?: number }>(`games/${code}/meta`, (m) => {
    if (m && m.phase === fromPhase && (m.deadline ?? 0) === expectedDeadline && serverNow() >= expectedDeadline) {
      m.deadline = serverNow() + 60_000; // lock: park the deadline so no one else claims
      return m;
    }
    return; // abort — already claimed/changed
  });
  return res.committed && (res.value?.deadline ?? 0) > expectedDeadline + 30_000;
}

/** Run a claimed transition's body so that ANY throw / rejected write RELEASES the
 *  60s claim lock (resets the deadline to a near-future value) instead of wedging
 *  the phase forever. Without this, a single error after claimTransition leaves the
 *  match stuck re-firing the parked deadline every minute (the planning-loop class).
 *  The error is re-thrown so the host loop logs it; the deadline reset lets the next
 *  host tick re-attempt the transition cleanly (or migrate). */
const claimFailures = new Map<string, number>();
async function withClaimGuard(code: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
    claimFailures.delete(code); // success → reset backoff (the failure was transient)
  } catch (err) {
    // Escalating backoff: a TRANSIENT error recovers fast (2.5s), but a
    // DETERMINISTIC one (a write the rules always reject) backs off to 30s instead
    // of hammering RTDB every 2.5s on a wedged game.
    const n = (claimFailures.get(code) ?? 0) + 1;
    claimFailures.set(code, n);
    const backoff = Math.min(2500 * 2 ** (n - 1), 30_000);
    await dbAdapter().update(`games/${code}/meta`, { deadline: serverNow() + backoff, hostBeat: serverNow() }).catch(() => {});
    throw err;
  }
}

/** Double Up team-vs-team PvP pairing. Groups alive players by team, pairs teams two at a
 *  time (deterministic shuffle), and within a pair sets member-vs-member fights so both
 *  partners clash with the SAME enemy team. A short side (a downed partner) is padded with
 *  a ghost; an odd team out fights ghosts. All damage still pools per team in endCombat. */
function buildDoubleUpCombat(combat: Record<string, CombatAssign>, room: Room, alive: RoomPlayer[], stage: number): void {
  const byTeam = new Map<number, string[]>();
  for (const p of alive) {
    if (p.teamId == null) continue;
    (byTeam.get(p.teamId) ?? byTeam.set(p.teamId, []).get(p.teamId)!).push(p.uid);
  }
  for (const ids of byTeam.values()) ids.sort(); // stable member order
  const teamIds = shuffled([...byTeam.keys()].sort((a, b) => a - b), stage * 131 + room.meta.round * 7 + 3);

  const ghostMirror = (uid: string) => {
    combat[uid] = { oppUid: uid, oppName: "—", ghost: true, won: true, survivors: 0, dmg: 0, selfBoard: rtdbSafe(board(room.players[uid])), oppBoard: [] };
  };

  for (let i = 0; i < teamIds.length; i += 2) {
    const A = byTeam.get(teamIds[i]) ?? [];
    if (i + 1 < teamIds.length) {
      const B = byTeam.get(teamIds[i + 1]) ?? [];
      const n = Math.max(A.length, B.length);
      for (let k = 0; k < n; k++) {
        const a = A[k], b = B[k];
        if (a && b) assign(combat, room, a, b, stage, false);            // real cross-team fight
        else if (a) assign(combat, room, a, B[0] ?? a, stage, true);     // B short → A ghosts vs a B copy
        else if (b) assign(combat, room, b, A[0] ?? b, stage, true);     // A short → B ghosts vs an A copy
      }
    } else {
      // Odd team out (no opponent team this round): both members fight a ghost.
      for (const a of A) ghostMirror(a);
    }
  }
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

  // Standard PvP: resolve the pairing FIRST so a bot can read (and counter-draft against) the
  // board of the HUMAN it's about to fight. Same deterministic shuffle the assign loop reuses.
  const isStandardPvp = kind !== "pve" && !isDoubleUp(room.rules);
  let order: string[] = [];
  const oppOf = new Map<string, string>();
  if (isStandardPvp) {
    order = shuffled(alive.map((p) => p.uid).sort(), stage * 131 + room.meta.round);
    for (let i = 0; i + 1 < order.length; i += 2) {
      if (room.players[order[i]]?.lastOpp === order[i + 1] && i + 2 < order.length) {
        [order[i + 1], order[i + 2]] = [order[i + 2], order[i + 1]];
      }
    }
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i], b = order[i + 1];
      if (b) { oppOf.set(a, b); oppOf.set(b, a); }
      else if (order.length > 1) oppOf.set(a, order[i - 1]); // odd → ghost of the previous
    }
  }

  // Bots get a deterministic host-generated board each round (humans synced theirs). A bot
  // facing a HUMAN counter-drafts against that human's current board (bot opponents' boards
  // aren't built yet, so those stay un-countered — no circular dependency).
  for (const p of alive) {
    if (!p.isBot) continue;
    const oppUid = oppOf.get(p.uid);
    const opp = oppUid ? room.players[oppUid] : undefined;
    const oppBoard = opp && !opp.isBot ? board(opp) : undefined;
    const b = botBoard(stage, room.meta.round, p.botDifficulty, p.uid, allowed, room.rules?.itemsEnabled, room.ghost, oppBoard);
    room.players[p.uid] = { ...p, board: b };
    botBoards[p.uid] = b;
  }

  const combat: Record<string, CombatAssign> = {};
  if (kind === "pve") {
    // Region Clash: the region's legendary appears as a BOSS on recurring PvE rounds
    // (the X-7 encounters), not the soft stage-1 opener — so the opener stays a build
    // breather while the legendary is a real mid/late-game wall.
    const bossId = modeBossId(room.rules);
    const isBossRound = !!bossId && hasDef(bossId) && stage >= 2;
    const bossName = modeBossName(room.rules);
    const pveName = isBossRound ? `${bossName} (Boss)`
      : stage <= 1 ? "Wild Pokémon"
      : stage <= 2 ? "Wild Pack"
      : stage <= 3 ? "Feral Horde"
      : stage <= 4 ? "Savage Swarm"
      : stage <= 5 ? "Apex Pack"
      : "Legendary Encounter";
    // Everyone fights wild creeps (or the boss) — resolve from the SAME round-tripped
    // boards the client replays (see assign()) so the PvE outcome the player sees always
    // matches what the host recorded.
    for (const p of alive) {
      const self = rtdbSafe(board(room.players[p.uid]));
      const seed = stage * 97 + room.meta.round * 13 + hashStr(p.uid);
      const creeps = rtdbSafe(isBossRound
        ? generateBossBoard(bossId!, stage, room.meta.round, seed, allowed)
        : generateCreepBoard(stage, room.meta.round, seed, allowed));
      // Player's augments + region modifier buff their team; wild creeps/boss get no buff.
      const r = simulate(self, creeps, teamBuffFor(room.players[p.uid], room), undefined);
      // A boss round CAN deal HP damage on a loss (it's a real threat); ordinary PvE doesn't.
      const dmg = isBossRound && r.winner !== "ally" ? Math.min(8, stageBaseDamage(stage)) : 0;
      combat[p.uid] = { oppUid: p.uid, oppName: pveName, ghost: true, pve: true, won: r.winner === "ally", survivors: 0, dmg, selfBoard: self, oppBoard: creeps };
    }
  } else if (isDoubleUp(room.rules)) {
    // Double Up (Phase 3): TEAM-vs-TEAM matchmaking — both partners face the two members
    // of ONE enemy team this round (each member fights one opponent), so the combined
    // damage into the shared HP pool comes from a coherent clash, not two random fights.
    buildDoubleUpCombat(combat, room, alive, stage);
  } else {
    // Reuse the pairing computed above (so it matches the bots' counter-draft opponents).
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
  return withClaimGuard(code, async () => {
    room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
    const { combat, botBoards } = buildCombat(room);

    const u: Updates = { "meta/phase": "combat", "meta/deadline": serverNow() + COMBAT_MS, "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow() };
    for (const uid of Object.keys(combat)) {
      u[`combat/${uid}`] = combat[uid];
      if (!combat[uid].pve && !combat[uid].ghost) u[`players/${uid}/lastOpp`] = combat[uid].oppUid;
    }
    for (const uid of Object.keys(botBoards)) u[`players/${uid}/board`] = botBoards[uid]; // persist for replay
    await dbAdapter().update(gamePath(code), u);
  });
}

/** Host: planning → carousel. Offers each human a free pick (a held item + units). */
export async function startCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "planning", room.meta.deadline))) return;
  return withClaimGuard(code, async () => {
    room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
    // Item rewards: a Mega Stone plus item components players combine into the
    // completed items the lobby enabled. Offering components (not finished items)
    // is what makes the carousel a build-toward-a-recipe decision.
    // Themed carousel: Region Clash adds the region's signature completed item to the pool.
    const sigItem = modeCarouselItem(room.rules);
    const itemPool = [MEGA_STONE, ...COMPONENT_IDS, ...(sigItem ? [sigItem] : [])];
    const carousel: Record<string, string[]> = {};
    // Per-GAME entropy: the room code is unique to each match, so folding it in
    // makes carousels differ from game to game (they used to seed only on
    // stage/round/uid.length, which is identical across every game). The host
    // writes this once, so it just needs to vary — not be client-reproducible.
    const gameSeed = hashStr(code);
    // Comeback mechanic: TFT lets the lowest-HP players pick the carousel first. With
    // private per-player menus there's no shared ring to pick from, so instead we scale
    // REWARD QUALITY by how far behind you are — players below the field's median HP get
    // a richer carousel (emblems earlier + more often), helping them claw back.
    const aliveHumans = alivePlayers(room).filter((p) => !p.isBot);
    const hps = aliveHumans.map((p) => p.hp).sort((a, b) => a - b);
    const medianHp = hps.length ? hps[Math.floor((hps.length - 1) / 2)] : 100;
    for (const p of alivePlayers(room)) {
      if (p.isBot) continue;
      const salt = (gameSeed ^ hashStr(p.uid) ^ Math.imul(room.meta.stage * 31 + room.meta.round * 7 + 1, 2654435761)) >>> 0;
      // Behind = strictly below the median HP (and not alone). Such players get the
      // premium emblem from stage 2 at ~50%, vs stage 3 at ~25% for everyone else.
      const behind = aliveHumans.length > 1 && p.hp < medianHp;
      const emblemGate = behind ? 2 : 4;            // % gate: 1-in-2 vs 1-in-4
      const wantEmblem = room.meta.stage >= (behind ? 2 : 3) && (salt >>> 11) % emblemGate === 0;
      const item = wantEmblem
        ? EMBLEM_IDS[(salt >>> 5) % EMBLEM_IDS.length]
        : itemPool[(salt >>> 3) % itemPool.length];
      carousel[p.uid] = [item, ...pickCarouselOptions(room.meta.stage, salt, 4, rosterFor(room))];
    }
    await dbAdapter().update(gamePath(code), {
      "meta/phase": "carousel", "meta/deadline": serverNow() + CAROUSEL_MS,
      "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow(),
      combat: null, carousel,
    });
  });
}

/** Client: mark that I've taken my carousel pick this round (so the host can end
 *  the carousel as soon as everyone has chosen). */
export async function markCarouselPicked(code: string, uid: string, key: string): Promise<void> {
  await dbAdapter().update(`games/${code}/players/${uid}`, { carouselPicked: key });
}

/** Host: if every alive human has already picked this carousel, end it early
 *  instead of waiting out the timer. Implemented by parking the deadline to now
 *  so the normal endCarousel path fires on the next host tick. */
export async function finishCarouselEarlyIfReady(code: string, room: Room): Promise<void> {
  if (room.meta?.phase !== "carousel") return;
  if (serverNow() >= room.meta.deadline) return; // already ending
  const key = `${room.meta.stage}-${room.meta.round}`;
  // NOTE: don't filter on `connected` — an alive-but-momentarily-disconnected
  // player (backgrounded tab) must still block the early finish, otherwise the
  // carousel ends before they can reconnect and pick, silently robbing them of a
  // reward. The deadline still bounds the wait if they never come back.
  const humans = alivePlayers(room).filter((p) => !p.isBot);
  if (humans.length === 0 || !humans.every((p) => p.carouselPicked === key)) return;
  await dbAdapter().update(`games/${code}/meta`, { deadline: serverNow(), updatedAt: serverNow() });
}

/** Host: carousel → next planning round. */
export async function endCarousel(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "carousel", room.meta.deadline))) return;
  return withClaimGuard(code, async () => {
    room = (await freshRoom(code)) ?? room; // authoritative state (migration-safe)
    const next = advanceRound(room.meta.stage, room.meta.round);
    await dbAdapter().update(gamePath(code), {
      "meta/phase": "planning", "meta/stage": next.stage, "meta/round": next.round,
      "meta/deadline": serverNow() + PLAN_MS, "meta/hostBeat": serverNow(), "meta/updatedAt": serverNow(),
      carousel: null,
    });
  });
}

/** Host: combat → next planning (or game over). Applies HP, eliminations, placement. */
export async function endCombat(code: string, room: Room): Promise<void> {
  if (!(await claimTransition(code, "combat", room.meta.deadline))) return;
  return withClaimGuard(code, async () => {
    room = (await freshRoom(code)) ?? room; // authoritative HP/combat (migration-safe)
    let combat = room.combat ?? {};
    const u: Updates = {};
    const aliveUids = alivePlayers(room).map((p) => p.uid);

    // Defensive: if a migration left us with a missing OR PARTIAL combat map for
    // the alive players, re-resolve the round deterministically from the frozen
    // boards instead of applying zero damage to whoever's entry is missing (which
    // would silently void the round for them).
    if (aliveUids.length > 0 && !aliveUids.every((uid) => combat[uid])) {
      combat = buildCombat(room).combat;
    }

    // Double Up: damage pools into shared TEAM HP and teams (not individuals) are
    // eliminated. Resolved separately so the classic FFA path stays untouched.
    if (isDoubleUp(room.rules)) {
      await resolveDoubleUpCombat(code, room, combat, aliveUids, u);
      return;
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

    // Assign DISTINCT placements to everyone who died this round, ordered by their
    // pre-damage HP (higher HP → better place) so a multi-death round doesn't hand
    // out duplicate medals. Lowest HP gets the worst remaining place.
    const deadByHp = [...dead].sort((a, b) => (room.players[a]?.hp ?? 0) - (room.players[b]?.hp ?? 0));
    deadByHp.forEach((uid, i) => {
      u[`players/${uid}/alive`] = false;
      u[`players/${uid}/place`] = surviving.length + dead.length - i;
    });

    if (surviving.length <= 1) {
      if (surviving.length === 1) {
        u[`players/${surviving[0]}/place`] = 1;
        u["meta/winnerUid"] = surviving[0]; // authoritative — every client reads this
      }
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
    await dbAdapter().update(gamePath(code), u);
  });
}

/** Double Up combat resolution: each alive player's combat damage pools into their TEAM's
 *  shared HP bar; a team is eliminated when its bar hits 0 (both partners out together).
 *  Placements + the winner are per TEAM. Each member's player.hp mirrors the team HP so the
 *  existing HP displays just work. Writes everything into `u` and commits. */
async function resolveDoubleUpCombat(code: string, room: Room, combat: Record<string, CombatAssign>, aliveUids: string[], u: Updates): Promise<void> {
  const teams = room.teams ?? {};
  // Sum this round's damage per team, and carry each player's streak (econ is per-player).
  const teamDmg: Record<number, number> = {};
  for (const uid of aliveUids) {
    const p = room.players[uid];
    if (!p || p.teamId == null) continue;
    const c = combat[uid];
    teamDmg[p.teamId] = (teamDmg[p.teamId] ?? 0) + (c?.dmg ?? 0);
    if (c) {
      const s = p.streak ?? 0;
      u[`players/${uid}/streak`] = c.won ? (s >= 0 ? s + 1 : 1) : (s <= 0 ? s - 1 : -1);
    }
  }

  const aliveTeamIds = Object.keys(teams).map(Number).filter((t) => teams[t]?.alive);
  const hpBefore: Record<number, number> = {};
  const hpAfter: Record<number, number> = {};
  for (const t of aliveTeamIds) {
    hpBefore[t] = teams[t].hp;
    hpAfter[t] = Math.max(0, teams[t].hp - (teamDmg[t] ?? 0));
  }

  let survivingTeams = aliveTeamIds.filter((t) => hpAfter[t] > 0);
  let deadTeams = aliveTeamIds.filter((t) => hpAfter[t] <= 0);
  // Mutual KO: if every remaining team would fall this round, the team with the most
  // pre-damage HP survives at 1 (mirrors the FFA tiebreak).
  if (survivingTeams.length === 0 && deadTeams.length > 0) {
    const winner = [...deadTeams].sort((a, b) => hpBefore[b] - hpBefore[a])[0];
    survivingTeams = [winner];
    deadTeams = deadTeams.filter((t) => t !== winner);
    hpAfter[winner] = 1;
  }

  // Commit the new shared HP, mirroring it onto each member's player.hp for display.
  for (const t of aliveTeamIds) {
    u[`teams/${t}/hp`] = hpAfter[t];
    for (const uid of teams[t].members ?? []) u[`players/${uid}/hp`] = hpAfter[t];
  }

  // Distinct team placements, worst HP → worst remaining place.
  const deadByHp = [...deadTeams].sort((a, b) => hpBefore[a] - hpBefore[b]);
  deadByHp.forEach((t, i) => {
    const place = survivingTeams.length + deadTeams.length - i;
    u[`teams/${t}/alive`] = false;
    u[`teams/${t}/place`] = place;
    for (const uid of teams[t].members ?? []) {
      u[`players/${uid}/alive`] = false;
      u[`players/${uid}/place`] = place;
    }
  });

  if (survivingTeams.length <= 1) {
    if (survivingTeams.length === 1) {
      const wt = survivingTeams[0];
      u[`teams/${wt}/place`] = 1;
      u["meta/winnerTeam"] = wt;
      // winnerUid stays single for compatibility (the end screen reads place===1 too).
      u["meta/winnerUid"] = (teams[wt].members ?? [])[0] ?? null;
      for (const uid of teams[wt].members ?? []) u[`players/${uid}/place`] = 1;
    }
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
  await dbAdapter().update(gamePath(code), u);
}

/** End screen → rematch: send the whole room back to the pre-game lobby. Resets
 *  every player's match state (the next start re-rolls fresh) and clears the
 *  finished game. Any player may trigger it — everyone returns to the lobby
 *  together the moment the shared phase flips. */
/** Show an invited friend as a pending placeholder slot in the lobby until they join. */
export async function addInvitePlaceholder(code: string, uid: string, username: string, photoURL?: string | null): Promise<void> {
  await dbAdapter().update(`games/${code}/invited/${uid}`, { username, photoURL: photoURL ?? null });
}

/** Remove an invite placeholder (on decline / after joining). */
export async function clearInvitePlaceholder(code: string, uid: string): Promise<void> {
  await dbAdapter().update(`games/${code}/invited`, { [uid]: null }).catch(() => {});
}

/** Forfeit: eliminate the player at `place` (the worst currently-alive spot) so they
 *  leave the standings cleanly instead of vanishing. Writes only their own node. */
export async function concede(code: string, uid: string, place: number): Promise<void> {
  await dbAdapter().update(`games/${code}/players/${uid}`, { hp: 0, alive: false, place });
}

export async function returnToLobby(code: string, room: Room): Promise<void> {
  const hp = room.rules?.startingHp ?? 100;
  // Fully rewind the room to a fresh lobby with the SAME players (TFT-style requeue):
  // clear every "over"/in-game meta marker so the next match starts clean.
  const u: Updates = {
    "meta/phase": "lobby",
    "meta/updatedAt": serverNow(),
    "meta/hostBeat": serverNow(),
    "meta/winnerUid": null,
    "meta/winnerTeam": null,
    "meta/stage": 1,
    "meta/round": 1,
    "meta/deadline": null,
    combat: null,
    carousel: null,
    invited: null,
    teams: null, // Double Up team pools cleared; rebuilt at next beginMatch
    transfers: null, // clear any pending co-op transfers
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
    u[`players/${p.uid}/augments`] = null; // clear public combat augments from the finished game
    u[`players/${p.uid}/teamId`] = null;   // Double Up teams re-paired at next beginMatch
    // Re-ready everyone so the host can immediately start again (bots stay ready).
    u[`players/${p.uid}/ready`] = true;
  }
  await dbAdapter().update(gamePath(code), u);
}

/** Any client: claim the host role if the current host's heartbeat has gone
 *  stale (dropped OR backgrounded tab). Race-free via a transaction on meta. */
/** Ensure the round loop has a live host, promoting THIS client if the current host has
 *  gone silent. Returns whether *I* am the host afterwards — read from the transaction's
 *  committed snapshot, NOT the (now-stale) input room, so the caller can act on a fresh
 *  promotion in the SAME tick instead of waiting for the listener to catch up. */
export async function maybeClaimHost(code: string, room: Room, myUid: string): Promise<boolean> {
  const meta = room.meta;
  const beat = meta?.hostBeat ?? 0;
  const host = room.players?.[meta?.hostUid];
  const hostHealthy = host?.connected && serverNow() - beat < HOST_TIMEOUT;
  if (hostHealthy) return meta?.hostUid === myUid;

  // Only a connected HUMAN can be host — a bot can't drive the round loop, so a
  // bot holding the role would wedge the game forever. Lowest-uid attempts.
  const humans = Object.values(room.players ?? {}).filter((p) => p.connected && !p.isBot).map((p) => p.uid).sort();

  // No human left at all → abandon the game so it doesn't hang in RTDB forever.
  // Assign final placements by current HP first, so a reconnecting player sees a
  // coherent scoreboard instead of all-null places (#99 medals / fake #1).
  if (humans.length === 0) {
    if (meta?.phase !== "over") {
      const u: Updates = { "meta/phase": "over", "meta/updatedAt": serverNow() };
      // Players already eliminated keep their real place; the survivors (place
      // still null) outlasted them, so rank those by alive-then-HP into 1..N.
      const survivors = Object.values(room.players ?? {})
        .filter((p) => p.place == null)
        .sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || (b.hp ?? 0) - (a.hp ?? 0));
      survivors.forEach((p, i) => { u[`players/${p.uid}/place`] = i + 1; u[`players/${p.uid}/alive`] = false; });
      if (survivors[0]) u["meta/winnerUid"] = survivors[0].uid; // place-1 = authoritative winner
      await dbAdapter().update(gamePath(code), u).catch(() => {});
    }
    return false;
  }
  if (humans[0] !== myUid) return false;

  const res = await dbAdapter().transaction<{ hostUid?: string; hostBeat?: number }>(`games/${code}/meta`, (m) => {
    if (!m) return undefined; // abort (NOT return null — that would delete meta); a stale
                              // cold-cache read retries with server data on the next pass
    if (serverNow() - (m.hostBeat ?? 0) >= HOST_TIMEOUT || !m.hostUid) {
      m.hostUid = myUid;
      m.hostBeat = serverNow();
    }
    return m;
  });
  // Whether I hold the role now — from the committed value, so a same-tick promotion is
  // visible immediately (the stale input room still names the old host).
  return res.value?.hostUid === myUid;
}
