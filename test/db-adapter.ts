/**
 * Guards the "empty path means ROOT" rule in both DB adapters.
 *
 * applyRatingFor() finishes with one root-level multi-path update, written as
 * `update("", {...})`. Neither SDK accepts "" as a path:
 *
 *   - firebase (web):  ref(db, "")  throws
 *   - firebase-admin:  adb.ref("")  throws  ("child failed: … invalid path")
 *
 * Both have shipped this bug. The web one silently dropped ratings, history
 * and the leaderboard on every client-hosted game. It was then recorded that
 * admin "resolves to root" and was unaffected — which production telemetry
 * from a finished match disproved, with the admin error landing verbatim in
 * games/<code>/ratingFailures. The rating transaction targets a non-empty path
 * and succeeds, so the claim says ratingApplied while results/history/
 * leaderboard are silently gone: the failure is invisible from inside the game.
 *
 * This is a SOURCE-level assertion, not a behavioural one — exercising it for
 * real needs a live RTDB (web) and admin credentials (functions), neither of
 * which belongs in `npm test`. It is deliberately crude: it only checks that
 * each adapter routes through a guard rather than calling .ref(path) raw, so a
 * future edit that reintroduces the raw call fails here instead of in a
 * player's match.
 */

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("Root-path handling in the DB adapters\n");

{
  const web = readFileSync("src/game/net/db-adapter.ts", "utf8");
  // The guard: a helper that maps a falsy path to the no-argument ref().
  check(
    "web adapter routes every call through a root-aware helper",
    /const\s+refAt\s*=\s*\(path[^)]*\)\s*=>\s*\(path\s*\?/.test(web),
    "expected `const refAt = (path) => (path ? ref(db(), path) : ref(db()))`",
  );
  for (const op of ["get", "update", "transaction"]) {
    const raw = new RegExp(`${op}\\b[\\s\\S]{0,120}?\\bref\\(\\s*db\\(\\)\\s*,\\s*path\\s*\\)`);
    check(`web ${op}() does not call ref(db(), path) directly`, !raw.test(web));
  }
}

{
  const admin = readFileSync("functions/src/index.ts", "utf8");
  check(
    "admin adapter routes every call through a root-aware helper",
    /const\s+adminRefAt\s*=\s*\(path[^)]*\)\s*=>\s*\(path\s*\?/.test(admin),
    "expected `const adminRefAt = (path) => (path ? adb.ref(path) : adb.ref())`",
  );
  // Only the adapter matters: fixed literal paths elsewhere are fine.
  const adapter = admin.slice(admin.indexOf("setDbAdapter({"), admin.indexOf("});", admin.indexOf("setDbAdapter({")));
  check(
    "admin adapter body never calls adb.ref(path) directly",
    !/adb\.ref\(\s*path\s*\)/.test(adapter),
    "adb.ref(\"\") throws — root is adb.ref() with no argument",
  );
}

if (fail) {
  console.error(`\n❌ ${fail} adapter assertion(s) failed`);
  process.exit(1);
}
console.log(`\n✅ ${pass}/${pass} — both adapters treat an empty path as root`);
