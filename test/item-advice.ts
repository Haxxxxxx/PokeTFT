/**
 * The item recommendations have to be advice, not decoration.
 *
 * This replaced a type-effectiveness chart, which had the virtue of being
 * trivially correct — it restated a fixed table. A recommendation can be
 * wrong, and wrongly confident, and nothing in the UI would show it: three
 * plausible-looking item names appear either way. So the properties that make
 * it trustworthy are asserted here rather than eyeballed in a screenshot.
 *
 * The properties that matter:
 *   - it covers the whole roster, with finite numbers (600+ mons, none hand-
 *     classified, so a single NaN would surface as a blank row in the panel)
 *   - it tells tanks apart from carries, which is the one distinction the
 *     model actually claims to make
 *   - it never recommends an item the lobby disabled — advice you cannot act
 *     on is worse than none
 *   - it is deterministic, so the same mon does not reshuffle between renders
 */

import { UNITS, archetypeOf } from "../src/game/data/mons";
import { COMPLETED, ITEM_BY_ID } from "../src/game/data/items";
import { recommendedItems } from "../src/game/data/item-advice";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

console.log("Item recommendations\n");

console.log("every mon in the roster gets usable advice:");
{
  let empty = 0, bad = 0, unknown = 0;
  for (const def of UNITS) {
    for (const star of [1, 2, 3]) {
      const picks = recommendedItems(def, star);
      if (picks.length === 0) { empty++; continue; }
      for (const p of picks) {
        if (!Number.isFinite(p.gain) || p.gain <= 0) bad++;
        if (!ITEM_BY_ID[p.item.id]) unknown++;
      }
    }
  }
  assert(empty === 0, `every mon at every star gets at least one pick (${empty} blanks)`);
  assert(bad === 0, `every score is a finite, positive improvement (${bad} bad)`);
  assert(unknown === 0, `and every pick is a real item (${unknown} unknown)`);
}

console.log("\nit tells a tank apart from a carry:");
{
  // The model's one real claim. Tanks should lean on the durability axes;
  // carries should lean on the damage ones. Asserted in aggregate rather than
  // per-mon, because an individual statline can legitimately buck its label.
  const defensive = new Set(["survive", "sustain"]);
  const share = (arch: string) => {
    const mons = UNITS.filter((d) => archetypeOf(d) === arch);
    let def = 0, total = 0;
    for (const d of mons) {
      for (const p of recommendedItems(d, 2)) { total++; if (defensive.has(p.axis)) def++; }
    }
    return { n: mons.length, pct: total ? def / total : 0 };
  };
  const tank = share("tank");
  const phys = share("physical");
  const mage = share("mage");
  assert(tank.n > 0 && phys.n + mage.n > 0, `the roster has both kinds (${tank.n} tanks, ${phys.n + mage.n} carries)`);
  const carryPct = (phys.pct * phys.n + mage.pct * mage.n) / Math.max(1, phys.n + mage.n);
  assert(tank.pct > carryPct + 0.25,
    `tanks are recommended defensive items far more often than carries (${(tank.pct * 100).toFixed(0)}% vs ${(carryPct * 100).toFixed(0)}%)`);
  assert(tank.pct > 0.5, `and it is the majority of a tank's advice (${(tank.pct * 100).toFixed(0)}%)`);
}

console.log("\nit respects the lobby's enabled items:");
{
  const sample = UNITS.slice(0, 60);
  const pool = COMPLETED.slice(0, 5).map((i) => i.id);
  let outside = 0;
  for (const d of sample) {
    for (const p of recommendedItems(d, 1, { pool })) if (!pool.includes(p.item.id)) outside++;
  }
  assert(outside === 0, `nothing outside the enabled list is suggested (${outside} strays)`);

  // A one-item lobby must return that item, not an empty panel.
  const single = recommendedItems(sample[0], 1, { pool: [COMPLETED[0].id] });
  assert(single.length === 1 && single[0].item.id === COMPLETED[0].id,
    "a single-item lobby still gets its one item");

  // An EMPTY list means "no restriction recorded", not "nothing allowed" —
  // that is how rules.itemsEnabled is initialised, and treating it as a ban
  // would blank the panel for every default lobby.
  const none = recommendedItems(sample[0], 1, { pool: [] });
  assert(none.length === 3, `an empty rules list is treated as unrestricted (${none.length} picks)`);
}

console.log("\nit is deterministic:");
{
  let drift = 0;
  for (const d of UNITS.slice(0, 120)) {
    const a = recommendedItems(d, 2).map((p) => p.item.id).join(",");
    const b = recommendedItems(d, 2).map((p) => p.item.id).join(",");
    if (a !== b) drift++;
  }
  assert(drift === 0, `the same mon yields the same list every call (${drift} drifted)`);
}

console.log("\nand the advice changes with the mon:");
{
  // A model that returned the same three items for everybody would pass every
  // test above. It must actually discriminate.
  const seen = new Set<string>();
  for (const d of UNITS) seen.add(recommendedItems(d, 2).map((p) => p.item.id).join(","));
  assert(seen.size >= 12, `the roster produces many distinct builds, not one list (${seen.size} distinct)`);

  // The specific failure this guards against, which the first version of the
  // model walked straight into: attack speed feeds both autos and mana, so it
  // wins nearly everywhere, and the raw top three gave 195 of 569 mons the
  // SAME attack-speed trio. True, and useless as advice. Each row must now
  // answer a different question.
  let narrow = 0;
  for (const d of UNITS) {
    const axes = new Set(recommendedItems(d, 2).map((p) => p.axis));
    if (axes.size < 3) narrow++;
  }
  assert(narrow === 0, `every mon's three picks span three different axes (${narrow} narrow)`);

  // Melee and ranged carries must not get identical advice: a melee unit is
  // focused first and has to live long enough to deal its damage.
  const melee = UNITS.filter((d) => d.stats.range <= 1 && archetypeOf(d) !== "tank");
  const ranged = UNITS.filter((d) => d.stats.range > 1 && archetypeOf(d) !== "tank");
  const defShare = (list: typeof UNITS) => {
    let def = 0, total = 0;
    for (const d of list) for (const p of recommendedItems(d, 2)) { total++; if (p.axis === "survive" || p.axis === "sustain") def++; }
    return total ? def / total : 0;
  };
  const mPct = defShare(melee), rPct = defShare(ranged);
  assert(melee.length > 0 && ranged.length > 0, `the roster has both (${melee.length} melee, ${ranged.length} ranged carries)`);
  assert(mPct > rPct,
    `melee carries are steered toward durability more than ranged ones (${(mPct * 100).toFixed(0)}% vs ${(rPct * 100).toFixed(0)}%)`);
}

console.log(
  failures === 0
    ? "\n✅ Recommendations cover the roster, separate tanks from carries, and stay inside the lobby's rules"
    : `\n❌ ${failures} recommendation assertion(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
