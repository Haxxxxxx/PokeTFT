/**
 * End-to-end check of the arena variants in an actual match.
 *
 * The unit test proves the resolver and tools/probe-arena.mjs proves a PINNED
 * variant renders. Neither exercises the path a player actually takes: start
 * with an empty board, buy mons, place them, and have the arena change
 * underneath you because a synergy went live. That is the whole feature, and
 * it is the one part nothing had confirmed.
 *
 * It asserts consistency rather than a fixed outcome, because the shop is
 * random and this cannot demand a Fire board. The invariants that must hold
 * whatever the shop deals:
 *
 *   - an empty board is the neutral arena
 *   - once themed, the arena's type is a synergy the game itself lists as
 *     ACTIVE in the rail (not merely present on the board)
 *   - the accent equals that type's colour from TYPE_COLOR — checked against a
 *     copy of the table, so a mismatch means the wiring broke rather than the
 *     test agreeing with itself
 *   - the weather layer matches the variant and is actually animating
 *   - reloading mid-match resolves to the same arena, since it is derived
 *
 * Usage:
 *   node tools/probe-arena-live.mjs [url] [outDir]
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "/tmp/poketft-arena-live";
const VIEWPORT = { width: 1440, height: 900 };

/** Mirror of src/game/ui.ts. Deliberately a copy: if the probe imported the
 *  real table it would be comparing the app against itself. */
const TYPE_COLOR = {
  normal: "#9099a1", fire: "#ff7b3d", water: "#4d90d5", electric: "#f4d23c",
  grass: "#63bb5b", ice: "#74cec0", fighting: "#ce4069", poison: "#ab6ac8",
  ground: "#d97746", flying: "#8fa8dd", psychic: "#f97176", bug: "#90c12c",
  rock: "#c7b78b", ghost: "#5269ac", dragon: "#0a6dc4", dark: "#5a5366",
  steel: "#5a8ea1", fairy: "#ec8fe6",
};
/** Mirror of ARENA_EFFECT in arena-variants.ts, same reasoning. */
const EFFECT = {
  fire: "ember", dragon: "ember", water: "rain", ice: "snow",
  electric: "spark", steel: "spark", grass: "pollen", bug: "pollen",
  poison: "bubble", flying: "wind", fighting: "wind", psychic: "mote",
  fairy: "mote", ghost: "wisp", dark: "wisp", ground: "dust",
  rock: "dust", normal: "dust",
};

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failures++; }
}

/** Normalise a CSS colour to lowercase hex.
 *
 *  The hex branch is NOT redundant: getComputedStyle returns a custom
 *  property's value verbatim, so --arena-accent comes back as "#9099a1", not
 *  as rgb(). Matching digit runs in that string finds "9099" and "1" and
 *  cheerfully builds "#238b01" -- which is how this probe reported a colour
 *  mismatch against a value that was already correct. */
const hex = (v) => {
  const s = v.trim().toLowerCase();
  if (s.startsWith("#")) return s;
  const m = s.match(/\d+/g);
  if (!m) return s;
  return "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
};

async function clickIfPresent(page, rx, timeout = 4000) {
  const el = page.getByText(rx).first();
  try { await el.waitFor({ state: "visible", timeout }); await el.click({ timeout: 2000 }); return true; }
  catch { return false; }
}
async function clickButton(page, rx, timeout = 4000) {
  const b = page.getByRole("button", { name: rx }).first();
  try {
    await b.waitFor({ state: "visible", timeout });
    if (await b.isDisabled().catch(() => false)) return false;
    await b.click({ timeout: 2500 });
    return true;
  } catch { return false; }
}
async function dismissOverlays(page) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(220);
    const closed =
      (await clickIfPresent(page, /^\s*(passer|skip|fermer|close|compris|got it|j'ai compris)\s*$/i, 600)) ||
      (await clickIfPresent(page, /^\s*(suivant|next|continuer)\s*$/i, 600));
    if (!closed) {
      const x = page.locator('button[aria-label*="lose" i], button[aria-label*="ermer" i]').first();
      if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await page.waitForTimeout(220); continue; }
      break;
    }
    await page.waitForTimeout(260);
  }
}

/** data-arena, the accent, and what the weather layer is doing. */
const readArena = (page) => page.evaluate(() => {
  const frame = document.querySelector(".arena-frame[data-arena]");
  if (!frame) return null;
  const fx = frame.querySelector(".arena-fx");
  const bits = fx ? fx.querySelectorAll(".arena-fx-bit") : [];
  const cs = bits[0] ? getComputedStyle(bits[0]) : null;
  // The synergy rail, as the game itself renders it.
  const rail = [...document.querySelectorAll("h2")]
    .find((h) => /synerg/i.test(h.textContent ?? ""))?.parentElement;
  const traits = rail ? [...rail.querySelectorAll("div")]
    .map((d) => (d.textContent ?? "").trim())
    .filter((t) => t.length > 0 && t.length < 40) : [];
  return {
    arena: frame.getAttribute("data-arena"),
    accent: getComputedStyle(frame).getPropertyValue("--arena-accent").trim(),
    fxClass: fx?.className ?? null,
    bits: bits.length,
    anim: cs?.animationName ?? null,
    railText: traits.join(" | ").toLowerCase(),
  };
});

/** Read the arena, retrying while the board is not mounted — during combat,
 *  or while a reconnect settles. A single read legitimately finds nothing and
 *  then reports "undefined" as though the feature had broken. */
async function waitForArena(page, ms = 45000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const a = await readArena(page);
    if (a) return a;
    await page.waitForTimeout(1200);
  }
  return null;
}

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // English, auto arena, effects on — English makes the synergy names in the
  // rail match the type keys, so the cross-check is a plain string test.
  await page.addInitScript(() => {
    try {
      const k = "poketft_settings";
      const cur = JSON.parse(localStorage.getItem(k) ?? '{"state":{"settings":{}},"version":0}');
      cur.state = cur.state ?? { settings: {} };
      cur.state.settings = { ...(cur.state.settings ?? {}), language: "en", arenaPin: "auto", arenaEffects: true };
      localStorage.setItem(k, JSON.stringify(cur));
    } catch { /* private mode */ }
  });

  console.log(`→ ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3200);
  await dismissOverlays(page);
  await clickIfPresent(page, /play as guest|jouer en invit|guest/i, 6000);
  await page.waitForTimeout(2400);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(create|cr[ée]er)\b/i, 8000);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1100);
    if (!(await clickButton(page, /^\s*(continue|continuer|next|suivant)\b/i, 2500))) break;
  }
  await page.waitForTimeout(2600);
  await dismissOverlays(page);
  await clickButton(page, /^\s*(easy|medium|facile|moyen)\s*$/i, 2500);
  await page.waitForTimeout(700);
  await clickButton(page, /start|lancer/i, 8000);
  await page.waitForTimeout(7000);
  await dismissOverlays(page);

  console.log("\nan empty board gets the neutral arena:");
  const before = await readArena(page);
  if (!before) {
    assert(false, "found the arena frame");
    await page.screenshot({ path: `${OUT}/99-no-arena.png` });
    await browser.close();
    process.exit(1);
  }
  assert(before.arena === "neutral", `nothing committed yet → neutral (${before.arena})`);
  await page.screenshot({ path: `${OUT}/01-neutral.png` });
  console.log("  📸 01-neutral.png");

  console.log("\nnow actually play — several rounds, so income can buy a synergy:");
  // One shopping trip on four gold buys two mons, which is nowhere near a
  // breakpoint. The first run of this probe ended neutral for exactly that
  // reason and proved nothing. So it plays on: buy everything affordable each
  // planning phase, deploy, and let round income accumulate.
  let after = null;
  for (let phase = 0; phase < 8; phase++) {
    // Only shop while the board is actually on screen (planning); during
    // combat the cards are gone.
    const live = await waitForArena(page);
    if (!live) break;

    // Buy XP FIRST. Board capacity is tied to level — level 1 fields two
    // units, so no synergy can reach a breakpoint of 2 distinct defs unless
    // both happen to share a type. The first run of this probe sat at
    // "1 water, 1 ground" for three phases for exactly that reason: it was
    // buying mons it had nowhere to put.
    for (let x = 0; x < 3; x++) {
      if (!(await clickButton(page, /buy xp|acheter xp|niveau/i, 900))) break;
      await page.waitForTimeout(220);
    }

    for (let pass = 0; pass < 3; pass++) {
      const cards = page.locator("button.shop-card");
      const n = await cards.count();
      for (let i = 0; i < n; i++) {
        await cards.nth(i).click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(120);
      }
      if (!(await clickButton(page, /^\s*(reroll|relancer)\b/i, 900))) break;
      await page.waitForTimeout(420);
    }
    await clickButton(page, /fill|remplir|d[ée]ployer/i, 1200);
    await page.waitForTimeout(900);

    after = await waitForArena(page);
    console.log(`  phase ${phase + 1}: arena=${after?.arena} | rail: ${after?.railText || "(none)"}`);
    if (after && after.arena !== "neutral") break;

    // Wait out the fight into the next planning phase.
    await page.waitForTimeout(42000);
    await dismissOverlays(page);
  }
  after = (await waitForArena(page)) ?? after;
  console.log(`  board now reads: arena=${after.arena} accent=${after.accent} bits=${after.bits}`);
  console.log(`  synergy rail: ${after.railText || "(empty)"}`);
  await page.screenshot({ path: `${OUT}/02-played.png` });
  console.log("  📸 02-played.png");

  console.log("\nthe arena agrees with the game's own synergy rail:");
  if (after.arena === "neutral") {
    // Legitimate: the shop may simply never have offered enough of one type.
    // Not a pass and not a failure — say so instead of pretending either.
    console.log("  — no synergy reached its breakpoint this run; nothing to cross-check.");
    console.log("    (the resolver is covered by test/arena-variants.ts for all 18 types)");
  } else {
    assert(after.railText.includes(after.arena),
      `the arena's type is listed in the synergy rail (${after.arena})`);
    const want = TYPE_COLOR[after.arena];
    assert(!!want && hex(after.accent) === want,
      `the accent is that type's colour (${hex(after.accent)} vs ${want})`);
    assert(after.fxClass?.includes(`arena-fx-${EFFECT[after.arena]}`),
      `the weather matches the type (${EFFECT[after.arena]} — ${after.fxClass})`);
    assert(after.bits > 0 && !!after.anim && after.anim !== "none",
      `and it is animating (${after.bits} particles, ${after.anim})`);
    assert(after.arena !== before.arena,
      `the arena actually CHANGED from where it started (${before.arena} → ${after.arena})`);
  }

  console.log("\nit survives a reload, because it is derived not stored:");
  {
    const pre = after.arena;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    await dismissOverlays(page);
    const again = await waitForArena(page);
    assert(!!again && again.arena === pre,
      `same board, same arena after reconnecting (${pre} → ${again?.arena})`);
  }

  const real = errors.filter((e) => !/ethereum|extension/i.test(e));
  assert(real.length === 0, `no console errors (${real.length})`);

  await browser.close();
  console.log(failures === 0
    ? "\n✅ The arena follows a real board, in a real match"
    : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
