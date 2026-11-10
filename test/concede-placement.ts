/**
 * Two players quitting at the same moment must not be given the same placement.
 *
 * concede() took its `place` from a snapshot of who was alive, and nothing
 * serialised it. Two simultaneous quits therefore both read the same alive
 * count and were both handed that number — two 4ths and no 3rd — and the same
 * race existed between a concede and endCombat. (endCombat itself is safe:
 * claimTransition parks the deadline so only one runs per round.)
 *
 * Placements now come from a single cursor that is TAKEN FROM rather than
 * recomputed, so each claim is handed a distinct number by construction. That
 * is the property worth testing, so the tests here never recompute an expected
 * place from the alive set — they assert that the numbers handed out are
 * distinct, descending, and survive a repeat claim.
 */

import { setDbAdapter } from "../src/game/net/db-adapter";
import { concedeAtomic } from "../src/game/net/match";

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

const CODE = "ABC123";
function room(aliveUids: string[], cursor?: number) {
  store = {};
  const players: Obj = {};
  for (const u of aliveUids) players[u] = { uid: u, alive: true, hp: 100 };
  set(store, `games/${CODE}/players`, players);
  if (cursor !== undefined) set(store, `games/${CODE}/meta/placeCursor`, cursor);
}
const placeOf = (uid: string) => get(store, `games/${CODE}/players/${uid}/place`);
const aliveOf = (uid: string) => get(store, `games/${CODE}/players/${uid}/alive`);

async function main() {
  console.log("Concede placements\n");

  console.log("simultaneous quits get DISTINCT placements:");
  {
    room(["a", "b", "c", "d"], 4);
    // Both claims are made against the same starting state — the shape of the
    // race. Under the old snapshot arithmetic both would read "4 alive".
    const [pa, pb] = await Promise.all([
      concedeAtomic(CODE, "a", 4),
      concedeAtomic(CODE, "b", 4),
    ]);
    assert(pa !== null && pb !== null, "both quits are accepted");
    assert(pa !== pb, `the two placements differ (${pa} vs ${pb})`);
    assert(new Set([pa, pb]).size === 2, "no duplicate medal is handed out");
    assert([pa, pb].sort().join(",") === "3,4", "and they are the two worst remaining places (3 and 4)");
  }

  console.log("\nplacements keep descending as more players quit:");
  {
    room(["a", "b", "c", "d"], 4);
    const got: Array<number | null> = [];
    for (const u of ["a", "b", "c"]) got.push(await concedeAtomic(CODE, u, 4));
    assert(got.join(",") === "4,3,2", `each quit takes the next worst place (${got.join(", ")})`);
    assert(get(store, `games/${CODE}/meta/placeCursor`) === 1, "and the cursor is left pointing at the winner's place");
  }

  console.log("\nquitting twice does not consume two placements:");
  {
    room(["a", "b", "c", "d"], 4);
    const first = await concedeAtomic(CODE, "a", 4);
    const again = await concedeAtomic(CODE, "a", 4);
    assert(first === 4, "the first quit takes 4th");
    assert(again === null, "the repeat is refused rather than taking another place");
    assert(placeOf("a") === 4, "and the recorded placement is unchanged");
    assert(get(store, `games/${CODE}/meta/placeCursor`) === 3, "the cursor moved exactly once");
  }

  console.log("\nthe elimination itself is recorded:");
  {
    room(["a", "b"], 2);
    await concedeAtomic(CODE, "a", 2);
    assert(aliveOf("a") === false, "the quitter is marked eliminated");
    assert(get(store, `games/${CODE}/players/a/hp`) === 0, "with HP zeroed");
    assert(aliveOf("b") === true, "and nobody else is touched");
  }

  console.log("\na room that predates the cursor still works:");
  {
    room(["a", "b", "c"]); // no placeCursor seeded
    const p = await concedeAtomic(CODE, "a", 3);
    assert(p === 3, "the alive count is used as the opening value");
    const q = await concedeAtomic(CODE, "b", 3);
    assert(q === 2, "and the cursor takes over from there, still distinct");
  }

  console.log(
    failures === 0
      ? "\n✅ Placements are taken from one source and are always distinct"
      : `\n❌ ${failures} concede-placement assertion(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
