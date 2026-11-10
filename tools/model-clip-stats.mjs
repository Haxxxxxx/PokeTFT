/**
 * How much of the roster is actually animated?
 *
 * Reads only each model's glTF JSON chunk (a range request, not the whole
 * model) and runs the SAME matchers the renderer uses, so the numbers describe
 * what the game would really find at runtime rather than what the files
 * nominally contain.
 */
const BASE = "https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular";
const STEP = Number(process.argv[2] ?? 16);
const CONC = 6;

// Mirrors of UnitModel's selection logic.
const IDLE = [/battle.?wait/i, /battle.?idle/i, /default.?wait/i, /default.?idle/i, /idle/i, /stand/i, /wait/i, /breath/i];
const ATTACK = /attack|hit|cast|fight|strike/i;
const LOCOMOTION = /walk|run|move/i;

async function clipsFor(dex) {
  const url = `${BASE}/${dex}.glb`;
  try {
    const head = await fetch(url, { headers: { Range: "bytes=0-19" } });
    if (!head.ok) return { dex, missing: true };
    const h = Buffer.from(await head.arrayBuffer());
    if (h.length < 20) return { dex, missing: true };
    const jsonLen = h.readUInt32LE(12);
    const body = await fetch(url, { headers: { Range: `bytes=20-${20 + jsonLen - 1}` } });
    if (!body.ok) return { dex, missing: true };
    const text = Buffer.from(await body.arrayBuffer()).toString("utf8").replace(/\0+$/, "");
    const gltf = JSON.parse(text);
    const names = (gltf.animations ?? []).map((a, i) => a.name ?? `(unnamed ${i})`);
    return {
      dex,
      n: names.length,
      skinned: (gltf.skins ?? []).length > 0,
      idle: names.some((x) => IDLE.some((p) => p.test(x))),
      attack: names.some((x) => ATTACK.test(x)),
      move: names.some((x) => LOCOMOTION.test(x)),
    };
  } catch { return { dex, missing: true }; }
}

const targets = [];
for (let d = 1; d <= 1025; d += STEP) targets.push(d);

const out = [];
for (let i = 0; i < targets.length; i += CONC) {
  out.push(...await Promise.all(targets.slice(i, i + CONC).map(clipsFor)));
  process.stderr.write(`\r  ${Math.min(i + CONC, targets.length)}/${targets.length}`);
}
process.stderr.write("\n");

const ok = out.filter((r) => !r.missing);
const pct = (n) => `${((n / ok.length) * 100).toFixed(0)}%`;
const none = ok.filter((r) => r.n === 0);
const idle = ok.filter((r) => r.idle);
const atk = ok.filter((r) => r.attack);
const mov = ok.filter((r) => r.move);
const unskinned = ok.filter((r) => !r.skinned);

console.log(`sampled ${ok.length} models (every ${STEP}th dex)\n`);
console.log(`  no animation clips at all   ${String(none.length).padStart(3)}  ${pct(none.length)}`);
console.log(`  has a usable IDLE clip      ${String(idle.length).padStart(3)}  ${pct(idle.length)}`);
console.log(`  has an ATTACK clip          ${String(atk.length).padStart(3)}  ${pct(atk.length)}`);
console.log(`  has WALK/RUN (anti-slide)   ${String(mov.length).padStart(3)}  ${pct(mov.length)}`);
console.log(`  no skeleton at all          ${String(unskinned.length).padStart(3)}  ${pct(unskinned.length)}`);
const rich = ok.filter((r) => r.n >= 10).map((r) => r.dex);
console.log(`\n  fully animated (10+ clips): ${rich.length ? rich.join(", ") : "none in sample"}`);
