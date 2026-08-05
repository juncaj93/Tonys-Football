# Homepage visual cleanliness — the boundary

**Status:** commissioner direction, recorded 2026-08-01. **Delivered 2026-08-01** —
see [§9](#9-what-was-done) for the mechanism chosen per surface, the two defects
the timed regression found, and the evidence.

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

---

## 9. What was done

### The clip was one CSS rule, and there was a second one beside it

**`.showing-taps .tony-mark` translated Tony `-2px`** with a 260ms eased
transition. `arrival.tsx` turns that class on at 1600ms and off at 4900ms, so on
an untouched homepage he rose two pixels, stood there for three and a third
seconds, and slid back — *"a few seconds after the homepage has been sitting
there"*, exactly. Two defects in one rule: the counter's cut moved about two
sprite rows up his apron, into the clearance `objects.ts` calls *"the difference
between behind and severed"*; and a 260ms eased transition put a
nearest-neighbour sprite at fractional offsets for every frame of both ramps.

It was not the hydration mismatch, and the repair for that remains untouched.
`spoken-line.test.tsx` still compares element skeletons and still passes.

The reveal keeps its meaning and loses its movement: Tony takes **a warm edge on
his own alpha** — `18 §9.4`'s mechanism, the one the owned box already uses. It
follows his silhouette because it *is* his silhouette, and it moves nothing.

Building the regression then found a **second** fractional offset, in the
animation that had been declared safe. `tony-talks` ran on `steps(2, end)` on the
belief that two steps across `0 → -1px → 0` give two positions. A CSS timing
function applies **between each pair of keyframes**, not across the animation, so
it ran two steps in each half and the rendered sequence was `0, -0.5, -1, -0.5`.
**Half a pixel, on every sentence Tony has ever spoken.** `step-end` holds each
keyframe's value for its interval: two positions, one whole pixel apart, same
cadence. No screenshot could have found this; the frame sampler reported it at
all three widths on its first green run.

### The regression, and the proof that it fails on the old behaviour

`checkTonySteady` in `scripts/visual-qa.mts`, on the `tony-steady` state. It
samples Tony **every animation frame** — the population the claim is about,
rather than the frames a timer happened to ask for — and measures his offset from
`[data-room-layer="counter-front"]`, so a page that scrolls does not read as a
sprite that moved. Each frame also records what is left of him after every
clipping ancestor, so *"no body part is briefly cropped"* is a measurement.

Five passes cover the seven moments this document asks for:

| pass | covers |
|---|---|
| A | an undisturbed first visit — several seconds idle, active idle frames, the greeting typing |
| B | the same window with the line dismissed, so the frames *before* the reveal are still ones too |
| C | Tony speaking, on demand |
| D | Tony after speaking |
| E | a Display opened and closed, then out to the Back Hall and back |

Passes A and B assert they actually sampled both sides of 1600ms and both sides
of 4900ms; a run that failed to cover the window fails rather than passing on an
empty set.

**Run against the old CSS it fails, at all three widths, in both passes**:

```
[tony-steady] @390 pass A: dy moved 2.00px (-140.17 at t=5284ms, -142.17 at t=2467ms)
[tony-steady] @390 pass A: cy moved 2.00px (-140.17 at t=5284ms, -142.17 at t=2467ms)
[tony-steady] @390 pass B: dy moved 2.00px (-140.17 at t=1456ms, -142.17 at t=2006ms)
… 12 failures across 390 / 375 / 360
```

Pass B's two timestamps straddle the reveal turning on. That is the defect, in
the gate's own words.

### The mechanism, per surface

| Surface | Mechanism | What was done |
|---|---|---|
| Tony's anchor | **Rendering** | the transform lift replaced by an alpha-derived edge; `tony-talks` moved to `step-end` |
| The Tonight board's face | **Deterministic replacement** — §6's own example | repainted flat `paper-white` with a `paper-mid` inner shadow, `scripts/clean-parlor-surfaces.ts` |
| The board's text | **Rendering** | `.board-paint` deleted with the ground that needed it. A pale outline existed because letters landed half on `#FFD98A` and half on `#F2A94B`; on one flat cream ground it would be a halo. `red-dark` measures 8.4:1 on it, `wood-dark` 10.6:1 |
| The wall and the alcove | **Source artwork, targeted** | a palette-preserving despeckle over two measured rectangles |
| The alcove behind Tony | **Source artwork, targeted** | the lit tile taken down one value step, so the recess is a recess and his silhouette is not competing with a background at his own value |
| The ceiling | **Nothing, deliberately** | see below |

**No new art files.** Both corrections are post-quantization edits to the
committed `zone_parlor_shell.png`, in the same shape and with the same guarantees
as `shift-tonight-board.ts`: measured, integrity-checked, idempotent, and pinned
by `scripts/clean-parlor-surfaces.test.ts` so a reprocess that reverts them fails
the suite by name.

> **Superseded 2026-08-06.** Every row of the table above that names *source
> artwork* or *deterministic replacement* has been **deleted**, and the surfaces
> are correct without it. All three were repairs to damage the **quantizer** was
> doing — this document said so itself, one section up: the board's face was a
> dithered vignette because thirty-two colours had three ambers to spend on a
> smooth gradient. The `zone` family palette carries the painting's own values,
> so the face is the painting's cream rather than a fill and the alcove is the
> painting's own value step. `scripts/clean-parlor-surfaces.ts` and its
> thirty-four tests are gone; `scripts/shell-surfaces.test.ts` pins the
> *properties* they used to produce. The mechanism for these three surfaces is
> now **"do not damage it in the first place."**
> `docs/PALETTE_FIDELITY_BOUNDARY.md §7`.

Neither can introduce a colour. The replacement paints two palette values; the
despeckle only ever assigns a colour already dominant among a pixel's own
neighbours.

**The board's frame is a hole in the wall's rectangle.** The first run cleaned
straight through it and took a lone `#5E3A25` out of the frame's one-unit shadow
line, and `shift-tonight-board.test.ts` refused: *"found a wall edge at x 185,
but the frame colours there are not the Tonight board's."* That test was written
to catch a reprocess reverting the board's position, and it caught a **different**
transform quietly editing the same hand-painted frame — which is what an
integrity check on a drawn feature is for. The hole is now explicit, and the
despeckle's own test asserts it.

### Why the source could not be fixed instead

Both defects are made by the downscale and the palette snap, not present in the
941 × 1672 painting. The board's face is a smooth gradient there and a dithered
vignette after quantization. And `SHELL_AUDIT_zone_parlor_shell.md` recorded the
alcove itself, and accepted it: *"the alcove backsplash reads brown where the
source is dark maroon: the palette has nothing between `red-dark #8C1F22` and
near-black, so dark reds land on wood."* Repainting the source and reprocessing
would produce the same output from the same 32 colours.

### The ceiling is still scorched, and that is recorded rather than hidden

The despeckle was run over it for one iteration and **dashed every tile grid
line**: the ceiling draws its perspective grid as one-unit dashed diagonals, and
a dashed diagonal is exactly what a lone-pixel filter cannot tell from noise. It
traded a defect this document names for one it names twice. The rectangle stays
in the script as `EXCLUDED_CEILING`, with the reasoning, because *"the ceiling
still looks scorched"* is a fair observation and the answer is that it needs a
different mechanism — a targeted regeneration — not this one. Carried as visual
debt.

### Evidence

`docs/evidence/homepage-cleanliness/` — the board and the wall behind Tony,
before and after, at 4× nearest-neighbour. Full-room captures at 390 / 375 / 360
are the `tony-steady` state in the visual-QA artifacts.

---

## 10. The clip was not finished — the entrance drops him

**Added 2026-08-03.** `§1` and `§9` closed visual debt 7 and the repair holds.
The commissioner then reported the same symptom again, with a detail: *"Tony's
bottom half clips at the exact moment his glow disappears."* That became visual
debt 13, scoped in `docs/TEXT_SURFACE_BOUNDARY.md §10` as ten candidate
mechanisms around the glow-off transition.

**None of them is it, and that was established by measurement rather than by
inspection.**

### The glow is innocent, at all three widths

`filter` was set to a series of static values with the ramp disabled, and each
one photographed at device resolution:

| state | vs `filter: none` |
|---|---|
| `drop-shadow(0 0 2px …) drop-shadow(0 0 10px …)` — the full glow | 44 493 px differ, **all outside the silhouette** |
| the ramp at half strength | 19 024 px |
| the ramp at a quarter | 7 027 px |
| `drop-shadow(0 0 0 transparent)` — the last interpolated frame | **0 px** |

`drop-shadow(0 0 0 transparent)` and `none` are **pixel-identical at 390, 375 and
360**. The composited layer that the filter creates is therefore torn down
without moving or re-rastering a single pixel of him, which removes
compositing-layer teardown, filter removal, raster resampling and z-index change
from the list in one measurement. An amplified difference image shows the halo
is strictly *outside* his alpha and stops exactly at the counter's cut — the
interior is unchanged, so the sprite is never redrawn.

The dynamic path agrees: a CDP screencast of a real first visit, aligned to the
page's own clock via `performance.timeOrigin`, shows the glow fading
monotonically from 4 745 differing pixels to 0 across its 260ms ramp with no
spike, no transient and no frame in which he moves.

### What actually drops him

The rule at the top of `arrival.tsx` — *"the server renders the finished
state"* — has a cost that had never been named. Tony is at the counter **in the
HTML**. The entrance is attached afterwards, by a class, from a `useEffect`. So
the entrance is anchored to **hydration**, while the picture it animates away
from is already on the glass.

`tony-steps-up` opens on `translate3d(0, 26%, 0)` under
`animation-fill-mode: both`, so the **backwards fill applies during the
animation's own 80ms delay**. The instant `.arriving` lands, Tony snaps down a
quarter of his height — behind the counter front, which is drawn over him — and
then walks back up.

Measured, at 390 under an 8× CPU throttle:

```
t+331ms   the room paints complete — Tony standing, his line up, the board readable
t+642ms   .arriving lands and he drops 62.42px
t+3522ms  he finishes climbing back
```

`docs/evidence/entrance-drop/` holds the two frames 31ms apart. In the first the
parlor is finished; in the second only his head and shoulders are above the
counter.

On this machine hydration follows paint by 118–178ms and nobody sees it. **A
phone on a real network is the throttled case, not the fast one** — which is why
this was reported from a phone and never from the gate.

### The fix: an entrance may not start on a room already on screen

`ENTRANCE_STALE_AFTER_MS = 250` in `arrival.tsx`. If the finished room has been
painted for longer than that, the entrance is skipped and the manager gets the
same thing `prefers-reduced-motion` gets — the reveal without the entrance. It is
one branch for both, because the correct behaviour is identical.

The measurement is **time since `first-contentful-paint`**, not
`performance.now()`. Those answer different questions: time since navigation
includes the network, so a slow connection would look like a stale room when the
picture had only just appeared. What is being protected is how long this person
has been looking at a complete parlor.

Nothing else changes. `arrived` is still set, so the greeting still types — that
is Tony answering, not the room assembling itself.

### Two gate defects fell out of it

**The gate was judging the wrong window.** `checkTonySteady`'s passes A and B
waited for `performance.now() >= 1300` to clear the entrance. The entrance is on
the hydration clock and that wait is on the navigation clock; the margin was
about 150ms on this machine and it ran out on a loaded one. A local production
sweep failed with `dy moved 0.74px (-134.04 at t=1323ms, -134.78 at t=1457ms)` —
the tail of `tony-steps-up` easing out, reported as a defect. The sampler now
records `arriving` per frame and the passes exclude those frames by the class
that causes them, the same way `speaking` already was. The reveal windows are
likewise anchored to the frame the reveal was first seen lit in rather than to
`1600`.

**And the gate could not see the defect at all.** Every pass measured a fast
arrival, which is the one case where the drop is invisible. **Pass F** delays
`/_next/static/chunks/` by 700ms so the room paints before the script arrives,
then asserts Tony never leaves the position the server painted him in.

CPU throttling was the first attempt and is the wrong instrument: it slows paint
and hydration together, so the gap between them — the entire defect — stays
small. It passed at two widths and failed at the third on the same build.
Delaying the bundle models the real case and is deterministic.

| build | pass F |
|---|---|
| before | **fails at all three widths** — 62.42px @390, 60.02px @375, 57.62px @360 |
| after | passes at all three |

### What is *not* claimed

That this is the whole of what the commissioner saw. The report tied the timing
to the glow, and the glow has been measured clean; the drop is tied to hydration
instead. What is claimed is narrower and is backed by pictures: **this is a real
defect, of exactly the reported shape, on exactly the reported surface, and it is
the only movement in the room that puts his bottom half behind the counter.** If
the symptom survives this, the next report should say whether the room had
finished loading first — that one detail separates the two remaining
explanations.

---

## 11. The glow *did* move him, one device pixel, and §10 was right not to claim otherwise

**Commissioner report, 2026-08-05:** *"When Tony's glow ends, part of his body
still clips through or behind the counter."*

§10 closed the entrance drop and said in as many words that it was **not**
claiming to be the whole of what was seen — *"if the symptom survives this, the
next report should say whether the room had finished loading first."* It
survived. This is the rest of it, and it is a different mechanism on the same
sprite.

### The gates could not have caught it, and that is the finding

`checkTonySteady` samples `getBoundingClientRect` on the sprite and on the
counter layer every animation frame. It is the right gate for §10's defect — a
keyframe translating him 62px — and it is **structurally incapable** of seeing
this one, because **no rectangle changes**. What changes is where the sprite
lands on the device's pixel grid.

Every mechanism §10 scoped is still eliminated. Nothing here contradicts it.

### What actually happens

A `filter` transition makes Chromium promote the element to its own compositing
layer **for the duration of the animation only**. A promoted layer is rasterized
separately from the page. Tony's layout size is fractional — **84.375 × 230.109
CSS at 375** — so `image-rendering: pixelated` maps his 88 source columns onto
device pixels unevenly, and the two rasterizations disagree by one device pixel.

So when `.showing-taps` is removed and `transition: filter 260ms ease-out` runs,
the layer appears, his edges step one pixel, and when the layer is torn down they
step back. Against the counter that cuts him, one pixel is exactly *"clips
through or behind"*.

### The evidence, off the compositor's own frames

`npm run visual:tony-glow` clears the arrival latch, waits for the glow, and
records the compositor's frames across the fade with `Page.startScreencast`.
The discriminator needs no authored mask: **`drop-shadow` composites a blurred
copy of the alpha behind the element, so it can only ever add light.** A pixel
*brighter* than the settled room is the glow. A pixel **darker** cannot be.

| | 390 | 375 | 360 |
|---|---|---|---|
| before | 27 px darker | **320 px darker** | 90 px darker |
| after | **0** | **0** | **0** |

The darker pixels are a one-pixel outline along his hairline, moustache, collar,
shoulder seams and apron edge — the signature of a sprite resampled onto a
different grid, not of a body part emerging from behind a counter. So the honest
answer to *"does he move, is he clipped, or is he occluded"* is **none of the
three in layout terms**: he is *redrawn*, and the redraw lands one pixel over.

Two false starts are recorded because both would have produced a confident wrong
answer. The first masked by *"pixels the first frame changed"*, and the first
screencast frame does not represent the whole glowing period, so the mask leaked
and reported hundreds of glow pixels as movement. The second mistook `tony-talks`
— his **deliberate** one-pixel speaking step, which `globals.css` already argues
is safe — for the defect; the state trace puts speaking at 1252–2585ms and the
fade at 5002–5269ms, which separates them.

### The fix

`will-change: filter` on `.tony-mark`. The promotion becomes permanent, so **one**
rasterization applies before, during and after the glow.

Nothing else moves: no geometry, no z-order, no hit region, no keyframe, no
entrance behaviour. The cost is one composited layer for one sprite.

**Not fixed by rounding his size to whole pixels.** His position is derived from
the room's aspect ratio and every other overlay shares that arithmetic, so
pinning Tony alone would put him out of register with the counter he is measured
against — which is the invariant `objects.ts` calls load-bearing.

**Not fixed by leaving the glow on, moving him up, removing the counter
foreground, or hiding the transition.** All four were ruled out by the
commissioner and none of them is the cause anyway.

### The regression gate

`checkGlowLeavesTonyAlone`, in the driver, on the `tony-steady` state at all
three widths — so it runs in CI beside every other gate. It fails on the pre-fix
build with the counts in the table above.

### What is left open

**The same mechanism is visible on the newspaper rack**, which is a Door and
therefore also glows on a filter transition. It was measured in the same sweep
and is a one-pixel step on its own edges. It is **not** fixed here: the
commissioner's report is about Tony, the rack is not cut by a foreground layer so
the step has nothing to read against, and widening this slice to every glowing
overlay is a change to the room's shared affordance rather than a defect repair.
Recorded so it is a decision rather than an oversight.

### The gate had a race that could take the whole sweep down

Found by running `--state=tony-steady` on its own, which is the one way this gate
had never been exercised — in a full sweep it is state two of eighty-eight and
the timing is different.

`Page.screencastFrame` keeps arriving until Chromium has processed
`stopScreencast`, so **at least one frame is normally still in flight when
`detach()` runs**, and acking a frame on a detached session rejects. The ack was
`void`ed, which makes that an *unhandled* rejection — and Node's default for an
unhandled rejection is to kill the process. So the sweep died with
`cdpSession.send: Target page, context or browser has been closed`: a message
about the harness, printed where a reader is looking for a message about the
room, with no gate result at all.

Two halves, because either alone leaves something wrong. Collection stops the
moment the session is closing, so a late frame cannot enter the measurement; and
the ack's rejection is caught, because a frame nobody is going to read does not
need to be acknowledged. **The gate itself is unchanged** — same window, same
discriminator, same counts.
