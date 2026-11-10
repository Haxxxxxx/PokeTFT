/**
 * Guards the fix for "3D on the bench and in planning, 2D sprites in combat".
 *
 * Board and CombatStage each kept their own `loadedModels` in component state,
 * keyed by `${unitInstanceId}:${dex}`. Both properties were wrong, and together
 * they guaranteed the symptom:
 *
 *   - component state dies with the mount, so every combat round started with
 *     NOTHING loaded and fell back to sprites;
 *   - keying by unit instance meant a model loaded during planning could never
 *     match a combat unit, which carries a different id.
 *
 * The behavioural half is asserted directly. The structural half is a
 * source-level assertion, in the same spirit as test/db-adapter.ts: exercising
 * it for real would need a WebGL context, a mounted React tree and models off
 * the network, none of which belongs in the engine suite — while the failure
 * mode is silent and purely visual, so nothing else would catch it.
 */

import { readFileSync } from "node:fs";
import {
  markModelReady,
  markModelFailed,
  isModelReady,
  __resetModelReadyForTests,
} from "../src/game/data/model-ready";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Model readiness\n");

console.log("readiness belongs to the MODEL, not to the unit holding it:");
{
  __resetModelReadyForTests();
  assert(!isModelReady(25), "a model nothing has loaded is not ready");
  markModelReady(25);
  assert(isModelReady(25), "once loaded, it is ready");
  assert(!isModelReady(26), "and a different species is unaffected");
  // The whole point: no unit id is involved anywhere in that exchange, so the
  // same species on a combat unit reads as ready too.
}

console.log("\nit survives what used to reset it:");
{
  __resetModelReadyForTests();
  markModelReady(6);
  // A combat round mounting is, from this store's point of view, nothing at all
  // — which is exactly the property that was missing.
  assert(isModelReady(6), "a model stays ready across any number of remounts");
  markModelReady(6);
  assert(isModelReady(6), "and marking it twice is harmless");
}

console.log("\na failed model does not pretend to be ready:");
{
  __resetModelReadyForTests();
  markModelFailed(150);
  assert(!isModelReady(150), "so its 2D sprite keeps rendering");
  markModelReady(150);
  assert(isModelReady(150), "a later success still promotes it");
}

console.log("\nneither board nor combat keeps its own copy of this state:");
{
  for (const file of [
    "src/components/game/Board.tsx",
    "src/components/game/CombatStage.tsx",
  ]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert(
      !/useState<Set<string>>/.test(src),
      `${file} does not hold model readiness in component state`,
    );
    assert(
      src.includes("useModelReady"),
      `${file} reads readiness from the shared store`,
    );
    assert(
      !/loadedModels\.has\(/.test(src),
      `${file} no longer probes a local, instance-keyed set`,
    );
  }
}

console.log(
  failures === 0
    ? "\n✅ Model readiness is shared, model-keyed and mount-independent"
    : `\n❌ ${failures} model-readiness assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
