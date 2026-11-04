# TFT parity — gap analysis

> Written 2026-11-04, comparing captured frames of our planning + combat views
> against TFT reference screenshots (planning, mid-drag, and a fight screen).
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
| 1.4 | No ambient motion | CODE | TFT's scene has drifting particles, water, subtle idle motion. Even a slow dust-mote layer would stop ours reading as a still image. |
| 1.5 | Enemy half ghost-hexes may still read thin | CODE | Currently a quiet outline. Needs a judgement call once seen beside the reference at the same size. |

## 2. Units

| # | Gap | Tag | Notes |
|---|---|---|---|
| 2.1 | **32px pixel sprites vs rigged 3D models** | **ART** | The defining difference. TFT champions are animated 3D models lit by the scene. No CSS treatment makes a 96×96 sprite (half of it transparent padding) read like that. Gates on the flagship roster. |
| 2.2 | No idle animation | ART | TFT units breathe, shift weight, face their target. Ours are static frames. The R3F spike proves per-unit idle animation is cheap **once models exist**. |
| 2.3 | No attack/cast animation | ART | We fake impact with a lunge + scale pop. TFT plays real wind-up and recovery. |
| 2.4 | Star tier shown as small stars | CODE | TFT draws a crown/star cluster above the unit with tier-coloured framing. Ours is a plain row of stars. |
| 2.5 | Held items not visible on board units | CODE | TFT shows item icons under the HP bar in combat. We show pips on the planning chip only. |

## 3. Combat presentation

| # | Gap | Tag | Notes |
|---|---|---|---|
| 3.1 | No ability-area indicators | CODE | TFT paints the hexes an ability will hit, in the ability's colour, before it lands. This is the *only* place TFT tints hexes — and it's a big part of why fights read. We have none. **Highest-value CODE item in this document.** |
| 3.2 | Opponent identity is thin | CODE | TFT shows the opponent's name and a strength bar at the top during a fight. We show "1 VS Wild Pokémon 1". |
| 3.3 | Damage numbers are plain | CODE | TFT styles crits/super-effective distinctly with scale and colour. We have some of this; it needs a pass. |
| 3.4 | No death animation | ART/CODE | We fade + grayscale. TFT plays a death animation and leaves the field clean. |
| 3.5 | HP bar vertical anchor is tuned, not derived | CODE | PokéAPI sprites have no consistent crown, so bar placement is a hand-tuned fraction of the tile. Goes away with real models (known pivot). |

## 4. HUD and rails

| # | Gap | Tag | Notes |
|---|---|---|---|
| 4.1 | Trait rail lacks the inactive block | CODE | TFT shows a "2+" tray of not-yet-active traits at the bottom of the rail. We hide them entirely. |
| 4.2 | Trait rows lack unit portraits | CODE | TFT shows which champions carry a trait inline. We have this in the hover card only. |
| 4.3 | Player rail lacks the trait flash | CODE | TFT shows each opponent's top trait icon beside their portrait — scouting at a glance. |
| 4.4 | No "last round opponent" marker | CODE | TFT marks who you just fought and who you're about to. We show the next opponent only. |
| 4.5 | Top bar is wider/sparser than TFT's | CODE | Our econ chips spread across the width; TFT groups tighter and gives the centre to the timer. |

## 5. Shop

| # | Gap | Tag | Notes |
|---|---|---|---|
| 5.1 | Card art is a sprite, not a portrait | **ART** | TFT cards carry a painted champion portrait bleeding off the card. Ours is a transparent sprite. Fixed sizing is solved; the asset isn't. |
| 5.2 | No "will complete a trait" highlight | CODE | TFT flags shop units that would activate or upgrade a synergy. We show the trait list but not the consequence. Strong gameplay value, not just cosmetic. |
| 5.3 | No star-up preview on cards | CODE | TFT indicates when buying would star-up a unit you hold. We show a `1/3` badge; it could be louder. |

## 6. Motion and feel

| # | Gap | Tag | Notes |
|---|---|---|---|
| 6.1 | Phase transitions are abrupt | CODE | TFT sweeps the camera and plays a transition into combat. Ours cuts. |
| 6.2 | No board-wide reactions | CODE | TFT shakes the arena on big hits, flashes on elimination. |
| 6.3 | Carousel is a list, not a carousel | CODE | TFT's shared draft is a rotating ring you physically walk to. Ours is a picker. Large CODE item, strong identity win. |
| 6.4 | No sound design for the arena | ART | Ambient bed, impact layers, UI ticks. We have some SFX. |

## 7. Blocked on a decision

| # | Item | Tag |
|---|---|---|
| 7.1 | **Flagship roster theme** | **DESIGN** — gates every ART row above |
| 7.2 | 2D stylised vs full 3D (R3F) renderer | DESIGN — spike is green; see `/lab/arena3d` |
| 7.3 | Whether the Pokémon pack stays built-in or moves to side-load | DESIGN — see `PACK-STRATEGY.md` |

---

## Recommended order

**Do now (CODE, no decision needed):**

1. **3.1 ability-area indicators** — the biggest readability win in the game, and the one thing TFT uses hex tinting for.
2. **5.2 "completes a trait" shop highlight** — gameplay value, not just looks.
3. **4.1 / 4.3** trait rail inactive tray + opponent trait flash — cheap, visibly TFT.
4. **1.4 ambient motion** — stops the arena reading as a still.
5. **3.2 opponent identity in combat.**

**Then decide 7.1**, which unblocks every ART row at once.

**Do not** spend more on arena CSS dressing (1.2, 1.3) if the R3F path is taken
— that work is replaced by the renderer. Everything in sections 3–5 survives
either way, because it's HUD and game logic rather than board rendering.
