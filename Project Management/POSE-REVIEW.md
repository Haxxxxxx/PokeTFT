# 3D model pose review — state and worklist

> Started 2026-11-09. The baked map had 3 of 967 species reviewed, one at a
> time through `/lab/model-poses`. At that rate the review is the thing that
> gates models-by-default, so the first job was making it not require 967
> individual judgements.

## What changed

### Facing is now a default, not 967 decisions

Every reviewed entry that set a rotation set **exactly the same one**:
`[0, -34°, 0]`. Models arrive from the asset pipeline facing straight down the
camera axis — a mugshot — while the sprites they sit beside are all
three-quarter views. That is a property of the whole asset set, not of any
species.

`DEFAULT_MODEL_ROTATION` in `src/game/data/model-poses.ts` now supplies it, so
all 967 get the correct facing without anyone typing the number again. A
species that genuinely needs a different angle still overrides it.

Scyther (123) was reviewed with bone corrections only, which implicitly
accepted rotation zero, so it is now pinned to `[0, 0, 0]` explicitly — without
that it would have silently inherited the new default and changed an
already-reviewed stance.

### Review is now batched, not one at a time

`/lab/model-sheet?from=1&count=12&yaw=0` renders a page of models beside their
own sprites at a fixed camera, and `tools/model-sheet.mjs` screenshots pages of
it. The single-model lab is the right tool for *fixing* a stance; it is the
wrong one for deciding which stances are even broken.

`yaw` orbits the camera for the whole page, which is how the facing problem was
identified as systematic rather than per-species in the first place.

**The sheet caps at 12 models.** Each cell is its own WebGL context and browsers
evict the OLDEST once a page passes roughly 16 — at 24 per sheet the first eight
cells silently blanked, which is indistinguishable from eight broken models.

## Worklist

Reviewed so far: **dex 1–49**. Of those, 40 render correctly at the new default
and need no entry. The rest:

### Orientation — standing vertically, should be horizontal
| Dex | Species | Note |
|---|---|---|
| 10 | Caterpie | Stands on its tail end; needs an X rotation |
| 13 | Weedle | Same |
| 24 | Arbok | Thin vertical column, same family of problem as Ekans (23), which is already excluded as an unusable straight mesh |

### Scale — renders far too large for its frame, cropped
| Dex | Species |
|---|---|
| 19 | Rattata |
| 20 | Raticate |
| 25 | Pikachu |
| 26 | Raichu |
| 38 | Ninetales |
| 46 | Paras |

**Not yet explained, and NOT a per-species pose problem.** `UnitModel`
normalises height to `MODEL_TARGET_HEIGHT` then clamps width via the optional
`fitToWidth`, recentres X/Z and sits the model on Y=0 — logic that reads
correctly. Passing `fitToWidth` (as the in-game preview does, and as the pose
lab does NOT) did not fix these. The likely cause is bounds being measured in
the rest pose before an idle animation spreads the model past them, but that is
a hypothesis, not a finding. Worth chasing as one bug rather than six pose
entries, because a fix would apply to every affected species at once.

Note the lab/game mismatch found along the way: `/lab/model-poses` omits
`fitToWidth`, so it shows models **wider** than the game renders them. Poses
judged there may not match what ships.

## Next pass

1. Chase the scale anomaly as a single bug before adding any pose entries for
   it — six species are already symptomatic in the first 49.
2. Sweep dex 50–1025 with `tools/model-sheet.mjs` (about 80 sheets at 12 each)
   and extend the worklist. Only the flagged species need the editor.
3. The orientation cases are genuine per-species work for `/lab/model-poses`.

## Incidental find

The sheet put every model beside its sprite, which surfaced **52 missing sprite
files** — 66 roster entries across 22 playable species (Hitmonchan, Bellossom,
Politoed, Slowking, Hitmontop, Cascoon, Dustox and more) had **no sprite at
all** and rendered as a broken image in the shop, on the board and in combat.
Nothing caught it because a 404 on an `<img>` is silent apart from a console
line. Fixed, with `tools/fetch-sprites.mjs` to keep it fixed.
