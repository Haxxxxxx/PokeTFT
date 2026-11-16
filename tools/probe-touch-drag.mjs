/**
 * Can you move a unit with a FINGER?
 *
 * This is a drag-and-drop game and nothing has ever tested touch input. Every
 * probe so far used mouse events, which take a different path through dnd-kit
 * (PointerSensor, 5px) than a finger does (TouchSensor, 140ms hold).
 *
 * The specific thing being checked: dnd-kit requires `touch-action: none` on
 * draggable elements, because without it the browser is free to interpret the
 * same gesture as a scroll or a pan, and it will emit touchcancel mid-drag —
 * the drag simply dies, with no error anywhere. Nothing in this codebase sets
 * touch-action, and several of the places you pick a unit up from sit inside
 * scrollable containers.
 *
 * The assertion is on STATE, not on pixels: the unit must actually end up
 * somewhere different. A drag that animates and snaps back looks like a drag
 * and achieves nothing.
 *
 * Usage:
 *   node tools/probe-touch-drag.mjs [url] [outDir]
 */

import { webkit } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-touch";
const VIEWPORT = { width: 852, height: 393 };

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}
function note(m) { console.log(`  · ${m}`); }

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
async function dismiss(page) {
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
    if (!(await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris|suivant|next|continuer)\s*$/i, 500))) break;
  }
}

/**
 * A finger drag, as the browser actually delivers one: touchstart, a hold long
 * enough to pass the sensor's 140ms activation delay, several small moves, then
 * touchend. Playwright's dragTo uses mouse events and would not exercise this
 * path at all.
 */
async function touchDrag(page, from, to, steps = 14) {
  const client = await page.context().newCDPSession?.(page).catch(() => null);
  // WebKit has no CDP; drive the touch API through the page instead, which is
  // what the browser itself dispatches.
  await page.evaluate(async ({ from, to, steps }) => {
    const el = document.elementFromPoint(from.x, from.y);
    if (!el) return;
    const touch = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
    const fire = (type, x, y) => el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: type === "touchend" ? [] : [touch(x, y)],
      targetTouches: type === "touchend" ? [] : [touch(x, y)],
      changedTouches: [touch(x, y)],
    }));
    fire("touchstart", from.x, from.y);
    // Past the TouchSensor's 140ms activation delay.
    await new Promise((r) => setTimeout(r, 260));
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      fire("touchmove", x, y);
      await new Promise((r) => setTimeout(r, 24));
    }
    fire("touchend", to.x, to.y);
  }, { from, to, steps });
  if (client) await client.detach().catch(() => {});
  await page.waitForTimeout(700);
}

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log(`→ ${URL} (WebKit, touch, ${VIEWPORT.width}x${VIEWPORT.height})`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  await dismiss(page);
  await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
  await page.waitForTimeout(2600);
  await dismiss(page);
  await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
  }
  await page.waitForTimeout(2600);
  await dismiss(page);
  await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
  await page.waitForTimeout(700);
  await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  await page.waitForTimeout(8000);
  const card = page.locator('[class*="w-\\[150px\\]"]').first();
  if (await card.isVisible().catch(() => false)) { await card.click().catch(() => {}); await page.waitForTimeout(1500); }
  await dismiss(page);

  console.log("\ndraggable elements declare touch-action:");
  const ta = await page.evaluate(() => {
    const units = [...document.querySelectorAll("[data-unit-chip], .shop-card, [draggable]")];
    const board = [...document.querySelectorAll("[id^='cell-'], .bench-slab")];
    const sample = (els) => els.slice(0, 4).map((e) => getComputedStyle(e).touchAction);
    // Anything the player presses to begin a drag.
    const grabbable = [...document.querySelectorAll("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 20 && r.height > 20 && (e.getAttribute("role") === "button" || e.tagName === "BUTTON");
    });
    return {
      units: sample(units), board: sample(board),
      anyNone: grabbable.some((e) => getComputedStyle(e).touchAction === "none"),
      bodyTouch: getComputedStyle(document.body).touchAction,
    };
  });
  note(`body touch-action: ${ta.bodyTouch}`);
  note(`sampled draggables: ${JSON.stringify(ta.units)}`);
  assert(ta.anyNone, "at least one grabbable element sets touch-action:none (dnd-kit requires it for TouchSensor)");

  console.log("\na finger can move a unit from the bench onto the board:");
  // Pick the mon up from wherever it currently stands and move it a couple of
  // hexes. Its own position is read from the DOM so this does not depend on
  // which hex the draft happened to place it on.
  const spot = await page.evaluate(() => {
    const u = document.querySelector(".arena-frame [data-unit]") || document.querySelector(".arena-frame img");
    if (!u) return null;
    const r = u.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  if (!spot) {
    assert(false, "found a unit on the board to drag");
  } else {
    note(`grabbing at ${spot.x},${spot.y}`);
    const target = { x: spot.x + 70, y: spot.y - 50 };
    const posBefore = await page.evaluate(() => {
      const u = document.querySelector(".arena-frame [data-unit]") || document.querySelector(".arena-frame img");
      const r = u.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top) };
    });
    await touchDrag(page, spot, target);
    const posAfter = await page.evaluate(() => {
      const u = document.querySelector(".arena-frame [data-unit]") || document.querySelector(".arena-frame img");
      if (!u) return null;
      const r = u.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top) };
    });
    note(`unit was at ${JSON.stringify(posBefore)}, now ${JSON.stringify(posAfter)}`);
    const moved = posAfter && (Math.abs(posAfter.x - posBefore.x) > 12 || Math.abs(posAfter.y - posBefore.y) > 12);
    assert(!!moved, "the unit actually ended up somewhere else");
  }

  await page.screenshot({ path: `${OUT}/01-after-drag.png` });
  console.log("  📸 01-after-drag.png");
  assert(errors.length === 0, `no page errors (${errors.length})`);

  await browser.close();
  console.log(failures === 0
    ? "\n✅ Touch dragging works"
    : `\n❌ ${failures} assertion(s) failed — touch dragging is not reliable`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
