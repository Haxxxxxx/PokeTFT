/**
 * PokéTFT dedicated game server — PHASE 1: SHADOW MODE.
 *
 * Watches every live game in RTDB and logs the transition it WOULD run when a phase
 * deadline passes — but writes NOTHING. The clients still host/drive the match. This
 * proves the server sees the same authoritative state and would act at the same moment,
 * BEFORE Phase 2 (where it actually takes over behind the `meta.serverDriven` flag).
 *
 * It also logs whether the client host actually resolved each due transition (so you can
 * confirm the server's view + timing match reality). Never writes to the DB.
 *
 * Run locally:
 *   cd server && npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   RTDB_URL=https://poketft-arena-default-rtdb.firebaseio.com \
 *   npm run shadow
 *
 * (Get a service-account.json from Firebase console → Project settings → Service
 *  accounts → Generate new private key. Do NOT commit it.)
 */
import admin from "firebase-admin";
import http from "node:http";

const RTDB_URL = process.env.RTDB_URL || "https://poketft-arena-default-rtdb.firebaseio.com";
admin.initializeApp({ databaseURL: RTDB_URL }); // creds via GOOGLE_APPLICATION_CREDENTIALS
const db = admin.database();

// Server-time offset, same source the clients use (RTDB .info/serverTimeOffset).
let offset = 0;
db.ref(".info/serverTimeOffset").on("value", (s) => { offset = s.val() || 0; });
const serverNow = () => Date.now() + offset;

const DRIVEN = new Set(["planning", "combat", "carousel"]);
const nextTransition = (phase) =>
  phase === "planning" ? "startCombat/resolveRound" : phase === "combat" ? "endCombat" : "endCarousel";

// Per-game: the deadline we last flagged as "due", to detect whether the client resolved it.
const flagged = new Map(); // code -> { deadline, phase, stage, round, at }

db.ref("games").on("value", (snap) => {
  const games = snap.val() || {};
  const now = serverNow();

  for (const [code, game] of Object.entries(games)) {
    const meta = game?.meta;
    if (!meta || !DRIVEN.has(meta.phase)) continue;
    const { phase, deadline, stage, round } = meta;

    const prev = flagged.get(code);
    // The client resolved a previously-due transition → confirm match.
    if (prev && (phase !== prev.phase || deadline !== prev.deadline)) {
      const lag = now - prev.at;
      console.log(`[shadow] ✓ ${code} ${prev.stage}-${prev.round}: client resolved ${nextTransition(prev.phase)} after ${lag}ms (server view matched)`);
      flagged.delete(code);
    }

    // A transition is DUE and we haven't flagged this exact deadline yet.
    if (now >= deadline && (!prev || prev.deadline !== deadline)) {
      flagged.set(code, { deadline, phase, stage, round, at: now });
      console.log(`[shadow] … ${code} ${stage}-${round}: would run ${nextTransition(phase)} (deadline passed by ${now - deadline}ms) — NOT writing`);
    }
  }
});

// Cloud Run requires an HTTP server listening on $PORT (health check).
http.createServer((_, res) => { res.writeHead(200); res.end("poketft-shadow ok"); }).listen(process.env.PORT || 8080);
console.log(`[shadow] watching ${RTDB_URL}/games … (observe-only, no writes)`);
