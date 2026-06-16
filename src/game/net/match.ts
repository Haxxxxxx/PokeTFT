import { dbAdapter } from "./db-adapter";
import { serverNow } from "./serverTime";
import { simulate } from "../engine/combat";
import { makeRng } from "../engine/rng";
import { generatePlayerLikeBoard, generateCreepBoard, pickCarouselOptions } from "../engine/enemy";
import { rosterForGenerations, hasDef } from "../data/mons";
import { advanceRound, stageBaseDamage, cumulativeRound, roundKind } from "../config";
import { MEGA_STONE } from "../data/mega";
import { COMPONENT_IDS, EMBLEM_IDS } from "../data/items";
import { teamBuffForAugments } from "../data/augments";
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
  return rosterForGenerations(room.rules?.generations ?? [1], room.rules?.draftPoolSize, hashStr(room.code));
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

/** A player's team-wide combat buff from their (public) combat augments. Computed the
 *  same way on host and client → deterministic. */
function teamBuffFor(p: RoomPlayer | undefined) {
  return teamBuffForAugments(p?.augments);
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
  if (typeof level === "number") pub.level = level;
  if (augments) pub.augments = rtdbSafe(augments);
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
  const r = simulate(sa, sb, teamBuffFor(room.players[aUid]), teamBuffFor(room.players[bUid]));
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
    const pveName = stage <= 1 ? "Wild Pokémon"
      : stage <= 2 ? "Wild Pack"
      : stage <= 3 ? "Feral Horde"
      : stage <= 4 ? "Savage Swarm"
      : stage <= 5 ? "Apex Pack"
      : "Legendary Encounter";
    // Everyone fights wild creeps — no HP loss, a breather to build. Resolve from
    // the SAME round-tripped boards the client replays (see assign()) so the PvE
    // outcome the player sees always matches what the host recorded.
    for (const p of alive) {
      const self = rtdbSafe(board(room.players[p.uid]));
      const creeps = rtdbSafe(generateCreepBoard(stage, room.meta.round, stage * 97 + room.meta.round * 13 + hashStr(p.uid), allowed));
      // Player's augments buff their team; the wild creeps get no buff.
      const r = simulate(self, creeps, teamBuffFor(room.players[p.uid]), undefined);
      combat[p.uid] = { oppUid: p.uid, oppName: pveName, ghost: true, pve: true, won: r.winner === "ally", survivors: 0, dmg: 0, selfBoard: self, oppBoard: creeps };
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
    const itemPool = [MEGA_STONE, ...COMPONENT_IDS];
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
    "meta/stage": 1,
    "meta/round": 1,
    "meta/deadline": null,
    combat: null,
    carousel: null,
    invited: null,
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
    if (!m) return m;
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
