# Design system

The short version: **use the primitives, don't re-fork them.** This file exists
because the system was written once, never adopted, and the app spent a long
time looking like several apps.

## What went wrong the first time

`globals.css` has defined `--gold`, `.panel`, `.btn-primary` and `.btn-ghost`
for a long time. An audit found:

| | |
|---|---|
| `<button>` elements | 140 |
| …using `.btn-primary` | 2 |
| …using `.btn-ghost` | **0** — written, never used once |
| `var(--gold)` referenced from a component | **0** |
| …stand-ins (`amber-*` / `yellow-*`) | 252 |
| `.panel` uses | 22 |
| …hand-rolled translucent surfaces | 95 |
| distinct text sizes | 19 |
| distinct z-index values | 13 |
| distinct hardcoded hex colours | 136 |

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

## Still to do

Tracked honestly rather than quietly:

- Most of the 140 buttons are not migrated yet. Do it screen by screen, not in
  one sweep — the sweep is how you ship a visual regression nobody reviewed.
- The type scale is still 19 sizes. It wants to be about 7. Needs a decision
  about the in-match HUD, which legitimately uses very small text.
- `HowToPlay` (custom hero header), `LobbyScreen`'s rules slide-over and
  `CoopPanel`'s anchored popover are not on `<Modal>`; the first two want new
  props, the third is a popover and probably wants its own primitive.
- 136 hardcoded hex values remain, mostly legitimate data-driven colours
  (type colours, rarity, rank tiers). Worth separating those from the
  incidental ones before touching any.
