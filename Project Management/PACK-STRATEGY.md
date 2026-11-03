# From PokéTFT to a multi-roster auto-battler

> Strategy + architecture plan. Written 2026-11-03 against commit `7ac32ef`.
> Goal: turn a working Pokémon fan game into an engine-first platform with many rosters,
> promotable on socials, with no in-app monetization.

---

## 0. TL;DR

Three moves, in this order:

1. **Abstract the roster into Packs.** The refactor is far smaller than it looks — measured below.
   The engine touches the Pokémon layer through *one function at two call sites*.
2. **Ship an original flagship roster.** The brand you promote on socials must be one nobody
   can delete. Pokémon becomes *a* pack, not *the* product.
3. **Build the shareability layer.** With no revenue, distribution *is* the product.
   Deterministic combat + seeded RNG means replays and recap cards are nearly free.

The thing you already built is the moat: a deterministic, server-authoritative, 8-player
auto-battler with ranked LP, 9 modes, i18n, and desktop/mobile packaging. Almost nobody
finishes that. The Pokémon skin is the *least* valuable and *most* fragile part of it.

---

## 1. The IP reality — read this first, it shapes everything

This is not a lecture, it's a load-bearing engineering constraint.

**What's actually in the repo right now:**

| Asset | Size | Count | What it is |
|---|---|---|---|
| `public/sprites/` | 4.1 MB | 1,020 files | Verbatim Pokémon sprites, mirrored from PokéAPI |
| `public/cries/` | 15 MB | 973 files | Verbatim Pokémon cry audio |

Plus 1,025 species names, the 18-type chart, evolution lines, and move names.

**Why this matters for your plan specifically:**

- **Non-commercial is not a defense.** It helps with damages, not with the takedown.
  Derivative works using copyrighted characters and verbatim assets aren't fair use because
  you didn't charge for them.
- **Enforcement tracks visibility, not revenue.** Nintendo ignores thousands of quiet fan
  projects and kills the ones that get popular. Pokémon Uranium, Pokémon Prism, AM2R —
  every one died *at the moment it broke containment*. None of them made money either.
- **Social comms is the amplifier.** The exact activity you want to do is the activity that
  triggers enforcement. "Quiet fan project" and "comms campaign on socials" are mutually
  exclusive strategies for Pokémon IP.
- **You're self-hosting the assets.** `public/sprites/` and `public/cries/` ship from your
  own Firebase Hosting. That's the single easiest takedown target: one notice to Firebase,
  and both hosting sites go, not just the sprites.

**The conclusion is not "don't do it."** It's: *don't build a brand on a foundation someone
else holds the delete key for.* You're about to invest months of comms effort. That effort
should compound into something you own.

**The hedge that makes everything work:**

```
Engine + brand + flagship roster   →  100% yours, promote it loudly, forever
Pokémon pack                        →  community-made, side-loaded, not hosted by you
```

Same code. Same game. One of them survives going viral.

This is the Tabletop Simulator / Slay the Spire / Balatro-mod model: the platform is clean,
the community makes the spicy content, and you never host or ship it. You can even make the
pack format so good that someone *else* builds the Pokémon pack in a weekend — and when the
C&D comes, it goes to a GitHub repo you don't own, and your game keeps running.

---

## 2. Architecture — the Pack system

### 2.1 The measurement (why this is a ~3 day refactor, not a rewrite)

I grepped the whole `src/` tree (17,301 LOC). The Pokémon coupling is *shallow and
concentrated*, because you already wrote the engine as pure TS with no React.

| Seam | Reality | Refactor cost |
|---|---|---|
| **`effectiveness(atk, defTypes)`** | The *entire* engine↔roster contract. `combat.ts:559` and `combat.ts:563`. That's it. | **Trivial** — becomes `pack.effectiveness()` |
| `typeChart.ts` | 3 importers total: `combat.ts`, `enemy.ts`, `UnitDetail.tsx` | Trivial |
| `PokeType` | 15 files — but 11 are data or UI. Engine refs: `combat.ts` (3), `enemy.ts` (10), `botBrain.ts` (1) | Low — becomes `AffinityKey = string` |
| `spriteUrl(dex)` | 13 files, but it's a 1-line helper | Trivial — becomes `pack.art(unitId)` |
| `rosterForRoom(rules, seed)` | **Already the single chokepoint** for "which units are in this game" | None — just add `packId` |
| `database.rules.json` | **Zero roster coupling.** Rules validate structure, not content | **None** |

Two things you already built make this almost free:

1. **`rosterForRoom()` already exists.** Your generation-selection feature (`generations: [1,2,3]`,
   `MAX_REGIONS = 3`) is a *proto pack system*. The lobby already lets players pick which
   subset of units is in play, seeds it deterministically from the room code, and guarantees
   all 8 clients draw the same pool. `packId` slots in right next to `generations`.
2. **You already defend against cross-roster data.** `match.ts:127` drops placed units with an
   unknown def id — *"stale/cross-roster data"*. You anticipated this. That defense
   generalizes to pack mismatches with no new concept.

### 2.2 The Pack manifest

A pack is pure data — no code, so it's safe to load from untrusted sources:

```ts
type Pack = {
  id: string;                        // "kanto", "norse", "neon-beasts"
  name: string;
  version: string;
  license: string;                   // surfaced in UI; CC0 / original / fan
  author: string;

  /** Replaces PokeType. 12–18 keys reads best; the chart is what makes drafting deep. */
  affinities: { key: string; label: string; color: string }[];

  /** NxN effectiveness matrix, affinities × affinities. Row = attacker. */
  chart: number[][];

  traits: TraitDef[];                // already generic enough — keys become strings
  units: UnitDef[];                  // dex[] becomes artId[]

  art: { base: string; ext: "png" | "webp" };
  audio?: { base: string; ext: "ogg" | "mp3" };
};
```

`UnitDef` barely changes. `dex: [number,number,number]` → `art: [string,string,string]`,
and `types: PokeType[]` → `affinities: string[]`. Everything else — stats, moves, roles,
`castEffect`, `typesByStar` — is already roster-agnostic. Your `StatBlock`, `Move`,
`TraitBuff` and `TraitTier` types need **zero changes**.

### 2.3 Netcode: keeping 8 clients honest

One new rule: **every client in a room must resolve the same pack bytes.**

```ts
room.rules.packId = "norse";
room.rules.packHash = "sha256:a1b2...";   // host writes it at room creation
```

On join, a client that can't produce a pack with that exact hash is refused with
"Missing pack: Norse v1.2 — [Install]". No RTDB rules change needed (they don't inspect
roster content). The existing unknown-defId purge at `match.ts:127` stays as the
belt-and-braces second line.

Built-in packs ship in the bundle. Community packs are fetched by URL and cached — and
critically, **you never host them**, which is the whole legal point.

### 2.4 Migration phases

**Phase A — Pack SDK core (~3 days).** No new content, no visible change. Pure refactor:
`PokeType` → `AffinityKey`, `typeChart` → `pack.chart`, `spriteUrl` → `pack.art`,
`TYPE_COLOR` → `pack.affinities[].color`. Existing Pokémon data becomes `packs/kanto/`.
Ship it when `npm test` is green — your determinism and 24-player sim tests are the
regression net, and they're genuinely good.

**Phase B — Flagship roster.** The content problem, not the code problem. See §3.

**Phase C — Pack loader + lobby UI.** Pack picker next to the existing mode/generation
selectors. Pack hash validation on join. Local side-load (drop a folder / paste a URL).

**Phase D — Shareability.** See §4. This is where growth actually comes from.

**Phase E — Pack authoring tools.** A validator CLI (`npm run pack:lint`) that checks the
chart is NxN, every unit's affinities exist, trait breakpoints are reachable given the pool,
and no cost tier is empty. Then a web pack editor. This is what turns players into content
producers and makes the platform self-feeding.

---

## 3. Rosters — what to actually build

### 3.1 What makes a pack work mechanically

From what's already tuned in `config.ts`:

- **60–120 units** minimum for a healthy 8-player shared pool (`POOL_SIZE` is 30/25/18/10/9
  copies per tier — below ~60 units, contested comps stop being interesting).
- **Three-stage families** map to star-ups. Any IP with "tiers of power" works.
- **12–18 affinities** with a real rock-paper-scissors chart. Fewer than 10 and the chart
  stops mattering; more than 20 and nobody can hold it in their head.
- **Silhouette distinctiveness** — players read the board at a glance, not names.

### 3.2 The flagship (do this one)

An original creature roster. Name it, own it, this is what goes on the socials.

The hard part isn't design, it's **art volume**: ~100 units × 3 stages = 300 assets with a
consistent style. Realistic options:

- **Geometric/abstract style** — strong silhouettes, procedurally composable, no art budget.
  Think *Slay the Spire*'s readability over *Pokémon*'s rendering. This is the pragmatic pick.
- **AI-generated with a locked style guide** — fast, but be aware you'll want consistency
  passes, and commercial-use terms vary by tool. Fine here since nothing is monetized.
- **Commission a pixel artist** — best result, real cost, slowest.

Mechanically you can be *better* than Pokémon here: design the affinity chart for **gameplay
balance** rather than inheriting one built for a 1996 RPG. Your 18×18 chart has known dead
zones (Normal attacks nothing super-effectively; Ghost/Dark immunities are swingy in an
auto-battler). A purpose-built 14×14 chart with clean triangles would play better.

### 3.3 Safe packs you can ship yourself

- **Mythology** — Greek, Norse, Egyptian, Yōkai. Public domain, infinite depth, instantly
  legible to players, and "evolution lines" map beautifully (spirit → god → titan).
- **Bestiary / cryptids** — dragons, chimeras, folklore creatures. Public domain.
- **Historical** — naval, siege, dynasties. Weird and distinctive.
- **CC0 asset packs** — Kenney.nl and OpenGameArt have enormous CC0 libraries. Zero art cost,
  legally clean, and a fast way to prove the pack system works with *real* content.

### 3.4 Packs that are not safe to host (be clear-eyed)

Pokémon, Digimon, Yu-Gi-Oh, One Piece, Dragon Ball, Nintendo anything, most anime IP. These
are exactly the ones your community will want most — which is precisely why the side-load
path matters. Let them exist; don't host them.

Some rights-holders do publish fan-content policies that are more permissive than Nintendo's.
Worth reading case by case before shipping anything first-party, and worth treating as the
exception, not the rule.

---

## 4. The comms engine — what I'd build so your socials actually work

You're doing the comms; this section is **what the app must produce so you have something to
post every day without manually making content.** With no monetization, shareability is the
entire growth loop.

The unlock: **your combat is already deterministic with seeded RNG.** That's rare, and it
makes most of this nearly free.

### 4.1 Highest leverage, cheapest to build

- **Replay links.** `poketft.app/r/<seed>` re-simulates the match client-side. Because combat
  is deterministic, a replay is a *seed plus a board*, not a video. Kilobytes. This is
  genuinely the single best feature you can build for socials.
- **Auto-generated recap cards.** After every match, render an OG image: placement, final
  board, active traits, damage dealt. One PNG per match, auto-posted or one-tap shared.
  Every player becomes a distribution channel.
- **Team codes.** Encode a board as a short string. Paste → load. This is how TFT comp
  content works; creators need it to publish builds.
- **Final-fight GIF/WebM export.** The money shot for Twitter/TikTok. You already render
  combat; capture it to a clip.
- **Public profile + ladder pages with OG meta.** Every shared rank link renders a rich
  card. Free impressions.

### 4.2 Content that writes itself

- **Pack of the week** — community packs are an infinite content treadmill you don't staff.
- **Patch notes as content.** You already have `patchNotes.ts`. Turn each release into a post.
- **Dev-log angle.** The determinism + server-authoritative netcode + Tauri packaging story is
  legitimately interesting to the gamedev crowd, which is a *different* audience than players
  and reaches a lot further for a solo dev. "I built an 8-player auto-battler where replays
  are 200 bytes" is a strong post.
- **The pack SDK launch itself** is a news beat. "Make your own TFT roster" is a better hook
  than any single roster.

### 4.3 Sequencing

Don't launch comms on the Pokémon version. Launch on the flagship, with the pack SDK as the
headline, and let the community supply the nostalgia packs. That way every bit of attention
you buy compounds into something that can't be taken down.

---

## 5. Suggested first week

| Day | Work |
|---|---|
| 1 | Phase A refactor: `AffinityKey`, `pack.chart`, `pack.art`. Keep tests green. |
| 2 | Finish Phase A, move Pokémon data into `packs/kanto/`. Verify the 24-player sim is byte-identical. |
| 3 | Pack manifest loader + `npm run pack:lint` validator. |
| 4 | Build a *second* pack from CC0 assets (even 60 units) — proves the system end to end. |
| 5 | Lobby pack picker + `packHash` join validation. |
| 6–7 | Replay links + recap cards. First shareable artifact. |

After that week you'd have: an engine that takes any roster, two working rosters, and a
share loop. That's the platform. Everything else is content.

---

## 6. Open decisions for Charles

1. **Flagship roster theme + art direction** — this is the one call only you can make, and
   it gates Phase B.
2. **How clean to go on Pokémon.** Options: (a) keep it as a built-in until the flagship
   lands, then retire it to community side-load; (b) move it to side-load immediately;
   (c) keep hosting it. (a) is the pragmatic middle — you don't lose your existing players
   while you build the replacement.
3. **Name.** "PokéTFT" can't be the brand you promote. Needs to change before comms start.
