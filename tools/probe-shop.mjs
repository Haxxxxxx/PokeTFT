/**
 * Probe for the shop row and the left rail.
 *
 * Five hand-reported complaints land here, and four of them are about WHERE
 * something is — which the engine tests cannot see at all, and which a
 * screenshot shows for one window size and one moment of one match.
 *
 * The fifth is the interesting one. "Items often hide the traits" is a
 * constraint that only bites once you own enough items, which is twenty
 * minutes into a match — so rather than play to that state, this asserts the
 * constraint itself: that the stash's height ceiling actually RESOLVES. A
 * Tailwind arbitrary value like max-h-[45%] silently does nothing if the class
 * was never generated, and the layout would then look perfect in every
 * screenshot taken before the stash fills up.
 *
 * Usage:
 *   node tools/probe-shop.mjs [url] [outDir]
 *
 * Assumes a dev server is already running. Plays a real match, so it writes a
 * real room.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-shop";
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
  await page.waitForTimeout(7000);
  await dismissOverlays(page);
  await shoot(page, "01-planning");

  console.log("\nthe odds sit over the cards they are odds on:");
  const geom = await page.evaluate(() => {
    const txt = (el) => (el?.textContent ?? "").trim();
    const all = [...document.querySelectorAll("div")];
    // The odds strip is the row holding the CHANCES/ODDS label.
    const odds = all.find((d) => /^(chances|odds)\b/i.test(txt(d.children[0])) && d.children.length <= 8);
    const cards = [...document.querySelectorAll("button.shop-card")];
    const xpBtn = [...document.querySelectorAll("button")].find((b) => /acheter xp|buy xp/i.test(txt(b)));
    const lock = document.querySelector('button[aria-pressed]');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    return {
      odds: r(odds),
      card0: r(cards[0]),
      cardLast: r(cards[cards.length - 1]),
      cardCount: cards.length,
      xp: r(xpBtn),
      xpText: txt(xpBtn),
      lock: r(lock),
      lockLabel: lock?.getAttribute("aria-label") ?? null,
      vw: window.innerWidth,
    };
  });

  if (!geom.odds || !geom.card0) {
    assert(false, "found the odds strip and the shop cards");
  } else {
    assert(geom.odds.bottom <= geom.card0.top + 2,
      `the odds sit directly above the cards (${geom.odds.bottom.toFixed(0)} → ${geom.card0.top.toFixed(0)})`);
    assert(geom.xp && geom.odds.left >= geom.xp.right - 2,
      `and no longer above the Buy XP button (odds start at ${geom.odds.left.toFixed(0)}, XP ends at ${geom.xp?.right.toFixed(0)})`);
  }

  console.log("\nthe level has a price in gold:");
  assert(/\d/.test(geom.xpText) && /(niv|lv)/i.test(geom.xpText),
    `the Buy XP control states the level and its cost (${JSON.stringify(geom.xpText.replace(/\s+/g, " "))})`);

  console.log("\nthe freeze is a small lock at the shop's top right:");
  if (!geom.lock) {
    assert(false, "found the freeze lock");
  } else {
    assert(geom.lock.width <= 34 && geom.lock.height <= 34,
      `it is small (${geom.lock.width.toFixed(0)}x${geom.lock.height.toFixed(0)}px)`);
    assert(geom.odds && Math.abs(geom.lock.top - geom.odds.top) < 14,
      "it rides on the odds strip, above the cards");
    assert(geom.cardLast && geom.lock.right >= geom.cardLast.right - 6,
      `and it is at the RIGHT end of the shop (${geom.lock.right.toFixed(0)} vs card edge ${geom.cardLast?.right.toFixed(0)})`);
  }

  console.log("\nthe shop takes the whole width:");
  assert(geom.cardCount === 5, `all five cards are present (${geom.cardCount})`);
  const slack = geom.vw - (geom.cardLast?.right ?? 0);
  assert(slack < 40,
    `the cards reach the right edge — no sell slot reserving width (${slack.toFixed(0)}px slack)`);
  const sellSlot = await page.getByText(/glisser pour vendre|drag to sell/i).count();
  assert(sellSlot === 0, `and the standing "drag to sell" slot is gone (${sellSlot} found)`);

  console.log("\nthe item stash cannot squeeze the synergies out:");
  const rail = await page.evaluate(() => {
    const traits = document.querySelector('[data-panel="traits"]');
    const stash = document.querySelector('[data-panel="stash"]');
    if (!traits || !stash) return null;
    const railEl = stash.parentElement;
    return {
      railH: railEl.getBoundingClientRect().height,
      traitsH: traits.getBoundingClientRect().height,
      stashH: stash.getBoundingClientRect().height,
      // The whole point: does the ceiling actually resolve to a length?
      stashMax: getComputedStyle(stash).maxHeight,
      stashOverflow: getComputedStyle(stash).overflowY,
    };
  });
  if (!rail) {
    assert(false, "found the synergies and the stash on the rail");
  } else {
    // getComputedStyle does NOT resolve a percentage max-height -- Chrome hands
    // back "45%" verbatim -- so both forms have to be accepted and converted,
    // or the test reads a real ceiling as a missing one (and then compares
    // "45px" against the rail, which is how this assertion first went wrong).
    assert(rail.stashMax !== "none",
      `the stash has a height ceiling at all, i.e. Tailwind generated the class (max-height: ${rail.stashMax})`);
    const maxPx = rail.stashMax.endsWith("%")
      ? (parseFloat(rail.stashMax) / 100) * rail.railH
      : parseFloat(rail.stashMax);
    assert(Number.isFinite(maxPx) && maxPx <= rail.railH * 0.46 + 1,
      `and the ceiling is under half the rail (${maxPx.toFixed(0)}px of ${rail.railH.toFixed(0)}px)`);
    assert(rail.stashH <= maxPx + 1,
      `the stash is actually inside it right now (${rail.stashH.toFixed(0)}px)`);
    assert(rail.stashOverflow === "auto" || rail.stashOverflow === "scroll",
      `so a full stash scrolls instead of growing (overflow-y: ${rail.stashOverflow})`);
    assert(rail.traitsH >= rail.railH * 0.5,
      `leaving the synergies the majority of the rail (${rail.traitsH.toFixed(0)}px of ${rail.railH.toFixed(0)}px)`);
  }

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 12)) console.log(`   ${e}`);
  }
  await browser.close();
  console.log(failures === 0
    ? "\n✅ The shop reads as a shop, and the stash stays in its lane"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
