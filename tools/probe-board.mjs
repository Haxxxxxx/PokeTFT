/**
 * Measures the real on-screen geometry of a PLANNING-board unit.
 *
 * Companion to probe-combat.mjs, and for the same reason: the board unit sits
 * inside a perspective scale AND a counter-rotation, so what any offset in the
 * source means on screen is not recoverable by reading CSS. Reasoning about it
 * produced several wrong fixes; measuring settles it in one run.
 *
 * Usage: node tools/probe-board.mjs [url]
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
await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {
  const card = page.locator('button:has-text("◉")').nth(i);
  await card.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
}
await page.keyboard.press("e").catch(() => {});
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll('img[src*="/sprites/"]')) {
    const r = img.getBoundingClientRect();
    if (r.width < 20) continue;
    if (r.y > window.innerHeight * 0.72) continue;
    if (r.x < window.innerWidth * 0.18 || r.x > window.innerWidth * 0.82) continue;

    // Walk up to the chip root, then list every positioned descendant so the
    // star badge shows up wherever it actually lives.
    let root = img;
    for (let i = 0; i < 4 && root.parentElement; i++) root = root.parentElement;
    const parts = [];
    for (const el of root.querySelectorAll("*")) {
      const er = el.getBoundingClientRect();
      if (er.width === 0 || er.height === 0) continue;
      const cls = (el.className || "").toString();
      if (!/absolute/.test(cls)) continue;
      parts.push(`${el.tagName.toLowerCase()} ${Math.round(er.width)}x${Math.round(er.height)} @(${Math.round(er.x)},${Math.round(er.y)}) ${cls.split(" ").slice(0, 3).join(".")}`);
    }
    out.push({
      src: img.getAttribute("src"),
      sprite: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      parts: parts.slice(0, 10),
    });
  }
  return out;
});

for (const u of report) {
  console.log(`\n${u.src}  sprite ${u.sprite.w}x${u.sprite.h} @(${u.sprite.x},${u.sprite.y})`);
  for (const p of u.parts) console.log(`    ${p}`);
}
if (!report.length) console.log("no board sprites found");
await browser.close();
