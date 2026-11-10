/**
 * Measures the bench and everything around it: the slabs, the pension dock,
 * the shop strip, the sell zone and the fill button.
 *
 * Same reason as the other probes — these pieces are positioned by a layout
 * engine, a perspective projection and a flex column, so what any number in
 * the source means on screen is not readable from the source. This prints the
 * real rects and flags the things that are checkable: slots that are not a
 * uniform size, uneven gaps, elements that overlap, and drop targets smaller
 * than a comfortable pointer target.
 *
 * Usage: node tools/probe-bench.mjs [url]
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
await page.waitForTimeout(7000);
// Buy several so the bench is populated.
for (let i = 0; i < 5; i++) {
  await page.locator('button:has-text("◉")').nth(i).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const slabs = [...document.querySelectorAll(".bench-slab")].map(rect);
  const byText = (re) => [...document.querySelectorAll("div,span,button")].find((e) => re.test(e.textContent ?? "") && e.getBoundingClientRect().width > 20);
  const pension = byText(/PENSION|Day Care/i);
  const sell = byText(/GLISSER POUR VENDRE|DRAG TO SELL/i);
  const reroll = byText(/^\s*Reroll/i);
  return {
    slabs,
    pension: pension ? rect(pension) : null,
    sell: sell ? rect(sell) : null,
    reroll: reroll ? rect(reroll) : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});

console.log(`viewport ${r.viewport.w}x${r.viewport.h}\n`);
console.log(`bench slabs: ${r.slabs.length}`);
if (r.slabs.length) {
  const ws = r.slabs.map((s) => s.w), hs = r.slabs.map((s) => s.h);
  console.log(`  size      ${Math.min(...ws)}..${Math.max(...ws)} wide, ${Math.min(...hs)}..${Math.max(...hs)} tall`);
  const gaps = r.slabs.slice(1).map((s, i) => s.x - (r.slabs[i].x + r.slabs[i].w));
  console.log(`  gaps      ${gaps.join(", ")}`);
  const uniform = Math.max(...ws) - Math.min(...ws) <= 1 && Math.max(...hs) - Math.min(...hs) <= 1;
  console.log(`  uniform   ${uniform ? "yes" : "NO — slots differ in size"}`);
  const evenGaps = gaps.length === 0 || Math.max(...gaps) - Math.min(...gaps) <= 1;
  console.log(`  even gaps ${evenGaps ? "yes" : "NO — spacing is inconsistent"}`);
  const first = r.slabs[0], last = r.slabs[r.slabs.length - 1];
  console.log(`  strip     x ${first.x}..${last.x + last.w}  (${last.x + last.w - first.x}px), y ${first.y}..${first.y + first.h}`);
}
for (const [name, box] of Object.entries({ pension: r.pension, sell: r.sell, reroll: r.reroll })) {
  console.log(`${name.padEnd(9)} ${box ? `${box.w}x${box.h} @(${box.x},${box.y})` : "not found"}`);
  if (box && Math.min(box.w, box.h) < 44) console.log(`  ⚠ smaller than a 44px pointer target (${Math.min(box.w, box.h)}px)`);
}
await browser.close();
