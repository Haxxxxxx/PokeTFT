/**
 * Combat sim tests: determinism, strong-beats-weak, empty-board edge case.
 * Run: npx tsx test/combat-sim.ts
 */
import { simulate } from "../src/game/engine/combat";
import type { UnitInstance } from "../src/game/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}

/** Build a board of n copies of defId at the given star level. */
function makeBoard(defId: string, star: 1 | 2 | 3, n: number): UnitInstance[] {
  const cols = [3, 2, 4, 1, 5, 0, 6];
  return Array.from({ length: n }, (_, i) => ({
    iid: `${defId}_${star}_${i}`,
    defId,
    star,
    pos: [cols[i % cols.length], 1] as [number, number],
    items: [],
  }));
}

/** Compact fingerprint of a fight result (winner + per-frame HP snapshot). */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function fingerprint(r: ReturnType<typeof simulate>): string {
  const frames = r.frames.map((f) =>
    f.units.map((u) => `${u.id}:${u.hpFrac.toFixed(5)}:${u.alive}`).join("|")
  ).join(";");
  return `${r.winner}#${r.survivors}#${r.frames.length}#${hashStr(frames)}`;
}

// ── Determinism ───────────────────────────────────────────────────────────────
console.log("determinism");
{
  const a = makeBoard("pidgey", 2, 4);
  const b = makeBoard("rattata", 2, 4);
  const fp1 = fingerprint(simulate(a, b));
  const fp2 = fingerprint(simulate(a, b));
  assert(fp1 === fp2, "same boards → byte-identical result on two runs");

  // Different seed (different boards) should produce a different fingerprint
  const c = makeBoard("caterpie", 1, 3);
  const fp3 = fingerprint(simulate(a, c));
  assert(fp1 !== fp3, "different boards → different fingerprint (seed sensitivity)");
}

// ── Strong beats weak ─────────────────────────────────────────────────────────
console.log("\nstrong beats weak");
{
  const strong = makeBoard("pidgey",   3, 6);   // 6× fully-evolved
  const weak   = makeBoard("caterpie", 1, 2);   // 2× weakest
  const result = simulate(strong, weak);
  assert(result.winner === "ally",   "6× Pidgey★3 beats 2× Caterpie★1");
  assert(result.survivors > 0,       "strong side has survivors");
  // All weak units should be dead
  const lastFrame = result.frames[result.frames.length - 1];
  const enemiesAlive = lastFrame.units.filter((u) => u.team === "enemy" && u.alive);
  assert(enemiesAlive.length === 0,  "all Caterpie dead by the end");
}

// ── Reversed perspective is consistent ───────────────────────────────────────
console.log("\nperspective consistency");
{
  const strong = makeBoard("pidgey",   3, 6);
  const weak   = makeBoard("caterpie", 1, 2);
  // When the "enemy" side is strong, the enemy should win
  const reversed = simulate(weak, strong);
  assert(reversed.winner === "enemy", "strong side wins regardless of ally/enemy slot");
}

// ── Empty board edge case ─────────────────────────────────────────────────────
console.log("\nempty board");
{
  const one  = makeBoard("pidgey", 1, 1);
  const none: UnitInstance[] = [];

  const allyEmpty = simulate(none, one);
  assert(allyEmpty.winner === "enemy", "ally empty → enemy wins immediately");
  assert(allyEmpty.survivors === 1,    "enemy retains its single unit");

  const enemyEmpty = simulate(one, none);
  assert(enemyEmpty.winner === "ally", "enemy empty → ally wins immediately");
  assert(enemyEmpty.survivors === 1,   "ally retains its single unit");

  const bothEmpty = simulate(none, none);
  assert(bothEmpty.winner === "draw",  "both empty → draw");
  assert(bothEmpty.survivors === 0,    "draw has 0 survivors");
}

// ── Frame structure sanity ────────────────────────────────────────────────────
console.log("\nframe structure");
{
  const a = makeBoard("pidgey", 2, 3);
  const b = makeBoard("rattata", 2, 3);
  const result = simulate(a, b);
  assert(result.frames.length >= 1,    "at least one frame is emitted");
  assert(result.frames[0].t === 0,     "first frame is at t=0");
  const first = result.frames[0];
  assert(first.units.length === 6,     "first frame has all 6 units");
  assert(first.units.every((u) => u.alive), "all units alive at t=0");
  assert(result.duration > 0,          "fight has positive duration");
}

console.log(`\n${failures === 0 ? "✅ All combat-sim tests passed" : `❌ ${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
