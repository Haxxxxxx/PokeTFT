/**
 * Engine determinism + flip-parity test (run: `npm run test:engine`).
 *
 * The whole multiplayer combat model rests on simulate() being PURE: the host and
 * both paired clients run the identical simulate(attacker, defender) call and must
 * get a byte-identical result. The flipped (enemy-side) client mirrors only the
 * VIEW, so the underlying winner must match — never swap. This guards against any
 * regression that would make fights resolve differently across screens.
 */
import { simulate, type CombatResult } from "../src/game/engine/combat";
import { generateBoard } from "../src/game/engine/enemy";

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A compact fingerprint of the entire fight (winner + every frame's HP state). */
function fingerprint(r: CombatResult): string {
  const frames = r.frames.map((f) => f.units.map((u) => `${u.id}:${u.hpFrac.toFixed(5)}:${u.c},${u.r}`).join("|")).join(";");
  return `${r.winner}#${r.survivors}#${r.frames.length}#${hashStr(frames)}`;
}

let pass = 0;
let fail = 0;
for (let trial = 0; trial < 24; trial++) {
  const a = generateBoard(1 + (trial % 8), 3 + (trial % 5), 1000 + trial * 7);
  const b = generateBoard(1 + ((trial + 3) % 8), 3 + ((trial + 2) % 5), 5000 + trial * 11);

  const r1 = fingerprint(simulate(a, b));
  const r2 = fingerprint(simulate(a, b));            // pure: identical inputs -> identical output
  const host = simulate(a, b);
  const enemySideClient = simulate(a, b);            // flip is a view transform, not a re-sim
  const ok = r1 === r2 && host.winner === enemySideClient.winner && host.survivors === enemySideClient.survivors;

  if (ok) pass++; else { fail++; console.error(`trial ${trial}: FAIL det=${r1 === r2} winner=${host.winner}/${enemySideClient.winner}`); }
}

console.log(`${pass}/${pass + fail} deterministic + flip-parity`);

// --- Host -> RTDB -> client path parity ---------------------------------------
// The host computes the authoritative winner from in-memory boards, writes them
// to RTDB, and clients re-simulate the read-back boards. RTDB strips empty arrays
// and can turn arrays into index-keyed objects. Replicate that mangling and
// confirm the client's winner still matches the host's — i.e. you can never see a
// loss while the host recorded a win.
type U = ReturnType<typeof generateBoard>[number];
function rtdbMangle(board: U[]): unknown {
  // JSON round-trip, drop empty `items`, and key the list like a sparse RTDB object.
  const obj: Record<string, unknown> = {};
  board.forEach((u, i) => {
    const c: Record<string, unknown> = { iid: u.iid, defId: u.defId, star: u.star, pos: u.pos };
    if (u.items && u.items.length) c.items = u.items;
    obj[i] = JSON.parse(JSON.stringify(c));
  });
  return obj;
}
function clientCoerce(b: unknown): U[] {
  const arr = Array.isArray(b) ? b : Object.values(b as Record<string, U>);
  return (arr as U[]).filter((u) => u && u.pos).map((u) => ({ ...u, pos: u.pos ?? null, items: u.items ?? [] })) as U[];
}
let netPass = 0, netFail = 0;
for (let trial = 0; trial < 24; trial++) {
  const ba = generateBoard(2 + (trial % 7), 4 + (trial % 4), 2000 + trial * 13);
  const bb = generateBoard(2 + ((trial + 4) % 7), 4 + ((trial + 1) % 4), 7000 + trial * 17);
  // Give a couple of units items so item handling is exercised on both paths.
  if (ba[0]) ba[0].items = ["choice-band"];
  if (bb[0]) bb[0].items = ["life-orb"];
  const host = simulate(ba, bb);                                   // authoritative
  const client = simulate(clientCoerce(rtdbMangle(ba)), clientCoerce(rtdbMangle(bb)));
  const ok = host.winner === client.winner && host.survivors === client.survivors;
  if (ok) netPass++; else { netFail++; console.error(`net trial ${trial}: FAIL host=${host.winner} client=${client.winner}`); }
}
console.log(`${netPass}/${netPass + netFail} host->RTDB->client winner parity`);

if (fail > 0 || netFail > 0) { console.error("\n❌ combat parity broken"); process.exit(1); }
console.log("✅ combat is deterministic, flip-parity holds, and survives the RTDB round-trip");
