/**
 * Double Up end-to-end flow test. Drives the REAL authoritative transitions from match.ts
 * (the exact code the Cloud Functions run) against an in-memory DB adapter — no browser, no
 * network — and asserts the whole 2v2 lifecycle:
 *   teams assigned → shared HP pools → cross-team pairing → damage pools per team →
 *   team eliminated at 0 → per-team placement → game over with one team + winnerTeam.
 *
 * Run: npx tsx test/double-up-flow.ts
 */
import { setDbAdapter } from "../src/game/net/db-adapter";
import { beginMatch, startCombat, endCombat } from "../src/game/net/match";
import { weightedRatingDelta } from "../src/game/rating";
import type { Room, RoomPlayer } from "../src/game/net/roomStore";
import type { UnitInstance } from "../src/game/types";

// ── In-memory DB (nested object) implementing the DbAdapter seam ──────────────
type Obj = Record<string, unknown>;
let store: Obj = {};

function getPath(root: Obj, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>((cur, k) => (cur == null ? cur : (cur as Obj)[k]), root);
}
function setPath(root: Obj, path: string, val: unknown): void {
  const keys = path.split("/").filter(Boolean);
  let cur: Obj = root;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Obj;
  }
  const last = keys[keys.length - 1];
  if (val === null || val === undefined) delete cur[last];
  else cur[last] = val;
}

/** Reproduce the Firebase SDK's client-side guard: an update() whose keys include an
 *  ancestor AND a descendant path (e.g. `teams` and `teams/0`) is rejected outright. The
 *  real SDK throws here; our in-memory store must too, or it silently masks the bug that
 *  broke Double Up's start on prod. */
function assertNoPathConflict(keys: string[]) {
  const norm = keys.map((k) => k.replace(/\/+$/g, ""));
  for (let i = 0; i < norm.length; i++) for (let j = 0; j < norm.length; j++) {
    if (i === j) continue;
    if (norm[i] === "" || norm[j].startsWith(norm[i] + "/")) {
      throw new Error(`update path conflict: '${norm[i]}' is an ancestor of '${norm[j]}' (Firebase rejects this)`);
    }
  }
}

setDbAdapter({
  async get(path) { return (getPath(store, path) ?? null) as never; },
  async update(path, value) {
    assertNoPathConflict(Object.keys(value));
    for (const [k, v] of Object.entries(value)) setPath(store, `${path}/${k}`, v === undefined ? null : v);
  },
  async transaction(path, fn) {
    const cur = getPath(store, path) ?? null;
    // Deep clone so the fn mutating `m` doesn't alias the store until we commit.
    const next = fn(JSON.parse(JSON.stringify(cur)));
    if (next === undefined) return { committed: false, value: cur as never };
    setPath(store, path, next);
    return { committed: true, value: next as never };
  },
});

// ── Test fixtures ────────────────────────────────────────────────────────────
const CODE = "DUTEST";

/** A board of `n` copies of `defId` at `star`, placed front-row. */
function makeBoard(defId: string, star: 1 | 2 | 3, n: number): UnitInstance[] {
  const cols = [3, 2, 4, 1, 5, 0, 6];
  return Array.from({ length: n }, (_, i) => ({
    iid: `${defId}_${star}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    defId, star, pos: [cols[i % cols.length], 1] as [number, number], items: [],
  }));
}

function player(uid: string, board: UnitInstance[]): RoomPlayer {
  return { uid, name: uid, isHost: uid === "p0", connected: true, ready: true, isBot: false,
    hp: 100, level: 6, alive: true, place: null, streak: 0, board };
}

function freshRoom(): Room {
  return JSON.parse(JSON.stringify({ ...(getPath(store, `games/${CODE}`) as Obj), code: CODE })) as Room;
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

/** Force the room into a PvP planning round with an already-elapsed deadline, so the next
 *  claimTransition fires immediately (mirrors the Cloud Task firing at the deadline). */
function armPvpRound(stage: number, round: number) {
  setPath(store, `games/${CODE}/meta/phase`, "planning");
  setPath(store, `games/${CODE}/meta/stage`, stage);
  setPath(store, `games/${CODE}/meta/round`, round);
  setPath(store, `games/${CODE}/meta/deadline`, Date.now() - 1000); // already elapsed
}

async function run() {
  console.log("Double Up end-to-end flow\n");

  // Strong team (0) vs weak team (1): team 1 should bleed shared HP and be eliminated.
  // Pidgey 3★ ×6 (strong) vs Caterpie 1★ ×2 (weak). Both ids exist in every roster.
  store = {};
  setPath(store, `games/${CODE}`, {
    meta: { hostUid: "p0", phase: "lobby", stage: 1, round: 1, deadline: 0, serverDriven: true, updatedAt: 0 },
    rules: { startingHp: 100, maxPlayers: 8, generations: [1], itemsEnabled: [], draftPoolSize: 60, mode: "double-up" },
    players: {
      p0: player("p0", makeBoard("pidgey", 3, 6)),
      p1: player("p1", makeBoard("pidgey", 3, 6)),
      p2: player("p2", makeBoard("caterpie", 1, 2)),
      p3: player("p3", makeBoard("caterpie", 1, 2)),
    },
  });

  // 1) beginMatch — assigns teams + shared HP pools.
  await beginMatch(CODE, freshRoom());
  // beginMatch resets boards to null (players build fresh each game) — re-populate them,
  // simulating each player syncing their planning board. Strong team 0 vs weak team 1.
  setPath(store, `games/${CODE}/players/p0/board`, makeBoard("pidgey", 3, 6));
  setPath(store, `games/${CODE}/players/p1/board`, makeBoard("pidgey", 3, 6));
  setPath(store, `games/${CODE}/players/p2/board`, makeBoard("caterpie", 1, 1));
  setPath(store, `games/${CODE}/players/p3/board`, makeBoard("caterpie", 1, 1));
  let room = freshRoom();
  const teamOf = Object.fromEntries(Object.values(room.players).map((p) => [p.uid, p.teamId]));
  console.log("After beginMatch:");
  assert(teamOf.p0 === 0 && teamOf.p1 === 0, "p0+p1 on team 0");
  assert(teamOf.p2 === 1 && teamOf.p3 === 1, "p2+p3 on team 1");
  assert(!!room.teams && room.teams[0]?.hp === 100 && room.teams[1]?.hp === 100, "two shared HP pools at 100");
  assert(room.teams?.[0]?.members?.length === 2 && room.teams?.[1]?.members?.length === 2, "each team has 2 members");

  // 2) Run PvP combat rounds until a team is eliminated (game over), capped to avoid loops.
  console.log("\nRunning PvP rounds:");
  let round = 0;
  let team1HpTrail: number[] = [100];
  let crossTeamOk = true;
  for (let i = 0; i < 12 && freshRoom().meta.phase !== "over"; i++) {
    armPvpRound(2, 1); // a PvP round with an elapsed deadline
    await startCombat(CODE, freshRoom());
    room = freshRoom();
    // Verify pairing crossed teams (never teammate vs teammate) for non-ghost fights.
    for (const [uid, c] of Object.entries(room.combat ?? {})) {
      if (!c.pve && !c.ghost && c.oppUid && c.oppUid !== uid) {
        if (teamOf[uid] === teamOf[c.oppUid]) crossTeamOk = false;
      }
    }
    // startCombat parked a fresh (future) combat deadline — elapse it so endCombat's
    // claimTransition fires, exactly as the Cloud Task does when the combat timer ends.
    setPath(store, `games/${CODE}/meta/deadline`, Date.now() - 1000);
    await endCombat(CODE, freshRoom());
    room = freshRoom();
    const t1 = room.teams?.[1]?.hp ?? 0;
    team1HpTrail.push(t1);
    round++;
  }
  console.log(`  team 1 shared-HP trail: ${team1HpTrail.join(" → ")}`);
  assert(crossTeamOk, "every real fight was cross-team (no teammate clashes)");
  assert(team1HpTrail[team1HpTrail.length - 1] <= 0, "team 1 shared HP reached 0");
  assert(team1HpTrail.some((h, k) => k > 0 && h < team1HpTrail[k - 1]), "shared HP decreased over rounds (damage pooled)");

  // 3) Game over: team 0 wins, both members place 1; team 1 both eliminated.
  room = freshRoom();
  console.log("\nFinal state:");
  assert(room.meta.phase === "over", "game ended (phase over)");
  assert(room.meta.winnerTeam === 0, "winnerTeam = 0");
  assert(room.players.p0.place === 1 && room.players.p1.place === 1, "both team-0 partners placed 1st");
  assert(room.players.p2.alive === false && room.players.p3.alive === false, "both team-1 partners eliminated");
  assert(room.players.p2.place === room.players.p3.place && (room.players.p2.place ?? 0) > 1, "team-1 partners share a worse placement");
  assert(room.teams?.[0]?.alive === true && room.teams?.[1]?.alive === false, "team 0 alive, team 1 dead");

  // 4) Server-authoritative rating (PR-C): every human has a results/{uid} row (the real write
  // path — rating + leaderboard + history also applied). Delta matches the formula.
  // 4-human lobby → total 4, 3 human opponents, 0 bots.
  console.log("\nServer rating results (results/{uid}):");
  const results = (getPath(store, `games/${CODE}/results`) ?? {}) as Record<string, { place: number; players: number; humans: number; bots: number; delta: number }>;
  for (const uid of ["p0", "p1", "p2", "p3"]) {
    const r = results[uid];
    const place = room.players[uid].place ?? 0;
    const expected = weightedRatingDelta(place, 4, 3, 0);
    assert(!!r, `${uid} has a server result row`);
    assert(!!r && r.delta === expected, `${uid} server delta ${r?.delta} === client formula ${expected} (place ${place})`);
  }
  // (In 2-team Double Up the losing team places 2nd of 4, above the 2.5 midpoint, so it can
  // still gain LP — pre-existing client behavior the server mirrors. The invariant is ordering.)
  assert(results.p0.delta > results.p2.delta, "winning team earned more LP than the losing team");

  console.log(`\n${failures === 0 ? "✅ Double Up flow verified end to end" : `❌ ${failures} assertion(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("harness threw:", e); process.exit(1); });
