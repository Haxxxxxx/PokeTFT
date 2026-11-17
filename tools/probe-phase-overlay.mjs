/**
 * Measures a full-screen PHASE overlay — the carousel, or the final
 * standings — at several viewport sizes.
 *
 * Both are reached only by playing: the carousel is the mid-stage event at
 * round 4, and the standings need the field down to one survivor. Neither had
 * ever been measured, because no harness played far enough to see them.
 *
 * What it checks is the failure this codebase keeps producing: an overlay
 * built as `fixed inset-0 … justify-center` whose content is taller than the
 * viewport. Flex centring pushes the overflow off BOTH ends, so whatever sits
 * at the bottom — a Quit button, a pick, a Continue — is unreachable unless
 * the container scrolls. Measured, not eyeballed:
 *   · does any interactive control sit outside the viewport?
 *   · if the content overflows, can it actually be scrolled?
 *   · is each control the thing you would really hit at its own centre?
 *
 * Usage:
 *   node tools/probe-phase-overlay.mjs <url> carousel|over [WxH,WxH]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const WHAT = (process.argv[3] ?? "carousel").toLowerCase();
const SIZES = (process.argv[4] ?? "852x393,1043x469,1280x800").split(",").map((s) => s.split("x").map(Number));

const MARK = WHAT === "over"
  ? /Classement final|Final Standings/i
  : /Carrousel|Carousel/i;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const click = async (rx, t = 4000) => { const e = page.getByText(rx).first(); try { await e.waitFor({ state: "visible", timeout: t }); await e.click({ timeout: 2000 }); return true; } catch { return false; } };
const btn = async (rx, t = 4000) => { const e = page.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
const esc = async () => { for (let i = 0; i < 5; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(160); } };

console.log(`→ ${URL}  looking for: ${WHAT}`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3600); await esc();
await click(/jouer en invit|play as guest|invit/i, 6000); await page.waitForTimeout(2600); await esc();
await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
for (let i = 0; i < 3; i++) { await page.waitForTimeout(1200); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2500))) break; }
await page.waitForTimeout(2600); await esc();
// Reaching the final standings means the field has to get down to one. An
// easy bot never kills an idle board — a 23-minute run sat at full HP into
// stage 4 — so that case picks a fight it will lose.
const DIFF = WHAT === "over" ? /^\s*(difficile|hard)\s*$/i : /^\s*(facile|moyen|easy|medium)\s*$/i;
if (!(await btn(DIFF, 2500))) await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2000);
await page.waitForTimeout(700);
await btn(/lancer la partie|lancer|start/i, 8000); await page.waitForTimeout(7000);
// Reaching the final standings needs the field down to one survivor, and a
// drafted mon wins enough PvE rounds to keep the player alive indefinitely —
// a 25-minute run bled 7hp. An empty board loses every round at full damage,
// which is the only way a harness gets to see this screen in finite time.
if (WHAT !== "over") {
  const draft = page.locator('[class*="w-\\[150px\\]"]').first();
  if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await page.waitForTimeout(1600); }
}
await esc();

// Idle until the overlay we want is on screen. Never picks anything: both of
// these wait for the player, which is what lets them be measured at leisure.
console.log(`\nidling until ${WHAT} …`);
let seen = "", found = false;
const LIMIT = WHAT === "over" ? 460 : 90; // ~23min vs ~4.5min
for (let i = 0; i < LIMIT; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate((markSrc) => {
    const t = document.body.innerText;
    const sr = t.match(/\b([1-9])\s*[-–]\s*([1-9])\b/);
    const hp = t.match(/PV\s*\n?\s*(\d{1,3})/i);
    return { stage: sr ? `${sr[1]}-${sr[2]}` : "?", hp: hp ? hp[1] : "?", hit: new RegExp(markSrc, "i").test(t) };
  }, MARK.source);
  const tag = `${s.stage}:${s.hp}hp`;
  if (tag !== seen) { seen = tag; process.stdout.write(` ${tag}`); }
  if (s.hit) { found = true; console.log(`\n  ${WHAT} is up at ${seen}`); break; }
}
if (!found) { console.log(`\n✗ never reached ${WHAT}`); await browser.close(); process.exit(1); }

for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1100);
  const m = await page.evaluate((markSrc) => {
    const re = new RegExp(markSrc, "i");
    const layer = [...document.querySelectorAll("div")].filter((d) => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.position === "fixed" && r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && re.test(d.textContent || "");
    }).pop();
    if (!layer) return { missing: true };
    const cs = getComputedStyle(layer);
    const controls = [...layer.querySelectorAll("button, a, input")].filter((b) => {
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      return r.width > 8 && r.height > 8 && s.visibility !== "hidden" && s.display !== "none";
    });
    const outside = controls.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
    }).map((b) => (b.textContent || b.getAttribute("aria-label") || "?").trim().slice(0, 22));
    // Of the ones on screen, is each actually the element you would hit?
    const blocked = controls.filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight || r.top < 0) return false;
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return !el || !(el === b || b.contains(el) || el.contains(b));
    }).map((b) => (b.textContent || "?").trim().slice(0, 22));
    // Does the overlay's own heading land on the HUD showing through behind
    // it? The backdrop is translucent, so this is a legibility question, not
    // a hit-test one — two sets of words in the same pixels.
    const head = layer.querySelector("h2") || layer.querySelector("h1");
    const shell = document.querySelector(".tft-shell");
    const inner = shell?.firstElementChild;
    const bars = inner ? [...inner.children].filter((c) => !/flex-1/.test(String(c.className))).slice(0, 2) : [];
    // Only a translucent backdrop can clash: if the overlay paints over the
    // HUD, the rectangles may still intersect but there is nothing to read
    // through. Gradient => translucent; flat colour => judge by its alpha.
    const bg = cs.backgroundColor || "";
    const alpha = Number((bg.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/) || [])[1] ?? "1");
    const seeThrough = cs.backgroundImage !== "none" || alpha < 0.95;
    let clash = null;
    if (head && bars.length && seeThrough) {
      const hr = head.getBoundingClientRect();
      for (const b of bars) {
        const br = b.getBoundingClientRect();
        const ox = Math.min(hr.right, br.right) - Math.max(hr.left, br.left);
        const oy = Math.min(hr.bottom, br.bottom) - Math.max(hr.top, br.top);
        if (ox > 2 && oy > 2) clash = { ox: Math.round(ox), oy: Math.round(oy), text: (head.textContent || "").trim().slice(0, 24) };
      }
    }
    return {
      overflowY: cs.overflowY,
      scrollable: /auto|scroll/.test(cs.overflowY),
      overflowPx: layer.scrollHeight - layer.clientHeight,
      controls: controls.length, outside, blocked, clash,
      vw: innerWidth, vh: innerHeight,
    };
  }, MARK.source);
  if (m.missing) { ok(false, `${w}x${h} — overlay present`); continue; }
  console.log(`\n  ${w}x${h}: controls=${m.controls} overflow-y:${m.overflowY} overflowPx=${m.overflowPx}`);
  ok(m.outside.length === 0 || m.scrollable,
    `${w}x${h} — nothing stranded off screen without a scroll${m.outside.length ? ` (off: ${m.outside.join(", ")})` : ""}`);
  ok(m.outside.length === 0, `${w}x${h} — every control is on screen${m.outside.length ? ` (off: ${m.outside.join(", ")})` : ""}`);
  ok(m.blocked.length === 0, `${w}x${h} — no on-screen control is covered${m.blocked.length ? ` (${m.blocked.join(", ")})` : ""}`);
  ok(!m.clash, `${w}x${h} — the heading is not printed over the HUD${m.clash ? ` ("${m.clash.text}" overlaps a top bar by ${m.clash.ox}x${m.clash.oy}px)` : ""}`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${WHAT}-${w}x${h}.png` });
}

if (errs.length) console.log(`\n  page errors: ${errs.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail === 0 ? `\n✅ ${WHAT} overlay fits everywhere tested` : `\n❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
