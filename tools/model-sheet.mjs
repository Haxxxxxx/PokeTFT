/**
 * Screenshots pages of /lab/model-sheet for pose triage.
 *
 * Waits on the page's own loaded counter rather than a fixed timeout — models
 * come off the network and a blank cell is indistinguishable from a slow one in
 * a screenshot, which would quietly turn "not loaded yet" into "broken model".
 *
 *   node tools/model-sheet.mjs <url> <outDir> [from] [sheets] [perSheet] [yawDeg]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL_BASE = process.argv[2] ?? "http://localhost:3007";
const OUT = process.argv[3] ?? "/tmp/sheets";
const FROM = Number(process.argv[4] ?? 1);
const SHEETS = Number(process.argv[5] ?? 1);
const PER = Math.min(12, Number(process.argv[6] ?? 12)); // see the WebGL context cap in page.tsx
const YAW = Number(process.argv[7] ?? 0);

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

let cursor = FROM;
for (let i = 0; i < SHEETS; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `${URL_BASE}/lab/model-sheet?from=${cursor}&count=${PER}&yaw=${YAW}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for every cell to settle (loaded or failed), with a hard ceiling.
  let progress = "0/0";
  for (let t = 0; t < 120; t++) {
    progress = await page.getAttribute("[data-sheet-progress]", "data-sheet-progress").catch(() => "0/0");
    const [done, total] = (progress ?? "0/0").split("/").map(Number);
    if (total > 0 && done >= total) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1200); // let the last frames paint

  const file = `${OUT}/sheet-${String(cursor).padStart(4, "0")}-yaw${YAW}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}  settled=${progress}${errors.length ? `  pageErrors=${errors.length}` : ""}`);

  // Advance past the models this sheet actually showed.
  const last = await page.evaluate(() => {
    const nums = [...document.querySelectorAll(".relative > span.absolute")].map((e) => Number(e.textContent)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? Math.max(...nums) : 0;
  });
  cursor = (last || cursor + PER) + 1;
  await page.close();
}
await browser.close();
