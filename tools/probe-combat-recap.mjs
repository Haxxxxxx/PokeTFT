/**
 * Probe for the two panels that sit beside the fight: the combat recap and the
 * pension dock.
 *
 * Both were reported by hand after a session — "pension too big", "can't move
 * the recap of the combat panel" — and both are the kind of claim a test suite
 * cannot make for itself, because the engine tests verify combat MATH and know
 * nothing about where a panel lands or how tall it is.
 *
 * So this plays a real match into a fight and asserts, in the browser:
 *   - the combat recap can be dragged, stays on screen, and stays put
 *   - dragging it does not reset the tab you had selected
 *   - the pension dock is a sensible fraction of the rail it lives in
 *
 * Usage:
 *   node tools/probe-combat-recap.mjs [url] [outDir]
 *
 * Assumes a dev server is already running. Like tools/shoot.mjs, this plays a
 * real match and therefore writes a real room.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-combat-recap";
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

/* Both panels carry a data-panel hook. Deliberately not a text or class
   selector: the labels are translated, the classes are utility soup, and a
   selector that guesses is a probe that reports confident nonsense -- an
   earlier version of this file matched the page body and announced the
   pension was 900px tall. These are also plain CSS, so the same string works
   in a Playwright locator and inside page.evaluate (Playwright's :text-is()
   is not valid CSS and throws in querySelector). */
const RECAP = '[data-panel="combat-recap"]';
const PENSION = '[data-panel="pension"]';

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
  console.log("  match started");
  await page.waitForTimeout(7000);
  await dismissOverlays(page);

  // The pension is on the rail in every phase — measure it during planning.
  console.log("\nthe pension dock is chrome, not a feature panel:");
  const pension = await page.evaluate((sel) => {
    const dock = document.querySelector(sel);
    if (!dock) return null;
    const r = dock.getBoundingClientRect();
    const parent = dock.parentElement?.getBoundingClientRect();
    return { w: r.width, h: r.height, railW: parent?.width ?? 0 };
  }, PENSION);
  if (!pension) {
    assert(false, "found the pension dock on the rail");
  } else {
    assert(pension.h <= 170,
      `it is not taller than a glance needs (${pension.h.toFixed(0)}px)`);
    assert(pension.h < VIEWPORT.height * 0.22,
      `nor a fifth of the screen (${(pension.h / VIEWPORT.height * 100).toFixed(0)}% of viewport height)`);
    assert(Math.abs(pension.w - pension.railW) < 2,
      `and it fills the rail's width exactly (${pension.w.toFixed(0)} of ${pension.railW.toFixed(0)})`);
    await shoot(page, "01-pension");
  }

  // Into the fight, where the combat recap lives.
  console.log("\n  waiting for combat…");
  await page.waitForTimeout(31000);
  await dismissOverlays(page);
  await shoot(page, "02-combat");

  console.log("\nthe combat recap can be moved off the fight it describes:");
  const panel = page.locator(RECAP).first();
  const visible = await panel.isVisible().catch(() => false);
  assert(visible, "the recap is showing during the fight");
  if (visible) {
    // Pick a non-default tab, so we can tell whether dragging remounts it.
    await page.locator(RECAP).getByRole("button", { name: "HEAL", exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(300);

    const before = await panel.boundingBox();
    await page.mouse.move(before.x + 60, before.y + 8);
    await page.mouse.down();
    await page.mouse.move(820, 560, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await panel.boundingBox();
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    assert(moved > 50, `dragging it moves it (${moved.toFixed(0)}px)`);
    assert(after.x >= 0 && after.y >= 0
      && after.x + after.width <= VIEWPORT.width
      && after.y + after.height <= VIEWPORT.height,
      "and it stays fully on screen");

    // The tab must survive the drag: a portal that remounts would reset it to
    // DMG, silently throwing away what the player was looking at.
    const healStill = await page.locator(RECAP).getByRole("button", { name: "HEAL", exact: true }).first()
      .evaluate((el) => el.style.background !== "").catch(() => false);
    assert(healStill, "and the tab you were reading survives the drag");

    // It must also sit ABOVE the fight rather than under it: a panel that
    // drops behind the board is no more usable than one you cannot move.
    const onTop = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 6);
      return !!hit && (el === hit || el.contains(hit));
    }, RECAP);
    assert(onTop, "and nothing paints over it where it now sits");
    await shoot(page, "03-recap-moved");
  }

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 12)) console.log(`   ${e}`);
  }
  await browser.close();
  console.log(failures === 0
    ? "\n✅ The combat recap moves, and the pension reads as chrome"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
