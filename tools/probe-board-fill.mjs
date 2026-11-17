import { webkit } from "playwright";
const URL = process.argv[2];
const SIZES = (process.argv[3] ?? "1920x1080").split(",").map((s) => s.split("x").map(Number));
// No SHOT_DIR, no screenshots — writing to "undefined/" litters the repo.
const OUT = process.env.SHOT_DIR;
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const click = async (rx, t = 4000) => { const e = p.getByText(rx).first(); try { await e.waitFor({ state: "visible", timeout: t }); await e.click({ timeout: 2000 }); return true; } catch { return false; } };
const btn = async (rx, t = 4000) => { const e = p.getByRole("button", { name: rx }).first(); try { await e.waitFor({ state: "visible", timeout: t }); if (await e.isDisabled().catch(() => false)) return false; await e.click({ timeout: 2500 }); return true; } catch { return false; } };
const esc = async () => { for (let i = 0; i < 5; i++) { await p.keyboard.press("Escape").catch(() => {}); await p.waitForTimeout(150); } };

await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3400); await esc();
await click(/jouer en invit|play as guest|invit/i, 6000); await p.waitForTimeout(2600); await esc();
await btn(/^\s*(cr[ée]er|create)\b/i, 8000);
for (let i = 0; i < 3; i++) { await p.waitForTimeout(1200); if (!(await btn(/^\s*(continuer|continue|suivant)\b/i, 2500))) break; }
await p.waitForTimeout(2000);
if (OUT) await p.screenshot({ path: `${OUT}/web-prelobby-${SIZES[0][0]}x${SIZES[0][1]}.png` });
await esc();
await btn(/^\s*(facile|moyen|easy|medium)\s*$/i, 2500); await p.waitForTimeout(700);
await btn(/lancer la partie|lancer|start/i, 8000); await p.waitForTimeout(7000);
const draft = p.locator('[class*="w-\\[150px\\]"]').first();
if (await draft.isVisible().catch(() => false)) { await draft.click().catch(() => {}); await p.waitForTimeout(1600); }
await esc(); await p.waitForTimeout(800);

for (const [W, H] of SIZES) {
  await p.setViewportSize({ width: W, height: H });
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const fr = document.querySelector(".arena-frame");
    const grid = [...document.querySelectorAll("div")].find((c) => /flex-1 min-h-0 grid/.test(String(c.className)));
    return { vw: innerWidth, arena: R(fr), cols: grid ? getComputedStyle(grid).gridTemplateColumns : null };
  });
  console.log(`${W}x${H} planning  arena=${JSON.stringify(m.arena)}  cols=${m.cols}`);
  if (m.arena) console.log(`   arena uses ${Math.round(100 * m.arena.w / m.vw)}% of width; dead left ${m.arena.l}, right ${m.vw - m.arena.r}`);
  if (OUT) await p.screenshot({ path: `${OUT}/web-game-${W}x${H}.png` });
}
await b.close();
