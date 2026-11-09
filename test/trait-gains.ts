/**
 * Shop "this completes a synergy" checks.
 *
 * The highlight is a decision prompt: a player buys off it. So the thing that
 * matters is that it never claims a gain that wouldn't happen, and never hides
 * one that would. `traitGainsFor` works by simulating the board with the unit
 * added and diffing tiers against the real synergy rules, and these assert the
 * behaviours a hand-rolled version would plausibly get wrong — above all the
 * duplicate case, since traits count DISTINCT defs.
 */

import { traitGainsFor, computeTraits } from "../src/game/engine/synergies";
import { TRAITS_BY_KEY } from "../src/game/data/traits";
import { UNITS } from "../src/game/data/mons";
import type { UnitInstance } from "../src/game/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

let n = 0;
const unit = (defId: string, star: 1 | 2 | 3 = 1): UnitInstance =>
  ({ iid: `u${n++}`, defId, star, pos: [0, n % 7], items: [] });

console.log("Shop trait-gain highlight\n");

console.log("Empty board:");
{
  // "starter" activates at 3, so one starter alone can't complete it.
  const gains = traitGainsFor("charmander", []);
  const starter = gains.find((g) => g.key === "starter");
  const starterBp = TRAITS_BY_KEY["starter"]?.breakpoints ?? [];
  assert(
    starterBp[0] > 1 ? !starter : !!starter,
    `a lone unit only claims traits whose first breakpoint is 1 (starter needs ${starterBp[0]})`,
  );
  assert(gains.every((g) => g.to > g.from), "every reported gain is a real tier increase");
}

console.log("\nReaching a breakpoint:");
{
  // Fire activates at 2. One fire unit on board + a fire unit in shop = gain.
  const board = [unit("charmander")];
  const gains = traitGainsFor("vulpix", board);
  const fire = gains.find((g) => g.key === "fire");
  const fireBp = TRAITS_BY_KEY["fire"]?.breakpoints ?? [];
  assert(fireBp[0] === 2, `fire's first breakpoint is 2 (got ${fireBp[0]})`);
  assert(!!fire, "a second distinct fire unit is reported as completing Fire");
  assert(fire ? fire.from === 0 && fire.to === 1 : false, "and it reports 0 → tier 1");
}

console.log("\nThe duplicate trap:");
{
  // Traits count DISTINCT defs — buying a copy of a unit already on the board
  // changes no trait count at all. This is the single most important case for
  // the highlight to get right, because it's where a naive "does this unit
  // share a trait with my board?" check would light up and mislead.
  const board = [unit("charmander")];
  const gains = traitGainsFor("charmander", board);
  assert(gains.length === 0, "buying a duplicate of a board unit reports no gain");

  const before = computeTraits(board);
  const after = computeTraits([...board, unit("charmander")]);
  const sameTiers = before.every((b) => (after.find((a) => a.key === b.key)?.tier ?? 0) === b.tier);
  assert(sameTiers, "and the underlying trait tiers genuinely don't move");
}

console.log("\nAlready-maxed traits:");
{
  // With a trait at its TOP tier, adding another carrier must not be reported
  // as a further gain. Carriers are pulled from the real roster rather than
  // hand-listed, so this can't quietly skip itself when a guessed name is
  // wrong or isn't actually Fire.
  const fireBp = TRAITS_BY_KEY["fire"]?.breakpoints ?? [];
  const topCount = fireBp[fireBp.length - 1];
  const carriers = UNITS.filter((u) => u.types.includes("fire")).map((u) => u.id);
  assert(carriers.length > topCount, `roster has more than ${topCount} Fire units to max the trait (${carriers.length})`);

  const board = carriers.slice(0, topCount).map((d) => unit(d));
  const tier = computeTraits(board).find((t) => t.key === "fire")?.tier ?? 0;
  assert(tier === fireBp.length, `board of ${topCount} Fire units reaches the top tier (${tier}/${fireBp.length})`);

  const extra = carriers[topCount];
  const gains = traitGainsFor(extra, board);
  assert(!gains.some((g) => g.key === "fire"), "a maxed trait is not reported as gaining again");
}

console.log("\nReported counts match reality:");
{
  const board = [unit("charmander"), unit("bulbasaur")];
  for (const candidate of ["vulpix", "squirtle", "pikachu"]) {
    const gains = traitGainsFor(candidate, board);
    const after = computeTraits([...board, unit(candidate)]);
    const ok = gains.every((g) => {
      const real = after.find((t) => t.key === g.key);
      return !!real && real.tier === g.to && real.count === g.count;
    });
    assert(ok, `${candidate} — every reported tier and count matches the simulated board`);
  }
}

if (failures) {
  console.error(`\n❌ ${failures} trait-gain assertion(s) failed`);
  process.exit(1);
}
console.log("\n✅ Shop trait-gain highlight verified");
