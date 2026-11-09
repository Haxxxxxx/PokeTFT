/**
 * Measures every model instead of eyeballing it.
 *
 * Triaging 967 models by looking at ~80 contact sheets is slow and unreliable —
 * the eye skips things, and "looks a bit big" is not a record anyone can act on.
 * This renders the same sheets but reads each cell's PIXELS back and reports a
 * silhouette measurement per species, so the visual pass only has to look at
 * what the numbers flag.
 *
 * Per dex it records:
 *   coverage  — fraction of the cell the model actually paints
 *   bbox      — the silhouette's bounds, normalised to the cell
 *   edges     — which cell edges the silhouette touches (cropped / oversized)
 *   aspect    — bbox width / height (lying down vs standing on end)
 *
 * Reading pixels back relies on preserveDrawingBuffer, which SheetCanvas sets.
 *
 *   node tools/model-sweep.mjs <url> <outJson> [from] [to]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const URL_BASE = process.argv[2] ?? "http://localhost:3007";
const OUT = process.argv[3] ?? "/tmp/sweep.json";
const FROM = Number(process.argv[4] ?? 1);
const TO = Number(process.argv[5] ?? 1025);
const PER = 12; // WebGL context cap — see page.tsx

const browser = await chromium.launch();
const results = {};
let cursor = FROM;
let sheets = 0;

while (cursor <= TO) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const url = `${URL_BASE}/lab/model-sheet?from=${cursor}&count=${PER}&yaw=0`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let t = 0; t < 90; t++) {
      const p = await page.getAttribute("[data-sheet-progress]", "data-sheet-progress").catch(() => null);
      const [done, total] = (p ?? "0/0").split("/").map(Number);
      if (total > 0 && done >= total) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);

    const cells = await page.evaluate(() => {
      const out = [];
      for (const cell of document.querySelectorAll("div.relative.rounded-lg")) {
        const label = cell.querySelector("span.absolute");
        const dex = Number(label?.textContent);
        const canvas = cell.querySelector("canvas");
        if (!Number.isFinite(dex) || !canvas) continue;
        const w = 120, h = 120;
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const ctx = off.getContext("2d");
        if (!ctx) continue;
        try { ctx.drawImage(canvas, 0, 0, w, h); } catch { out.push({ dex, error: "readback" }); continue; }
        const { data } = ctx.getImageData(0, 0, w, h);
        let minX = w, minY = h, maxX = -1, maxY = -1, lit = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            // Alpha is the silhouette: the sheet background is transparent in
            // the canvas itself (the dark card sits behind it in the DOM).
            if (data[(y * w + x) * 4 + 3] > 24) {
              lit++;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) { out.push({ dex, coverage: 0, empty: true }); continue; }
        const bw = (maxX - minX + 1) / w, bh = (maxY - minY + 1) / h;
        out.push({
          dex,
          coverage: +(lit / (w * h)).toFixed(4),
          bbox: [+(minX / w).toFixed(3), +(minY / h).toFixed(3), +(maxX / w).toFixed(3), +(maxY / h).toFixed(3)],
          aspect: +(bw / bh).toFixed(2),
          edges: {
            left: minX <= 1, right: maxX >= w - 2,
            top: minY <= 1, bottom: maxY >= h - 2,
          },
        });
      }
      return out;
    });

    for (const c of cells) results[c.dex] = c;
    const last = cells.length ? Math.max(...cells.map((c) => c.dex)) : cursor + PER - 1;
    sheets++;
    if (sheets % 10 === 0) console.log(`  …${sheets} sheets, through dex ${last}`);
    cursor = last + 1;
    if (!cells.length) cursor += PER; // nothing usable in this range; keep moving
  } catch (e) {
    console.log(`sheet at ${cursor} failed: ${String(e).slice(0, 80)}`);
    cursor += PER;
  }
  await page.close();
}

writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`measured ${Object.keys(results).length} models → ${OUT}`);
await browser.close();
