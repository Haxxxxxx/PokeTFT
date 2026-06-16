# PokéTFT Game Server (#110)

Authoritative game server for PokéTFT. Built in phases (see `docs/dedicated-server-design.md`).
Keeps **Firebase RTDB as the store/transport** — the server just becomes the authoritative writer.

## Status: Phase 1 — SHADOW MODE (observe only, no writes)

`shadow.mjs` watches every live game and **logs the transition it would run** when a phase
deadline passes, plus whether the client host actually resolved it. It writes nothing, so it's
**safe to run against production** — it can't affect live games. This proves the server sees the
same state and would act at the same instant before Phase 2 takes over.

## Run it locally (validate before any cloud spend)

1. Firebase console → Project settings → **Service accounts** → **Generate new private key** →
   save as `server/service-account.json` (gitignored — never commit it).
2. ```bash
   cd server
   npm install
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
   RTDB_URL=https://poketft-arena-default-rtdb.firebaseio.com \
   npm run shadow
   ```
3. Start a game in the app. You should see lines like:
   ```
   [shadow] … ABCD 2-3: would run endCombat (deadline passed by 40ms) — NOT writing
   [shadow] ✓ ABCD 2-3: client resolved endCombat after 180ms (server view matched)
   ```
   A `✓` after every `…` means the server's view + timing match reality. **That's the Phase 1 success criteria.**

## Deploy to Cloud Run (Phase 1, optional — this is the billing step)

> Only do this after the local run looks right. It provisions an always-on instance (~$25/mo).

```bash
gcloud run deploy poketft-shadow \
  --source server \
  --region <your-region> \
  --no-cpu-throttling \           # CPU always allocated → the watcher keeps running
  --min-instances 1 \
  --max-instances 1 \
  --no-allow-unauthenticated \
  --set-env-vars RTDB_URL=https://poketft-arena-default-rtdb.firebaseio.com
```
The Cloud Run service account needs **Firebase Realtime Database Viewer** (read-only in shadow mode).

## Next phases (not built yet)

- **Phase 2** — server takes the loop: add a `firebase-admin` `DbAdapter` impl, `setDbAdapter()` it,
  and run the real `src/game/net/match.ts` transitions when `meta.serverDriven` is true (clients stop
  hosting). Reversible by clearing the flag. *(This needs a TS build/bundle of the shared game code for
  the server — the adapter seam from Phase 0 is already in place.)*
- **Phase 3** — optional server-authoritative economy (anti-cheat).
- **Phase 4** — delete client host-loop / migration code.
