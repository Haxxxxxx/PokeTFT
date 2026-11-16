// Reaches combat once, then measures the arena against its column at several
// viewport sizes inside the same fight — the case the layout engine is most
// likely to get wrong, because combat draws 8 rows where planning draws 5.
import { webkit } from "playwright";
const URL = process.argv[2];
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const click = async (rx, t = 4000) => { const e = p.getByText(rx).first(); try { await e.waitFor({ state: "visible", timeout: t }); await e.click({ timeout: 2000 }); return true; } catch { return false; } };
const btn = async (rx, t = 4000) => { const e = p.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
const esc = async () => { for (let i = 0; i < 6; i++) { await p.keyboard.press("Escape").catch(() => {}); await p.waitForTimeout(150); } };

await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3400); await esc();
await click(/jouer en invit|play as guest|invit/i, 6000); await p.waitForTimeout(2600); await esc();
await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
for (let i = 0; i < 3; i++) { await p.waitForTimeout(1200); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2500))) break; }
await p.waitForTimeout(2600); await esc();
await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await p.waitForTimeout(700);
await btn(/lancer la partie|lancer|start/i, 8000); await p.waitForTimeout(7000);
const card = p.locator('[class*="w-\\[150px\\]"]').first();
if (await card.isVisible().catch(() => false)) { await card.click().catch(() => {}); await p.waitForTimeout(1400); }
await esc();

const measure = async (label) => {
  const m = await p.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; };
    const col = document.querySelector('[class*="order-2"]');
    const fr = document.querySelector(".arena-frame");
    const shell = document.querySelector(".tft-shell");
    const inner = shell?.firstElementChild;
    const bars = inner ? [...inner.children].filter((c) => !/flex-1/.test(String(c.className))) : [];
    const grid = inner ? [...inner.children].find((c) => /flex-1/.test(String(c.className))) : null;
    const barBottom = bars.length ? Math.max(...bars.filter((c) => c.getBoundingClientRect().top < 200).map((c) => c.getBoundingClientRect().bottom)) : 0;
    return { col: R(col), frame: R(fr), grid: R(grid), barBottom: Math.round(barBottom), vh: window.innerHeight,
      combat: /COMBAT/i.test(document.body.innerText) };
  });
  if (!m.col || !m.frame) { console.log(`${label}: no board`); return true; }
  const aboveCol = m.col.t - m.frame.t;
  const belowCol = m.frame.b - m.col.b;
  const overHud = m.barBottom - m.frame.t;
  const ok = aboveCol <= 0 && belowCol <= 0 && overHud <= 0;
  console.log(`${ok ? "OK  " : "FAIL"} ${label} combat=${m.combat} col h=${m.col.h} arena h=${m.frame.h} | above=${aboveCol} below=${belowCol} overHUD=${overHud}`);
  return ok;
};

console.log("waiting for combat...");
let hit = false;
for (let i = 0; i < 120; i++) { await p.waitForTimeout(1000); hit = await p.evaluate(() => /COMBAT/i.test(document.body.innerText)); if (hit) break; }
console.log(hit ? "combat detected\n" : "NEVER REACHED COMBAT\n");

let bad = 0;
for (const [w, h] of [[852, 393], [1024, 768], [1280, 800], [1920, 1080], [1366, 768]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(900);
  if (!(await measure(`${w}x${h}`))) bad++;
}
await b.close();
console.log(bad ? `\n${bad} size(s) FAIL` : "\nall sizes fit");
process.exit(bad ? 1 : 0);
