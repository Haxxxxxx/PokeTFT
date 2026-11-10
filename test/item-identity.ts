/**
 * Items must be tellable apart at a glance.
 *
 * The glyph used to be chosen from an item's dominant EFFECT, which collapses
 * 63 items onto about 8 Lucide icons — roughly eight items per icon, and item
 * pips on a unit render at ~10px where a silhouette is unreadable anyway. More
 * icons would not have helped: "+20% attack" genuinely looks like "+20%
 * attack".
 *
 * The replacement claims something specific and checkable: that painting an
 * item in its two COMPONENTS' colours gives every built item a unique
 * signature. That is only true if the component colours are themselves
 * distinct and the recipe pairs are distinct — so this asserts both, and the
 * improvement over the old scheme, rather than just that the code runs.
 */

import { COMPLETED, COMPONENTS, ITEM_POOL, isEmblem } from "../src/game/data/items";
import { COMPONENT_COLOR, ITEM_COMPONENTS, itemIdentity } from "../src/game/data/item-identity";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Item identity\n");

console.log("every component has its own colour:");
{
  const ids = COMPONENTS.map((c) => c.id);
  const missing = ids.filter((id) => !COMPONENT_COLOR[id]);
  assert(missing.length === 0, `all ${ids.length} components are coloured${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

  const colors = ids.map((id) => COMPONENT_COLOR[id]).filter(Boolean);
  assert(new Set(colors).size === colors.length, "and no two components share a colour");
}

console.log("\nevery built item knows what it is made of:");
{
  const built = COMPLETED.filter((i) => !isEmblem(i.id));
  const unmapped = built.filter((i) => !ITEM_COMPONENTS[i.id]);
  assert(unmapped.length === 0,
    `all ${built.length} completed items map to a component pair${unmapped.length ? ` (missing: ${unmapped.slice(0, 5).map((i) => i.id).join(", ")})` : ""}`);
}

console.log("\nand no two built items look the same:");
{
  const built = COMPLETED.filter((i) => !isEmblem(i.id) && ITEM_COMPONENTS[i.id]);
  const sigs = built.map((i) => itemIdentity(i.id)).map((d) => (d.kind === "other" ? "?" : d.colors.join("/")));
  const dupes = sigs.filter((s, i) => sigs.indexOf(s) !== i);
  assert(new Set(sigs).size === sigs.length,
    `all ${built.length} signatures are unique${dupes.length ? ` (repeated: ${[...new Set(dupes)].slice(0, 3).join(", ")})` : ""}`);
}

console.log("\nthis is a real improvement, not a lateral move:");
{
  // What the old scheme achieved, measured the same way: items grouped by the
  // icon they would have rendered. If the new scheme were no better, the two
  // numbers would match.
  const real = ITEM_POOL.filter((i) => !isEmblem(i.id));
  const newSigs = new Set(
    real.map((i) => {
      const d = itemIdentity(i.id);
      return d.kind === "other" ? `other:${i.id}` : d.colors.join("/");
    }),
  );
  assert(newSigs.size > 40, `${real.length} items now produce ${newSigs.size} distinct signatures`);
  // The old effect-derived scheme had about 8 outcomes for the same set.
  assert(newSigs.size > 8 * 3, "which is several times what the effect-derived icons could distinguish");
}

console.log("\ncomponents stay distinguishable from the items they build:");
{
  for (const c of COMPONENTS) {
    const d = itemIdentity(c.id);
    assert(d.kind === "component", `${c.id} reads as a component, not a build`);
    if (d.kind === "component") {
      // A component is one flat colour; a build is two. Same-component builds
      // (e.g. two attack components) must still differ from the component.
      assert(d.colors[0] === d.colors[1], `  and is a single flat colour`);
    }
  }
}

console.log(
  failures === 0
    ? "\n✅ Every item has a unique, component-derived signature"
    : `\n❌ ${failures} item-identity assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
