# The manager sprite — the canonical account

**Status: built, 2026-08-10.** One reopened area — *sprite quality* — a canvas
raised by measurement, a shading engine rewritten, and twenty-nine layers
re-authored on it. `docs/CHARACTER_CUSTOMISATION_BOUNDARY.md` stays closed and
nothing in it moved: the six traits, their stored integers, the catalog, the
layer order, the editor, the defaults and both regression guards are untouched.
**11,520 combinations before, 11,520 after.**

---

## 0. The report, and the measurement under it

The commissioner supplied a generic sprite as a quality benchmark and a
screenshot of a manager standing in the delivered storeroom shell, and named the
problem: *"too simplistic, too flat, too geometric / placeholder-like, not
convincingly part of the same pixel-art world."*

The instruction was to investigate the best path rather than patch the surface,
with two named candidates — improve the drawn shapes in place, or introduce a
layered/tinted-mask pipeline — and permission to choose a third with an
explanation.

**The third one was right, and the reason is a number nobody had taken.**
`art/ASSET_PIPELINE.md`'s fourth rule is *one art pixel is one room unit*, and
every object in the basement obeyed it except the manager:

| | authored | drawn into | room units per source pixel |
|---|---|---|---|
| `zone_room_shell_storeroom` | 320 × 569 | 320 × 569 | **1.00** |
| every collectible | 46 × 46 | 46 × 46 | **1.00** |
| `character_tony_neutral` | 88 × 240 | 72 × 197 | **0.82** |
| the manager | **64 × 96** | **112 × 168** | **1.75** |

The manager was the only thing in the world **drawn coarser than the world**,
and then magnified into it. At 390 CSS px a room unit is 3.656 device pixels, so
the shell rendered at 3.656 device px per painted pixel and the figure at 6.4 —
its pixels were **1.75× the linear size** of every pixel around them, and 2.1×
the size of Tony's.

That reframes the whole report. *Simplistic, flat, geometric and placeholder-like*
are all true, and they are also what any drawing looks like when it is the
low-resolution object in a high-resolution picture. **No amount of care spent on
a 64 × 96 sprite could have fixed it**, because the mismatch is not in the
drawing.

---

## 1. Why not Option B, the tinted-mask pipeline

`docs/ROOMS_BOUNDARY.md §14.2` set out the two routes and called the mask
pipeline *"the one route that reaches the reference's fidelity and keeps 11,520
combinations from ~29 assets."* It is a real design and it is not what this
needed, for three reasons stated so the decision can be checked rather than
assumed:

1. **It buys resolution, and resolution was free.** §14.2's case against a bigger
   canvas is quoted from `art/geometry.ts`: *"a set of thirty layers at that size
   is not authorable by hand."* That is true of a system whose layers are
   **pixels**. These layers are **shapes** — an ellipse with `rx: 13` costs
   exactly what one with `rx: 7` costs, and the rasteriser draws the finer curve
   for nothing. The sentence was inherited from the 32 × 48 → 64 × 96 raise and
   was never re-checked against the system that replaced it.

2. **It costs the one thing this repository is documented as worst at.** Twenty-nine
   masks would have to register to each other to the pixel, across a set, from a
   generator. `scripts/prepare-incoming.ts` exists because *"across three rounds
   of candidates not one arrived correctly cropped"* — and cropping one image is
   the easy version of the problem. A hairstyle that sits two pixels high on a
   skull is not a crop error anybody can see in the file; it is visible only in
   the composite, on one combination.

3. **It would have been gated on the commissioner.** The instruction was to work
   autonomously and to request art only when truly needed, in the smallest useful
   set. A 29-asset batch is not a small set, and it would have stopped the work
   at the first step.

**Option B is not refused, it is not needed yet.** If a later slice wants
painted layers, the geometry below is what they would be painted to, and the
per-layer art-swap contract is intact and untouched: a registry row gaining a
`path` still takes over that one layer and leaves the rest drawing themselves.

---

## 2. What was actually done

### 2.1 The canvas is `112 × 168`, which is `roomObject('manager').rect`

Exactly, not approximately. One sprite pixel is one room unit, so the figure and
the painted shell behind it are magnified by the same number on every phone.
`lib/rooms/objects.test.ts` pins the two together and says why, and
`checkManagerBelongsInTheRoom` measures the *rendered* ratio in the browser —
because the arithmetic can be right while a stylesheet sizes the figure by
something else.

**It cost no art.** All twenty-nine slugs are `art_status: placeholder`, which
here means *there is no PNG at any size*. This is the third canvas the system has
had and the first derived from the surface the sprite is actually seen on.

Nothing changed size on screen. `CHARACTER_SCALES` went from whole multiples of
`64 × 96` to half-steps of `112 × 168`; both canvas dimensions are even, so every
offered scale still lands on a whole number of CSS pixels, which is the property
the old integer rule was protecting.

### 2.2 The proportions are the reference's

The old figure was **four heads tall**, which is the proportion of a mascot. The
reference is a little over five. This one is 28 rows of skull in a 144-row
figure — **5.1** — with shoulders at two head-widths, hands at the top of the
thigh, and legs 39% of the standing height.

Everything is authored against `lib/character/art/geometry.ts`, so the whole set
moved together and no layer needed to be re-registered against another.

### 2.3 The shading pass models a form instead of tracing an edge

The old pass marked a pixel `shade` when it failed
`solid(x+1,y+1) && solid(x,y+2) && solid(x+2,y)` — a one-pixel ring on the lower
right, `base` everywhere else. That is a **rim**, and a rim is what a flat cut-out
looks like when you trace its bottom edge. It is the whole of *too flat*.

What replaces it measures how far each pixel is from the shape's own boundary in
four directions and bands each edge independently, thickened against the form's
extent in that direction. So an arm eleven pixels across gets a one-pixel lit rim
and a two-pixel shadow, and a torso fifty across gets three and six, from the
same two constants.

**Four tones now, from three colours plus ink.** The third was previously refused
in writing — *"a third tone per material would need colours the room does not
have"* — and that was never checked. `art/palette.json`'s own `semantic.shadowRule`
is *one step darker within the same ramp*; `light` is that rule read upward.
**Not one colour was added to the locked 32.** Two ramps decline it (`Bottle
green` and `Grape`, whose palette families have nothing above them but a neon)
and draw flat, which is recorded as a decision rather than left for somebody to
"fix" with `green-neon`.

The half of the old reasoning that *was* true is what changed: at 64 × 96 a third
step landed on too few pixels to read. At 112 × 168 it is the difference between
a cylinder and a stripe.

### 2.4 Fixed colours became ramps, which is where the flattest surfaces were

`FIXED` held single hexes, so every fixed part of every sprite was flat **by
construction** — and the largest of them is the trousers: eighteen rows of every
manager, on every screen, one navy rectangle with a seam down the side. No amount
of care spent on the shirt above them could fix that. Each key is a three-step
ramp now, each step inside its own palette family, and the step travels with the
pixel as `fixed:denim@shade` because a tone grid is cached per slug long before
any colour is known.

The boots came out of the same change and needed a second look: based on
`wood-dark` they were the same value as the basement's own floor and joists, and
disappeared into it.

### 2.5 The composite knows the stack, which is where two effects live

Colour used to be resolved per layer as each was drawn, which made the composite a
pile of independently-lit cut-outs. Tones are now carried through the stack and
resolved once at the end, and two things become possible that no layer can do
alone:

- **Contact shadow.** Before a layer is drawn, whatever it is about to sit over is
  darkened one step within two pixels down-and-right of it. That is the shadow of
  the fringe on the brow, the beard on the neck, the cuff on the wrist and the hem
  on the trousers — **none of it authored**, all of it a consequence of the order.
- **Selective outline.** An outline pixel that touches nothing empty is not the
  figure's edge, it is a seam between two layers, and it draws in the upper layer's
  own **shade**. Ink is reserved for the silhouette, which is what has to hold up
  against a dark basement wall. Every layer still outlines itself, so a hat still
  reads as a separate object from the hair — what changed is which of those
  outlines is drawn in the same hard `ink-900` as the figure's edge.

### 2.6 A shadow on the floor, which is the room's and not the sprite's

`ManagerInRoom` draws it, and that is deliberate. Inside the composite it would
follow the character onto `/profile` and into the customiser, where there is no
floor for it to fall on, and it would be recoloured by whatever ramp sat under it.

**Two hard ellipses, no blur.** A penumbra out of two flat steps is the same
trick `.pixel-edge` uses for a bevel and the same trick the sprite uses for a
curve — it survives `image-rendering: pixelated`, costs no filter, and is the
house style rather than an exception to it. The first version was one blurred
rounded rectangle and drew nothing at all; see defect 15.

It is the single cue no work on the sprite itself could supply.

---

## 3. Defects found by rendering and looking

**Eighteen**, recorded because each was invisible to the seventy-six tests that
already existed, and because the list is the argument for the screenshot loop.

Most were introduced by this rewrite and caught inside it, which is the loop
working rather than a tally of mistakes — a figure re-authored on a canvas 1.75×
larger is a new drawing, and the ones below are what a new drawing costs. Two had
been shipped for months and are marked.

1. **The entire figure rendered as its own outline colour.** One transposed index
   in `runDepths` — the recurrence read the neighbour on the far side of the pixel
   from the direction it was measuring, so every depth came back `1`, the edge test
   fired on every solid pixel, and nothing else in the pass ever ran. **Every
   character test passed.** They had to: the figure is drawn, inside the canvas,
   standing on the floor, made of legal colours, and overlapping the layers it must
   overlap. It is also a silhouette. `lib/character/shading.test.ts` exists because
   of this one.
2. **A diagonal crease across every shirt.** `min(down, right)` has an **L**-shaped
   contour, and the corner of that L is a clean 45° line through the middle of any
   large form. It reads as a fold in the fabric and there is no fold. Fixed by
   banding each edge independently; rectangular corners are what pixel art is made
   of, and a diagonal out of a shading pass is always an artefact.
3. **Every manager had a square face.** The hair's face cut was one `erase`
   rectangle. At twenty-two pixels of head width its corners were lost inside the
   outline; at forty-four they are a straight hairline running ear to ear.
4. **Two managers had horns.** `SIDEBURNS` was passed the hairline row, which on a
   high hairline is the top of the skull — so `avatar_hair_02` and `_05` grew
   coloured spikes off the top corners of the head. A sideburn's top is a property
   of the ear.
5. **The ears were one column apart.** An ellipse's `cx` sits on the boundary
   between columns and a hit region's `x` sits on a column, so they mirror by
   different arithmetic — `112 - cx` against `111 - x`. The left ear stood proud of
   the skull and the right was buried in it, on every manager. `mirrorCentre` exists
   for this and the symmetry test checks the drawing as well as the constants.
6. **Shipped for months: the hoodie's drawstrings had been rendering in
   `ink-900` since the hoodie was written.** They are one pixel wide, so every pixel of them touches empty and the
   unconditional outline claimed the whole cord. Found by asking why a *thin fixed
   mark* should be outlined at all — a fixed colour is an explicit decision about a
   pixel, and the beanie's pom is outlined because it has an interior, not because
   it is fixed.
7. **Both pupils sat hard left.** Two ink columns of a five-column eye is
   off-centre by construction; every manager was looking away from whoever was
   looking at them.
8. **Shipped for months: eyebrows were the manager's own skin, one step down.** Invisible on the pale
   tones and wrong on all four. They belong to the hair layer now and take the hair
   colour, in the same way facial hair already did.
9. **A shelf at each shoulder.** The deltoid ellipse sat level with `TORSO.top`, so
   it stood proud of the sloped shoulder the torso draws and the figure grew a step
   on each side — the most mechanical-looking thing about the first render.
10. **Crew necks were scoop necks**, and the sleeve caps were puffed.
11. **A two-column hole down each side of the figure**, from the armpit to the
    hem, with the room showing through it. The arm's inner edge and the torso's
    outer edge were authored to *meet*, and they did — at the shoulder, where a
    round cap covers the join. Below it the torso narrows towards the waist and
    the arm narrows towards the wrist, so the two edges walked apart. In a
    thumbnail it reads as a deliberate dark seam, which is why it survived being
    looked at several times. Found by a **flood fill from outside the canvas**,
    which is now a test.
12. **And closing it merged the arms into the torso**, because the hole had been
    doing the separating. Every top rendered as one wide blob with hands at the
    corners. A shadow is what separates an arm from a body — the arm is in front,
    so it casts one — and that is now drawn, in both the skin and the garment.
13. **The basement showed through a manager's collarbone.** The T-shirt and the
    sweater each built a collar band by drawing an ellipse and cutting a smaller
    one out of it, and both cut a *different* hole from `CREW_NECK`'s — wider than
    the neck, in the two rows where the torso has not started yet. Twelve pixels,
    on two of six tops, caught by the same flood fill. There is one definition of
    the opening now.
14. **Balding managers had horns**, twice and for two different reasons. First the
    sideburns were passed the hairline row, which on a high hairline is the top of
    the skull. Then the crown erase was narrower than the cap it was cutting, so
    two vertical strips of hair stood above the head.
15. **The floor shadow was an invisible rectangle.** `rounded-[50%]` is an
    arbitrary value Tailwind never emitted, and `blur-[2px]` is the treatment the
    house-edge note says *"made the interiors read as a different product from the
    room."* The element was in the DOM at every width and drew nothing anybody
    could see — a gate asking whether the node existed would have been green on
    it, so the gate measures its rendered width and its computed alpha. It is two
    hard ellipses now, which is the same trick `.pixel-edge` uses for a bevel.
16. **And then it was too narrow to notice.** Sized at 0.68 of the figure — barely
    more than the boots are — it darkened the rug by a measurable amount and almost
    all of that was *behind the feet*, leaving two tapering tips. Measured off the
    capture by sampling rows through the shadow band rather than by squinting at
    it. What makes a contact shadow read is the part that spreads past the stance
    sideways, so it is wider than the boots and only a few rows deep.
17. **All three hats sat across the face.** They were authored in offsets from
    `HEAD.top`, so when the features moved they came down with the skull rather
    than with the eyes: the beanie's band landed **on both eyes**, the visor's brim
    on the lash line, the paper hat's band through the eyebrows. Nothing awards a
    wearable, so all three would have shipped and surfaced on the day one was.
    `HAT_BRIM` is one number now, two rows above the brow, and a test holds it.
18. **Raising them made the visor float.** Five clear rows above a balding
    manager's remaining hair — caught by the matrix test that exists for exactly
    that pair, which is the one defect in this list a *test* found rather than an
    eye. The balding crown is a horseshoe now; the cut that fixes this and the cut
    that fixed defect 14 are the same cut at two different radii, and both wrong
    versions are recorded beside it so the next person does not rediscover them.

---

## 4. What holds it

- **`lib/character/shading.test.ts`** — 27 tests, and the file exists because the
  suite that passed a solid-black figure could not have been extended to catch it.
  A block gets all four tones in the proportions of a lit form; the light is up and
  left of the shadow, measured as a centre of mass; bands scale with the form; a
  thin fixed mark keeps its colour and a thick one is still outlined; a
  manager-coloured silhouette is never un-outlined; **the figure has no hole in
  it, on any top, flood-filled from outside**; it draws in more than eight
  colours; its outer edge is ink and its hairline seam is not; a sleeve throws a
  shadow on the forearm below it; the trousers have more than two tones; every
  mirrored pair mirrors, by the right arithmetic for its kind; and no highlight is
  darker than its own base.
- **`lib/rooms/objects.test.ts`** — the manager's rectangle *is* the sprite canvas,
  stated beside the collectibles' 46 × 46 so the two cannot drift into two rules.
- **`checkManagerBelongsInTheRoom`** — the rendered device-pixels-per-source-pixel
  of the figure and of the room agree to within 2%, the figure is not stretched,
  and the shadow exists and lands at the feet. No integer is required of either:
  `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md` records that integer scaling is
  unavailable on these viewports and cannot be bought.
- **`checkCharacter`** — now driven off `CANVAS` and `CHARACTER_SCALES` rather than
  hardcoded `64`/`96`, so a future canvas change cannot leave the gate asserting a
  number the product stopped using. Plus a **distinct-fill count** in the browser,
  which is the same regression as defect 1 caught on the far side of the render.

---

## 5. What did not change, and must not be read as having changed

- **The trait model.** Six traits, the same indices, the same slugs, the same
  catalog, the same 11,520 combinations, the same `defaultCharacterFor`. No
  migration, no backfill, nothing in `docs/ACTIVATION.md` moves.
- **The customiser.** One category at a time, the character pinned, *Surprise me*,
  the local preview running the identical pure compositor. The only thing that
  moved is the number the preview is scaled by.
- **Ownership and equipping.** The four slots, the trigger that says you may only
  wear what you own, the one-per-slot index. The wardrobe is still empty because
  nothing awards a wearable, which is a product decision and not an unimplemented
  feature.
- **`art/palette.json`.** Not one colour added, removed or edited. The family
  extensions are untouched — they serve `process-art.ts`, and a manager sprite is
  drawn at runtime and never goes through it.
- **Tony.** Not touched, not re-measured, not re-registered.

---

## 6. What would make this wrong

Stated so it can be checked rather than assumed.

- **If the room's framing changes**, the manager's rectangle changes with it, and
  the canvas has to move too or the 1:1 relationship silently becomes 1.2:1. The
  test fails loudly, which is the point of it existing rather than a comment.
- **If a manager is ever drawn in the same frame as Tony**, the two are at
  different densities — 1.00 against 0.82 — and the difference will show. Nothing
  in v1 puts them in one frame; the parlor draws Tony and the basement draws the
  manager.
- **If painted layers are ever commissioned**, this geometry is what they are
  painted to, and the mask convention in `ROOMS_BOUNDARY §14.2` is the design to
  reach for. The runtime colour system is what makes it non-trivial and it has not
  changed: colour is a parameter, not a property of a drawing.
- **If the figure ever needs a second light**, the whole pass is built on one
  direction from the upper left, applied identically to every layer, and the
  reason is in `sprite.ts`: an author who has to remember which side the light is
  on will get it wrong on the twenty-ninth sprite, and the twenty-ninth sprite is
  the one nobody looks at twice.
