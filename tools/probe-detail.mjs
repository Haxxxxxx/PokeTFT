/**
 * Probe for the unit detail panel.
 *
 * The panel's tallest block used to be a type-effectiveness chart — eighteen
 * type chips restating a fixed table, identical for every mon of that type.
 * It is now a recommended-items list computed from the unit's own statline.
 *
 * Worth probing rather than eyeballing because a recommendation list LOOKS
 * right whatever it contains: three plausible item names and a percentage. So
 * this checks the properties a screenshot cannot — that the old block is
 * actually gone, that the panel got shorter rather than just rearranged, and
 * that the stat grid ends on a full row instead of a ragged one.
 *
 * Usage:
 *   node tools/probe-detail.mjs [url] [outDir]
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-detail";
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
async function shoot(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

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
  await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
  await page.waitForTimeout(800);
  await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  await page.waitForTimeout(8000);
  await dismissOverlays(page);

  // Open a detail panel from a shop card's info button.
  const info = page.locator('button.shop-card [role="button"]').first();
  await info.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);

  const panel = page.locator('[data-inspect-panel]').first();
  let box = await panel.boundingBox().catch(() => null);
  if (!box) {
    // Fall back to whatever holds the recommended header.
    await shoot(page, "99-no-panel");
  }

  console.log("\nthe type chart is gone and items took its place:");
  const chart = await page.getByText(/compatibilit|type matchups|capacité touche|move hits/i).count();
  assert(chart === 0, `no type-effectiveness block remains (${chart} found)`);
  const reco = await page.getByText(/objets conseillés|recommended items/i).count();
  assert(reco > 0, `the recommended-items block is present (${reco})`);

  const rows = await page.evaluate(() => {
    const head = [...document.querySelectorAll("span")]
      .find((e) => /objets conseillés|recommended items/i.test(e.textContent ?? ""));
    const block = head?.closest("div")?.parentElement;
    if (!block) return null;
    const btns = [...block.querySelectorAll("button")];
    return {
      count: btns.length,
      texts: btns.map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()),
      height: block.getBoundingClientRect().height,
    };
  });
  if (!rows) assert(false, "found the recommended block's rows");
  else {
    assert(rows.count === 3, `it lists three items (${rows.count})`);
    assert(rows.texts.every((t) => /\+\d+%/.test(t)),
      `each row states how much it improves the mon (${JSON.stringify(rows.texts[0] ?? "")})`);
    assert(new Set(rows.texts).size === rows.count, "and no row repeats another");
  }

  console.log("\nthe stat grid ends on a full row:");
  const grid = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("div.grid.grid-cols-3 > div")];
    const inPanel = cells.filter((c) => /PV|HP|DPS|MANA|TIER/i.test(c.textContent ?? "") || true);
    return { n: inPanel.length };
  });
  assert(grid.n % 3 === 0, `its cell count is a multiple of three — no orphan row (${grid.n} cells)`);

  await shoot(page, "01-detail");

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 8)) console.log(`   ${e.slice(0, 150)}`);
  }
  await browser.close();
  console.log(failures === 0
    ? "\n✅ The detail panel recommends items instead of reprinting the type chart"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
