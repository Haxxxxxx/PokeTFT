/**
 * Can you move a unit with a FINGER? — with REAL touch input.
 *
 * The earlier probe built synthetic TouchEvents with `new Touch(...)`, which
 * WebKit does not implement (illegal constructor), so it never tested the
 * thing it was written for. Worse, synthetic events cannot reproduce the bug
 * they were aimed at: when a draggable does not set `touch-action: none`, it
 * is the BROWSER — not the page — that decides the gesture is a scroll and
 * fires touchcancel. Only real input through the browser's own pipeline shows
 * that, so this drives Chromium's Input.dispatchTouchEvent over CDP.
 *
 * The assertion is on STATE: the unit must end up on a different hex. A drag
 * that animates and snaps back looks like a drag and achieves nothing.
 *
 * Usage: node tools/probe-touch-real.mjs [url] [WxH]
 */

import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const [W, H] = (process.argv[3] ?? "852x393").split("x").map(Number);

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const note = (m) => console.log(`  · ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

const click = async (rx, t = 4000) => { const e = page.getByText(rx).first(); try { await e.waitFor({ state: "visible", timeout: t }); await e.click({ timeout: 2000 }); return true; } catch { return false; } };
const btn = async (rx, t = 4000) => { const e = page.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
const esc = async () => { for (let i = 0; i < 6; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(170); } };

/** A finger: touchStart, a hold past the 140ms activation delay, moves, end. */
async function fingerDrag(from, to, steps = 16) {
  const send = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    });
  await send("touchStart", from.x, from.y);
  await page.waitForTimeout(280);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(26);
  }
  await send("touchEnd", to.x, to.y);
  await page.waitForTimeout(800);
}

console.log(`→ ${URL} (Chromium, REAL touch, ${W}x${H})`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3600); await esc();
await click(/jouer en invit|play as guest|invit/i, 6000); await page.waitForTimeout(2600); await esc();
await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
for (let i = 0; i < 3; i++) { await page.waitForTimeout(1200); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2500))) break; }
await page.waitForTimeout(2600); await esc();
await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await page.waitForTimeout(700);
await btn(/lancer la partie|lancer|start/i, 8000); await page.waitForTimeout(8000);
const draft = page.locator('[class*="w-\\[150px\\]"]').first();
if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await page.waitForTimeout(1600); }
await esc(); await page.waitForTimeout(600);

// --- what does the thing you actually grab declare? ------------------------
console.log("\ntouch-action on the element you put your finger on:");
const ta = await page.evaluate(() => {
  const chip = document.querySelector(".arena-frame img, .bench-slab img");
  const chain = [];
  for (let e = chip; e && e !== document.documentElement; e = e.parentElement) {
    chain.push({ cls: String(e.className).slice(0, 34) || e.tagName, ta: getComputedStyle(e).touchAction });
    if (chain.length >= 6) break;
  }
  return { chain, body: getComputedStyle(document.body).touchAction };
});
note(`body: ${ta.body}`);
for (const c of ta.chain) note(`  ${c.ta.padEnd(12)} ${c.cls}`);
ok(ta.chain.some((c) => c.ta === "none"), "the unit, or an ancestor, sets touch-action:none");

// --- can a finger actually move it? ----------------------------------------
console.log("\na finger moves a unit on the board:");
const at = async () => page.evaluate(() => {
  const u = document.querySelector(".arena-frame img");
  if (!u) return null;
  const r = u.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
const before = await at();
if (!before) { ok(false, "found a unit on the board to drag"); }
else {
  note(`grabbing at ${before.x},${before.y}`);
  const target = { x: before.x + 60, y: before.y - 44 };
  await fingerDrag(before, target);
  const after = await at();
  note(`was ${JSON.stringify(before)} → now ${JSON.stringify(after)}`);
  const moved = after && (Math.abs(after.x - before.x) > 10 || Math.abs(after.y - before.y) > 10);
  ok(!!moved, "the unit ended up on a different hex");
}

await browser.close();
console.log(fail === 0 ? "\n✅ touch dragging works" : `\n❌ ${fail} failed — touch dragging is not reliable`);
process.exit(fail ? 1 : 0);
