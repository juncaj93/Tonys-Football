# The championship shelf

`item_championship_ring` has been in the asset registry since M2, marked
**earned, never pulled** and excluded from the loot box — the only acquisition
path the product had. Nothing granted it. It was an item that could not be
obtained, and its `systemLayer` flag was parsed by the registry and read by
nothing.

These are the three states of the shelf that now earns it.

| file | state |
|---|---|
| `rings-none-<width>.png` | no titles won — what almost every manager sees |
| `rings-one-<width>.png` | a single championship |
| `rings-many-<width>.png` | a repeat champion, one plate per season |

390 / 375 / 360, device resolution (deviceScaleFactor 3), photographed as the
`[data-championships]` element rather than the viewport, because the shelf sits
above the twenty-four slots and a viewport shot at 360 crops it.

## What the pictures are showing

The **year leads, at headline size**. One ring asset serves every championship
forever — `art/assets.inventory.json` says so directly: *"the season year is
rendered as text at runtime, so one asset serves every championship"* — so the
year is the only thing that tells two titles apart. It is the name of the thing,
not its metadata, and `rings-many` is the state that proves it: two plates,
identical art, distinguishable only by 2017 and 2018.

The ring art itself is the compact placeholder. Real art is a registry row, never
a code change.

## The empty state does not pretend there is a chase

No locked silhouettes, no `0 of 1`, no progress. You win a season or you do not,
and a row of greyed placeholders would imply something to grind toward —
`16 §8`'s explicit non-goals include achievements, levels and streaks.

## A defect these caught that every gate passed

The first version rendered the ring with a bare `AssetView`, which falls back to
`PlaceholderSign` — the taped-up card built for a wall, with `min-h-24`. Inside a
46px box the min-height wins, the slug wraps to four lines, and the label spilled
over the paragraph beneath it.

**Typecheck, lint, 1,379 tests and the whole 92-state visual sweep passed that
version.** Nothing measures "this element is legible": the type floor reads
computed sizes and the placeholder's text is a compliant 13px. It took looking at
the picture, which is the entire argument for the screenshot loop.

The fix is `compact placeholder="collectible"` — exactly what the twenty-four
slots below already pass, and exactly the case `PlaceholderObject` was written
for when `object_box_owned` first rendered at object scale.

## Regenerating

Apply each demo state, sign in through its door, and photograph the
`[data-championships]` element at each width. The demo years (2017, 2018, 2019)
sit outside the imported league on purpose, so a demo can never be mistaken for
a season that actually happened.
