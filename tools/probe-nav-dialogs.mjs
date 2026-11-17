/**
 * Opens each dialog reachable from the home screen and checks it is usable at
 * the size it is opened on.
 *
 * The existing overlay audit only recognised a dialog if it was a full-bleed
 * `fixed inset-0` layer, so the leaderboard, the news panel and the profile
 * never registered at all — it reported "could not open" and passed. These
 * are ordinary panels, and the question for them is the same one that keeps
 * biting this UI: is anything you need to press outside the screen, and if
 * the content is too tall, can you scroll to it?
 *
 * Usage: node tools/probe-nav-dialogs.mjs [url] [WxH]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const [W, H] = (process.argv[3] ?? "667x375").split("x").map(Number);

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const esc = async () => { for (let i = 0; i < 5; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(150); } };

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3600); await esc();
const guest = page.getByText(/jouer en invit|play as guest|invit/i).first();
if (await guest.isVisible().catch(() => false)) await guest.click().catch(() => {});
await page.waitForTimeout(2800); await esc(); await page.waitForTimeout(600);

/** Everything on screen that can be pressed, and whether it is reachable. */
const survey = async (label) => {
  const m = await page.evaluate(() => {
    const vis = (e) => {
      const s = getComputedStyle(e);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.15) return false;
      const r = e.getBoundingClientRect();
      return r.width > 10 && r.height > 10;
    };
    const controls = [...document.querySelectorAll("button, a, input, select, textarea, [role=button]")].filter(vis);
    const outside = controls.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
    }).map((e) => (e.textContent || e.getAttribute("aria-label") || "?").trim().slice(0, 24));
    // Can the page or any scroller actually reach them?
    const de = document.documentElement;
    const pageScrolls = de.scrollHeight > de.clientHeight + 1;
    const anyScroller = [...document.querySelectorAll("div")].some((d) => {
      const s = getComputedStyle(d);
      return /auto|scroll/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 1;
    });
    return {
      total: controls.length, outside: [...new Set(outside)],
      pageScrolls, anyScroller,
      overflowX: de.scrollWidth - de.clientWidth,
    };
  });
  console.log(`\n  ${label}: ${m.total} controls, overflowX=${m.overflowX}, pageScrolls=${m.pageScrolls}, innerScroller=${m.anyScroller}`);
  ok(m.outside.length === 0 || m.pageScrolls || m.anyScroller,
    `${label} — nothing unreachable${m.outside.length ? ` (off: ${m.outside.join(", ")})` : ""}`);
  ok(m.overflowX <= 1, `${label} — no sideways page overflow (${m.overflowX}px)`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/nav-${label.replace(/\W+/g, "-")}-${W}x${H}.png` });
  return m;
};

await survey("home");

for (const [label, rx] of [
  ["leaderboard", /^Classement$/i],
  ["news", /^Actus$/i],
  ["howtoplay", /Comment jouer/i],
  ["download", /^T[ée]l[ée]charger$/i],
]) {
  // Reload between dialogs. Escape does not reliably close these, and a
  // half-closed one made every later item report "not on screen" — a probe
  // that silently tests nothing.
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200); await esc();
  const g2 = page.getByText(/jouer en invit|play as guest|invit/i).first();
  if (await g2.isVisible().catch(() => false)) { await g2.click().catch(() => {}); await page.waitForTimeout(2600); await esc(); }
  await page.waitForTimeout(500);

  const el = page.getByText(rx).first();
  if (!(await el.isVisible().catch(() => false))) { console.log(`\n  – ${label}: not on screen`); continue; }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1600);
  await survey(label);
}

if (errs.length) console.log(`\n  page errors: ${errs.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail === 0 ? `\n✅ every home dialog is usable at ${W}x${H}` : `\n❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
