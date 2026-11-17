/**
 * What does the game show on a phone that it does not show on the web, and
 * the other way round?
 *
 * A lot of this UI is gated on density — `compact` means phone — so a fix
 * aimed at a phone can simply never appear on a desktop, and a desktop can
 * keep a defect that was fixed once on mobile and assumed fixed everywhere.
 * This reaches the same point in the same kind of match at two sizes and
 * diffs what is actually on screen: named controls, labelled panels, and the
 * handful of flags that change how the board itself renders.
 *
 * Usage: node tools/probe-parity.mjs [url] [mobileWxH] [desktopWxH]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const A = (process.argv[3] ?? "852x393").split("x").map(Number);
const B = (process.argv[4] ?? "1920x1080").split("x").map(Number);

const browser = await webkit.launch();

const inventory = async (W, H, label) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: H < 500, isMobile: H < 500, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const esc = async () => { for (let i = 0; i < 5; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(150); } };
  const btn = async (rx, t = 6000) => { const e = page.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3400); await esc();
  const g = page.getByText(/jouer en invit|play as guest|invit/i).first();
  if (await g.isVisible().catch(() => false)) { await g.click().catch(() => {}); await page.waitForTimeout(2600); await esc(); }
  await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(1100); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2200))) break; }
  await page.waitForTimeout(1800); await esc();
  await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await page.waitForTimeout(600);
  await btn(/lancer la partie|lancer|start/i, 8000); await page.waitForTimeout(7000);
  const draft = page.locator('[class*="w-\\[150px\\]"]').first();
  if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await page.waitForTimeout(1700); }
  await esc(); await page.waitForTimeout(900);

  const inv = await page.evaluate(() => {
    const onScreen = (e) => {
      const r = e.getBoundingClientRect();
      if (!(r.width > 6 && r.height > 6)) return false;
      if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) return false;
      for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.15) return false;
      }
      return true;
    };
    const label = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 26);
    const controls = [...document.querySelectorAll("button, [role=button]")].filter(onScreen).map(label).filter(Boolean);
    // Named regions/panels the game draws.
    const panels = [...document.querySelectorAll("[data-panel]")].filter(onScreen).map((e) => e.getAttribute("data-panel"));
    // Visual systems that are easy to ship on one size only.
    const feats = {
      arenaFrame: !!document.querySelector(".arena-frame"),
      arenaThemed: !!document.querySelector(".arena-themed"),
      arenaPlane: !!document.querySelector(".arena-plane"),
      canvas3d: !!document.querySelector("canvas"),
      benchSlabs: document.querySelectorAll(".bench-slab").length,
      interestPips: !!document.querySelector('[class*="interest"], [data-interest]'),
      shopCards: document.querySelectorAll(".shop-card").length,
      hexCells: document.querySelectorAll(".hex-cell").length,
    };
    return { controls: [...new Set(controls)].sort(), panels: [...new Set(panels)].sort(), feats, vw: innerWidth, vh: innerHeight };
  });
  await ctx.close();
  console.log(`\n── ${label} ${W}x${H} ──`);
  console.log(`  panels: ${inv.panels.join(", ") || "(none)"}`);
  console.log(`  feats:  ${JSON.stringify(inv.feats)}`);
  return inv;
};

const a = await inventory(A[0], A[1], "MOBILE");
const b = await inventory(B[0], B[1], "DESKTOP");
await browser.close();

const onlyA = a.controls.filter((x) => !b.controls.includes(x));
const onlyB = b.controls.filter((x) => !a.controls.includes(x));
const pA = a.panels.filter((x) => !b.panels.includes(x));
const pB = b.panels.filter((x) => !a.panels.includes(x));

console.log(`\n══ parity ══`);
console.log(`\ncontrols only on MOBILE (${onlyA.length}):`);
for (const x of onlyA) console.log(`   · ${x}`);
console.log(`\ncontrols only on DESKTOP (${onlyB.length}):`);
for (const x of onlyB) console.log(`   · ${x}`);
if (pA.length || pB.length) console.log(`\npanels only mobile: ${pA.join(", ") || "-"}   only desktop: ${pB.join(", ") || "-"}`);
const fdiff = Object.keys(a.feats).filter((k) => JSON.stringify(a.feats[k]) !== JSON.stringify(b.feats[k]));
console.log(`\nrender features that differ:`);
for (const k of fdiff) console.log(`   · ${k}: mobile=${JSON.stringify(a.feats[k])}  desktop=${JSON.stringify(b.feats[k])}`);
if (!fdiff.length) console.log("   (none)");
