/**
 * Measures the real on-screen geometry of a combat unit.
 *
 * Exists because the combat unit's boxes are computed from TILE_W and a 1.85x
 * sprite multiple, then passed through a perspective transform and a counter
 * rotation — so what any one number means on screen is not something you can
 * read off the source. Guessing at it produced two wrong fixes in a row.
 *
 * Prints, for each rendered unit: the sprite's painted rect, its bar stack's
 * rect, and the gap between them, in real pixels.
 *
 * Usage: node tools/probe-combat.mjs [url]
 */
import { chromium } from "playwright";

const SERVER = process.argv[2] ?? "http://localhost:3000";

async function clickButton(page, rx, timeout = 8000) {
  const b = page.getByRole("button", { name: rx }).first();
  try { await b.waitFor({ state: "visible", timeout }); await b.click({ timeout: 2500 }); return true; }
  catch { return false; }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(SERVER, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
for (let i = 0; i < 6; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); }

await clickButton(page, /guest|invit/i);
await page.waitForTimeout(2500);
for (let i = 0; i < 6; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); }

await clickButton(page, /^\s*(cr[ée]er|create)\b/i);
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(1200);
  if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
}
await page.waitForTimeout(2500);
for (let i = 0; i < 3; i++) { await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await page.waitForTimeout(700); }
await clickButton(page, /lancer la partie|lancer|start/i);

// Buy a couple of units so there is something to fight with. The shop cards
// are buttons carrying the species name; clicking is far more reliable than
// the number hotkeys, which are not bound.
await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {
  const card = page.locator('button:has-text("\u25c9")').nth(i);
  await card.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
}
// Put them on the board.
await page.keyboard.press("e").catch(() => {});
await page.waitForTimeout(500);

console.log("waiting for combat…");
for (let i = 0; i < 60; i++) {
  const inCombat = await page.getByText(/combat/i).first().isVisible().catch(() => false);
  if (inCombat) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  // A combat unit's sprite is the only absolutely-positioned <img> sized from
  // the tile; find them and walk up to the cell box they live in.
  const imgs = [...document.querySelectorAll('img[src*="/sprites/"]')];
  const out = [];
  for (const img of imgs) {
    const r = img.getBoundingClientRect();
    // Arena only: shop cards and the player rail also render sprites, and they
    // sit outside the board. The arena occupies the upper-centre of the view.
    if (r.width < 20) continue;
    if (r.y > window.innerHeight * 0.72) continue; // shop strip
    if (r.x < window.innerWidth * 0.18 || r.x > window.innerWidth * 0.82) continue; // side rails
    const cell = img.parentElement;
    const stack = cell?.parentElement;
    const bars = stack?.querySelector("div.absolute.flex.flex-col");
    const br = bars?.getBoundingClientRect();
    const chain = [];
    let n = img;
    for (let i = 0; i < 4 && n; i++) {
      const nr = n.getBoundingClientRect();
      chain.push(`${n.tagName.toLowerCase()}.${(n.className || "").toString().split(" ").slice(0,3).join(".")} ${Math.round(nr.width)}x${Math.round(nr.height)} [w=${n.style?.width || "-"} max=${getComputedStyle(n).maxWidth}]`);
      n = n.parentElement;
    }
    out.push({
      chain,
      src: img.getAttribute("src"),
      sprite: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      bars: br ? { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) } : null,
      cell: cell ? { w: Math.round(cell.getBoundingClientRect().width), h: Math.round(cell.getBoundingClientRect().height) } : null,
    });
  }
  return out;
});

for (const u of report) {
  const s = u.sprite, b = u.bars;
  console.log(`\n${u.src}`);
  for (const c of u.chain) console.log(`    ${c}`);
  console.log(`  sprite box ${s.w}x${s.h} at (${s.x},${s.y})`);
  if (b) {
    console.log(`  bar stack  ${b.w}x${b.h} at (${b.x},${b.y})`);
    console.log(`  bar/sprite width ratio  ${(b.w / s.w).toFixed(2)}`);
    console.log(`  bar bottom -> sprite top gap  ${Math.round(s.y - (b.y + b.h))}px`);
    console.log(`  horizontal centre delta  ${Math.round((b.x + b.w / 2) - (s.x + s.w / 2))}px`);
  } else {
    console.log("  bar stack  NOT FOUND");
  }
}
if (!report.length) console.log("no combat sprites found — flow did not reach a fight");

await browser.close();
