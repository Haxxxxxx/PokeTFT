// Regenerates each GENERATED unit's signature move NAME to a real, distinct move the
// species can actually learn (PokéAPI learnset), matching the move's existing TYPE so
// combat balance (type/power/shape) is untouched — only the flavour name changes, and
// it's made as unique across the roster as the learnsets allow.
//
// Usage: node tools/gen-moves.mjs          (uses ./tools/.cache-*.json if present)
//        node tools/gen-moves.mjs --write  (rewrites src/game/data/mons.generated.ts)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const GEN_PATH = ROOT + "src/game/data/mons.generated.ts";
const MOVE_CACHE = ROOT + "tools/.cache-moves.json";
const LEARN_CACHE = ROOT + "tools/.cache-learnsets.json";
const API = "https://pokeapi.co/api/v2";
const WRITE = process.argv.includes("--write");

const TITLE = (s) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(300 * (i + 1));
  }
  throw new Error("fetch failed " + url);
}

// Limited-concurrency map.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
      if (idx % 25 === 0) process.stdout.write(`\r  ${idx}/${items.length}   `);
    }
  }));
  process.stdout.write("\r");
  return out;
}

function loadCache(p) { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}; }

// ── Parse the GENERATED array out of the TS file ───────────────────────────────
const src = readFileSync(GEN_PATH, "utf8");
const start = src.indexOf("[{");
const end = src.lastIndexOf("}]") + 2;
const units = JSON.parse(src.slice(start, end));
console.log(`Loaded ${units.length} generated lines.`);

// ── 1. Move DB: { name: {type, power} } for all damaging moves ─────────────────
const moveCache = loadCache(MOVE_CACHE);
if (Object.keys(moveCache).length === 0) {
  console.log("Fetching move list…");
  const list = await getJSON(`${API}/move?limit=2000`);
  console.log(`  ${list.results.length} moves — fetching details (cached after)…`);
  await pool(list.results, 12, async (m) => {
    try {
      const d = await getJSON(m.url);
      moveCache[m.name] = { type: d.type?.name ?? null, power: d.power ?? null, dc: d.damage_class?.name ?? null };
    } catch { moveCache[m.name] = { type: null, power: null, dc: null }; }
    return null;
  });
  writeFileSync(MOVE_CACHE, JSON.stringify(moveCache));
}
console.log(`Move DB: ${Object.keys(moveCache).length} moves.`);

// ── 2. Learnsets for each unit's FINAL form (dex[2]) ───────────────────────────
const learn = loadCache(LEARN_CACHE);
const needDex = [...new Set(units.map((u) => u.dex[2]))].filter((d) => !learn[d]);
if (needDex.length) {
  console.log(`Fetching ${needDex.length} learnsets…`);
  await pool(needDex, 12, async (dex) => {
    try {
      const p = await getJSON(`${API}/pokemon/${dex}`);
      learn[dex] = p.moves.map((m) => m.move.name);
    } catch { learn[dex] = []; }
    return null;
  });
  writeFileSync(LEARN_CACHE, JSON.stringify(learn));
}
console.log(`Learnsets cached: ${Object.keys(learn).length}.`);

// ── 3. Assign a distinct, type-matching real move to each unit ─────────────────
const used = new Map(); // moveName -> times used (favour rarer for distinctness)
const OUR_TYPES = new Set(["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"]);
let changed = 0, kept = 0;
// Process in a stable order; greedily prefer the least-used candidate so the roster's
// names spread out. Two candidate tiers: STAB (a type the mon HAS — keeps it thematic
// and on-type) then coverage (any learnable damaging move) only if every STAB option is
// already taken — pushing distinctness up without going wildly off-theme.
const monTypes = (u) => new Set(u.types);
for (const u of units) {
  const all = (learn[u.dex[2]] ?? [])
    .map((n) => ({ n, ...(moveCache[n] ?? {}) }))
    .filter((m) => m.power && m.type && OUR_TYPES.has(m.type));
  const stab = all.filter((m) => monTypes(u).has(m.type));
  const rank = (arr) => arr.sort((a, b) => (used.get(a.n) ?? 0) - (used.get(b.n) ?? 0) || (b.power - a.power));
  // Prefer an UNUSED STAB move; else an unused coverage move; else best STAB; else best any.
  const unusedStab = rank(stab.filter((m) => !used.has(m.n)));
  const unusedAny = rank(all.filter((m) => !used.has(m.n)));
  const pick = unusedStab[0] ?? unusedAny[0] ?? rank(stab)[0] ?? rank(all)[0];
  if (pick) {
    u.move.name = TITLE(pick.n);
    u.move.type = pick.type; // authentic move's type (still one the mon can use)
    used.set(pick.n, (used.get(pick.n) ?? 0) + 1);
    changed++;
  } else {
    kept++; // no learnable damaging move at all — keep the curated name/type
  }
}
const distinct = new Set(units.map((u) => u.move.name)).size;
console.log(`Assigned: ${changed} real moves, kept ${kept}. Distinct names: ${distinct}/${units.length}.`);

// ── 4. Rewrite the TS file (one entry per line, matching the existing format) ───
if (WRITE) {
  const body = units.map((u) => JSON.stringify(u)).join(",");
  const next = src.slice(0, start) + "[" + body + "]" + src.slice(end);
  writeFileSync(GEN_PATH, next);
  console.log("✓ wrote " + GEN_PATH);
} else {
  console.log("(dry run — pass --write to update mons.generated.ts)");
  // Sample of the most-reused names so we can eyeball distinctness.
  const counts = {};
  for (const u of units) counts[u.move.name] = (counts[u.move.name] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log("Most-reused:", top.map(([n, c]) => `${n}×${c}`).join(", "));
}
