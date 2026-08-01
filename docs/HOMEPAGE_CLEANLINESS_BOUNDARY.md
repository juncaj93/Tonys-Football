# Homepage visual cleanliness — the boundary

**Status:** commissioner direction, recorded 2026-08-01. **Not yet started.**

**Authority:** this is a standing commissioner ruling and sits at level 1 of
`AUTONOMY.md §1`, below only `docs/PRODUCT_DELIVERY_MANDATE.md` in the same tier.

**When it applies:** the next coherent homepage/parlor visual-polish slice, **or**
any slice that already touches Tony, the Tonight board, the homepage shell, room
rendering, or visual QA. It was explicitly recorded as **non-interrupting** — no
in-flight pull request or gate is to be stopped for it.

**What it does not need:** new art files from the commissioner. Every fix here is
available from CSS, compositing, the art pipeline, or a targeted regeneration of
one surface.

---

## 1. The clipping defect — Tony, several seconds in

**Observed hosted, by the commissioner:** Tony still clips briefly after the
homepage has been sitting for a few seconds.

### It is a separate defect from the hydration mismatch

PR #50 repaired a React `#418` structural hydration mismatch by making
`SpokenLine`'s DOM skeleton invariant. **Do not assume that fixed this.** They
share a surface and nothing else: `#418` is a server/client tree disagreement at
hydration, and this is a rendering artefact appearing **seconds after mount**,
long after hydration has settled. Treating the second as the first's residue is
how a real cause goes unlooked-for.

The hydration repair must remain intact — `spoken-line.test.tsx` compares element
skeletons and will fail if the resting branch is tidied back into one span.

### Where to look

A delayed, transient clip has a small number of plausible causes and they are
worth walking rather than guessing at:

| | |
|---|---|
| Tony idle animation | keyframes, and whether any frame moves the sprite outside its box |
| Transforms | `translate` values, fractional pixels, `transform-origin` |
| Sprite anchors | whether the drawn anchor matches `TONY` in `lib/parlor/objects.ts` |
| Ancestor `overflow` | any parent between the sprite and the room shell |
| Masks / clip paths | including anything the counter-front cut introduces |
| Delayed CSS classes | a class added on a timer, or on `arrived` |
| Speech transitions | the pad's entrance and dismissal, which run on their own timers |
| Compositing layers | promotion or demotion mid-animation |
| Fractional scaling | `w-full h-auto` against a non-integer container width |
| Image dimensions | the sprite's own canvas versus the box it is placed in |
| Delayed state | anything scheduled seconds after mount |

`lib/parlor/objects.ts` already records the geometry that matters: `TONY` at
`(64, 177) 72 × 197`, the sprite's own canvas at `88 × 240`, `COUNTER_EDGE` at
row 292, and the derived cut row. `tony-scale.test.ts` holds the aspect and the
cut. A change that moves either must fail there first.

### One screenshot is not evidence

The defect is transient. A single post-navigation capture cannot see it, and a
green sweep taken that way is the false green this repository has shipped three
times.

**The regression must be timed or frame-sequenced**, covering:

- the initial settled homepage
- the homepage after several seconds idle
- active idle-animation frames
- Tony speaking
- Tony after speaking
- a return visit
- at **390**, **375** and **360**

### Acceptance

1. Tony never crosses or is cut by unintended bounds
2. No body part is briefly cropped
3. No ancestor clips the sprite during idle or speech transitions
4. Every frame preserves the intended anchor
5. **The regression fails on the old behaviour** — a test that passes before and
   after has not tested the defect
6. The hydration repair remains intact

---

## 2. Standing direction — clean pixel art

The homepage contains surfaces that read as **burnt, scratchy, muddy or
painterly** rather than as clean, intentional pixel art. The named examples:

- the large Tonight board
- the wall or niche directly behind Tony
- some surrounding room surfaces
- parts of Tony where texture or scaling makes the sprite look dirty or smeared

### The target

Intentional pixel clusters · a controlled palette · crisp value separation ·
readable silhouettes · restrained texture · clear material definition · clean
text-bearing surfaces.

### What to avoid

Heavy mottling · random scratch overlays · soot-like or burnt texture · painterly
noise · muddy brown clusters · an *"AI-painted and then quantized"* appearance ·
noisy backgrounds competing with characters or text.

**Readability and intentional pixel structure take priority over preserving
unnecessary grunge.** Where the two conflict, the grunge loses.

---

## 3. The Tonight board

The board is a **presentation surface**, and its face is currently too noisy and
scratchy to be one.

- solid or nearly solid warm near-white / cream
- clearly separated from the darker frame
- very restrained pixel variation only
- no heavy mottling behind text
- no dirty, burnt or scratched centre field
- strong readability at actual iPhone size

**A mostly solid near-white or light cream panel is acceptable and likely
preferable.** It must not become sterile modern UI: keep the pixel-art frame and
the room's character, and keep the writing surface calm.

The board's geometry is already measured and must not be re-derived by eye —
`TONIGHT_CREAM` at `(61, 83) 119 × 88`, inset six units to `TONIGHT_FIELD`. That
measurement was got wrong once by reading a zoomed screenshot, and the note in
`objects.ts` records what it cost.

---

## 4. Behind Tony

The background directly behind him must not read as scorched, muddy or noisy.

Cleaner blocks of tone · reduced random scratch texture · clearer material read ·
stronger separation between Tony and the environment · fewer clusters competing
with his silhouette.

**Tony should read immediately and cleanly against the background.**

---

## 5. Tony himself

**Do not redesign him.** Preserved without exception: face · hairline · mustache ·
cigarette · jersey · apron · branding · body proportions · palette · character.

Clean up **only** where rendering, scaling, compositing or excess texture makes
him appear smeared, burnt or dirty. Maintain crisp nearest-neighbour scaling and
consistent sprite anchors.

---

## 6. Choosing the mechanism, and recording it

Each affected surface gets the **correct** fix, and which one was chosen is part
of the deliverable:

| Cause | Fix |
|---|---|
| Rendering | CSS, transforms, layering, `overflow`, animation |
| Source artwork | edit or regenerate **that surface**, targeted |
| Pipeline | fix the compositing or processing that introduces the noise |
| A simple surface | a deterministic replacement — the Tonight board face is the example |

**Do not cover a source-art defect with a fragile CSS patch.** Do not redraw the
whole parlor. Group the work into **one coherent, reviewable slice**.

---

## 7. Visual QA

At true display size, **390 · 375 · 360**, reviewing:

Tony at first load · Tony several seconds after load · Tony during idle motion ·
Tony speaking · Tony after speaking · the Tonight board with the **shortest and
longest** approved copy · contrast behind all text · the wall behind Tony · sprite
clipping · pixel scaling · texture density · foreground/background separation.

Static screenshots alone are insufficient for the clipping defect. Timed or
frame-sequence coverage is required.

---

## 8. The slice is complete only when

1. Tony no longer clips briefly after sitting on the homepage
2. The Tonight board reads as a clean near-white or cream writing surface
3. The wall behind Tony no longer reads as burnt, muddy or scratchy
4. Tony is cleanly separated from the environment
5. The room still feels like Tony's Pizza rather than generic flat UI
6. Text-bearing surfaces prioritise readability
7. **No new art files are required from the commissioner**
8. Before-and-after screenshots are captured at phone size
9. **The chosen fix mechanism is recorded for each affected surface**
