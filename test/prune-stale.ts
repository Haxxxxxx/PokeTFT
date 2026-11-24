/**
 * Reading a room's players must survive the shapes RTDB actually stores.
 *
 * `pruneStale` read `Object.values(room.players).filter(p => !p.uid.startsWith("bot-"))`.
 * That is correct against the `RoomPlayer` TYPE — where `uid` and `name` are declared
 * required — and wrong against the wire, where a player node can exist carrying nothing
 * but `connected`: writing `players/<uid>/connected` for presence creates the parent on
 * its own, so a client that drops while joining leaves a stub behind with no `uid` at all.
 *
 * `p.uid.startsWith(...)` then threw. Because the sweep accumulates ONE multi-path update
 * and applies it after the loop, that single throw discarded the entire run — every 30
 * minutes, silently, for weeks. Measured on production data at the time of the fix: 11
 * stub nodes were holding back 206 deletable games, and the backlog only grew.
 *
 * Typechecking cannot catch this: the type says `uid: string`, so the old line compiled
 * perfectly. Only a test against the real shape can, which is why this file exists.
 *
 * What is claimed here:
 *  - a presence stub never throws, and is never treated as a player;
 *  - a player's uid comes from its KEY, not from the writable `uid` field
 *    (database.rules.json enforces `$uid === auth.uid` on the key but puts no .validate
 *     on the field, so the field is forgeable and the key is not);
 *  - bots are still identified, and real players still come through intact.
 */

import { joinedPlayers } from "../src/game/net/match";
import type { Room } from "../src/game/net/roomStore";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const roomWith = (players: Record<string, unknown>) => ({ players } as unknown as Room);

console.log("Reading room players\n");

console.log("a presence-only stub is survived, not counted:");
{
  // The exact shape found in production: the node exists, holds only `connected`.
  const room = roomWith({
    "z34fSwNt2HYYcfBuXI90htR0uWq2": { uid: "z34fSwNt2HYYcfBuXI90htR0uWq2", name: "Ash", hp: 40, alive: true, place: null },
    "fCBWwG56ESY2ra0vYI2n8pmFV1P2": { connected: false },
  });

  let threw = false;
  let players: ReturnType<typeof joinedPlayers> = [];
  try { players = joinedPlayers(room); } catch { threw = true; }

  assert(!threw, "reading the room does not throw (this is the bug that broke the sweep)");
  assert(players.length === 1, `only the real player is returned (${players.length})`);
  assert(players[0]?.uid === "z34fSwNt2HYYcfBuXI90htR0uWq2", "and it is the one who actually joined");
  assert(!players.some((p) => p.uid === "fCBWwG56ESY2ra0vYI2n8pmFV1P2"),
    "the stub is absent, so it can never be handed a placement or a rating");

  // The old expression, kept honest: it must still throw on this input, or this
  // test would pass for the wrong reason.
  let oldThrew = false;
  try {
    (Object.values(room.players ?? {}) as { uid: string }[]).filter((p) => !p.uid.startsWith("bot-"));
  } catch { oldThrew = true; }
  assert(oldThrew, "and the old `Object.values(...).filter(p => p.uid...)` really does throw on it");
}

console.log("\nthe uid comes from the key, which is the only enforced one:");
{
  // A client can write anything into its own `uid` field — rules validate the KEY.
  const room = roomWith({
    "realUid123": { uid: "bot-impostor", name: "Sneaky", hp: 20, alive: true, place: null },
  });
  const [p] = joinedPlayers(room);
  assert(p?.uid === "realUid123", "the key wins over a forged `uid` field");
  assert(!p.uid.startsWith("bot-"), "so a human cannot disguise themselves as a bot to dodge an LP loss");
}

console.log("\nbots and real players still read correctly:");
{
  const room = roomWith({
    "bot-3od029": { uid: "bot-3od029", name: "Rival", isBot: true, hp: 0, alive: false, place: 5 },
    "humanA": { uid: "humanA", name: "Red", hp: 30, alive: true, place: null },
    "humanB": { uid: "humanB", name: "Blue", hp: 10, alive: true, place: 3 },
    "ghost": { connected: true },
  });
  const all = joinedPlayers(room);
  const real = all.filter((p) => !p.uid.startsWith("bot-"));

  assert(all.length === 3, `the stub is dropped, the rest kept (${all.length} of 4 nodes)`);
  assert(real.length === 2, `bots are separable by uid prefix (${real.length} humans)`);
  assert(real.every((p) => typeof p.name === "string"), "every returned player has the fields the sweep reads");
  assert(all.find((p) => p.uid === "humanB")?.place === 3, "an already-decided placement is carried through untouched");
}

console.log("\nempty and malformed rooms are handled:");
{
  assert(joinedPlayers(roomWith({})).length === 0, "a room with no players yields none");
  assert(joinedPlayers({} as Room).length === 0, "a room with no `players` key at all yields none");
  assert(joinedPlayers(roomWith({ a: null, b: undefined })).length === 0, "null/undefined player nodes are skipped");
}

console.log(
  failures === 0
    ? "\n✅ A presence stub can no longer abort the stale-game sweep"
    : `\n❌ ${failures} prune-stale assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
