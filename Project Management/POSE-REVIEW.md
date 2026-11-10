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

---

# The assets are not animated (measured 2026-11-10)

Reported from play with models ON: *"lots of sliding"* and *"picking actions
are fucked"* for most mons. Neither is a renderer bug.

`tools/model-clip-stats.mjs` reads each model's glTF JSON chunk (a range
request, not the whole file) and runs the SAME clip matchers `UnitModel` uses,
so the numbers are what the game actually finds at runtime. Sampling every 16th
National Dex entry, 62 models:

| | share of models |
|---|---|
| **No animation clips at all** | **89%** |
| Has a usable idle clip | 6% |
| **Has an attack clip** | **2%** |
| **Has walk/run (what would stop sliding)** | **2%** |
| No skeleton at all — cannot even be posed | 34% |

So: actions look broken for most mons because **98% have no attack animation**,
and units slide because **98% have no walk clip**. Both complaints are the
asset set, not the code.

The clip matchers themselves are fine. Where clips DO exist they are found —
Mewtwo (150) ships the full official set (71 clips: `battlewait01_loop`,
`walk01_loop`, `attack01`, `rangeattack01`, `damage01`…) and matches cleanly.
The set is just wildly inconsistent: a handful are fully animated, a few carry
one odd clip (Pikachu has exactly one, `Impactrueno`; Charizard one,
`Chariard_dizzy`), Bulbasaur uses an older naming convention
(`001aidle`/`001fight_b`/`001walk`), and the overwhelming majority are static
meshes.

Checked for a richer source: the upstream repo has only `models/opt`, whose
subdirectories are FORM variants (alolan, mega, galar, gmax…), not animation
variants. There is no unoptimised animated set to switch to.

## What this means for the plan above

The pose worklist is still valid but smaller in scope than it looked:
**34% of models have no skeleton**, so they can only ever be re-oriented, never
posed bone by bone — the pose editor cannot help them.

More importantly, "animated 3D units" is not reachable from this asset source.
The realistic options are:

1. **Keep sprites as the default.** They are complete for all 1,025, and a
   sprite that lunges reads better than a static mesh that glides.
2. **Ship models as deliberately static figures**, leaning on the existing
   procedural motion (idle bob, attack lunge) for everything. This is the only
   lever that reaches the 89%, since it needs no clips at all. It will never
   look animated, but it would stop reading as broken.
3. **Change asset source.** Nothing comparable with animations is known to be
   freely available for this roster.

This is a product decision, not an engineering one, and it is why models remain
behind `settings.models3d`.

---

# Decision: sprites stay the default (2026-11-10)

Taken after the animation measurement above. **Sprites remain the default
renderer for all 1,025 units; 3D models stay opt-in behind
`settings.models3d`.**

Why, in one line: a sprite that lunges reads better than a static mesh that
glides, and 89% of the models are static meshes.

What this closes:
- The pose review is **no longer on the critical path**. It only matters if
  models are ever promoted, and the ceiling on that is now known to be low.
  The worklist and tooling stay for whoever picks it up — including the fact
  that 34% of models have no skeleton and can never be posed.
- The scale anomaly (Rattata/Pikachu/Ninetales/Paras rendering oversized)
  drops to low priority for the same reason. It is still a real bug and still
  worth one investigation rather than six pose entries, but nothing ships on it.

What this does NOT change:
- The model pipeline stays in the tree and keeps working behind the toggle. It
  is a complete piece of work, it cost nothing to keep, and the measurement
  that makes it opt-in is about the ASSETS, not the code.
- Sprites are now complete for the whole roster (the 52 missing files were
  fixed), so the default path has no gaps.

If this is ever revisited, the thing that would change the answer is a source
of animated models for this roster. `tools/model-clip-stats.mjs` re-measures
coverage against any source in a couple of minutes.
