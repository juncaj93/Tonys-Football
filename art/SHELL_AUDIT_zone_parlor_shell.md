# Shell Audit — `zone_parlor_shell.png` (candidate 1)

**Source presented:** 941 × 1672 · **Proposed production canvas:** 960 × 1707
**Status:** audit only. Not processed, not registered, not integrated.

---

## 0. What this audit could and could not check

**Two things were unavailable, and both limit what follows.**

1. **The Option C shell requirements are not in this repository.** `grep` over every
   markdown file finds no "Option C", no prepared-shell plan, and no revised
   environmental-composition ruling. §1 below therefore audits the candidate against
   the requirements that *are* canonical — `art/ART_SPEC.md`, the asset pipeline, and
   the navigation map — and cannot confirm conformance to a document it has not seen.

2. **The image file is not on disk.** It was pasted into the conversation, so every
   coordinate in §7 and §9 is **read by eye at display scale**, tolerance roughly
   **±3 logical units** (±9 source px). They are good enough to plan overlays against
   and not good enough to trace polygons from. Drop the PNG into `art/incoming/` and
   the numbers can be tightened to the pixel and machine-checked.

Everything in §2–§6 and §8 is arithmetic or measured off the existing same-generator
source, and is exact.

---

## 1. Against the requirements that are canonical

| Requirement | Source | Result |
|---|---|---|
| Shallow stage box, floor visible, gentle recession | `zone_tile.md` FAMILY | **Pass.** Floor reads clearly, back wall parallel, no aggressive vanishing point. |
| Front ground line clear for composited sprites | `zone_tile.md` | **Pass.** The bottom carpet band is unobstructed. |
| Flat front-facing sprite must look right standing on it | `zone_tile.md` | **Pass.** Floor angle is shallow. |
| Outer ~16px of left/right edges free of load-bearing content | `zone_tile.md` | **Pass on the left** (wall panelling only). **Marginal on the right** — the booths and the window run to the edge, so a right-edge crop loses booth seating. Not load-bearing for navigation. |
| Warm overhead light, no rim light | `_style_preamble` | **Pass.** Consistent with `character_tony_neutral`. |
| Text surfaces blank | `surface.md` | **Pass.** Every prepared surface — the large panel, the slate, the receipt — is clean. No lettering anywhere in frame. This is the family's most common failure mode and this candidate avoids it. |

**Improvements over the shipped room, confirmed:** the floor is calmer, the rug is a
single readable shape rather than competing checker, and — the important one — the
back wall now carries *prepared, blank* fixtures instead of a painted mural that
nothing could be mounted on.

---

## 2. Composition at iPhone portrait

The parlor is anchored: the room is pinned to the top of a `100dvh` screen under a
44px utility bar, so **the bottom of the drawing is always cut off**. How much:

| Device | Room renders at | Visible after the 44px bar | Logical y visible |
|---|---|---|---|
| iPhone 14 (390 × 664) | 693 px tall | 620 px | **0 – 509** |
| iPhone SE (375 × 667) | 667 px tall | 623 px | 0 – 532 |
| iPhone 12 mini (375 × 629) | 667 px tall | 585 px | 0 – 499 |

**Worst case is logical y = 499.** Everything interactive must sit above it.

This candidate handles that well by accident or design: the bottom ~80 logical units
are plain carpet, which is exactly the right thing to lose. Every prepared location
read in §7 sits above y = 316. **Nothing is at risk of falling below the fold.**

The lowest interactive element — the receipt at y ≈ 307 — clears the worst-case fold
by 192 logical units. There is a lot of headroom here.

---

## 3–6. Can 941 × 1672 become 960 × 1707 safely?

### The short answer: don't do this conversion at all. It is a step backwards.

**960 × 1707 is exactly 3 × the logical 320 × 569 space.** (320×3 = 960, 569×3 = 1707.)
That is the only reason that canvas is interesting — and it means the *correct* way to
produce it is not by resampling the source.

### What the pipeline actually does

`scripts/process-art.ts` **downscales, nearest-neighbour only**, to the declared
canvas, then quantizes to `palette.json`. The shipped room went
`941 × 1672 → 320 × 291 + 320 × 278`. The browser then upscales with
`image-rendering: pixelated`.

So the source's entire job is **to be downsampled once**. Upscaling it 1.02× first
adds one lossy resample for zero information gain, then throws the result away in a
2.94× downscale. Strictly worse than doing nothing.

### Is there a pixel grid to protect?

I measured the existing 941 × 1672 source — same generator, same dimensions — for
column-edge periodicity:

```
lag 1  1.000   lag 4  0.274   lag 7  0.137   lag 10  0.109
lag 2  0.850   lag 5  0.191   lag 8  0.181   lag 11  0.095
lag 3  0.474   lag 6  0.166   lag 9  0.072   lag 12  0.086
```

Monotonic decay, **no peak at any lag**. There is no pixel grid in the source — it is
a smooth high-resolution painting *in the style of* pixel art, exactly as
`process-art.ts` documents. The grid is created by the pipeline's downscale, not
carried by the source.

**Consequence:** the 941 → 960 upscale would not shatter a pixel grid, because there
isn't one. It would just be a pointless lossy step.

### The three options, ranked

**1 — Recommended: leave the source at 941 × 1672 and change nothing.**
Run it through the existing pipeline to the declared canvas. If a 3× production PNG is
wanted for review or for a non-`pixelated` context, generate it by
**nearest-neighbour ×3 from the 320 × 569 output** — exact, lossless, no interpolation,
and guaranteed to match what the browser renders.

**2 — Acceptable if 960 × 1707 must exist as a source: pad, never stretch.**
Uniform scaling gives 960 × 1705.76 or 960.70 × 1707 — neither lands. So instead:
scale by the **width** ratio 960/941 with Lanczos to 960 × 1706, then **pad one row of
edge-replicated carpet at the bottom** to reach 1707. The pad lands in the dark carpet
band that no phone displays. Do **not** scale by the height ratio: that needs a 1px
crop off the width, and the right edge is where the booths are.

**3 — Not recommended: force 941 × 1672 → 960 × 1707 directly.**
This is a non-uniform scale. The distortion is only **0.073% horizontal** — about
0.2 px across the full width, genuinely invisible — so it is not a *distortion*
problem. It is a pointless-resample problem, same as option 2 but without the excuse.

### Is regeneration at 960 × 1707 materially better?

**No. It is a small win, and not worth a regeneration on its own.**

The honest case for it: 960/320 = **3.0000 exactly**, whereas 941/320 = **2.9406**.
Under nearest-neighbour downscaling a non-integer ratio makes the sampled pixel drift
across each output block, which can put a one-pixel jitter into thin high-contrast
details — the rail above the panel, the chalkboard's inner frame moulding. At 3.0000
every output pixel samples a fixed position in an exact 3 × 3 block, and thin details
come down cleanly.

The case against: the shipped room came down the identical 2.94 path and looks
correct at every size screenshotted this session. The artefact is real but small.

**Recommendation:** ship this candidate at 941 × 1672. If it later goes back for a
revision on artistic grounds, ask for 960 × 1707 *then* — free at that point. Do not
spend a regeneration cycle on the ratio alone.

---

## 7 & 9. Prepared locations — placement map

Logical 320 × 569 space. `x, y, w, h`. **By eye, ±3 units** (see §0).
Conversion used: logical = source × 0.340.

| # | Prepared location | Reading | Logical `x, y, w, h` | Kind |
|---|---|---|---|---|
| 1 | **Trophy banners** | the rail above the large panel | `56, 64, 128, 7` | Door → `/timeline` |
| 2 | **Tonight board** | the large blank cream framed panel | `52, 77, 131, 98` | Display |
| 3 | **Prediction chalkboard** | dark slate in the ornate frame | `154, 184, 38, 60` | Display |
| 4 | **Newspaper rack** | *no rack in frame* — see §10 | — | Door → `/slice` |
| 5 | **Display case** | glass-topped case set into the counter | `155, 284, 100, 25` | Door → `/collection` |
| 6 | **Basement door** | the closed wooden door, back wall | `203, 122, 42, 126` | Door, locked |
| 7 | **Underground / Casino** | *no second door in frame* — see §10 | — | Door, locked |
| 8 | **Receipt** | the paper lying on the counter, left | `84, 293, 25, 14` | Display |
| 9 | **Tony's standing position** | see §8 | `62, 173, 72, 111` visible | Toy |

Supporting geometry, same space:

| Feature | Logical |
|---|---|
| Recessed checkered alcove + shelf | `54, 185, 91, 68` |
| Tall arched nook, far left | `6, 182, 46, 104` |
| Counter top — back edge | **y = 284** |
| Counter top — front edge | y = 316 |
| Counter front panel | `0, 316, 320, 72` |
| Floor rug | `71, 395, 149, 57` |
| Booths, right | `248, 200, 72, 93` |
| Bottom carpet band | `0, 490, 320, 79` |
| **Worst-case phone fold** | **y = 499** |

### Hit-target check

Three prepared locations are **under the 44-unit minimum** in one dimension and will
need their polygons padded, exactly as the Tonight board was on the shipped room:

- **Trophy banner rail** — 7 units tall. Pad to ≥44 vertically, or trace the banners
  themselves once they are generated (they will hang well below the rail, which
  probably solves it outright).
- **Prediction chalkboard** — 38 units wide. Pad to 44, centred.
- **Receipt** — 25 × 14. Needs padding on both axes. It sits on open counter with
  nothing within 45 units, so padding is safe here.

---

## 8. Room for Tony and the foreground layer

**Yes, and the fit is almost exact.**

Cut the shell at **logical y = 284** — the counter top's back edge, which is also the
top edge of the display case.

```
  rear layer    logical y   0 – 284    (source y   0 –  835)
  Tony                      drawn between
  front layer   logical y 284 – 569    (source y 835 – 1672)
```

That cut puts the counter top, the display case, the receipt, the counter front, the
rug and the carpet all **in front of** Tony — correct, since he stands behind the
counter and the case sits on it between him and the viewer.

**Tony's visible band: y 173 → 284 = 111 logical units.**
On the shipped room it is 291 − 179 = **112 units**. Within one unit of identical, so
`character_tony_neutral` transfers at its current scale with no re-authoring.

### But his position is constrained to one lane

Tony is 72 units wide. Laid over the back wall, the free columns are:

- `x 6–52` — the arched nook (scenery)
- `x 54–145` — the recessed alcove (scenery)
- `x 154–192` — **chalkboard** (prepared)
- `x 203–245` — **basement door** (prepared)
- `x 52–183` — **Tonight board** (prepared), y 77–175
- `x 248–320` — booths (scenery)

The gap between the Tonight board's right edge (183) and the door's left edge (203) is
**20 units** — too narrow. So Tony must stand over scenery, and the only 72-wide
scenery column is the alcove.

**Recommended: `x 62, y 173, w 72, h 111` visible** — Tony centred on the recessed
alcove, head finishing at y 173, two units clear of the Tonight board's bottom edge at
175. That leaves the chalkboard, the basement door, the display case and the receipt
completely unobstructed.

This works **only if the recessed checkered alcove is scenery.** If the revised ruling
intends it as a prepared location, Tony has nowhere to stand and the shell needs a
clear standing lane added.

---

## 10. Flagged before any Door asset is generated

**Blocking — two named destinations have no prepared location:**

1. **The Underground / Casino entrance is absent.** There is exactly **one** door in
   the back wall. The map needs two locked doors (basement → Rooms, and
   Underground/Casino), and they must be visually distinct because they behave
   differently. As drawn, one of them cannot be placed. *Note: the casino is Phase 10
   and explicitly not in v1 (`16 §Approved Scope`) — but its entrance being visible
   and locked is a composition decision, so this needs resolving now rather than in P10.*

2. **The newspaper rack is absent.** There is no rack, and nothing in frame reasonably
   stands in for one. The arched nook at far left is a built-in cabinet, not a rack; it
   is also 46 units wide against a 44-unit minimum, leaving no margin. **`/slice` still
   has no room entrance.**

**Ambiguous — needs a ruling before overlays are traced:**

3. **Is the rail the trophy-banner location, or a curtain rod for the panel below it?**
   It reads as either. If it is the banner rail, the banners hang *over* the top of the
   Tonight board and the two overlap — which changes both polygons.

4. **Is the large blank panel the Tonight board or the menu board?** I have assigned it
   to Tonight because Tonight is in v1 and the menu board is not. If that is wrong,
   Tonight has no home and the chalkboard would have to carry it, which collides with
   the prediction chalkboard.

5. **Is the recessed alcove scenery?** §8 depends on it. If it becomes a prepared
   location, Tony has no standing lane.

6. **Which door is the basement?** Only one exists, so whichever it is assigned to, the
   other is unplaced.

**Non-blocking:**

7. The right edge carries booths and window to the frame boundary, against
   `zone_tile.md`'s ~16px safe-edge guidance. Nothing navigational is there, so a
   right-edge crop is survivable — but it is a deviation worth recording.

---

## Bottom line

The shell is **materially better than what shipped** and I would build on it. It
supports **6 of the 9** objects the navigation map needs — Tonight, the chalkboard,
the display case, one locked door, the receipt, and Tony's position — against **1 of 9**
today.

**It does not yet close the gap.** The newspaper rack and the second locked door are
still missing, so `/slice` remains unreachable from the room and the Underground has no
entrance. Those two need adding to the shell — or an explicit decision that they arrive
as separate transparent overlays composited over it.

**On the canvas: keep 941 × 1672, do not resample.** The 960 × 1707 figure is right
about one thing — it is exactly 3× the logical space — but that makes it the correct
*output* of the pipeline, not the correct input to it.
