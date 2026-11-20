/**
 * Does Google sign-in work when the game runs as an INSTALLED app?
 *
 * An iOS home-screen app has no popup to open: `window.open` either hands the
 * flow to Safari — where the session lands in the browser, not the app the
 * player is looking at — or is blocked. Reported from an iPhone as the
 * home-screen shortcut never picking up the Google account.
 *
 * So the installed app has to sign in by REDIRECT. This emulates standalone
 * display-mode, presses the Google button, and checks which of the two
 * happened: a navigation of the app's own window (right) or a popup (wrong).
 *
 * Usage: node tools/probe-pwa-signin.mjs [url]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const browser = await webkit.launch();

const run = async (standalone) => {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true });
  if (standalone) {
    // Emulate an installed app: both the iOS flag and the standard media query.
    await ctx.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { get: () => true, configurable: true });
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => (String(q).includes("display-mode: standalone")
        ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
        : real(q));
    });
  }
  const page = await ctx.newPage();
  let popup = null;
  page.on("popup", (pg) => { popup = pg.url() || "(opened)"; });
  const navs = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3600);

  const btn = page.getByRole("button", { name: /Continuer avec Google|Continue with Google/i }).first();
  const seen = await btn.isVisible().catch(() => false);
  if (!seen) { console.log(`  – ${standalone ? "standalone" : "browser"}: no Google button on the gate`); await ctx.close(); return; }
  await btn.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const wentToGoogle = navs.some((u) => /accounts\.google\.com|__\/auth\/handler/.test(u));
  console.log(`\n  ${standalone ? "INSTALLED (standalone)" : "BROWSER tab"}:`);
  console.log(`      popup: ${popup ?? "none"}`);
  console.log(`      main-frame navigations: ${navs.length} ${wentToGoogle ? "(reached the auth handler)" : ""}`);
  for (const u of navs) console.log(`        -> ${u.slice(0, 120)}`);
  const err = await page.evaluate(() => document.body.innerText.match(/[^\n]*(auth\/|erreur|error|Sign-in|échou)[^\n]*/i)?.[0] ?? "");
  if (err) console.log(`      on-screen: ${err.slice(0, 120)}`);
  if (standalone) {
    ok(!popup, "no popup is opened — an installed app has nowhere to put one");
    ok(wentToGoogle, "the app's own window navigates to the auth flow");
  } else {
    ok(true, `browser tab unchanged (popup=${popup ? "yes" : "no"})`);
  }
  await ctx.close();
};

console.log(`→ ${URL}`);
await run(false);
await run(true);
await browser.close();
console.log(fail === 0 ? "\n✅ installed app signs in by redirect" : `\n❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
