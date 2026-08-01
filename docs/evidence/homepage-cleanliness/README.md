# Homepage cleanliness — before and after

Crops from `public/assets/zone/zone_parlor_shell.png`, at **4× nearest-neighbour**
so the pixel structure is visible. `before` is the shell as it stood at `f79290a`;
`after` is the same rectangle once `scripts/clean-parlor-surfaces.ts` has run.

| File | Rectangle | What changed |
|---|---|---|
| `board-before.png` / `board-after.png` | the Tonight board, x 55-185 y 77-176 | The face was a dithered vignette across three amber values — `amber-mid` at the edges through `yellow-cheese` to `amber-glow` — with the dithering heaviest exactly where the board's two lines of text sit. It is flat `paper-white` with a two-unit `paper-mid` shadow on the top and left inner edges and a one-unit line on the bottom and right. The hand-painted frame is untouched, and is now a **hole** in the despeckle's rectangle. |
| `behind-tony-before.png` / `behind-tony-after.png` | the oven alcove, x 50-159 y 165-264 | Scattered near-black singles across a brown checker — 777 of them in the alcove alone, which is the *"burnt, scratchy"* wall. Despeckled (strictly lone pixels, to a fixed point), then the lit tile taken down one value step so the recess reads as a recess rather than as a mid-value pattern at Tony's own value. |

**Full-room captures** at 390 / 375 / 360 are the `tony-steady` state in the
visual-QA artifacts — the homepage photographed **after** the arrival's reveal has
come and gone, which is the moment the clipping report was about and a moment no
capture in this driver had ever taken.

The reasoning, the mechanism chosen per surface, and the proof that the timed
regression fails on the old behaviour: `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9`.
