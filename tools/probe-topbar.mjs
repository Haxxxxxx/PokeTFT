/**
 * Probe for the round strip at the top of the match screen.
 *
 * Three separate complaints landed on this one row: the cubes were "cut in
 * half", a round told you nothing until you clicked it, and the recap it
 * opened could not be moved out of the way. The first is a measurement — the
 * strip scrolls horizontally, and a horizontal scroller clips vertically
 * whether you asked it to or not, so the current round (scaled 1.18) and every
 * result dot (hung at -top-0.5) were sliced by a box nobody thought was
 * clipping. A screenshot can show that it looks fixed; only measuring the
 * rects proves it, at any window size, for every cube rather than the one that
 * happened to be on screen.
 *
 * So this walks a real match two rounds in and then asserts, in the browser:
 *   - every cube, including the scaled current one, is fully inside the strip
 *   - every result dot is too
 *   - hovering a cube produces a readable card, not a native tooltip
 *   - the recap panel can be dragged somewhere else and stays there
 *
 * Usage:
 *   node tools/probe-topbar.mjs [url] [outDir]
 *
 * Assumes a dev server is already running. Like tools/shoot.mjs, this plays a
 * real match and therefore writes a real room — run it when you need it, not
 * on a loop.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-topbar";
const VIEWPORT = { width: 1440, height: 900 };

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

async function clickIfPresent(page, rx, timeout = 4000) {
  const el = page.getByText(rx).first();
  try {
    await el.waitFor({ state: "visible", timeout });
    await el.click({ timeout: 2000 });
    return true;
  } catch { return false; }
}

async function clickButton(page, rx, timeout = 4000) {
  const btn = page.getByRole("button", { name: rx }).first();
  try {
    await btn.waitFor({ state: "visible", timeout });
    if (await btn.isDisabled().catch(() => false)) return false;
    await btn.click({ timeout: 2500 });
    return true;
  } catch { return false; }
}

async function dismissOverlays(page) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
    const closed =
      (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 700)) ||
      (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 700));
    if (!closed) {
      const x = page.locator('button[aria-label*="lose" i], button[aria-label*="ermer" i]').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await page.waitForTimeout(250); continue; }
      break;
    }
    await page.waitForTimeout(300);
  }
}

async function shoot(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

/** The strip is the scrolling flex row of round buttons. Found by structure
 *  rather than a test id, so the probe keeps working through restyles. */
const STRIP = '.overflow-x-auto:has(> button)';

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  await dismissOverlays(page);
  await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
  }
  await page.waitForTimeout(3000);
  await dismissOverlays(page);
  for (let i = 0; i < 3; i++) {
    await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
    await page.waitForTimeout(800);
  }
  await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  console.log("  match started — playing two rounds through");
  await page.waitForTimeout(7000);
  await dismissOverlays(page);

  // Two full round cycles, so there is at least one PAST round carrying a
  // result dot — the element that was being sliced off.
  await page.waitForTimeout(80000);
  await dismissOverlays(page);
  await shoot(page, "01-strip");

  console.log("\nthe strip no longer slices what it holds:");
  const geom = await page.evaluate((sel) => {
    const strip = document.querySelector(sel);
    if (!strip) return null;
    const s = strip.getBoundingClientRect();
    const cubes = [...strip.querySelectorAll(":scope > button")].map((b) => {
      const r = b.getBoundingClientRect();
      const dot = b.querySelector("span.rounded-full");
      const d = dot ? dot.getBoundingClientRect() : null;
      return {
        top: r.top, bottom: r.bottom, h: r.height,
        dotTop: d ? d.top : null, dotBottom: d ? d.bottom : null,
      };
    });
    return { stripTop: s.top, stripBottom: s.bottom, cubes, clipY: getComputedStyle(strip).overflowY };
  }, STRIP);

  if (!geom) {
    assert(false, "found the round strip");
  } else {
    assert(geom.cubes.length > 0, `found ${geom.cubes.length} round cubes`);
    // Sub-pixel: a rect can sit exactly on the edge after rounding.
    const EPS = 0.5;
    const cut = geom.cubes.filter((c) => c.top < geom.stripTop - EPS || c.bottom > geom.stripBottom + EPS);
    assert(cut.length === 0,
      `every cube sits inside the strip's box (${cut.length} clipped of ${geom.cubes.length})`);
    const dots = geom.cubes.filter((c) => c.dotTop !== null);
    const cutDots = dots.filter((c) => c.dotTop < geom.stripTop - EPS || c.dotBottom > geom.stripBottom + EPS);
    assert(dots.length > 0, `at least one round has played and carries a result dot (${dots.length})`);
    assert(cutDots.length === 0,
      `and no result dot is clipped (${cutDots.length} of ${dots.length})`);
    // The tallest cube is the current one at scale 1.18 — the specific element
    // the complaint was about.
    const tallest = Math.max(...geom.cubes.map((c) => c.h));
    const shortest = Math.min(...geom.cubes.map((c) => c.h));
    assert(tallest > shortest,
      `the current round is still visibly larger than the rest (${tallest.toFixed(1)}px vs ${shortest.toFixed(1)}px)`);
  }

  console.log("\na round says what it was without being clicked:");
  const firstCube = page.locator(`${STRIP} > button`).first();
  await firstCube.hover();
  await page.waitForTimeout(400);
  const tip = page.locator('[role="tooltip"]').first();
  const tipVisible = await tip.isVisible().catch(() => false);
  assert(tipVisible, "hovering a round opens a card");
  if (tipVisible) {
    const text = (await tip.innerText().catch(() => "")).trim();
    assert(text.length > 0, `the card carries readable text (${JSON.stringify(text.replace(/\n/g, " / "))})`);
    const box = await tip.boundingBox();
    assert(!!box && box.y >= 0 && box.x >= 0 && box.x + box.width <= VIEWPORT.width,
      "and it lands on screen rather than off the edge");
    await shoot(page, "02-hover");
  }
  // And every round must answer, not only the handful you can click on.
  const cubeCount = await page.locator(`${STRIP} > button`).count();
  let hovered = 0;
  for (let i = 0; i < cubeCount; i++) {
    await page.locator(`${STRIP} > button`).nth(i).hover().catch(() => {});
    await page.waitForTimeout(150);
    if (await page.locator('[role="tooltip"]').first().isVisible().catch(() => false)) hovered++;
  }
  assert(hovered === cubeCount,
    `every round in the strip answers on hover, clickable or not (${hovered}/${cubeCount})`);

  const titled = await page.locator(`${STRIP} > button[title]`).count();
  assert(titled === 0, `no round falls back to a native title tooltip (${titled} left)`);

  console.log("\nthe recap can be moved out of the way:");
  // Only a past PvP round opens a recap, and stage 1 is entirely PvE plus a
  // carousel -- so the match has to run into stage 2 before there is anything
  // to open. That is several more round cycles of waiting, which is why this
  // assertion is last.
  let opened = false;
  for (let wait = 0; wait < 8 && !opened; wait++) {
    const cubes = page.locator(`${STRIP} > button`);
    for (let i = 0; i < (await cubes.count()); i++) {
      const c = cubes.nth(i);
      // aria-disabled, not :disabled -- see the note on the button itself.
      if ((await c.getAttribute("aria-disabled").catch(() => "true")) === "true") continue;
      await c.click().catch(() => {});
      await page.waitForTimeout(800);
      opened = await page.locator('div.gilded-strong:has(button:text("\u2715"))').count() > 0;
      if (opened) break;
    }
    if (!opened) {
      console.log(`  (no PvP round played yet — waiting another round)`);
      await page.waitForTimeout(45000);
      await dismissOverlays(page);
    }
  }
  const panel = page.locator('div.gilded-strong:has(button:text("✕"))').first();
  const havePanel = await panel.isVisible().catch(() => false);
  assert(havePanel, "a past round opens its recap");
  if (havePanel) {
    const before = await panel.boundingBox();
    await page.mouse.move(before.x + 30, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(400, 600, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await panel.boundingBox();
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    assert(moved > 50, `dragging it moves it (${moved.toFixed(0)}px)`);
    assert(after.x >= 0 && after.y >= 0 && after.x + after.width <= VIEWPORT.width && after.y + after.height <= VIEWPORT.height,
      "and it stays fully on screen");
    await shoot(page, "03-recap-moved");
  }

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 12)) console.log(`   ${e}`);
  }
  await browser.close();
  console.log(failures === 0
    ? "\n✅ The round strip shows its rounds whole, explains them, and its recap moves"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
