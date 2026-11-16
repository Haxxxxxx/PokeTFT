/**
 * Does the augment picker — and its REROLL button — actually fit?
 *
 * Reported as "the reroll button isn't rendering properly" and never
 * reproduced, because an augment is only offered at stage 2 round 2: no
 * harness had ever played far enough to see one. This idles through the
 * opening rounds against a bot until the picker opens, then measures it at
 * several viewport sizes without picking (the overlay waits for a choice).
 *
 * The thing being checked is not "is it in the DOM" — it always was. It is
 * whether the button is inside the viewport and actually hittable, because
 * the failure mode is a full-height card stack pushing it below the fold of a
 * scroll container, where it reads as missing.
 *
 * Usage: node tools/probe-augment.mjs [url] [WxH,WxH]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const SIZES = (process.argv[3] ?? "852x393,1043x469,1280x800").split(",").map((s) => s.split("x").map(Number));

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const click = async (rx, t = 4000) => { const e = page.getByText(rx).first(); try { await e.waitFor({ state: "visible", timeout: t }); await e.click({ timeout: 2000 }); return true; } catch { return false; } };
const btn = async (rx, t = 4000) => { const e = page.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
const esc = async () => { for (let i = 0; i < 5; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(160); } };

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3600); await esc();
await click(/jouer en invit|play as guest|invit/i, 6000); await page.waitForTimeout(2600); await esc();
await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
for (let i = 0; i < 3; i++) { await page.waitForTimeout(1200); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2500))) break; }
await page.waitForTimeout(2600); await esc();
await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await page.waitForTimeout(700);
await btn(/lancer la partie|lancer|start/i, 8000); await page.waitForTimeout(7000);
const draft = page.locator('[class*="w-\\[150px\\]"]').first();
if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await page.waitForTimeout(1600); }
await esc();

// Idle through the opening rounds. The augment opens at stage 2 round 2.
console.log("\nidling to stage 2-2 (augment round)…");
let seen = "";
let found = false;
for (let i = 0; i < 160; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => {
    const t = document.body.innerText;
    const sr = t.match(/\b([1-9])\s*[-–]\s*([1-9])\b/);
    return {
      stage: sr ? `${sr[1]}-${sr[2]}` : "?",
      aug: /Augmentation\s*\d\/3|Augment\s*\d\/3|bonus permanent|permanent boost/i.test(t),
      over: /Partie terminée|Game over|Classement final/i.test(t),
    };
  });
  if (s.stage !== seen) { seen = s.stage; process.stdout.write(` ${s.stage}`); }
  if (s.aug) { found = true; console.log("\n  augment picker is up"); break; }
  if (s.over) { console.log("\n  game ended before an augment round"); break; }
}
if (!found) { console.log("\n✗ never reached an augment round"); await browser.close(); process.exit(1); }

for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    // Scope to the augment OVERLAY. The shop has a "Reroll" button too, and it
    // sits behind this overlay — matching it instead reports an unclickable
    // button that is unclickable exactly as intended.
    const overlay = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      return cs.position === "fixed" && /Augmentation\s*\d\/3|Augment\s*\d\/3/i.test(d.textContent || "");
    });
    if (!overlay) return { missing: true, why: "no augment overlay" };
    const all = [...overlay.querySelectorAll("button")];
    const rr = all.find((b) => /Relancer|Reroll/i.test(b.textContent || ""));
    if (!rr) return { missing: true, why: "no reroll inside the overlay" };
    rr.setAttribute("data-probe-reroll", "1");
    const r = rr.getBoundingClientRect();
    // The scroll container the cards and the button share.
    let sc = rr.parentElement, scroller = null;
    while (sc && sc !== document.body) {
      const cs = getComputedStyle(sc);
      if (/auto|scroll/.test(cs.overflowY)) { scroller = sc; break; }
      sc = sc.parentElement;
    }
    const sr = scroller ? scroller.getBoundingClientRect() : null;
    // Is the button's centre the element the user would actually hit?
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const hitEl = document.elementFromPoint(cx, cy);
    // Everything painted at that point, topmost first, with what would eat
    // the tap and why.
    const stack = (document.elementsFromPoint(cx, cy) || []).slice(0, 5).map((e) => {
      const cs = getComputedStyle(e);
      return `${String(e.className).slice(0, 30) || e.tagName}[pe:${cs.pointerEvents},z:${cs.zIndex}]`;
    });
    return {
      vw: innerWidth, vh: innerHeight,
      btn: { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) },
      inViewport: r.top >= -1 && r.bottom <= innerHeight + 1,
      hittable: !!hitEl && (hitEl === rr || rr.contains(hitEl)),
      hitBy: hitEl ? String(hitEl.className).slice(0, 36) || hitEl.tagName : null,
      stack,
      disabled: rr.disabled,
      btnPE: getComputedStyle(rr).pointerEvents,
      scrollable: !!scroller,
      clippedByScroller: sr ? Math.round(r.bottom - sr.bottom) : null,
      offer: all.map((b) => (b.textContent || "").trim().slice(0, 16)).join("|"),
      // Anatomy, so a fix can be sized rather than guessed.
      overlay: { h: Math.round(overlay.getBoundingClientRect().height), scrollH: overlay.scrollHeight, clientH: overlay.clientHeight, oy: getComputedStyle(overlay).overflowY },
      cards: all.filter((b) => b !== rr).map((b) => Math.round(b.getBoundingClientRect().height)),
      content: (() => {
        const inner = overlay.querySelector(".min-h-full") || overlay.firstElementChild;
        return inner ? Math.round(inner.getBoundingClientRect().height) : null;
      })(),
    };
  });
  if (m.missing) { ok(false, `${w}x${h} — reroll button exists (${m.why})`); continue; }
  console.log(`\n  ${w}x${h}: btn ${JSON.stringify(m.btn)} disabled=${m.disabled} pe=${m.btnPE}`);
  console.log(`      overlay ${JSON.stringify(m.overlay)} content=${m.content} cards=${JSON.stringify(m.cards)}`);
  ok(m.inViewport, `${w}x${h} — reroll button is inside the viewport`);
  ok(m.hittable, `${w}x${h} — reroll button is what you actually hit${m.hittable ? "" : ` (hit ${m.hitBy})`}`);
  // The decisive test: does pressing it change the offered augments?
  const offerNow = () => page.evaluate(() => {
    const ov = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).position === "fixed" && /Augmentation\s*\d\/3|Augment\s*\d\/3/i.test(d.textContent || ""));
    return ov ? [...ov.querySelectorAll("button")].map((b) => (b.textContent || "").trim().slice(0, 16)).join("|") : "";
  });
  const before = await offerNow();
  await page.locator('[data-probe-reroll="1"]').click({ timeout: 3000 })
    .catch((e) => console.log(`      click threw: ${String(e).split("\n")[0].slice(0, 90)}`));
  await page.waitForTimeout(1500);
  const after = await offerNow();
  ok(before !== after, `${w}x${h} — pressing reroll actually changes the offer`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/augment-${w}x${h}.png` });
}

await browser.close();
console.log(fail === 0 ? "\n✅ the augment picker and its reroll fit everywhere tested" : `\n❌ ${fail} failed`);
process.exit(fail ? 1 : 0);
