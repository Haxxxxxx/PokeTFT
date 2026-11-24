# TFT parity — gap analysis

> Written 2026-11-04, comparing captured frames of our planning + combat views
> against TFT reference screenshots (planning, mid-drag, and a fight screen).
>
> **Re-verified against the code 2026-11-24.** Eight rows had shipped since the
> gap analysis was written and were still listed as open — including 3.1, which
> this document called its highest-value item. Rows now carry a status, checked
> by reading the component rather than by memory of what was merged.
>
> Scope note: this is about **rendering and presentation**, not game rules. The
> economy, shop odds, star-up, carousel and augment systems already follow TFT
> closely — see `IMPLEMENTED.md`.

---

## How to read this

Each item is tagged with what it actually costs:

| Tag | Meaning |
|---|---|
| **CODE** | Pure engineering. No new assets. Can be done now. |
| **ART** | Needs an asset that doesn't exist. Blocked on the flagship roster. |
| **DESIGN** | Needs a decision before anyone can build it. |

The honest headline: **structure and layout are close; the remaining distance
is mostly ART.** Nothing below reorders that.

---

## 1. Board / arena

| # | Gap | Tag | Notes |
|---|---|---|---|
| 1.1 | No surrounding environment | **ART** | TFT's board sits inside a painted diorama — snow, trees, lanterns, water, sky. Ours sits on a flat backdrop. This is the single biggest remaining visual difference and no amount of CSS closes it. |
| 1.2 | Floor is gradient, not texture | **ART** | We approximate stone with layered gradients + a cross-hatch. TFT uses a painted texture map. A single tiling stone texture would close most of this cheaply. |
| 1.3 | Platform edge is plain | ART | TFT has carved stonework, corner posts, a lip with relief. We have an extruded slab + a railing shadow. |
| 1.4 | ~~No ambient motion~~ | **SHIPPED** | `ArenaEffects.tsx`. Also since: the arena takes its character from the board standing on it (`arena-variants.ts`), which partly addresses 1.1/1.2 without an asset. |
| 1.5 | Enemy half ghost-hexes may still read thin | CODE | Currently a quiet outline. Needs a judgement call once seen beside the reference at the same size. |

## 2. Units

| # | Gap | Tag | Notes |
|---|---|---|---|
| 2.1 | **32px pixel sprites vs rigged 3D models** | **ART** | The defining difference. TFT champions are animated 3D models lit by the scene. No CSS treatment makes a 96×96 sprite (half of it transparent padding) read like that. Gates on the flagship roster. |
| 2.2 | No idle animation | ART | TFT units breathe, shift weight, face their target. Ours are static frames. The R3F spike proves per-unit idle animation is cheap **once models exist**. |
| 2.3 | No attack/cast animation | ART | We fake impact with a lunge + scale pop. TFT plays real wind-up and recovery. |
| 2.4 | ~~Star tier shown as small stars~~ | **SHIPPED (different)** | Deliberately not TFT's crown: a tier-coloured pool under the unit, because star glyphs vanish at board scale. See the note in `SpriteUnit.tsx`. |
| 2.5 | ~~Held items not visible on board units~~ | **SHIPPED** | `ItemPips` in `CombatField3D.tsx`, fed by `CombatResult.unitItems`. |

## 3. Combat presentation

| # | Gap | Tag | Notes |
|---|---|---|---|
| 3.1 | ~~No ability-area indicators~~ | **SHIPPED** | `CombatStage.tsx`, covered by `test/ability-area.ts`. This was the document's highest-value CODE item; it landed in #112. |
| 3.2 | ~~Opponent identity is thin~~ | **SHIPPED** | `CombatStage.tsx` shows the opponent's name, live alive-counts and strength bars. |
| 3.3 | Damage numbers are plain | **PARTIAL** | Super-effective now draws its own ring (`combat-fx.ts`) and numbers scale with the board. A crit-specific treatment is still missing. |
| 3.4 | No death animation | ART/CODE | We fade + grayscale. TFT plays a death animation and leaves the field clean. |
| 3.5 | HP bar vertical anchor is tuned, not derived | CODE | PokéAPI sprites have no consistent crown, so bar placement is a hand-tuned fraction of the tile. Goes away with real models (known pivot). |

## 4. HUD and rails

| # | Gap | Tag | Notes |
|---|---|---|---|
| 4.1 | Trait rail lacks the inactive block | **PARTIAL** | `TraitPanel.tsx` now lists active synergies in full then as many partials as fit (`INLINE_PARTIALS`), plus an unreachable-in-this-region marker TFT has no equivalent for. Not yet a dedicated "2+" tray. |
| 4.2 | Trait rows lack unit portraits | CODE | TFT shows which champions carry a trait inline. We have this in the hover card only. |
| 4.3 | ~~Player rail lacks the trait flash~~ | **SHIPPED** | `NetGameClient.tsx` computes `topTraits` per opponent and renders them on the rail. |
| 4.4 | No "last round opponent" marker | CODE | TFT marks who you just fought and who you're about to. We show the next opponent only. |
| 4.5 | Top bar is wider/sparser than TFT's | CODE | Our econ chips spread across the width; TFT groups tighter and gives the centre to the timer. |

## 5. Shop

| # | Gap | Tag | Notes |
|---|---|---|---|
| 5.1 | Card art is a sprite, not a portrait | **ART** | TFT cards carry a painted champion portrait bleeding off the card. Ours is a transparent sprite. Fixed sizing is solved; the asset isn't. |
| 5.2 | ~~No "will complete a trait" highlight~~ | **SHIPPED** | `ShopBar.tsx` via `traitGainsFor`; a gaining chip gets the `shop-trait-gain` ring. |
| 5.3 | No star-up preview on cards | CODE | TFT indicates when buying would star-up a unit you hold. We show a `1/3` badge; it could be louder. |

## 6. Motion and feel

| # | Gap | Tag | Notes |
|---|---|---|---|
| 6.1 | Phase transitions are abrupt | **PARTIAL** | A stage banner animates in (`stage-banner` keyframe). There is still no camera move into combat. |
| 6.2 | No board-wide reactions | CODE | Per-unit hit flash exists (`combat-hitflash`); no arena-level shake or elimination flash. Still open. |
| 6.3 | Carousel is a list, not a carousel | CODE | TFT's shared draft is a rotating ring you physically walk to. Ours is a picker. Large CODE item, strong identity win. |
| 6.4 | No sound design for the arena | ART | Ambient bed, impact layers, UI ticks. We have some SFX. |

## 7. Blocked on a decision

| # | Item | Tag |
|---|---|---|
| 7.1 | **Flagship roster theme** | **DESIGN** — gates every ART row above |
| 7.2 | 2D stylised vs full 3D (R3F) renderer | DESIGN — spike is green; see `/lab/arena3d` |
| 7.3 | Whether the Pokémon pack stays built-in or moves to side-load | DESIGN — see `PACK-STRATEGY.md` |

---

## Recommended order (revised 2026-11-24)

Four of the five items the original order recommended have shipped. What is
left, in order:

**Do now (CODE, no decision needed):**

1. **6.3 carousel as a real rotating ring** — now the largest remaining CODE
   item and the strongest identity win left that needs no art.
2. **4.4 last-round / next opponent markers** and **4.2 trait-row portraits** —
   cheap scouting legibility, both still open.
3. **6.2 arena-level reactions** — shake on a big hit, flash on elimination.
   The per-unit flash already exists to build on.
4. **3.3 crit treatment** and **5.3 louder star-up preview** — small passes.
5. **4.5 top-bar density** and **1.5 enemy ghost-hex weight** — judgement calls,
   best made side by side with the reference.

**Then decide 7.1**, which unblocks every ART row at once. This is unchanged and
is now the single largest blocker in the document: the CODE queue above is
mostly small items, while the ART queue is the whole remaining visual distance.

**Do not** spend more on arena CSS dressing (1.2, 1.3) if the R3F path is taken
— that work is replaced by the renderer. Everything in sections 3–5 survives
either way, because it's HUD and game logic rather than board rendering.

> Note on 2.1–2.3: these remain tagged ART, but the model measurement in
> `POSE-REVIEW.md` (89% of assets carry no animation clips) means they are not
> reachable from the current asset source at all. They are blocked on the
> roster decision *and* on an asset source, not on the renderer, which works.
