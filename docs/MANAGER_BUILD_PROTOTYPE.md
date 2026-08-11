# The painted manager build — prototype phase

**Status: infrastructure built, 2026-08-11. No artwork exists, and nothing a
manager sees has changed by a single pixel.**

Commissioner ruling, 2026-08-11, approved the investigation in
`docs/MANAGER_SPRITE_QUALITY_INVESTIGATION.md` and authorised a deliberately
narrow prototype phase to answer one question:

> Can the painted-build architecture actually produce a customisable manager who
> looks like they belong beside Tony?

This document is the account of the infrastructure that question needs, and the
instructions for what happens when the art comes back.

---

## 0. The rulings, and where each one landed

| | Ruling | Where it is |
|---|---|---|
| **R1** | Option 4 approved — painted builds below the neck, fixed head plate, separate hair and facial hair, runtime colour, six stored integers unchanged | `lib/character/composite.ts`, `lib/character/art/body.ts` |
| **R2** | The pose belongs to the top; head registration stays compatible | `BUILD_REGISTRATION` in `lib/character/mask.ts` — the binding list is short **on purpose** |
| **R3** | Tony is the quality authority; obsolete detail limits do not bind | `art/ART_SPEC.md §4`, amended |
| **R4** | Palette extension approved in principle, **not to be chosen yet** | the mask vocabulary is exactly what the locked 32 can express — no `shade2` |
| **R5** | Art comes from the ChatGPT workflow; provide the mechanical contract | `docs/art/MANAGER_BUILD_TSHIRT_BRIEF.md`, `art/jigs/`, `npm run art:mask` |
| **R6** | Wearables deferred | nothing about them was touched or designed |

---

## 1. Nothing changes until a mask is registered, and that is the whole safety story

`lib/character/art/masks/index.ts` exports an **empty** `BUILD_MASKS`. Every top
resolves to the drawn sprite, `composeCharacter` returns the same layers it
always did, and the rendered output is unchanged pixel for pixel.

That is what makes landing the infrastructure ahead of the art a safe thing to do
rather than a leap of faith:

- **no visual state moved**, so no screenshot in the sweep changes;
- **no visual-QA assertion was weakened, replaced or deleted** — `checkCharacter`
  still asserts an `<svg>`, at least 200 rectangles, at least 8 distinct fills and
  `shape-rendering="crispEdges"`, and all four still pass because the render path
  is untouched (see §6 for what happens to them if a raster path is ever needed);
- **no database change, no migration, no trait added or removed**, and nothing in
  `docs/ACTIVATION.md` moves;
- reverting is deleting one line from a map.

## 2. What a build is

**One painted layer carrying the whole figure below the neck** — torso, arms,
hands, garment, trousers, boots — instead of a shared body with a garment shell
traced over it.

That merge is the entire point. The investigation's finding was that *stiff*,
*symmetric* and *boxy* are not authoring failures but the shape of a fully
independent layer stack: because one body had to serve six garments, the arms had
to hang straight down and nothing could overlap anything. A build can pose,
because it only has to be one shirt.

It costs nothing to merge them, because **every manager always has a top** —
`TOP_OPTIONS` has no `null` option — so the separate base body was never buying
any variety below the neck.

### The two layers are the two layers they always were

```
base-body   (order 10)   painted: the head plate      drawn: the whole figure
base-top    (order 20)   painted: the build           drawn: a garment shell
```

`LAYER_ORDER`, `TRAIT_LAYER`, the catalog, the traits and the stored integers are
untouched, which is why a build can land **one at a time**. Five drawn tops and
one painted one is a legitimate state and is exactly the prototype's state.

### The head is fixed, and that is what keeps the art bill at seventeen

A build may pose its arms; it may not move the skull. Six hairstyles and four
facial hairs register against one head **once**. If a build could move the head,
they would have to be painted per build — 36 and 24 instead of 6 and 4.

## 3. The role-mask contract

`lib/character/mask.ts`. **Fifteen entries, meant to be read in one sitting.**

A mask is a `112 × 168` PNG in which every pixel names *the job it does*, not the
colour it ends up. `#C42B2B` does not mean "red"; it means "the base tone of the
garment channel", and a manager who chose Deep blue sees `#2C5A8C` there. That
indirection is the whole reason painted art can arrive without deleting the
colour system — `ROOMS_BOUNDARY §14.1` prices a naive full-colour PNG swap at
**132 files**, because a finished hairstyle is one hair colour and the other seven
stop existing.

Three channels — `garment`, `skin`, `fixed` — and four tones. Three deliberate
absences:

- **No `shade2`.** The investigation recommended a fifth tone and R4 says measure
  before extending the palette. The vocabulary is therefore exactly what the
  locked 32 can express, and the returned T-shirt is the evidence that settles
  whether more is needed.
- **`denim` and `sole` stop at two steps.** Their third is `ink-900`, which is the
  outline colour — a pixel painted there could not be told from the silhouette
  and would render identically either way.
- **No channel on the outline.** One ink colour, and `compositeRuns`' existing
  rule decides per pixel whether it is the figure's edge or an internal seam.

The key colours are **real production colours**, chosen as the ones one specific
manager actually renders in — skin Tone 2, a Sauce-red top, denim, leather. So a
mask is simultaneously a machine-readable role map *and* a correct picture of a
real manager, which means the art session is asked to paint **a character** rather
than an encoding, and the delivered file can be reviewed by looking at it.

`mask.test.ts` asserts every pair of keys is more than 20 apart in sRGB, because
the conversion snaps to the nearest key and two close keys would make that snap a
coin toss on exactly the pixels an artist was least careful about.

### A mask ships as a module, not as a file read at runtime

`composeCharacter` is pure, synchronous, and runs **in the browser** inside the
customiser's local preview, so that a manager tapping a colour sees the identical
function the server will run rather than an approximation of it. A mask loaded
from disk would exist on one side of that and not the other, and the preview would
quietly stop being the truth.

The cost is client bundle, and it should be measured rather than assumed when the
first real asset lands: `/profile/character` is **11.8 kB** today, and a painted
build's run list will be a few tens of kB on top. One build is unremarkable; six
is worth a number before it is worth a decision.

## 4. The jig — `npm run art:jig`

Four files in `art/jigs/`, every number imported from
`lib/character/art/geometry.ts`. **Nothing is typed in twice**: a jig with its own
copy of the shoulder line is a second opinion about where the shoulder is, and the
day they disagree the art is drawn to the wrong one and looks *almost* right —
which is the expensive kind of wrong, because nothing fails.

| File | Reader |
|---|---|
| `manager_registration_jig.png` | the machine — `112 × 168`, exact |
| `manager_registration_jig@6x.png` | a person — the same lines, labelled, with the fourteen swatches |
| `manager_paintover_672x1008.png` | **the canvas that is actually painted on** — a whole multiple, no gutter |
| `manager_registration_jig.json` | the validator and the brief, so all of them agree by construction |

There are two 6× plates because the test caught the trap: the annotated plate
carries a gutter of labels, so a file painted over *it* comes back at a size the
conversion step refuses — after the painting is done.

**The head plate is drawn on both**, and the body deliberately is not. The head is
the half a build must register against; the body is the half being replaced, and a
ghost of the slab this work exists to escape is an invitation to redraw it.

`scripts/manager-jig.test.ts` re-reads the committed JSON against the production
constants, so changing `geometry.ts` without regenerating goes red.

## 5. The validator — `npm run art:mask`

```
painted PNG, 672 x 1008
   ↓  block mode      the most common colour in each 6 x 6 block
   ↓  snap            nearest of the fourteen keys, plain Euclidean sRGB
role mask, 112 x 168
   ↓  validate        registration · outline · coverage · head clearance
lib/character/art/masks/<slug>.ts
```

**Block mode rather than nearest-neighbour.** Nearest samples one pixel per
block, so a single stray anti-aliased pixel at the sample point takes the whole
block with it; mode takes the majority. A test corrupts one pixel in every block
and asserts the output is unchanged.

**The snap distance is reported** because art painted in some *other* palette
still snaps — every pixel has a nearest key — so without the number the pipeline
would accept a file it had substantially rewritten and say nothing. Mean 0 means
the mask *is* the art; over ~12 means it is a guess and the tool says so.

**Nothing is written unless everything passes.** A validator that wrote a
"mostly fine" mask would be `ART_SPEC §9`'s forbidden move — the renderer
adjusting to compensate for bad art — one step earlier.

Six binding checks, each one a rule another layer actually depends on: head
clearance · contact row · the collar closing over the neck · a fully enclosed
outline · coverage · canvas and alpha. **The pose, the arms, the hands, the
stance and the garment silhouette are deliberately unconstrained** (R2).

## 6. Tests, and what they can and cannot tell you

| File | Holds |
|---|---|
| `lib/character/mask.test.ts` | the vocabulary, the encoding round trip, six validation refusals, and that the body split is **pixel-identical** to what it replaced |
| `lib/character/build.test.ts` | the painted path end to end — head plate above, build below, all 4 skin tones and all 8 top colours from one file, unpainted tops unchanged, the `skin:` prefix never escaping the compositor |
| `scripts/manager-jig.test.ts` | the committed jig against the production geometry; the paint-over plate at a whole multiple; the pose staying advisory |
| `scripts/manager-mask.test.ts` | the conversion is **lossless** on art that obeys the brief, survives speckle, refuses bad sizes, and reports drift |

The test that matters most is *"puts the skin colour on the bare pixels and the
garment colour on the rest"* — not that two renders differ, but **which pixels
moved**. A single-channel resolution would pass every other test in the file by
repainting the whole figure each time.

**None of it says anything about whether a manager looks good.** The fixture they
run on is the drawn figure re-expressed as role keys, built in memory, never
committed, and it exists only so decoding and composition can be tested before
any painted asset exists.

### The visual gate, and the promise about it

**Nothing was weakened.** `checkCharacter`'s four assertions are architecture-
specific in one direction only: they assume the SVG path. That path is untouched
and the assertions all still pass.

If the real T-shirt turns out to need a raster render path — a painted figure
run-length encodes to roughly **4,800 rectangles** against ~500 today, measured on
Tony — then `rects >= 200`, `fills >= 8` and `shape-rendering="crispEdges"` stop
being meaningful and **must be replaced before the switch, not after**, with
checks that measure the same four properties: that the figure is drawn, that it
has tonal structure, that it is not smoothed, and that it lands on whole pixels.
The replacement has to be demonstrated failing on a deliberately broken sprite.
That is the standing requirement, and it is written here so that a later session
cannot read a deleted assertion as an accident.

## 7. What has NOT been done

- **No artwork of any kind**, and no substitute committed. The smoke test that
  proved the CLI end to end wrote a mask and a preview, and both were deleted.
- **No palette extension.** R4 — measure first.
- **No head plate art.** `avatar_body_head` is a registry row drawing the existing
  shapes; painting it is a separate authorised step.
- **No hair or facial-hair masks**, and **no wearable work at all** (R6).
- **No other five builds.** Commissioning them is the commissioner's decision
  after the prototype is judged.
- **No change to the customiser**, the traits, the catalog indices, the database,
  the room, or Tony.

## 8. When the art comes back

1. `npm run art:mask -- <file.png> avatar_body_starter_04` — it validates,
   reports the snap distance, and writes the module and a four-manager preview.
2. Register it: one import and one entry in `lib/character/art/masks/index.ts`.
3. `npm run check` — the compatibility suites are the first thing that should see
   it.
4. Render it at several skin tones and shirt colours, and **place it in the real
   storeroom**.
5. Photograph `/rooms` at **390 / 375 / 360**, and inspect on a real iPhone.
6. Compare against **Tony**, the supplied manager-quality references, and the old
   production sprite.

**Then stop.** The next decision is the commissioner's and it is a single
question: does the real T-shirt prototype look good enough to commission the
other sixteen?
