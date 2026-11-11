/**
 * Combat has to be able to ask what a unit IS.
 *
 * A combat frame is a replay: it carries a `dex` and a star, not a defId,
 * because it describes what was on the board rather than pointing back at the
 * roster. So nothing in the fight could answer "what type is this", "what is
 * it called" or "show me its card" — which is why the HP bars were team
 * colours, the damage numbers were white, and clicking a fighting unit did
 * nothing.
 *
 * DEF_BY_DEX closes that, and it has to be right for EVERY form a unit can
 * appear as — not just its base — or a 2★ or 3★ mon mid-fight would fall back
 * to grey while its 1★ sibling showed a colour.
 */

import { UNITS, DEF_BY_DEX, primaryTypeForDex, typesForStar } from "../src/game/data/mons";
import { TYPE_COLOR } from "../src/game/ui";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Dex lookup\n");

console.log("every form of every roster entry resolves:");
{
  let forms = 0;
  const missing: string[] = [];
  for (const def of UNITS) {
    def.dex.forEach((d, i) => {
      forms++;
      const hit = DEF_BY_DEX[d];
      if (!hit) missing.push(`${def.id} ${i + 1}★ (dex ${d})`);
    });
  }
  assert(forms > 500, `the roster exposes ${forms} dex forms`);
  assert(missing.length === 0,
    missing.length === 0 ? "all of them map back to a definition"
      : `${missing.length} unmapped, e.g. ${missing.slice(0, 3).join(", ")}`);
}

console.log("\nand the star it resolves to is the right one:");
{
  // A dex REPEATS within a line whenever a mon keeps the same form across two
  // tiers -- Rattata is [19, 20, 20], Raticate at both 2 and 3 stars -- and 712
  // of the roster's forms are like that. First-writer picks the lower star,
  // which is only harmless if the TYPING is identical across the stars sharing
  // that dex. If it ever differed, the lookup would quietly serve the wrong
  // types. That, not the star index, is the thing worth asserting.
  let ambiguous = 0;
  const cases: string[] = [];
  for (const def of UNITS) {
    const seen = new Map<number, number[]>();
    def.dex.forEach((d, i) => seen.set(d, [...(seen.get(d) ?? []), i + 1]));
    for (const [d, stars] of seen) {
      if (stars.length < 2) continue;
      // PRIMARY type only — that is what the colour actually reads. Scyther is
      // the one case in the roster where a shared dex disagrees on the full
      // typing (bug/flying at 1 star, bug/steel after, keeping Scyther's
      // sprite throughout): its primary stays "bug", so the colour is right
      // either way. Asserting the full typing here would fail on a difference
      // the feature does not consume, and would have to be suppressed — which
      // is how a test stops meaning anything.
      const typings = stars.map((st) => typesForStar(def, st)[0]);
      if (new Set(typings).size > 1) {
        ambiguous++;
        if (cases.length < 3) cases.push(`${def.id} dex ${d}: ${typings.join(" vs ")}`);
      }
    }
  }
  assert(ambiguous === 0,
    ambiguous === 0
      ? "where a dex is shared across stars, the PRIMARY type is identical -- so resolving to the lower one is safe"
      : `${ambiguous} shared-dex forms disagree on typing, e.g. ${cases.join("; ")}`);

  // And a dex that is NOT shared must land on its own star exactly.
  let wrong = 0;
  for (const def of UNITS) {
    def.dex.forEach((d, i) => {
      if (def.dex.filter((x) => x === d).length > 1) return; // shared, handled above
      const hit = DEF_BY_DEX[d];
      if (hit && hit.def.id === def.id && hit.star !== i + 1) wrong++;
    });
  }
  assert(wrong === 0, "and an unshared dex resolves to exactly its own star");
}

console.log("\nevery resolvable form yields a colour:");
{
  let noType = 0;
  let noColour = 0;
  for (const def of UNITS) {
    for (const d of def.dex) {
      const ty = primaryTypeForDex(d);
      if (!ty) { noType++; continue; }
      if (!TYPE_COLOR[ty]) noColour++;
    }
  }
  assert(noType === 0, "no form comes back without a type");
  assert(noColour === 0, "and every type has a colour defined for it");
}

console.log("\nthe types follow the STAR, not just the species:");
{
  // Charmander → Charizard gains Flying at 3★. If the lookup ignored the star
  // this would read "fire" at every tier and the whole feature would be a
  // species colour wearing a type's name.
  const charmander = UNITS.find((u) => u.id === "charmander");
  assert(charmander !== undefined, "found a line that changes type as it evolves");
  if (charmander) {
    const at1 = typesForStar(charmander, 1);
    const at3 = typesForStar(charmander, 3);
    assert(at3.length > at1.length || at3[1] !== at1[1],
      `its typing really does change across stars (${at1.join("/")} → ${at3.join("/")})`);
    assert(primaryTypeForDex(charmander.dex[2]) === at3[0],
      "and the 3★ dex resolves to the 3★ typing");
  }
}

console.log("\nunknown input degrades instead of throwing:");
{
  assert(primaryTypeForDex(999999) === null, "an unknown dex returns null rather than crashing a frame");
  assert(DEF_BY_DEX[999999] === undefined, "and the map simply has no entry");
}

console.log(
  failures === 0
    ? "\n✅ Combat can resolve any unit on the board to its definition and type"
    : `\n❌ ${failures} dex-lookup assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
