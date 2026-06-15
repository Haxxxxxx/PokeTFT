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
if (fail > 0) { console.error("\n❌ combat is non-deterministic"); process.exit(1); }
console.log("✅ combat is deterministic and flip-parity holds");
