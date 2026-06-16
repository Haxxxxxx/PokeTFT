/**
 * Local screenshot harness — boots a real bot game and snapshots each screen so you
 * can iterate on the planning / combat / lobby UI without a live opponent.
 *
 * It is intentionally NOT a repo dependency (Playwright is heavy and CI doesn't need
 * it). One-time setup, then run against your local dev server:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run dev                      # in one terminal (http://localhost:3000)
 *   node tools/screenshots.mjs       # in another → writes to ./screenshots/
 *
 * Optional: BASE_URL=https://poketft-arena.web.app node tools/screenshots.mjs
 *
 * Drives the flow by data-testid (create-game → add-bot-* → start-game), so it keeps
 * working even if button copy changes. It creates a THROWAWAY room and leaves at the
 * end. The headless gameplay regression guard is `npm run test:sim` (no browser).
 */
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "./screenshots";

const { chromium } = await import("playwright").catch(() => {
  console.error("Playwright not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1760, height: 1000 } });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(`  📸 ${name}.png`); };

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);             // let guest auth settle
  await shot("01-welcome");

  // Create a room (host is auto-signed-in as a guest).
  await page.getByTestId("create-game").click();
  await page.getByTestId("add-bot-medium").waitFor({ timeout: 15000 });
  await shot("02-lobby");

  // Fill with a few bots so the match can start, then begin.
  for (let i = 0; i < 3; i++) await page.getByTestId("add-bot-medium").click();
  await page.waitForTimeout(500);
  await page.getByTestId("start-game").click();

  // Planning, then combat.
  await page.waitForTimeout(3000);
  await shot("03-planning");
  await page.waitForTimeout(18000);            // wait out planning into combat
  await shot("04-combat");

  console.log(`\n✅ Screens saved to ${OUT}/`);
} catch (err) {
  console.error("Screenshot run failed:", err?.message ?? err);
  await shot("error-state");
  process.exitCode = 1;
} finally {
  await browser.close();
}
