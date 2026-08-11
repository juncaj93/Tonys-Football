# The T-shirt prototype — round 3, registered 2026-08-11

**`avatar_body_starter_04` is the first painted build in the product.** The other
five tops still draw themselves and a manager wearing one cannot tell.

It passed with **`--fit`**: rescaled `0.952×` and moved 6 rows down, a
normalisation of placement only, reported in full at ingest. Unfitted it misses
the shoulder band by six rows and fails nothing else.

| File | What it shows |
|---|---|
| `drawn-vs-painted.png` | the same manager, drawn hoodie against painted T-shirt |
| `prototype-preview.png` | four managers from **one** file — four skin tones, four shirt colours, resolved at render time |
| `room-390.png` · `room-375.png` · `room-360.png` | the storeroom at each phone width |
| `room-closeup.png` | device-pixel scale, for the head-to-body join |
| `avatar_body_starter_04-mask.png` | what `art:mask` wrote as its own preview |
| `diag-mask.png` | **round 2**, kept for the record — the delivery that missed by 18 rows |

## Two things these pictures make obvious

**The head is now the weakest thing in the frame.** It is still the *drawn* plate,
because painting it is not authorised. Against a painted body it is flat, and it
is what a viewer's eye goes to.

**`lib/character/shading.test.ts` is red**, and deliberately left that way. The
composite has 55 pixels of enclosed empty space: the gap under the bent arm and
the gap beside the hanging hand. **Both are correct** — they are outlined negative
space, and they are what makes the pose read as a pose. The rule they trip was
written for a *drawn* figure, where every enclosed gap was a bug and it caught two
real ones. It is in direct conflict with commissioner ruling R2, which grants a
build its own pose: an asymmetric figure with an arm away from the body cannot
have zero enclosed negative space.

That is a ruling to make, not a test to quietly edit. `docs/MANAGER_BUILD_PROTOTYPE.md §10`.
