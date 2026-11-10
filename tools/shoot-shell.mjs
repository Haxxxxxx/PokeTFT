/**
 * Visual harness for the app SHELL — the screens and dialogs outside a match.
 *
 * tools/shoot.mjs drives a real match, which means it creates a real row in the
 * production RTDB every run. The design-system work does not need a match, so
 * this one stops at the welcome screen and opens each dialog in turn. Nothing
 * here writes a game.
 *
 * Usage:
 *   node tools/shoot-shell.mjs [url] [outDir]
 *
 * Assumes a dev server is already running (npm run dev).
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-shell";
const VIEWPORT = { width: 1440, height: 900 };

async function shoot(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

async function clickButton(page, rx, timeout = 5000) {
  const btn = page.getByRole("button", { name: rx }).first();
  try {
    await btn.waitFor({ state: "visible", timeout });
    await btn.click({ timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shoot(page, "01-signin");

  // Guest sign-in — an anonymous auth user, no game row.
  await clickButton(page, /guest|invit/i);
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
  await shoot(page, "02-welcome");

  // Each dialog that moved onto <Modal>. Opened by accessible name, which is
  // itself part of what changed: before the migration most of these had none.
  const dialogs = [
    [/how to play|comment jouer/i, "03-howtoplay"],
    [/what's new|nouveaut/i, "04-news"],
    [/profile|profil/i, "05-profile"],
  ];
  for (const [rx, name] of dialogs) {
    const opened = await clickButton(page, rx, 3000);
    if (!opened) { console.log(`  – skipped ${name} (no button)`); continue; }
    await page.waitForTimeout(1200);
    await shoot(page, name);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }

  console.log(errors.length ? `\n⚠️  ${errors.length} console error(s):` : "\n✅ no console errors");
  for (const e of errors.slice(0, 10)) console.log("   " + e);

  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
