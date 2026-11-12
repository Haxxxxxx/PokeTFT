/**
 * Probe for the arena variants.
 *
 * The resolution logic is unit-tested (test/arena-variants.ts) — which board
 * gives which theme, and that it cannot flicker. What a unit test cannot show
 * is whether the theme is VISIBLE: whether the accent actually reaches the
 * slab, and whether the weather layer renders particles rather than an empty
 * div. Both of those fail silently and look fine in code.
 *
 * So this pins each variant in turn via the persisted settings key, plays into
 * a board, and measures the rendered result.
 *
 * Usage:
 *   node tools/probe-arena.mjs [url] [outDir] [type,type,...]
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-arena";
const PINS = (process.argv[4] ?? "fire,water,ice,electric").split(",");
const VIEWPORT = { width: 1440, height: 900 };

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

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const pin of PINS) {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Pin the variant before the app boots, the same way shoot.mjs opts into
    // the 3D board — the chooser lives behind an in-match menu.
    await page.addInitScript((p) => {
      try {
        const k = "poketft_settings";
        const cur = JSON.parse(localStorage.getItem(k) ?? '{"state":{"settings":{}},"version":0}');
        cur.state = cur.state ?? { settings: {} };
        cur.state.settings = { ...(cur.state.settings ?? {}), arenaPin: p, arenaEffects: true };
        localStorage.setItem(k, JSON.stringify(cur));
      } catch { /* private mode — falls back to auto */ }
    }, pin);

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await dismissOverlays(page);
    await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
    await page.waitForTimeout(2200);
    await dismissOverlays(page);
    await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1100);
      if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
    }
    await page.waitForTimeout(2500);
    await dismissOverlays(page);
    await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
    await page.waitForTimeout(700);
    await clickButton(page, /lancer la partie|lancer|start/i, 8000);
    await page.waitForTimeout(7000);
    await dismissOverlays(page);

    const m = await page.evaluate(() => {
      const frame = document.querySelector(".arena-frame[data-arena]");
      if (!frame) return null;
      const fx = frame.querySelector(".arena-fx");
      const bits = fx ? fx.querySelectorAll(".arena-fx-bit") : [];
      const sample = bits[0] ? getComputedStyle(bits[0]) : null;
      return {
        arena: frame.getAttribute("data-arena"),
        accent: getComputedStyle(frame).getPropertyValue("--arena-accent").trim(),
        fxClass: fx ? fx.className : null,
        bits: bits.length,
        anim: sample ? sample.animationName : null,
        dur: sample ? sample.animationDuration : null,
      };
    });

    results.push({ pin, m, errors });
    await page.screenshot({ path: `${OUT}/arena-${pin}.png` });
    console.log(`  📸 arena-${pin}.png`);
    await ctx.close();
  }

  await browser.close();

  console.log("\nthe pinned variant reaches the DOM:");
  for (const { pin, m } of results) {
    if (!m) { assert(false, `${pin}: found the arena frame`); continue; }
    assert(m.arena === pin, `${pin}: data-arena is set (${m.arena})`);
    assert(/^#|rgb/.test(m.accent), `${pin}: accent resolves to a colour (${m.accent})`);
  }

  console.log("\nthe weather actually renders:");
  for (const { pin, m } of results) {
    if (!m) continue;
    assert(m.bits > 0, `${pin}: particles exist (${m.bits})`);
    assert(!!m.anim && m.anim !== "none", `${pin}: they are animated (${m.anim})`);
    assert(m.fxClass?.includes(`arena-fx-`), `${pin}: the effect class is applied (${m.fxClass})`);
  }

  console.log("\nand each variant is visually distinct:");
  const accents = results.filter((r) => r.m).map((r) => r.m.accent);
  assert(new Set(accents).size === accents.length,
    `no two pinned variants share an accent (${accents.join(", ")})`);
  const anims = results.filter((r) => r.m).map((r) => r.m.anim);
  assert(new Set(anims).size > 1, `and they do not all use one animation (${[...new Set(anims)].join(", ")})`);

  const allErrors = results.flatMap((r) => r.errors);
  assert(allErrors.length === 0, `no page errors (${allErrors.length})`);

  console.log(failures === 0
    ? "\n✅ Each arena variant themes the slab and renders its own weather"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
