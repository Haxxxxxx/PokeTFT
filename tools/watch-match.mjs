/**
 * Live telemetry for a real match, read from production RTDB.
 *
 * This is the "two humans on real connections" test that the netcode fixes in
 * #113 have never had. It prints a timeline of CHANGES rather than dumping
 * state, and calls out the specific failures those fixes were about:
 *
 *   PRESENCE  a player's `connected` going false and never coming back was the
 *             root cause behind a false game-over and a lobby-overfill wedge.
 *             With the .info/connected listener it should recover on its own.
 *   FORFEIT   meta.endedByHost means the host's exit ended everyone's match —
 *             the thing that should now only happen with no humans left.
 *   PLACES    duplicate or missing placements, and players left alive with a
 *             place already assigned.
 *   RATING    anything landing in ratingFailures, which is where the silent
 *             LP-loss class surfaces.
 *
 *   node tools/watch-match.mjs [code] [--project poketft-arena]
 *
 * With no code it finds the most recently updated live game by itself.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const PROJECT = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "poketft-arena";
let CODE = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const POLL_MS = 3000;
const MAX_MIN = Number(process.env.WATCH_MINUTES ?? 45);

async function dbGet(path) {
  try {
    const { stdout } = await run("firebase", ["database:get", path, "--project", PROJECT], {
      maxBuffer: 24 * 1024 * 1024,
    });
    const text = stdout.replace(/^\(node:.*$/gm, "").trim();
    return text && text !== "null" ? JSON.parse(text) : null;
  } catch (e) {
    return { __error: String(e).slice(0, 120) };
  }
}

const stamp = () => new Date().toLocaleTimeString("en-GB");
const log = (tag, msg) => console.log(`[${stamp()}] ${tag.padEnd(9)} ${msg}`);

async function findLiveGame() {
  const games = await dbGet("/games");
  if (!games || games.__error) return null;
  const live = Object.entries(games)
    .filter(([, g]) => g?.meta && g.meta.phase !== "over")
    .sort((a, b) => (b[1].meta.updatedAt ?? 0) - (a[1].meta.updatedAt ?? 0));
  if (!live.length) return null;
  // Prefer a game with a real (non-bot) player in it.
  const withHuman = live.find(([, g]) =>
    Object.keys(g.players ?? {}).some((uid) => !uid.startsWith("bot-")));
  return (withHuman ?? live[0])[0];
}

console.log(`watching project ${PROJECT}${CODE ? ` · game ${CODE}` : " · auto-discovering"}\n`);

const prev = { phase: null, stage: null, round: null, host: null, players: {}, failures: 0 };
let ticks = 0;
let lastUpdate = null;
let lastSeenChange = Date.now();
const deadline = Date.now() + MAX_MIN * 60_000;

while (Date.now() < deadline) {
  if (!CODE) {
    CODE = await findLiveGame();
    if (!CODE) {
      if (ticks++ % 10 === 0) log("waiting", "no live game yet — start one and I'll pick it up");
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    log("FOUND", `game ${CODE}`);
  }

  // Re-discover if the watched game has gone quiet: the auto-discovered one is
  // often a leftover from an earlier session, and the match actually being
  // played is the one receiving writes.
  if (!process.argv[2] && lastUpdate && Date.now() - lastSeenChange > 45_000) {
    const fresh = await findLiveGame();
    if (fresh && fresh !== CODE) {
      log("SWITCH", `game ${CODE} went quiet — following ${fresh} instead`);
      CODE = fresh;
      prev.phase = prev.stage = prev.round = prev.host = null;
      prev.players = {};
      lastSeenChange = Date.now();
    }
  }

  const g = await dbGet(`/games/${CODE}`);
  if (!g || g.__error) {
    log("warn", g?.__error ?? "game node empty — it may have ended");
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue;
  }

  const m = g.meta ?? {};
  if (m.updatedAt !== lastUpdate) { lastUpdate = m.updatedAt; lastSeenChange = Date.now(); }
  if (m.phase !== prev.phase || m.stage !== prev.stage || m.round !== prev.round) {
    log("PHASE", `${m.stage ?? "?"}-${m.round ?? "?"} ${String(m.phase).toUpperCase()}${m.serverDriven ? "" : "  (client-host fallback!)"}`);
    prev.phase = m.phase; prev.stage = m.stage; prev.round = m.round;
  }
  if (m.hostUid && m.hostUid !== prev.host) {
    log(prev.host ? "MIGRATE" : "host", `host = ${m.hostUid.slice(0, 12)}${prev.host ? " (migrated)" : ""}`);
    prev.host = m.hostUid;
  }
  if (m.endedByHost) log("FORFEIT", "meta.endedByHost is set — the host's exit ended this match for everyone");

  for (const [uid, p] of Object.entries(g.players ?? {})) {
    const was = prev.players[uid] ?? {};
    const tag = `${(p.name ?? uid).slice(0, 12)}${uid.startsWith("bot-") ? " (bot)" : ""}`;
    if (was.connected === undefined) log("join", `${tag} hp=${p.hp} lvl=${p.level ?? "?"}`);
    else {
      if (p.connected !== was.connected) {
        log(p.connected ? "ONLINE" : "OFFLINE", `${tag} connected=${p.connected}${p.connected ? "  (presence recovered)" : "  — watching whether it comes back"}`);
      }
      if (p.hp !== was.hp) log("hp", `${tag} ${was.hp} → ${p.hp}`);
      if (p.alive !== was.alive) log("ALIVE", `${tag} alive=${p.alive}`);
      if (p.place !== was.place && p.place != null) log("PLACE", `${tag} placed ${p.place}`);
      if (p.alive && p.place != null) log("ANOMALY", `${tag} is ALIVE but already has place ${p.place}`);
    }
    prev.players[uid] = { connected: p.connected, hp: p.hp, alive: p.alive, place: p.place };
  }

  const places = Object.values(g.players ?? {}).map((p) => p.place).filter((x) => x != null);
  const dupes = places.filter((p, i) => places.indexOf(p) !== i);
  if (dupes.length) log("ANOMALY", `duplicate placements: ${[...new Set(dupes)].join(", ")}`);

  const fails = Object.keys(g.ratingFailures ?? {}).length;
  if (fails > prev.failures) { log("ANOMALY", `ratingFailures now ${fails} — LP persist failed for someone`); prev.failures = fails; }

  if (m.phase === "over") {
    log("OVER", `winner=${m.winnerUid ? m.winnerUid.slice(0, 12) : "(none recorded)"}`);
    const results = await dbGet(`/games/${CODE}/results`);
    const n = results ? Object.keys(results).length : 0;
    const humans = Object.keys(g.players ?? {}).filter((u) => !u.startsWith("bot-")).length;
    log("RESULT", `${n} result row(s) for ${humans} human player(s)${n < humans ? "  — MISSING LP/history rows" : ""}`);
    break;
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log("\nwatch ended");
