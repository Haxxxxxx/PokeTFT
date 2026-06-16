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
import { teamBuffForAugments } from "../src/game/data/augments";

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

// --- Board array-ORDER independence -------------------------------------------
// RTDB stores arrays as index-keyed objects and may reorder/compact them, so the
// host's array order can differ from a client's read-back order. simulate() must
// produce a BYTE-IDENTICAL fight regardless of unit array order — otherwise the
// seed or a tie-break diverges and one player sees a win while the other sees a
// loss. Shuffle both boards deterministically and assert the full fingerprint.
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
let ordPass = 0, ordFail = 0;
for (let trial = 0; trial < 24; trial++) {
  const ba = generateBoard(2 + (trial % 7), 5 + (trial % 4), 3100 + trial * 19);
  const bb = generateBoard(2 + ((trial + 2) % 7), 5 + ((trial + 3) % 4), 8100 + trial * 23);
  if (ba[0]) ba[0].items = ["choice-band"];
  if (bb[1]) bb[1].items = ["c-ap", "c-crit"];
  const base = fingerprint(simulate(ba, bb));
  const shuffled = fingerprint(simulate(shuffle(ba, 7 + trial), shuffle(bb, 99 - trial)));
  if (base === shuffled) ordPass++;
  else { ordFail++; console.error(`order trial ${trial}: FAIL base!=shuffled`); }
}
console.log(`${ordPass}/${ordPass + ordFail} board array-order independence`);

// --- Combat-augment team-buff determinism -------------------------------------
// Combat augments apply a team-wide buff at fight start, derived from PUBLIC augment
// data on host AND client. The buff must (1) be pure: same boards + same buffs ->
// identical fight, (2) survive the RTDB round-trip exactly like an unbuffed fight, and
// (3) actually change the outcome (not be silently inert) — else buffed combats desync.
let buffPass = 0, buffFail = 0;
const ALLY_BUFF = { adMult: 1.18, hpMult: 1.2, manaStart: 12 };
const ENEMY_BUFF = { apMult: 1.28, asMult: 1.18, armorAdd: 22 };
for (let trial = 0; trial < 24; trial++) {
  const a = generateBoard(2 + (trial % 7), 4 + (trial % 4), 4400 + trial * 13);
  const b = generateBoard(2 + ((trial + 1) % 7), 4 + ((trial + 2) % 4), 9400 + trial * 17);
  const pure1 = fingerprint(simulate(a, b, ALLY_BUFF, ENEMY_BUFF));
  const pure2 = fingerprint(simulate(a, b, ALLY_BUFF, ENEMY_BUFF));     // identical inputs
  const host = fingerprint(simulate(a, b, ALLY_BUFF, ENEMY_BUFF));
  const client = fingerprint(simulate(clientCoerce(rtdbMangle(a)), clientCoerce(rtdbMangle(b)), ALLY_BUFF, ENEMY_BUFF));
  const changed = fingerprint(simulate(a, b)) !== host;
  if (pure1 === pure2 && host === client && changed) buffPass++;
  else { buffFail++; console.error(`buff trial ${trial}: FAIL pure=${pure1 === pure2} parity=${host === client} changed=${changed}`); }
}
console.log(`${buffPass}/${buffPass + buffFail} combat-augment buff determinism + RTDB parity`);

// --- Combat-augment fold: order-independent, correct, cap doesn't clip legit play ------
// teamBuffForAugments runs on BOTH host and client; it must fold to the SAME buff
// regardless of the synced array's order (it iterates the canonical AUGMENTS list).
let augPass = 0, augFail = 0;
{
  const a = teamBuffForAugments(["swords-dance", "bulk-up", "focus-band"]);
  const b = teamBuffForAugments(["focus-band", "bulk-up", "swords-dance"]); // different order
  const orderOk = JSON.stringify(a) === JSON.stringify(b);
  // swords-dance ad×1.18, bulk-up ad×1.22 hp×1.20, focus-band hp×1.12.
  const correctOk = Math.abs((a.adMult ?? 0) - 1.18 * 1.22) < 1e-9
    && Math.abs((a.hpMult ?? 0) - 1.20 * 1.12) < 1e-9;
  const capOk = (a.adMult ?? 0) <= 1.8 && (a.hpMult ?? 0) <= 1.8 // never exceeds the ceiling
    && (a.adMult ?? 0) > 1.4;                                    // …but a legit stack isn't clipped
  const emptyOk = JSON.stringify(teamBuffForAugments([])) === "{}" && JSON.stringify(teamBuffForAugments(undefined)) === "{}";
  if (orderOk && correctOk && capOk && emptyOk) augPass++;
  else { augFail++; console.error(`aug fold FAIL order=${orderOk} correct=${correctOk} cap=${capOk} empty=${emptyOk}`); }
}
console.log(`${augPass}/${augPass + augFail} augment fold order-independence + cap`);

if (fail > 0 || netFail > 0 || ordFail > 0 || buffFail > 0 || augFail > 0) { console.error("\n❌ combat parity broken"); process.exit(1); }
console.log("✅ combat is deterministic, order-independent, flip-parity holds, and survives the RTDB round-trip");
