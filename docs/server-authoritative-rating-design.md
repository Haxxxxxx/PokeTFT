# Server-Authoritative Rating — Design

**Status:** proposed · **Author:** scoping pass · **Scope:** ranked LP / leaderboard integrity

## 1. Problem

LP (rating) and the public leaderboard are currently **computed and written by the
client**. After a game ends, the browser calls `applyRankedResult()` in
`src/game/net/users.ts`, which:

1. computes the delta locally (`weightedRatingDelta`),
2. writes `users/{uid}/rating` via a transaction,
3. mirrors `leaderboard/{uid}` with `{ username, rating, photoURL }`,
4. and separately writes the history row `users/{uid}/history/{code}` (incl. `lp`).

The security rules only gate these on *ownership + bounds*:

```jsonc
// database.rules.json
"users/$uid": { ".write": "auth != null && $uid === auth.uid",
  "rating": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 30000" } },
"leaderboard/$uid": { ".write": "auth != null && $uid === auth.uid",
  "rating": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 30000" } }
```

So any authenticated user can open the console and write `rating: 30000` to their own
node + leaderboard entry. **The competitive ladder is trivially forgeable.** The same
hole lets a client write its own `players/{uid}/place = 1` to fake a win.

## 2. What we already have (why this is cheap)

The hard part is already done. **The game is fully server-driven** (`meta.serverDriven`
is always true since #110):

- Cloud Functions (`functions/src/index.ts`) own the match loop. `runTransition` (a
  Cloud Tasks dispatch) calls `resolveRoundStart` / `endCombat` / `endCarousel` from
  `src/game/net/match.ts` at every phase deadline.
- **`endCombat` already assigns authoritative `place`** to every eliminated player —
  derived from its own HP simulation, ordered by pre-damage HP — sets `meta/winnerUid`,
  and flips `meta/phase = "over"` (match.ts:758-772). It does **not** trust client-written
  `place`; it computes and overwrites it.
- `match.ts` talks to the DB only through `dbAdapter()` (`db-adapter.ts`), which already
  abstracts Web-SDK vs **firebase-admin**. Code added inside `endCombat` runs server-side
  under admin privileges (bypassing rules) when the Cloud Function invokes it.

So **every input to the rating calculation already exists server-side at the exact moment
a placement is decided.** We are not building new game infrastructure — we are moving one
calculation across the trust boundary and locking the door behind it.

## 3. Design

### 3.1 Extract pure rating math into a shared module

`ratingDelta`, `weightedRatingDelta`, `rankOf`, `START_RATING`, `BOT_LP_WEIGHT` currently
live in `users.ts`, which imports the Firebase **client** SDK and therefore can't be
imported by `match.ts` / functions. Move the pure functions to a dependency-free module:

```
src/game/rating.ts   // no firebase imports — just math + the Rank table
```

`users.ts` re-exports from it (no client churn); `match.ts` imports it directly. The
existing determinism tests can cover it unchanged.

### 3.2 Apply rating at the point of placement (server-side)

Add a single idempotent helper, invoked from `endCombat` (and the Double-Up resolution
path) wherever the server assigns a final `place`:

```ts
// match.ts — runs under the admin adapter inside the Cloud Function
async function applyRatingFor(code, room, uid, place) {
  const p = room.players[uid];
  if (!p || p.isBot) return;                       // humans only
  // Idempotency: claim a per-player marker once. Cloud Tasks may retry endCombat.
  const claim = await dbAdapter().transaction(
    `games/${code}/rated/${uid}`,
    (cur) => (cur ? undefined : true),             // abort if already rated
  );
  if (!claim.committed) return;

  const { humans, bots } = countOpponents(room, uid);
  const total = humans + bots + 1;
  const delta = weightedRatingDelta(place, total, humans, bots);

  const res = await dbAdapter().transaction(
    `users/${uid}/rating`,
    (cur) => Math.max(0, (typeof cur === "number" ? cur : START_RATING) + delta),
  );
  const rating = res.value ?? START_RATING;

  await dbAdapter().update("", {
    [`leaderboard/${uid}`]: { username: p.name, rating, photoURL: p.photoURL ?? null },
    [`users/${uid}/history/${code}`]: buildHistoryRow(room, uid, place, total, delta),
    [`games/${code}/results/${uid}`]: { place, delta, prevRating: rating - delta, rating },
  });
}
```

- Called for each newly-dead player in `endCombat`'s `deadByHp.forEach`, and for the
  winner when `surviving.length === 1`.
- `buildHistoryRow` composes `{ place, players, regions, won, team, traits, lp, mode }`
  from the **authoritative** `room` state (the server has each player's final board in
  `players/{uid}/board`), so history becomes server-truth too — no client cooperation.
- Writing `games/{code}/results/{uid}` gives the client a node to read for its end screen
  (§3.4). It's pruned with the game by `pruneStale`.

**Idempotency** is the per-player `games/{code}/rated/{uid}` transaction claim — survives
Cloud Tasks retries and the rare double-invocation. The existing `withClaimGuard` around
`endCombat` already serializes transitions; this is belt-and-suspenders for the retry case.

### 3.3 Forfeit / disconnect

- **Concede:** today `concede(code, uid, place)` (match.ts:893) does a client `update` of
  `{ hp: 0, alive: false, place }`. Replace the client call with a `concede` **callable**
  (`onCall`, like `kickoff`/`finishEarly`): the server validates the caller owns `uid`,
  sets the worst currently-alive placement *itself*, and calls `applyRatingFor`. The
  client no longer chooses its own place.
- **Rage-quit (no concede):** the server keeps simulating the player's frozen board until
  it's eliminated normally → `endCombat` assigns place + rating. No client presence needed.
  This deletes the entire class of "I played a game and it didn't record" bugs (#57),
  because recording no longer depends on the loser's tab being open.

### 3.4 Client becomes a reader

- Delete the client write paths: `applyRankedResult`, `recordGameResult`, and the
  `users.ts` `recordUltimateBotWin` rating write. `NetGameClient.tsx` stops calling them
  (lines ~711-720, ~789-796).
- The end screen reads its LP outcome from `games/{code}/results/{myUid}` via a short
  `onValue` listener (it already subscribes to the room). `RankedResult` shape is
  unchanged, so the existing UI binding stays. Slight latency (one server transition) is
  acceptable and already implied by the server-driven model.
- The client keeps a **read-only** copy of `weightedRatingDelta` for the optimistic
  "you'll gain ~+24 LP" preview, clearly a non-authoritative estimate.

### 3.5 Lock the rules (deploy LAST)

RTDB gotcha: a `.write:true` on a parent **cascades** to all children — a child
`.write:false` cannot revoke it. `users/$uid` currently grants a blanket write, so we must
*remove* the node-level write and enumerate the client-writable fields, leaving rating
(and the leaderboard) with no client write path:

```jsonc
"users/$uid": {
  // no node-level ".write" — enumerate writable fields instead
  "username":      { ".write": "$uid === auth.uid", ".validate": "..." },
  "usernameLower": { ".write": "$uid === auth.uid", ".validate": "..." },
  "photoURL":      { ".write": "$uid === auth.uid" },
  "online":        { ".write": "$uid === auth.uid" },
  "currentGame":   { ".write": "$uid === auth.uid" },
  "friends":       { /* unchanged */ },
  "createdAt":     { ".write": "$uid === auth.uid && !data.exists()" },
  "rating":        { ".write": false },            // ← server (admin) only
  "history":       { ".write": false },            // ← server (admin) only
  "ultimateBotWins": { /* see §5 */ }
},
"leaderboard/$uid": { ".write": false, ".read": true, ".indexOn": ["rating"] }
```

- Admin SDK bypasses rules, so the server writes freely.
- `ensureProfile` must switch from `set(node, …)` to `update(node, …)` so it doesn't trip
  the now-absent node-level write (and can't clobber a server-written `rating`).
- `players/{uid}/place` stays client-writable (the node carries live planning data and
  RTDB can't split it cheaply) — **but it is no longer trusted**: rating derives from the
  server's own elimination order, never from this field. Integrity comes from *the server
  ignoring it*, not from locking it.

## 4. Rollout (staged — no flag-day)

1. **PR-A — extract `rating.ts`** + shared import. Pure refactor, no behavior change.
2. **PR-B — server dual-write.** `applyRatingFor` runs in `endCombat`; client writes stay.
   Compare `games/{code}/results/{uid}` deltas against client values in logs/QA until they
   match across modes (standard, Double Up, mega, bot-weighted lobbies).
3. **PR-C — flip the client to read** `results/{uid}`; remove client rating/history writes;
   move concede to a callable.
4. **PR-D — lock the rules** (`rating`/`history`/`leaderboard` → server-only) + switch
   `ensureProfile` to `update`. Deploy `--only database` last, after PR-C is live, so
   clients are already off the write path before the door closes.

Each PR is independently revertible. Determinism tests stay green throughout (combat math
is untouched).

## 5. Out of scope / follow-ups

- **`ultimateBotWins`** (Nightmare unlock gate) is still client-incremented. It doesn't
  touch the leaderboard, so it's low-integrity; moving it server-side (increment inside
  `applyRatingFor` when the winner beat an ultimate/nightmare bot) is a clean follow-up but
  not required for ladder integrity.
- **Backfill:** existing forged ratings aren't corrected. Optional one-shot admin script to
  recompute from history, or a leaderboard reset at launch of the locked-down season.
- **Anti-collusion / win-trading** (humans intentionally feeding each other) is a separate,
  harder problem and explicitly not addressed here.

## 6. Risk & cost

- **Risk:** low-medium. No combat/determinism changes. The main subtlety is the RTDB
  rules cascade (§3.5) — mitigated by staged rollout and the admin bypass.
- **Effort:** ~1.5–2 days across the 4 PRs, most of it in PR-B/PR-C wiring + QA across
  game modes. The enabling infra (server loop, dbAdapter, authoritative placement) already
  exists, which is what makes this tractable.
- **Payoff:** the leaderboard becomes trustworthy, and history/LP recording stops depending
  on client presence (kills the "game didn't record" bug class).
