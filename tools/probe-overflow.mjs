/**
 * Finds what is actually causing horizontal overflow at a phone width.
 *
 * "The render is broken on iPhone" is a symptom; this names the element. It
 * walks the tree for boxes that extend past the viewport and reports the
 * OUTERMOST ones, since an overflowing parent drags its children with it and a
 * flat list of every spilling node buries the cause in its own consequences.
 *
 * Usage:
 *   node tools/probe-overflow.mjs [url] [width] [height]
 */

import { chromium, devices } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3000";
const W = Number(process.argv[3] ?? 393);
const H = Number(process.argv[4] ?? 852);

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  // Past the auth gate, so the real screen is measured and not the sign-in.
  const guest = page.getByText(/play as guest|jouer en invit|invit/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click().catch(() => {}); }
  await page.waitForTimeout(2600);
  // The how-to-play modal covers the screen on a first run; dismiss it so the
  // page underneath is what gets measured.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(180);
  }
  const close = page.getByRole("button", { name: /close|fermer/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
  await page.waitForTimeout(700);

  const report = await page.evaluate((vw) => {
    const de = document.documentElement;
    const out = [];
    const walk = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const spills = r.right > vw + 1 || r.left < -1;
      if (spills) {
        // Outermost only: once a node spills, its children are consequences.
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className ?? "").slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48),
        });
        return;
      }
      for (const c of el.children) walk(c);
    };
    walk(document.body);
    return {
      scrollW: de.scrollWidth, clientW: de.clientWidth,
      overflow: de.scrollWidth - de.clientWidth,
      offenders: out.slice(0, 10),
    };
  }, W);

  console.log(`viewport ${W}x${H}`);
  console.log(`document scrollWidth ${report.scrollW} vs clientWidth ${report.clientW} → overflow ${report.overflow}px\n`);
  if (report.offenders.length === 0) console.log("no element extends past the viewport");
  for (const o of report.offenders) {
    console.log(`  ${o.tag}.${o.cls}`);
    console.log(`     x ${o.left}..${o.right} (w ${o.width})  "${o.text}"`);
  }
  await browser.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
