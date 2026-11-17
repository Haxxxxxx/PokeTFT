/**
 * Walks every screen a player can reach and reports defects on each.
 *
 * Point checks keep finding one bug at a time because each probe only looks
 * where it was pointed. This looks at everything reachable without playing a
 * match, at whatever size it is given, and reports the same four things
 * everywhere:
 *
 *   · uncaught page errors and failed requests
 *   · the page overflowing sideways (a layout that does not fit, full stop)
 *   · controls outside the viewport with no way to scroll to them
 *   · controls on screen that something else would swallow the tap for
 *
 * Usage: node tools/probe-sweep.mjs [url] [WxH]
 */

import { webkit } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3100";
const [W, H] = (process.argv[3] ?? "1920x1080").split("x").map(Number);

let problems = 0;
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: H < 500, isMobile: H < 500, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const errs = [];
const net = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 120)}`); });
page.on("requestfailed", (r) => {
  const u = r.url();
  if (/analytics|gtag|doubleclick/.test(u)) return;
  net.push(`${r.failure()?.errorText ?? "failed"} ${u.slice(0, 90)}`);
});

const esc = async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(140); } };

const check = async (label) => {
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    // Visible AND actually presented: a closed drawer is usually still in the
    // DOM, faded out and parked off-screen by a transform on an ANCESTOR.
    // Opacity does not inherit into computed style, so checking only the
    // element itself reports every control in every closed panel as a broken
    // one — which is how this first ran, and why none of it was reported.
    const vis = (e) => {
      for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden" || s.display === "none") return false;
        if (Number(s.opacity) < 0.15) return false;
        if (s.pointerEvents === "none") return false;
        if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return false;
      }
      const r = e.getBoundingClientRect();
      if (!(r.width > 10 && r.height > 10)) return false;
      // Clipped out of a scrolling ancestor counts as not presented. These
      // are reachable by scrolling, and reporting them as broken controls is
      // how this probe first claimed six game modes were unreachable when
      // every one of them was a scroll away.
      for (let n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (!/auto|scroll|hidden/.test(s.overflowY + s.overflowX)) continue;
        const nr = n.getBoundingClientRect();
        if (r.bottom <= nr.top + 1 || r.top >= nr.bottom - 1 || r.right <= nr.left + 1 || r.left >= nr.right - 1) return false;
      }
      return true;
    };
    // Is a modal up? Then everything behind it is covered on purpose.
    const modalOpen = [...document.querySelectorAll("div")].some((d) => {
      const s = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return s.position === "fixed" && Number(s.zIndex) >= 40
        && r.width >= innerWidth - 2 && r.height >= innerHeight - 2
        && (d.textContent || "").trim().length > 0;
    });
    const controls = [...document.querySelectorAll("button, a, input, select, textarea, [role=button]")].filter(vis);
    const outside = controls.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
    }).map((e) => (e.textContent || e.getAttribute("aria-label") || "?").trim().slice(0, 20));
    const covered = modalOpen ? [] : controls.filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.bottom > innerHeight || r.top < 0 || r.right > innerWidth || r.left < 0) return false;
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return hit && !(hit === e || e.contains(hit) || hit.contains(e));
    }).map((e) => (e.textContent || e.getAttribute("aria-label") || "?").trim().slice(0, 20));
    const de = document.documentElement;
    // Every element, not just divs — the mode picker scrolls on a <main>, and
    // looking only at divs is what made it look like it did not scroll at all.
    const canScroll = de.scrollHeight > de.clientHeight + 1
      || [...document.querySelectorAll("*")].some((d) => {
        const s = getComputedStyle(d);
        return (/auto|scroll/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 1)
          || (/auto|scroll/.test(s.overflowX) && d.scrollWidth > d.clientWidth + 1);
      });
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      outside: [...new Set(outside)], covered: [...new Set(covered)],
      canScroll, controls: controls.length, modalOpen,
      blank: document.body.innerText.trim().length < 20,
    };
  });
  const bad = [];
  if (m.overflowX > 1) bad.push(`overflowX ${m.overflowX}px`);
  if (m.outside.length && !m.canScroll) bad.push(`unreachable: ${m.outside.join(", ")}`);
  if (m.covered.length) bad.push(`covered: ${m.covered.join(", ")}`);
  if (m.blank) bad.push("page is blank");
  if (errs.length) bad.push(`errors: ${errs.slice(0, 2).join(" | ")}`);
  if (net.length) bad.push(`net: ${net.slice(0, 2).join(" | ")}`);
  if (bad.length) { problems++; console.log(`  ✗ ${label}  (${m.controls} controls)`); for (const b of bad) console.log(`       ${b}`); }
  else console.log(`  ✓ ${label}  (${m.controls} controls)`);
  errs.length = 0; net.length = 0;
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/sweep-${label.replace(/\W+/g, "-")}-${W}x${H}.png` });
};

const go = async (path, label) => {
  await page.goto(`${URL}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log(`  ! ${label}: ${e.message.slice(0, 60)}`));
  await page.waitForTimeout(2600);
  await check(label);
};

console.log(`sweeping ${URL} at ${W}x${H}\n`);

// --- static routes ---------------------------------------------------------
await go("/home", "landing /home");
await go("/download", "download page");
await go("/privacy", "privacy page");

// --- the app ---------------------------------------------------------------
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3400);
await check("sign-in gate");
await esc();
const guest = page.getByText(/jouer en invit|play as guest|invit/i).first();
if (await guest.isVisible().catch(() => false)) { await guest.click().catch(() => {}); await page.waitForTimeout(2800); await esc(); }
await check("lobby (guest)");

/** Back to a signed-in lobby. Escape does not reliably close these dialogs,
 *  and a half-closed one made every later screen report "not reachable" — a
 *  sweep that silently stops sweeping. */
const freshLobby = async () => {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200); await esc();
  const g = page.getByText(/jouer en invit|play as guest|invit/i).first();
  if (await g.isVisible().catch(() => false)) { await g.click().catch(() => {}); await page.waitForTimeout(2600); await esc(); }
  await page.waitForTimeout(500);
  errs.length = 0; net.length = 0;
};

for (const [label, rx] of [
  ["leaderboard", /^Classement$/i],
  ["news", /^Actus$/i],
  ["how to play", /Comment jouer/i],
]) {
  await freshLobby();
  const el = page.getByText(rx).first();
  if (await el.isVisible().catch(() => false)) {
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ timeout: 3000 }).catch(() => {});
    await check(label);
  } else console.log(`  – ${label}: not reachable`);
}

await freshLobby();

// create → pre-lobby → in game
const btn = async (rx, t = 6000) => { const e = page.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
if (await btn(/^\s*(cr[ée]er|create)\b/i, 8000)) {
  await page.waitForTimeout(1600);
  await check("pre-lobby");
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(1100); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2200))) break; }
  await page.waitForTimeout(2000);
  await check("lobby (hosting)");
  await esc();
  await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500);
  await page.waitForTimeout(600);
  if (await btn(/lancer la partie|lancer|start/i, 8000)) {
    await page.waitForTimeout(7000);
    await check("in game (draft)");
    const draft = page.locator('[class*="w-\\[150px\\]"]').first();
    if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await page.waitForTimeout(1800); }
    await esc();
    await check("in game (planning)");
  }
}

await browser.close();
console.log(problems === 0 ? `\n✅ no defects found at ${W}x${H}` : `\n❌ ${problems} screen(s) with defects at ${W}x${H}`);
process.exit(problems ? 1 : 0);
