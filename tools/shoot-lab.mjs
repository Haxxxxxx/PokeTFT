/**
 * Spike harness: screenshots the R3F arena and exercises a drag, so the three
 * questions the spike exists to answer get real numbers instead of opinions.
 *
 * Usage: node tools/shoot-lab.mjs [url] [outDir]
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000/lab/arena3d";
const OUT = process.argv[3] ?? "/tmp/poketft-lab";

const main = async () => {
  // WebGL needs a GPU-ish context; headless Chromium uses SwiftShader, which is
  // slower than real hardware — so treat the fps figure as a FLOOR, not a score.
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await mkdir(OUT, { recursive: true });
  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Give the canvas time to compile shaders and settle its frame timer.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/01-arena.png` });
  console.log(`  📸 ${OUT}/01-arena.png`);

  // Drag: press on a unit, move across the board, release. Exercises pointer
  // capture + the ground-plane hit → cell mapping.
  const box = await page.locator("canvas").boundingBox();
  if (box) {
    // Screen position of the blue capsule in the default camera framing, and an
    // empty ally hex below it. Hard-coded because the point is to exercise the
    // pointer path, not to be clever about finding a mesh from outside WebGL.
    const from = { x: box.x + 495, y: box.y + 525 };
    const to = { x: box.x + 620, y: box.y + 700 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * i) / 14,
        from.y + ((to.y - from.y) * i) / 14,
      );
      await page.waitForTimeout(16);
    }
    await page.screenshot({ path: `${OUT}/02-dragging.png` });
    console.log(`  📸 ${OUT}/02-dragging.png`);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/03-dropped.png` });
    console.log(`  📸 ${OUT}/03-dropped.png`);
  }

  const stats = await page.locator("text=/fps/").first().textContent().catch(() => null);
  console.log(`\n  perf: ${stats ?? "n/a"}`);
  console.log(errors.length ? `\n⚠️  errors:\n   ${errors.slice(0, 8).join("\n   ")}` : "\n✅ no console errors");

  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
