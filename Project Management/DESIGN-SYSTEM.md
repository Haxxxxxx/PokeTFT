# Design system

The short version: **use the primitives, don't re-fork them.** This file exists
because the system was written once, never adopted, and the app spent a long
time looking like several apps.

## What went wrong the first time

`globals.css` has defined `--gold`, `.panel`, `.btn-primary` and `.btn-ghost`
for a long time. An audit found:

| | audit (2026-11-10) | now (2026-11-24) |
|---|---|---|
| `<button>` elements | 140 | **144** |
| …using the `<Button>` primitive | 2 | **1** |
| …using `.btn-primary` / `.btn-ghost` | 2 / 0 | 4 (combined) |
| `gold-*` token referenced from a component | **0** | **274** |
| …stand-ins (`amber-*` / `yellow-*`) | 252 | **4** |
| named z-layer uses | 0 | **30** |
| raw z-index numbers | 13 | **3** |
| distinct text sizes | 19 | 17 |
| distinct hardcoded hex colours | 136 | 134 |

Re-measured 2026-11-24 with the same kind of grep that produced the original
audit. Two of the four migrations landed; two did not. See **Where this stands**
below — the numbers are the point of this file, so they are kept current rather
than left as a snapshot of the day it was written.

Nothing here was carelessness. Each one is a reasonable local decision — the
token wasn't reachable as a class, so a close-enough Tailwind colour went in
instead; the dialog needed a backdrop, so a backdrop got typed. The failure is
that nothing made the shared thing the easier thing.

So the rule is not "be disciplined". It's: **if you find yourself typing a
backdrop, a button's padding, or a z-index number, the primitive is missing a
prop — add the prop.**

## Colour

One gold. `--color-gold-50 … --color-gold-950`, used as `text-gold-300`,
`bg-gold-500`, `border-gold-300/55`.

The ramp passes through the brand values that already existed, so
`text-gold-300` is exactly `.text-gold`, not an approximation:

| step | hex | was |
|---|---|---|
| `gold-200` | `#f4e3a1` | the light stop of `.gild-text` |
| `gold-300` | `#e7c66b` | `--gold-bright` |
| `gold-500` | `#d4af37` | `--gold` — the brand |
| `gold-700` | `#8a6d1f` | `--gold-dim` |

**Do not use `amber-*` or `yellow-*`.** They are a hotter, more orange colour
than the brand gold, and mixing them is why the same "gold" looked different on
different screens. Other Tailwind hues (`emerald`, `rose`, `sky`, `violet`) are
fine — they carry meaning (good / bad / info / special) rather than brand.

## Stacking

Never write a z-index number. Use a named layer:

| class | z | for |
|---|---|---|
| `z-screen` | 50 | full-screen takeovers, in-match HUD chrome |
| `z-panel` | 60 | popovers and slide-overs anchored to a screen |
| `z-modal` | 80 | dialogs |
| `z-tooltip` | 90 | tooltips — must clear the dialog they explain |
| `z-overlay` | 100 | blocking state: orientation gate, boot veil |
| `z-toast` | 140 | transient notices — must be readable over a block |
| `z-gate` | 200 | auth gate |

The order is a claim about the product, not a convenience. If a new thing does
not fit a layer, add a layer with a comment saying what it is for — don't pick
a number between two of these.

## Dialogs

`<Modal>` (`src/components/ui/Modal.tsx`). It handles the backdrop, Escape,
`role="dialog"`/`aria-modal`, focus-in on open and focus-restore on close.

```tsx
<Modal onClose={close} label="Ranks" title="Ranks & how to climb" icon={<TrendingUp size={18} />}>
  …
</Modal>
```

`label` is required because a dialog with no accessible name is unusable on a
screen reader, and 7 of the 9 originals had none.

**It portals to `document.body`, and that is load-bearing.** A `fixed inset-0`
overlay is trapped inside the local stacking context of any ancestor carrying a
CSS `transform`. The match renders inside `.tft-shell`, which is scaled by a
transform, so a dialog opened from in-match is confined to that box and gets
painted over by anything rendered outside it — whatever z-index it claims.
`RecipeBook` hit this, diagnosed it, and fixed it for itself with a portal;
every other in-match dialog had the same latent bug. Portaling in the primitive
is what stops that from being a bug each component has to rediscover.

Use `padded={false}` when content bleeds to the edge, `surface="gilded"` for
the heavier in-match frame, `size="sm" | "md" | "lg"`.

## Buttons

`<Button>` (`src/components/ui/Button.tsx`). Four variants, which are what the
140 hand-written buttons already clustered into:

- `primary` — the single affirmative action on a screen. Brand gold.
- `ghost` — everything secondary. The default.
- `danger` — destructive or exit. Neutral at rest, red on hover, so it is not
  alarming until you are actually on it.
- `subtle` — bare text or icon, no chrome. Replaces the four different close-X
  spellings.

Sizes `sm | md | lg`. It carries a visible focus ring, which almost none of the
originals had.

## Where this stands (2026-11-24)

Tracked honestly rather than quietly.

### Landed

**Colour.** The one-gold rule took. `amber-*`/`yellow-*` went 252 → 4 and the
gold ramp went 0 → 274 uses. The "same gold looked different on different
screens" problem is gone.

**Stacking.** Named layers went 0 → 30 and raw z-index numbers 13 → 3. New
work reaches for `z-panel` before it reaches for a number, which is what the
layer table was for.

### Did not land

**Buttons — and this is the file's own failure mode repeating.** There are
**144** raw `<button>` elements. `<Button>` is imported in exactly one file
(`NetGameClient.tsx`) and rendered **once**. That is fewer adopters than the
original audit found for `.btn-primary`, against four *more* raw buttons.

The primitive is good; nothing is wrong with it. It is simply not the easier
thing to type, which is precisely the diagnosis at the top of this file. Before
migrating another screen, answer why one usage in two weeks: if the honest
answer is that `<button className="...">` is faster for the in-match HUD, then
either the primitive needs the props that make it faster, or it should be
scoped to screens outside the match and said so here. **One usage against 144
is worse than either committing or deleting.**

**Modal — half adopted.** Five files use it. Thirteen still hand-roll
`fixed inset-0`. Some of those are correctly not dialogs (`OrientationGate`,
`CombatStage`, `Arena3D`), but the three called out when this file was written
— `HowToPlay`, `LobbyScreen`'s rules slide-over, `CoopPanel`'s anchored
popover — are all still off-primitive and still want the props named below.

### Untouched

- The type scale is still 17 sizes (from 19). It wants to be about 7, and still
  needs a decision about the in-match HUD, which legitimately uses very small
  text.
- 134 hardcoded hex values remain (from 136), mostly legitimate data-driven
  colours (type colours, rarity, rank tiers). Worth separating those from the
  incidental ones before touching any.

### The rule that follows from all of this

The two migrations that succeeded were the ones where the shared thing was
reachable as a class you could type in place of what you were already typing
(`text-gold-300` for `text-amber-300`, `z-panel` for `z-[60]`). The two that
stalled both require changing the *shape* of the call — importing a component
and rewriting its props.

So: **prefer primitives that are drop-in substitutions at the point of use.**
Where a component primitive is genuinely needed, expect adoption to need a
scheduled migration, not goodwill.
