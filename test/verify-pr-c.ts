/**
 * Quick smoke-test for applyRatingFor (PR-C): verifies that
 *   - rating/leaderboard/history/results are written
 *   - idempotency (rated/{uid} guard) works
 *   - bots are skipped
 * Run: npx tsx test/verify-pr-c.ts
 */
import { setDbAdapter } from "../src/game/net/db-adapter";
import { applyRatingFor } from "../src/game/net/match";
import { START_RATING } from "../src/game/rating";
import type { Room, RoomPlayer } from "../src/game/net/roomStore";

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
  if (val === null || val === undefined) delete cur[last]; else cur[last] = val;
}
setDbAdapter({
  async get(path) { return (getPath(store, path) ?? null) as never; },
  async update(path, value) {
    for (const [k, v] of Object.entries(value)) setPath(store, `${path}/${k}`, v === undefined ? null : v);
  },
  async transaction(path, fn) {
    const cur = getPath(store, path) ?? null;
    const next = fn(JSON.parse(JSON.stringify(cur)));
    if (next === undefined) return { committed: false, value: cur as never };
    setPath(store, path, next);
    return { committed: true, value: next as never };
  },
});

const CODE = "PRCTEST";
const room = {
  code: CODE,
  rules: { startingHp: 100, maxPlayers: 4, generations: [1], itemsEnabled: [], draftPoolSize: 60 },
  players: {
    alice: { uid: "alice", name: "Alice", photoURL: null, isHost: false, isBot: false, connected: true, ready: true, hp: 0, level: 6, alive: false, place: 2, streak: 0, board: [] } as RoomPlayer,
    bob:   { uid: "bob",   name: "Bob",   photoURL: null, isHost: false, isBot: false, connected: true, ready: true, hp: 100, level: 6, alive: true,  place: null, streak: 0, board: [] } as RoomPlayer,
  },
} as unknown as Room;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

async function run() {
  console.log("applyRatingFor — PR-C smoke test\n");

  await applyRatingFor(CODE, room, "alice", 2);

  const rating = getPath(store, "users/alice/rating") as number;
  const lb = getPath(store, "leaderboard/alice") as Record<string, unknown>;
  const hist = getPath(store, `users/alice/history/${CODE}`) as Record<string, unknown>;
  const result = getPath(store, `games/${CODE}/results/alice`) as Record<string, unknown>;
  const rated = getPath(store, `games/${CODE}/rated/alice`);

  assert(typeof rating === "number", `users/alice/rating written (${rating})`);
  assert(rating !== START_RATING, "rating changed from START_RATING");
  assert(!!lb && lb.username === "Alice", "leaderboard/alice written with username");
  assert(!!hist && hist.place === 2, "history row has correct place");
  assert(!!hist && hist.lp === result?.delta, "history.lp matches results.delta");
  assert(!!result && typeof result.rating === "number", "results/{uid} has rating");
  assert(rated === true, "rated/{uid} idempotency marker set");

  // Idempotency
  const ratingBefore = rating;
  await applyRatingFor(CODE, room, "alice", 2);
  assert((getPath(store, "users/alice/rating") as number) === ratingBefore, "second call is no-op (idempotent)");

  // Bot skip
  await applyRatingFor("BOT", { ...room, players: { ...room.players, bot: { uid: "bot", isBot: true, name: "Bot", hp: 0, place: 1 } } } as unknown as Room, "bot", 1);
  assert(getPath(store, "users/bot/rating") == null, "bot rating NOT written");

  console.log(`\n${failures === 0 ? "✅ PR-C smoke test passed" : `❌ ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });
