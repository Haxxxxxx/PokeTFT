/**
 * Probe for the interest stack on the left of the board.
 *
 * The "+N" under the gold counter is gone, so this stack is now the ONLY
 * readout for interest. If it drifts from the real number nothing else in the
 * UI contradicts it, and the player banks to a breakpoint that is not there.
 *
 * So it checks the stack against the gold it claims to describe, recomputing
 * interest independently (floor(gold / 10), capped at 5) rather than asking
 * the app — otherwise it would agree with any value the app produced.
 *
 * Usage:
 *   node tools/probe-income.mjs [url] [outDir]
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-income";
const VIEWPORT = { width: 1440, height: 900 };

/** Mirrors ECONOMY in src/game/config.ts. A copy, deliberately. */
const PER = 10, CAP = 5;
const expectedInterest = (gold) => Math.min(Math.floor(gold / PER), CAP);

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
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(220);
    const closed =
      (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 600)) ||
      (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 600));
    if (!closed) break;
    await page.waitForTimeout(240);
  }
}

/** The stack, plus the gold the HUD is showing. */
const read = (page) => page.evaluate(() => {
  const stack = document.querySelector("[data-income]");
  if (!stack) return null;
  const balls = [...stack.querySelectorAll("[data-ball]")].map((b) => b.getAttribute("data-ball"));
  // Gold as the player sees it, from the shop's own readout.
  const goldEl = [...document.querySelectorAll("span")]
    .find((s) => s.className.includes("text-gold-300") && /^\d+$/.test(s.textContent?.trim() ?? ""));
  const box = stack.getBoundingClientRect();
  return {
    earned: Number(stack.getAttribute("data-income")),
    cap: Number(stack.getAttribute("data-income-cap")),
    balls,
    gold: goldEl ? Number(goldEl.textContent.trim()) : null,
    left: box.left, width: box.width, height: box.height,
    boardLeft: document.querySelector(".arena-frame")?.getBoundingClientRect().left ?? null,
  };
});

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200);
  await dismissOverlays(page);
  await clickIfPresent(page, /play as guest|jouer en invit|invit/i, 6000);
  await page.waitForTimeout(2400);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(create|cr[ée]er)\b/i, 8000);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1100);
    if (!(await clickButton(page, /^\s*(continue|continuer|next|suivant)\b/i, 2500))) break;
  }
  await page.waitForTimeout(2600);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(easy|medium|facile|moyen)\s*$/i, 2500);
  await page.waitForTimeout(700);
  await clickButton(page, /start|lancer/i, 8000);
  await page.waitForTimeout(7000);

  // Take the opening draft, or its overlay sits over the board all round.
  const starters = page.locator('button:has-text("Zap Cannon"), button:has-text("Thrash")');
  await page.locator("div").filter({ hasText: /^$/ }).first().waitFor({ timeout: 1000 }).catch(() => {});
  const draftCard = page.locator('[class*="w-\\[150px\\]"]').first();
  if (await draftCard.isVisible().catch(() => false)) {
    await draftCard.click().catch(() => {});
    console.log("  took the opening draft");
  } else {
    await starters.first().click().catch(() => {});
  }
  await page.waitForTimeout(1600);
  await dismissOverlays(page);

  console.log("\nthe stack is on the board and matches the gold:");
  const a = await read(page);
  if (!a) {
    assert(false, "found the interest stack");
    await page.screenshot({ path: `${OUT}/99-missing.png` });
    await browser.close();
    process.exit(1);
  }
  assert(a.cap === CAP, `it shows the full capacity, not just what is earned (${a.balls.length} slots, cap ${a.cap})`);
  assert(a.balls.length === CAP, `every slot is drawn (${a.balls.length})`);
  assert(a.gold !== null, `read the gold from the HUD (${a.gold})`);
  if (a.gold !== null) {
    const want = expectedInterest(a.gold);
    assert(a.earned === want, `interest matches the gold independently (${a.gold}g → ${a.earned}, expected ${want})`);
    assert(a.balls.filter((b) => b === "filled").length === want,
      `and that many balls are actually filled (${a.balls.filter((b) => b === "filled").length})`);
  }
  assert(a.boardLeft !== null && Math.abs(a.left - a.boardLeft) < a.width * 2.5,
    `it sits at the LEFT edge of the board (stack ${a.left.toFixed(0)}, board ${a.boardLeft?.toFixed(0)})`);
  assert(a.height > a.width, `and stacks vertically (${a.width.toFixed(0)}x${a.height.toFixed(0)})`);

  await page.screenshot({ path: `${OUT}/01-stack.png` });
  console.log("  📸 01-stack.png");

  console.log("\nthe old +N readout is gone:");
  // It lived directly under the gold number. Its absence is the other half of
  // the change and would otherwise silently come back.
  const stale = await page.locator('span[title*="ntérêt"], span[title*="nterest"]').count();
  assert(stale === 0, `no leftover interest text under the gold counter (${stale})`);

  const real = errors.filter((e) => !/ethereum|extension/i.test(e));
  assert(real.length === 0, `no console errors (${real.length})`);

  await browser.close();
  console.log(failures === 0
    ? "\n✅ Interest reads as a stack of balls, and agrees with the gold"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
