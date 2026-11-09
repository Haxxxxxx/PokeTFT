/**
 * Fills gaps in public/sprites.
 *
 * 52 National Dex sprites were missing, 22 of them species that are actually in
 * the playable roster (Hitmonchan, Bellossom, Politoed, Slowking, Hitmontop,
 * Cascoon, Dustox, …) — so those units rendered as a broken image in the shop,
 * on the board and in combat. Nothing caught it because a 404 on an <img> is
 * silent apart from a console line.
 *
 * Only downloads what is absent, so it is safe to re-run.
 *
 *   node tools/fetch-sprites.mjs [--dry]
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "public/sprites";
const SRC = (dex) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;
const DRY = process.argv.includes("--dry");
const MAX_DEX = 1025;

const have = new Set(
  readdirSync(DIR).filter((f) => f.endsWith(".png")).map((f) => Number(f.replace(".png", ""))),
);
const missing = [];
for (let d = 1; d <= MAX_DEX; d++) if (!have.has(d)) missing.push(d);

console.log(`${have.size} present · ${missing.length} missing`);
if (!missing.length) process.exit(0);
if (DRY) {
  console.log(missing.join(", "));
  process.exit(0);
}

let ok = 0;
const failed = [];
for (const dex of missing) {
  const dest = join(DIR, `${dex}.png`);
  if (existsSync(dest)) continue;
  try {
    const res = await fetch(SRC(dex));
    if (!res.ok) { failed.push(`${dex} (HTTP ${res.status})`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    // Verify it is really a PNG before writing — an error page saved as .png
    // would be worse than the 404 it replaced.
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isPng) { failed.push(`${dex} (not a PNG, ${buf.length}B)`); continue; }
    writeFileSync(dest, buf);
    ok++;
  } catch (e) {
    failed.push(`${dex} (${e.message})`);
  }
}
console.log(`downloaded ${ok}`);
if (failed.length) console.log(`still missing ${failed.length}: ${failed.join(", ")}`);
