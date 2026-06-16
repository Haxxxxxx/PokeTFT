# PokéTFT — Dedicated Authoritative Game Server (Design / Scoping)

**Status:** proposal — no infrastructure provisioned yet. Read, then approve before any build.
**Task:** #110. **Author:** scoped during the big hardening pass.

---

## 1. Why (and why-not-yet)

### Today: host-authoritative
One client per game is elected **host** and drives everything:

- `NetGameClient.tsx` runs a **700 ms loop** that: claims/keeps host (`maybeClaimHost`), heartbeats, and on each phase **deadline** fires the transition — `resolveRoundStart` → `startCombat` → `endCombat` → `startCarousel` → `endCarousel` (`src/game/net/match.ts`).
- Transitions are guarded by an RTDB transaction lock (`claimTransition` + `withClaimGuard`) so exactly one caller advances a round, even mid-migration.
- Combat is a **pure deterministic sim** (`src/game/engine/combat.ts`, seeded by an order-independent `boardSeed`); every client re-runs `simulate()` to replay the host's result.
- **Economy is private** (`priv/{code}/{uid}`), so the host can't see or validate it — each client trusts its own econ.

This model has been **substantially hardened** this pass: host-quit force-end, the reconnect/hydration wipe fix, deterministic transitions with escalating backoff, host migration on disconnect, board-stamp parity. For friends/hobby scale it's solid.

### What host-authoritative still can't give us
| Limitation | Impact |
|---|---|
| The host's device drives the match | Host lag/disconnect causes a migration hiccup; a malicious host *could* tamper with public board state |
| Client-trusted economy | Gold/XP/pool live on the client — a modified client could cheat (no server validation) |
| No server clock authority | Phase timing derives from `serverNow()` (RTDB server time offset) — good, but transitions still execute on a player device |
| Spectator-only / late-join | A game can't run with **zero** connected players (no host to drive it) |

A dedicated server fixes all four. **Recommendation stands: build it only when you outgrow hobby scale**, because it adds always-on cost + a real rewrite. This doc is the plan for when you do.

---

## 2. Goal

A single authoritative **Node service** owns every game's loop and (optionally) its economy. Clients become **thin**: send inputs, render state. No host election, no client-driven transitions, no client-trusted econ.

---

## 3. Proposed architecture

```
┌─────────────┐   inputs (board, picks, buys)   ┌──────────────────────────┐
│  Clients    │ ──────────────────────────────► │  Game Server (Cloud Run) │
│ (Next app)  │                                 │  - per-game tick timers  │
│  render     │ ◄────────── state ───────────── │  - authoritative loop    │
└─────────────┘     (RTDB onValue, unchanged)   │  - firebase-admin (RTDB) │
                                                 └──────────────────────────┘
                                                        ▲ reads/writes
                                                 ┌──────────────────────────┐
                                                 │  Firebase RTDB (unchanged)│
                                                 └──────────────────────────┘
```

Key choice: **keep Firebase RTDB as the state store and transport.** Clients already subscribe via `onValue`; nothing about the client read path changes. The server simply *becomes the only writer of authoritative fields* (`meta`, `combat`, `carousel`, placements). This makes the migration incremental and low-risk — we don't touch the client's rendering or the deterministic replay at all.

### 3.1 Running a loop on Cloud Run
Cloud Run throttles CPU between requests, **but** with **CPU always allocated + `min-instances=1`** a container can run background timers. We do **not** poll every 700 ms globally; instead, **per-game `setTimeout` to the next phase deadline** — one always-on instance comfortably drives hundreds of games (each timer just runs one `match.ts` transition).

- Single instance for hobby/early scale (sticky: all games on instance 0).
- To scale out: shard games by `code` hash across instances (later; not needed initially).

Alternative compute (cheaper, less managed): a single **e2-micro Compute Engine VM** (free-tier eligible) running the same Node loop under `systemd`. Same code, ~$0/month, but you manage the box. **Cloud Run is the recommended default**; the VM is the budget option.

> Note: Cloud **Scheduler** can't drive this — its min interval is 1 minute, far too coarse for ~1 s phase timing. Always-on compute is required.

### 3.2 The server reuses our existing logic
Almost all the authoritative logic already lives in framework-agnostic modules:
- `src/game/engine/*` (combat, synergies, enemy, shop) — pure, no React/DOM.
- `src/game/net/match.ts` — the transitions, written against the `firebase` Web SDK.
- `src/game/store/gameStore.ts` — econ actions (only needed server-side in Phase 3).

The main porting work is swapping the **Web SDK** calls in `match.ts` for **`firebase-admin`** (server) equivalents, behind a tiny DB adapter so the same transition code runs in both. The engine and config import unchanged.

---

## 4. Migration plan (phased, each phase shippable + reversible)

**Phase 0 — Extract a shared core (no behavior change).**
Move `match.ts`'s DB calls behind an interface (`get/set/update/transaction/onValue`). Provide a Web-SDK impl (current) and an admin impl (server). Verify the existing client still passes everything. *Low risk, no infra.*

**Phase 1 — Server skeleton, shadow mode.**
Stand up the Cloud Run service with `firebase-admin`. It **watches** active games (`/games`) and logs what transition it *would* run, but **doesn't write** yet. Clients still host. Confirms the server sees the same state and computes the same transitions. *Infra goes up here (behind a flag); no gameplay change.*

**Phase 2 — Server takes the loop.**
Flip a per-room flag `meta.serverDriven = true`. When set: the server claims host (`hostUid = "server"`), runs the transitions; **clients stop** running `maybeClaimHost`/the 700 ms transition loop (they keep rendering + sending inputs). Roll out to new games only; old games finish on the client path. *Reversible by clearing the flag.*

**Phase 3 — Server-authoritative economy (optional, the security win).**
Move buy/sell/reroll/xp validation server-side: clients send **intents** (`buy slot 3`), the server applies them against the authoritative pool/gold and writes the result. Removes client econ trust entirely and collapses the `priv/` privacy split (the server holds econ; it just doesn't broadcast it). Bigger change — do only if cheating matters.

**Phase 4 — Cleanup.**
Delete client host-loop code, host migration, `claimTransition` racing, and the boot-veil "syncing" guard. Simplify reconnect (server is always there). The client shrinks meaningfully.

You can **stop after Phase 2** and already have a true dedicated server (no host dependency, games run with zero players connected). Phase 3 is the anti-cheat upgrade.

---

## 5. Cost estimate

| Option | Monthly (rough) | Notes |
|---|---|---|
| **Cloud Run**, 1 vCPU + 512 MB, CPU-always, `min-instances=1` | **~$20–35** | Recommended. Managed, autoscateles later. Cost is the always-on instance. |
| **e2-micro VM** (Compute Engine) | **~$0** (free-tier) | Budget. You patch/run it yourself via systemd. |
| RTDB usage delta | ~$0 | Same read/write volume; server replaces a client as the writer. |

For one always-on instance, **budget ~$25/month** on Cloud Run, or near-zero on a micro VM. No per-game cost until you shard for real scale.

---

## 6. Risks & mitigations

- **Single-instance = single point of failure.** Mitigate: Cloud Run health checks + auto-restart; on restart the server rebuilds active-game timers from `/games` (state is in RTDB, not memory). For HA, shard later.
- **Double-driver during Phase 2 rollout** (a client *and* the server both think they host). Mitigate: the existing `claimTransition` transaction already makes concurrent transitions safe; the `serverDriven` flag gates client loops off.
- **`firebase-admin` vs Web SDK behavior drift** (transactions, server timestamps). Mitigate: the DB adapter + Phase 1 shadow mode catches divergence before any write.
- **Determinism must still hold** across server-resolved combat + client replay. Mitigate: the engine is unchanged and already covered by `npm run test:engine` (72/72) + the round-trip test; the server imports the *same* `simulate()`.

---

## 7. Effort estimate

| Phase | Scope | Rough effort |
|---|---|---|
| 0 | DB adapter + extract | 1–2 days |
| 1 | Cloud Run service + shadow watch | 2–3 days |
| 2 | Server-driven transitions + flag rollout | 2–4 days |
| 3 | Server-authoritative econ (optional) | 4–6 days |
| 4 | Client cleanup | 1–2 days |

**~1–2 weeks to a true dedicated server (through Phase 2);** +1 week for the anti-cheat econ (Phase 3).

---

## 8. Recommendation

1. **Don't provision yet.** The hardened host-authoritative model is fine for friends-scale.
2. When you're ready: do **Phase 0 + Phase 1 first** (no gameplay change, ~3–5 days) to de-risk — it proves the server computes identical transitions in shadow mode before anything goes live.
3. Default to **Cloud Run min-instances=1, CPU-always**; fall back to an **e2-micro VM** if cost matters.
4. Stop after **Phase 2** unless client-side cheating becomes a real problem (then Phase 3).

**Nothing here is built or deployed.** Approve a phase and I'll implement it behind a flag, verified the same way as everything else (typecheck + engine 72/72 + sim + build) before it touches a live game.
