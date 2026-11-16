/**
 * Mobile reality check.
 *
 * Reported from an actual iPhone: the render is wrong, fullscreen does
 * nothing, and the game generally does not behave. This reproduces what can be
 * reproduced in a headless browser — layout at phone sizes, overflow, whether
 * anything is pushed off screen — and reports measurements rather than
 * impressions, so the fixes can be aimed at something.
 *
 * What it CANNOT reproduce: Safari's own behaviour. Playwright drives
 * Chromium, and the two differ in exactly the places that matter here (the
 * collapsing URL bar, the Fullscreen API, safe-area insets). Those are called
 * out as unverifiable rather than passed over.
 *
 * Usage:
 *   node tools/probe-mobile.mjs [url] [outDir]
 */

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-mobile";

/** iPhone-class viewports, portrait and landscape. The game gates on
 *  orientation, so both have to be looked at. */
const CASES = [
  { name: "iphone14-portrait", viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: "iphone14-landscape", viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: "iphone-se-landscape", viewport: { width: 667, height: 375 }, dpr: 2 },
];

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}
function note(msg) { console.log(`  · ${msg}`); }

async function clickIfPresent(page, rx, timeout = 3500) {
  const el = page.getByText(rx).first();
  try { await el.waitFor({ state: "visible", timeout }); await el.click({ timeout: 2000 }); return true; }
  catch { return false; }
}

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const c of CASES) {
    const ctx = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: c.viewport,
      deviceScaleFactor: c.dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    console.log(`\n=== ${c.name} (${c.viewport.width}x${c.viewport.height}) ===`);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await clickIfPresent(page, /play as guest|jouer en invit|invit/i, 5000);
    await page.waitForTimeout(2200);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const vv = window.visualViewport;
      // Anything wider than the viewport means a horizontal scrollbar on a
      // phone, which is the classic "it looks broken" symptom.
      const overflowX = de.scrollWidth - de.clientWidth;
      const overflowY = de.scrollHeight - de.clientHeight;
      // Elements poking out past the right edge.
      const spill = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 2;
        })
        .slice(0, 6)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] || "?"} right=${Math.round(el.getBoundingClientRect().right)}`);
      return {
        innerW: window.innerWidth, innerH: window.innerHeight,
        vvW: vv ? Math.round(vv.width) : null, vvH: vv ? Math.round(vv.height) : null,
        overflowX, overflowY, spill,
        // Does the orientation gate have the screen?
        gate: !!document.querySelector(".z-overlay, [data-orientation-gate]")
          || /rotate|pivote|landscape|paysage/i.test(document.body.innerText.slice(0, 400)),
        fullscreenApi: typeof document.documentElement.requestFullscreen === "function",
        bodyText: document.body.innerText.slice(0, 90).replace(/\s+/g, " "),
      };
    });

    note(`window ${m.innerW}x${m.innerH} · visualViewport ${m.vvW}x${m.vvH}`);
    note(`first text: ${JSON.stringify(m.bodyText)}`);
    assert(m.overflowX <= 2, `no horizontal overflow (${m.overflowX}px)`);
    if (m.spill.length) note(`spilling right: ${m.spill.join(" | ")}`);
    assert(errors.length === 0, `no page errors (${errors.length}${errors[0] ? ": " + errors[0].slice(0, 90) : ""})`);
    if (m.gate) note("orientation gate is showing");

    // The layout engine sizes the board from window.innerHeight. On iOS Safari
    // that is the LAYOUT viewport, which stays tall while the URL bar is up —
    // so the board is built for more height than is actually visible. Chromium
    // keeps the two in step, which is precisely why this cannot be reproduced
    // here and has to be fixed by reading the right number.
    if (m.vvH !== null && m.innerH !== m.vvH) {
      note(`window.innerHeight and visualViewport.height DISAGREE here (${m.innerH} vs ${m.vvH}) — this is the iOS case`);
    } else {
      note("window.innerHeight === visualViewport.height in Chromium; on iOS Safari they diverge by the URL bar");
    }

    await page.screenshot({ path: `${OUT}/${c.name}.png`, fullPage: false });
    console.log(`  📸 ${c.name}.png`);
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0
    ? "\n✅ No layout overflow at phone sizes in Chromium"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
