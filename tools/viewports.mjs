/**
 * Responsive check. The layout engine has unit tests (test/layout.ts) but the
 * RENDERED result has only ever been looked at on one 1440x900 desktop.
 * Landscape-only reflow was an explicit product requirement, so this drives a
 * real match at several real device sizes and reports, per viewport:
 *   - horizontal page overflow (the thing reflow is supposed to prevent)
 *   - any element sticking out past the viewport
 *   - console errors
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3004";
const OUT = process.argv[3] ?? "/tmp/vp";

const VIEWPORTS = [
  { name: "phone-se-landscape", width: 667, height: 375 },
  { name: "phone-14-landscape", width: 844, height: 390 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

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
    await b.click({ timeout: 2500 }); return true;
  } catch { return false; }
}
async function dismissOverlays(page) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
    const closed = (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 500))
      || (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 500));
    if (!closed) {
      const x = page.locator('button[aria-label*="lose" i], button[aria-label*="ermer" i]').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); continue; }
      break;
    }
  }
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const report = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2600);
    await dismissOverlays(page);
    await clickIfPresent(page, /jouer en invit|play as guest|invit/i, 6000);
    await page.waitForTimeout(2000);
    await dismissOverlays(page);
    await clickButton(page, /^\s*(cr[ée]er|create)\b/i, 8000);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(1000);
      if (!(await clickButton(page, /^\s*(continuer|continue|suivant)\b/i, 2000))) break;
    }
    await page.waitForTimeout(2200);
    await dismissOverlays(page);
    for (let i = 0; i < 3; i++) { await clickButton(page, /^\s*(facile|moyen|easy|medium)\s*$/i, 2000); await page.waitForTimeout(500); }
    await clickButton(page, /lancer la partie|lancer|start/i, 8000);
    await page.waitForTimeout(6500);
    await dismissOverlays(page);

    const probe = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth, vh = de.clientHeight;
      const overflowX = de.scrollWidth - vw;
      const overflowY = de.scrollHeight - vh;
      // Elements sticking out horizontally past the viewport.
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 2 || r.left < -2) {
          const cls = (el.className && typeof el.className === "string") ? el.className.slice(0, 48) : el.tagName;
          out.push(`${el.tagName}.${cls} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        }
        if (out.length > 6) break;
      }
      return { vw, vh, overflowX, overflowY, out };
    });
    await page.screenshot({ path: `${OUT}/${vp.name}.png` });
    report.push({ vp: vp.name, size: `${vp.width}x${vp.height}`, ...probe, errors: errors.length, firstError: errors[0] ?? null });
  } catch (e) {
    report.push({ vp: vp.name, size: `${vp.width}x${vp.height}`, failed: String(e).slice(0, 140), errors: errors.length });
  }
  await page.close();
}

for (const r of report) {
  console.log(`\n### ${r.vp} (${r.size})`);
  if (r.failed) { console.log("  FAILED:", r.failed); continue; }
  console.log(`  overflowX=${r.overflowX}px  overflowY=${r.overflowY}px  consoleErrors=${r.errors}`);
  if (r.firstError) console.log(`  firstError: ${r.firstError.slice(0, 160)}`);
  if (r.out.length) { console.log("  elements past viewport:"); for (const o of r.out.slice(0, 5)) console.log("   -", o); }
}
await browser.close();
