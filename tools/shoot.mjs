/**
 * Visual harness: drives a real match to a given phase and screenshots it.
 *
 * Exists because every rendering bug in the board rework was found by a human
 * screenshotting and none by the test suite — the headless engine tests verify
 * combat MATH, not that the combat VIEW draws where it should. This closes
 * that loop so layout regressions get caught before they ship.
 *
 * Usage:
 *   node tools/shoot.mjs [url] [outDir]
 *
 * Assumes a dev server is already running (npm run dev). Plays as a guest,
 * hosts a game, adds a bot, starts, and shoots both planning and combat.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-shots";
const VIEWPORT = { width: 1440, height: 900 };

/** Click the first visible element whose text matches, if present. */
async function clickIfPresent(page, rx, timeout = 4000) {
  const el = page.getByText(rx).first();
  try {
    await el.waitFor({ state: "visible", timeout });
    await el.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear anything modal standing between us and the game: the first-run tour,
 * the coach, cookie-ish banners. Tries Escape, then any close affordance, then
 * clicks through a paged tour.
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);

    const closed =
      (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 700)) ||
      (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 700));

    // Bare icon close buttons carry no text — fall back to aria/known markup.
    if (!closed) {
      const x = page.locator('button[aria-label*="lose" i], button[aria-label*="ermer" i]').first();
      if (await x.isVisible().catch(() => false)) {
        await x.click().catch(() => {});
        await page.waitForTimeout(250);
        continue;
      }
      break;
    }
    await page.waitForTimeout(300);
  }
}

/** Click a real <button> by accessible name — more reliable than text nodes,
 *  which can match a label inside a disabled or decorative element. */
async function clickButton(page, rx, timeout = 4000) {
  const btn = page.getByRole("button", { name: rx }).first();
  try {
    await btn.waitFor({ state: "visible", timeout });
    if (await btn.isDisabled().catch(() => false)) return false;
    await btn.click({ timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

async function shoot(page, name) {
  await mkdir(OUT, { recursive: true });
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  console.log(`  📸 ${path}`);
  return path;
}

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  // Opt into the HD-2D board before the app boots, by writing the persisted
  // settings key directly — the toggle lives behind an in-match menu, which is
  // several clicks deep and not what this harness is testing.
  // BOARD3D=1 opts into the HD-2D board; MODELS3D=1 swaps sprites for 3D
  // models. Both are written straight into the persisted settings key because
  // the toggles live behind an in-match menu several clicks deep.
  const wantBoard3d = process.env.BOARD3D === "1";
  const wantModels3d = process.env.MODELS3D === "1";
  if (wantBoard3d || wantModels3d) {
    await page.addInitScript(([board3d, models3d]) => {
      try {
        const k = "poketft_settings";
        const cur = JSON.parse(localStorage.getItem(k) ?? '{"state":{"settings":{}},"version":0}');
        cur.state = cur.state ?? { settings: {} };
        const next = { ...(cur.state.settings ?? {}) };
        if (board3d) next.board3d = true;
        if (models3d) next.models3d = true;
        cur.state.settings = next;
        localStorage.setItem(k, JSON.stringify(cur));
      } catch { /* private mode — fall back to the defaults */ }
    }, [wantBoard3d, wantModels3d]);
    console.log(`  (${[wantBoard3d && "HD-2D board", wantModels3d && "3D models"].filter(Boolean).join(" + ")} enabled)`);
  }

  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  // The first-run "how to play" tour blocks everything behind a modal.
  await dismissOverlays(page);
  await shoot(page, "01-welcome");

  // Guest sign-in, if the auth gate is showing.
  await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
  await page.waitForTimeout(2500);
  await dismissOverlays(page);

  // Host a game. The button is just "Créer".
  const hosted = await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
  console.log(hosted ? "  hosted a game" : "  ⚠️ could not find the create button");
  // Hosting can land on a multi-step pre-lobby (mode picker, then rules) before
  // the salon itself. Walk any "Continue" steps until the lobby appears.
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1200);
    if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2500))) break;
    console.log("  advanced a pre-lobby step");
  }

  await page.waitForTimeout(3000);
  await dismissOverlays(page);
  await shoot(page, "02-lobby");

  // Add AI opponents. In the lobby a bot is added by picking a difficulty
  // under "Ajouter IA"; "Lancer la partie" stays disabled while you're alone.
  for (let i = 0; i < 3; i++) {
    await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
    await page.waitForTimeout(800);
  }
  await shoot(page, "02b-lobby-bot");

  const started = await clickButton(page, /lancer la partie|lancer|start/i, 8000);
  console.log(started ? "  started the match" : "  ⚠️ start button never enabled");

  // Planning.
  await page.waitForTimeout(7000);
  await dismissOverlays(page);
  await shoot(page, "03-planning");

  // Combat: the planning timer is 30s, so wait it out and shoot mid-fight.
  console.log("  waiting for combat…");
  await page.waitForTimeout(31000);
  // Several frames across the fight: a cast only fires at full mana, so a
  // single capture is a coin flip on whether ability effects are on screen.
  for (let i = 0; i < 6; i++) {
    await shoot(page, `04-combat-${String(i).padStart(2, "0")}`);
    await page.waitForTimeout(2200);
  }

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} console error(s):`);
    for (const e of errors.slice(0, 12)) console.log(`   ${e}`);
  } else {
    console.log("\n✅ no console errors");
  }

  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
