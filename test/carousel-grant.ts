/**
 * A carousel is a reward every player is owed. Being disconnected must not
 * cost it.
 *
 * The pick is applied entirely in the PICKER's own client — the server only
 * records a `carouselPicked` flag — so a player who is away when the timer
 * expires applies nothing, and endCarousel then wiped the carousel node on the
 * way to planning. Closing the tab during a carousel cost you the round's item
 * outright, with nothing anywhere to say it had happened.
 *
 * An earlier fix made the EARLY finish wait for every alive human, which helps
 * a backgrounded tab and does nothing for a player who is genuinely gone: the
 * deadline still bounds the wait. So the host now parks the reward in a
 * mailbox keyed by round.
 *
 * What has to hold, and what this checks:
 *   - someone who picked gets no grant (they already have their reward)
 *   - someone who did not gets exactly one, carrying the ITEM slot
 *   - re-running endCarousel does not hand out a second copy
 *   - bots never get one, and neither does a player eliminated already
 */

import { setDbAdapter } from "../src/game/net/db-adapter";
import { endCarousel } from "../src/game/net/match";

type Obj = Record<string, unknown>;
let store: Obj = {};

const get = (root: Obj, path: string): unknown =>
  path.split("/").filter(Boolean).reduce<unknown>((cur, k) => (cur == null ? cur : (cur as Obj)[k]), root);

function set(root: Obj, path: string, val: unknown): void {
  const keys = path.split("/").filter(Boolean);
  let cur: Obj = root;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== "object" || cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Obj;
  }
  if (val === null) delete cur[keys[keys.length - 1]];
  else cur[keys[keys.length - 1]] = val;
}

setDbAdapter({
  async get(path) { return (get(store, path) ?? null) as never; },
  async update(path, value) {
    for (const [k, v] of Object.entries(value)) set(store, `${path}/${k}`, v === undefined ? null : v);
  },
  async transaction(path, fn) {
    const cur = get(store, path) ?? null;
    const next = fn(cur as never);
    if (next === undefined) return { committed: false, value: cur as never };
    set(store, path, next);
    return { committed: true, value: next as never };
  },
});

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

const CODE = "CARO01";
const KEY = "2-4";

type P = { uid: string; alive?: boolean; isBot?: boolean; picked?: boolean };

function setup(players: P[]) {
  store = {};
  const ps: Obj = {};
  const carousel: Obj = {};
  for (const p of players) {
    ps[p.uid] = {
      uid: p.uid, hp: 100,
      alive: p.alive !== false,
      isBot: !!p.isBot,
      ...(p.picked ? { carouselPicked: KEY } : {}),
    };
    // [item, ...four units] — exactly the shape startCarousel writes.
    carousel[p.uid] = [`item-${p.uid}`, "unit-a", "unit-b", "unit-c", "unit-d"];
  }
  set(store, `games/${CODE}/players`, ps);
  set(store, `games/${CODE}/carousel`, carousel);
  set(store, `games/${CODE}/meta`, {
    phase: "carousel", stage: 2, round: 4, deadline: 0, hostUid: "host",
  });
}

// ?? null is load-bearing: get() returns UNDEFINED for a missing path, and the
// assertions below compare against null. Without it, "no grant was written"
// reads as a failure and the test reports a bug in code that is behaving
// correctly -- which is exactly what it did on its first run.
const grantOf = (uid: string) => (get(store, `games/${CODE}/grants/${uid}/${KEY}`) ?? null) as { pick?: string } | null;
const grantsOf = (uid: string) => Object.keys((get(store, `games/${CODE}/grants/${uid}`) ?? {}) as Obj);

async function main() {
  console.log("Carousel grants\n");

  console.log("a player who never picked is still paid:");
  {
    setup([{ uid: "away" }, { uid: "picked", picked: true }]);
    await endCarousel(CODE, (await (async () => get(store, `games/${CODE}`))()) as never);
    const g = grantOf("away");
    assert(!!g, "the disconnected player gets a grant");
    assert(g?.pick === "item-away",
      `and it is the ITEM slot, which cannot be refused by a full bench (${g?.pick})`);
    assert(grantOf("picked") === null, "while the player who picked gets none");
  }

  console.log("\nthe round still advances:");
  {
    assert(get(store, `games/${CODE}/meta/phase`) === "planning", "the phase moves to planning");
    assert(get(store, `games/${CODE}/meta/round`) !== 4 || get(store, `games/${CODE}/meta/stage`) !== 2,
      "and the round advanced");
    assert(get(store, `games/${CODE}/carousel`) == null, "the carousel node is cleared");
  }

  console.log("\nre-running it does not pay twice:");
  {
    setup([{ uid: "away" }]);
    const snap = () => get(store, `games/${CODE}`) as never;
    await endCarousel(CODE, snap());
    const after1 = grantsOf("away");
    // The real retry shape: the repair path can call endCarousel again on a
    // room snapshot taken before the first run.
    set(store, `games/${CODE}/meta/phase`, "carousel");
    set(store, `games/${CODE}/meta/stage`, 2);
    set(store, `games/${CODE}/meta/round`, 4);
    set(store, `games/${CODE}/carousel`, { away: ["item-away", "u"] });
    await endCarousel(CODE, snap());
    const after2 = grantsOf("away");
    assert(after1.length === 1, `one grant after the first run (${after1.length})`);
    assert(after2.length === 1,
      `still one after a retry — keyed by round, not a push id (${after2.length})`);
  }

  console.log("\nbots and the eliminated are not paid:");
  {
    setup([{ uid: "bot-1", isBot: true }, { uid: "dead", alive: false }, { uid: "live" }]);
    await endCarousel(CODE, get(store, `games/${CODE}`) as never);
    assert(grantOf("bot-1") === null, "a bot gets nothing");
    assert(grantOf("dead") === null, "nor does an eliminated player");
    assert(!!grantOf("live"), "but a live human still does");
  }

  console.log("\na missing carousel entry is skipped rather than written as junk:");
  {
    setup([{ uid: "nolist" }]);
    set(store, `games/${CODE}/carousel`, {}); // no options for this player
    await endCarousel(CODE, get(store, `games/${CODE}`) as never);
    assert(grantOf("nolist") === null, "no grant is written when there is nothing to grant");
  }

  console.log(
    failures === 0
      ? "\n✅ A disconnected player's carousel reward survives the round"
      : `\n❌ ${failures} carousel-grant assertion(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
