/**
 * Regression test for the silent-data-loss bug found in production: applyRatingFor's
 * rating transaction could commit while the separate leaderboard/history/results write
 * threw right after — and because the old idempotency claim was a bare `true` consumed
 * up front, nothing would ever retry it, and every call site's `.catch(() => {})`
 * discarded the error with zero trace. A real player's rating changed with no
 * corresponding history or leaderboard entry, and nothing in any log explained why.
 *
 * Verifies:
 *   - a persist failure durably records a ratingFailures/{uid} entry and rethrows
 *   - the rating is NOT lost, but history/leaderboard/results are genuinely absent
 *   - a later retry (simulating pruneStale's repair pass) resumes from the stored
 *     decision and finishes the write WITHOUT re-crediting the rating a second time
 *
 * Run: npx tsx test/verify-rating-persist-repair.ts
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

// Fails the FIRST combined leaderboard/history/results write (path === ""), succeeds
// every other write (including the rating transaction and the ratingFailures record).
let failNextRootUpdate = false;
setDbAdapter({
  async get(path) { return (getPath(store, path) ?? null) as never; },
  async update(path, value) {
    if (path === "" && failNextRootUpdate) {
      failNextRootUpdate = false;
      throw new Error("simulated network failure");
    }
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

const CODE = "REPAIRTEST";
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
  console.log("applyRatingFor — persist-failure self-heal regression test\n");

  failNextRootUpdate = true;
  let threw = false;
  try { await applyRatingFor(CODE, room, "alice", 2); } catch { threw = true; }
  assert(threw, "first call throws (simulated persist failure)");

  const ratingAfterFailure = getPath(store, "users/alice/rating") as number | null;
  assert(typeof ratingAfterFailure === "number" && ratingAfterFailure !== START_RATING, `rating still committed despite persist failure (${ratingAfterFailure})`);
  assert(getPath(store, `users/alice/history/${CODE}`) == null, "history genuinely absent after the failure (not silently lost — this IS the bug reproduced)");
  assert(getPath(store, "leaderboard/alice") == null, "leaderboard genuinely absent after the failure");

  const failureRecord = getPath(store, `games/${CODE}/ratingFailures/alice`) as Record<string, unknown> | null;
  assert(!!failureRecord && failureRecord.place === 2, "ratingFailures/{uid} durably records the decided outcome instead of losing it");

  const claim = getPath(store, `games/${CODE}/rated/alice`) as { place?: number; ratingApplied?: boolean } | null;
  assert(!!claim && claim.ratingApplied === true, "claim marks ratingApplied so a retry won't re-run the rating transaction");

  // Simulate pruneStale's repair pass calling applyRatingFor again for the same uid+code.
  await applyRatingFor(CODE, room, "alice", 2);

  const ratingAfterRepair = getPath(store, "users/alice/rating") as number;
  assert(ratingAfterRepair === ratingAfterFailure, "rating was NOT double-credited by the repair retry");

  const hist = getPath(store, `users/alice/history/${CODE}`) as Record<string, unknown> | null;
  assert(!!hist && hist.place === 2, "history row now exists after the repair retry");
  const lb = getPath(store, "leaderboard/alice") as Record<string, unknown> | null;
  assert(!!lb && lb.rating === ratingAfterRepair, "leaderboard now exists and matches the (unchanged) rating");

  console.log(`\n${failures === 0 ? "✅ persist-failure self-heal test passed" : `❌ ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });
