/**
 * Probe for match chat.
 *
 * This one exists because the feature it replaces was dead for its entire
 * life and nobody could tell. Messages were written to games/<code>/chat, a
 * path with no rule of its own, so every write fell through to
 * games/<code>/.write — which permits only CREATING a game or the host
 * DELETING one — and was refused. The send was `.catch(() => {})`, so the UI
 * looked exactly the same whether or not a single message had ever arrived.
 *
 * The assertion that matters is therefore not "the panel opens" but "the
 * message came BACK": written to the database, accepted by the rules, and
 * echoed to a subscriber. Anything less would have passed against the old
 * implementation too.
 *
 * Usage:
 *   node tools/probe-chat.mjs [url] [outDir]
 *
 * Needs the chat rule deployed (firebase deploy --only database). Plays a real
 * match, so it writes a real room.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-chat";
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

const PANEL = '[data-panel="chat"]';

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
  for (let i = 0; i < 2; i++) {
    await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
    await page.waitForTimeout(800);
  }
  await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  console.log("  match started");
  await page.waitForTimeout(8000);
  await dismissOverlays(page);

  console.log("\nthe chat opens:");
  const toggle = page.getByRole("button", { name: /^(chat|tchat)$/i }).last();
  await toggle.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const panel = page.locator(PANEL);
  const open = await panel.isVisible().catch(() => false);
  assert(open, "the panel is showing");
  if (!open) {
    await shoot(page, "99-no-panel");
    await browser.close();
    process.exit(1);
  }

  console.log("\na typed message actually reaches the database and comes back:");
  const text = `probe-${Date.now().toString(36)}`;
  const input = panel.locator("input").first();
  await input.fill(text);
  await input.press("Enter");

  // The real assertion. The message must appear in the LOG, which is fed by
  // the onChildAdded subscription -- i.e. it round-tripped through RTDB and
  // the rules accepted it. Rendering the local draft would not prove anything.
  let landed = false;
  for (let i = 0; i < 25 && !landed; i++) {
    await page.waitForTimeout(400);
    landed = (await panel.getByText(text, { exact: false }).count()) > 0;
  }
  assert(landed, `the typed message round-tripped through RTDB (${text})`);

  const sendErrors = errors.filter((e) => /\[chat\] send failed|permission_denied/i.test(e));
  assert(sendErrors.length === 0,
    `the rules accepted the write (${sendErrors.length} refusal(s)${sendErrors[0] ? ": " + sendErrors[0].slice(0, 120) : ""})`);

  console.log("\na preset reaches it too:");
  // Wait out the client-side send throttle first. Without this the click is
  // refused by the cooldown and the probe reports a product failure for its
  // own impatience -- which is exactly what happened the first time it ran.
  await page.waitForTimeout(1200);
  const gg = panel.getByRole("button", { name: "GG!", exact: true });
  assert(!(await gg.isDisabled().catch(() => true)),
    "the preset is re-enabled once the throttle lapses");
  await gg.click().catch(() => {});
  let preset = false;
  for (let i = 0; i < 20 && !preset; i++) {
    await page.waitForTimeout(400);
    preset = (await panel.getByText("GG!", { exact: false }).count()) > 1; // button + message
  }
  assert(preset, "the preset round-tripped as well");
  await shoot(page, "01-chat");

  console.log("\nand typing does not drive the shop:");
  // R / L / S / D / F are shop hotkeys bound on window. Typing them into the
  // chat input must not reroll, buy XP or sell.
  const goldBefore = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /^\d+$/.test(s.textContent?.trim() ?? "") && s.className.includes("text-gold-300"));
    return el ? Number(el.textContent.trim()) : null;
  });
  await input.fill("rrrlllsss");
  await page.waitForTimeout(800);
  const goldAfter = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /^\d+$/.test(s.textContent?.trim() ?? "") && s.className.includes("text-gold-300"));
    return el ? Number(el.textContent.trim()) : null;
  });
  assert(goldBefore !== null && goldBefore === goldAfter,
    `typing shop hotkeys into the chat spent nothing (${goldBefore} → ${goldAfter})`);
  await input.fill("");

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 10)) console.log(`   ${e.slice(0, 160)}`);
  }
  await browser.close();
  console.log(failures === 0
    ? "\n✅ Chat messages reach the database, come back, and don't touch the shop"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
