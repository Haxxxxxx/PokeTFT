/**
 * Audits every dialog the player can open, at a phone's height.
 *
 * One class of bug has now been found twice by hand: a full-screen overlay
 * built as `fixed inset-0 … justify-center` with no `overflow-y-auto`. When
 * its content is taller than the viewport, flex centring pushes the overflow
 * off BOTH ends and there is nothing to scroll — so whatever sits at the
 * bottom (a Quit button, a Next button, a form's submit) is simply
 * unreachable. It looks fine at desktop height and fails on a phone.
 *
 * Rather than keep finding these one report at a time, this opens each dialog
 * and measures whether its content fits, and whether it can scroll if it does
 * not. A dialog that overflows AND cannot scroll is a trap.
 *
 * Usage:
 *   node tools/audit-overlays.mjs [url] [width] [height]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3000";
const W = Number(process.argv[3] ?? 852);
const H = Number(process.argv[4] ?? 393);

let traps = 0;

const main = async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200);

  console.log(`auditing dialogs at ${W}x${H}\n`);

  /** Measure whatever full-screen overlay is currently open. */
  const probe = async (label) => {
    const m = await page.evaluate(() => {
      // The topmost fixed, full-bleed layer that actually has content.
      const layers = [...document.querySelectorAll("div")].filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed") return false;
        const r = el.getBoundingClientRect();
        return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2 && el.textContent.trim().length > 0;
      });
      if (!layers.length) return null;
      const el = layers[layers.length - 1];
      const cs = getComputedStyle(el);
      // Does its own content exceed it, and can it be scrolled if so?
      const scrollable = /auto|scroll/.test(cs.overflowY);
      let overflow = el.scrollHeight - el.clientHeight;
      // When centring is done by flex, the overflow does not even register on
      // scrollHeight — the children are simply pushed outside. Measure them.
      const kids = [...el.querySelectorAll("*")].filter((k) => {
        const r = k.getBoundingClientRect();
        return r.height > 8 && r.width > 8;
      });
      const above = Math.min(0, ...kids.map((k) => k.getBoundingClientRect().top));
      const below = Math.max(window.innerHeight, ...kids.map((k) => k.getBoundingClientRect().bottom)) - window.innerHeight;
      // Buttons that ended up outside the viewport are the actual harm.
      const lostButtons = [...el.querySelectorAll("button, a")].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.height > 0 && (r.bottom > window.innerHeight + 1 || r.top < -1);
      }).map((b) => (b.textContent || b.getAttribute("aria-label") || "?").trim().slice(0, 24));
      return {
        overflowY: cs.overflowY, scrollable,
        selfOverflow: overflow,
        pushedAbove: Math.round(-above), pushedBelow: Math.round(below),
        lostButtons,
        cls: String(el.className).slice(0, 60),
      };
    });
    if (!m) { console.log(`  ${label}: no full-screen layer found (did it open?)`); return; }
    const bad = m.lostButtons.length > 0 && !m.scrollable;
    if (bad) traps++;
    const mark = bad ? "✗ TRAP" : m.lostButtons.length ? "~ scrolls" : "✓";
    console.log(`  ${mark}  ${label}`);
    console.log(`        overflow-y:${m.overflowY} pushedAbove:${m.pushedAbove} pushedBelow:${m.pushedBelow}`);
    if (m.lostButtons.length) console.log(`        off-screen controls: ${m.lostButtons.join(" | ")}`);
  };

  const esc = async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); } };

  // --- the sign-in gate is already up on first load -------------------------
  await probe("SignInScreen (auth gate)");
  await esc();

  const click = async (rx) => {
    const e = page.getByText(rx).first();
    try { await e.waitFor({ state: "visible", timeout: 4000 }); await e.click({ timeout: 2000 }); await page.waitForTimeout(900); return true; }
    catch { return false; }
  };
  const btn = async (rx) => {
    const e = page.getByRole("button", { name: rx }).first();
    try { await e.waitFor({ state: "visible", timeout: 4000 }); await e.click({ timeout: 2500 }); await page.waitForTimeout(900); return true; }
    catch { return false; }
  };

  await click(/jouer en invit|play as guest|invit/i);
  await page.waitForTimeout(2600);

  // The how-to-play tour opens by itself on a first run.
  await probe("HowToPlay (first-run tour)");
  await esc();
  await page.waitForTimeout(500);

  for (const [label, rx] of [
    ["HowToPlay (from nav)", /comment jouer|how to play/i],
    ["Leaderboard", /classement|ranks/i],
    ["News", /actus|news/i],
    ["Profile", /profil|profile/i],
  ]) {
    if (await click(rx)) { await probe(label); await esc(); await page.waitForTimeout(400); }
    else console.log(`  –  ${label}: could not open`);
  }

  // Create flow → the rules panel.
  if (await btn(/^\s*(cr[ée]er|create)\b/i)) {
    await probe("Create / pre-lobby");
    await esc();
  }

  await browser.close();
  console.log(traps === 0
    ? "\n✅ No dialog traps content off screen without a way to scroll"
    : `\n❌ ${traps} dialog(s) push controls off screen with no scroll`);
  process.exit(traps === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
