/**
 * Plays a match in WEBKIT at iPhone landscape size.
 *
 * Everything that has tested this game so far ran in Chromium. The iOS reports
 * ("the render doesn't properly render on iPhone") are about Safari, and the
 * two engines genuinely differ in the places a board like this lives:
 * backdrop-filter, mix-blend-mode, nested 3D transforms with preserve-3d,
 * clip-path on transformed elements, and how `dvh` resolves.
 *
 * The iOS Simulator runs real Mobile Safari but exposes no way to tap — simctl
 * has no tap command and Simulator.app hands accessibility no window — so a
 * match cannot be driven there. Playwright's WebKit is the same engine family
 * without the iOS chrome, which makes it the only way to get THROUGH a match
 * on WebKit at all. It will not reproduce iOS-only behaviour (Fullscreen API,
 * URL-bar viewport, safe areas); those are called out rather than implied.
 *
 * Usage:
 *   node tools/shoot-webkit-phone.mjs [url] [outDir]
 */

import { webkit } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-webkit-phone";
// iPhone 14/15/16 landscape, the orientation the game asks for.
const VIEWPORT = { width: 852, height: 393 };

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

async function clickIfPresent(page, rx, timeout = 4000) {
  const el = page.getByText(rx).first();
  try { await el.waitFor({ state: "visible", timeout }); await el.click({ timeout: 2000 }); return true; }
  catch { return false; }
}
async function clickButton(page, rx, timeout = 4000) {
  const b = page.getByRole("button", { name: rx }).first();
  try {
    await b.waitFor({ state: "visible", timeout });
    if (await b.isDisabled().catch(() => false)) return false;
    await b.click({ timeout: 2500 });
    return true;
  } catch { return false; }
}
async function dismissOverlays(page) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(220);
    const closed =
      (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 600)) ||
      (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 600));
    if (!closed) {
      const x = page.locator('button[aria-label*="lose" i], button[aria-label*="ermer" i]').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await page.waitForTimeout(220); continue; }
      break;
    }
    await page.waitForTimeout(260);
  }
}
async function shoot(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

/** Geometry of the things a phone render gets wrong. */
const measure = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  // Anything pushed outside the viewport is the symptom people describe as
  // "broken" — a board you cannot reach or chrome sitting off the edge.
  const offscreen = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" && cs.pointerEvents === "none") return false; // decorative bleed
      return r.right > window.innerWidth + 2 || r.bottom > window.innerHeight + 2 || r.left < -2;
    })
    .slice(0, 6)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} ${Math.round(el.getBoundingClientRect().right)}x${Math.round(el.getBoundingClientRect().bottom)}`);
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    docOverflowX: de.scrollWidth - de.clientWidth,
    docOverflowY: de.scrollHeight - de.clientHeight,
    arena: box(q(".arena-frame")),
    shop: box(q("button.shop-card")),
    orientationGate: !!q(".z-overlay"),
    offscreen,
  };
});

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  console.log(`→ ${URL}  (WebKit ${browser.version()}, ${VIEWPORT.width}x${VIEWPORT.height})`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  await dismissOverlays(page);
  await shoot(page, "01-welcome");

  await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
  await page.waitForTimeout(2600);
  await dismissOverlays(page);
  await shoot(page, "02-lobby-home");

  await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
  }
  await page.waitForTimeout(2800);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
  await page.waitForTimeout(700);
  await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  await page.waitForTimeout(8000);
  await dismissOverlays(page);

  // Take the opening draft so the board is actually visible.
  const card = page.locator('[class*="w-\\[150px\\]"]').first();
  if (await card.isVisible().catch(() => false)) { await card.click().catch(() => {}); await page.waitForTimeout(1400); }
  await dismissOverlays(page);
  await shoot(page, "03-board");

  console.log("\nthe board fits the phone:");
  const m = await measure(page);
  console.log(`  viewport ${m.vw}x${m.vh} · arena ${JSON.stringify(m.arena)} · shop card ${JSON.stringify(m.shop)}`);
  assert(m.docOverflowX <= 2, `no horizontal overflow (${m.docOverflowX}px)`);
  assert(m.docOverflowY <= 2, `no vertical overflow (${m.docOverflowY}px)`);
  assert(!!m.arena, "the arena is rendered");
  if (m.arena) {
    assert(m.arena.w > 0 && m.arena.h > 0, `the arena has size (${m.arena.w}x${m.arena.h})`);
    assert(m.arena.y >= -2 && m.arena.y + m.arena.h <= m.vh + 2,
      `and it fits vertically (${m.arena.y}..${m.arena.y + m.arena.h} in ${m.vh})`);
  }
  assert(!!m.shop, "the shop row is rendered");
  if (m.shop) {
    assert(m.shop.y + m.shop.h <= m.vh + 2,
      `the shop is on screen, not below the fold (bottom ${m.shop.y + m.shop.h} of ${m.vh})`);
  }
  if (m.offscreen.length) console.log(`  · pushed off screen: ${m.offscreen.join(" | ")}`);
  assert(m.offscreen.length === 0, `nothing interactive is pushed off screen (${m.offscreen.length})`);

  const real = errors.filter((e) => !/ethereum|extension/i.test(e));
  if (real.length) { console.log("\n  console errors:"); real.slice(0, 5).forEach((e) => console.log(`   · ${e.slice(0, 140)}`)); }
  assert(real.length === 0, `no console errors (${real.length})`);

  await browser.close();
  console.log(failures === 0
    ? "\n✅ The board renders and fits on a phone-sized WebKit viewport"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
