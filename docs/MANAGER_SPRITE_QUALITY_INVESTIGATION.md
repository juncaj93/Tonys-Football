# Manager sprite visual quality — investigation, 2026-08-11

**Status: INVESTIGATION ONLY. Nothing is implemented, nothing is claimed in
`docs/ACTIVE_WORK.md`, no production code, schema, art or trait moved.**

This document answers `docs/OPEN_ITEMS.md` **C3** / `docs/VISUAL_DEBT.md` item
**18**, which have been waiting on three things, none of them code: a production
screenshot at real phone scale, a concrete description of what reads wrong, and
a visual quality target. **The commissioner has now supplied all three** — a
production capture of `/rooms` on an iPhone, the words *boxy · stiff · flat ·
overly geometric · simplistic · avatar-builder rather than illustrated*, and
three reference images with stated authority (Tony as the world/style benchmark,
a manager quality/anatomy reference, a basement concept as directional only).

Evidence rendered for this investigation is in
`docs/evidence/manager-sprite-quality/`.

---

## A. How the manager sprite actually works today

**A manager is six small integers. Everything else is derived at request time.**

| Layer | File | What it is |
|---|---|---|
| Storage | `character_configurations` | `skin · hair · hair_colour · facial_hair · top · top_colour`, all `integer` |
| Catalog | `lib/character/catalog.ts` | Index → option name → **registry slug**. Order is the meaning of the stored number; append-only |
| Shapes | `lib/character/art/*.ts` | 29 layers authored as `rect · ellipse · poly · pixels · erase` against one shared geometry module |
| Geometry | `lib/character/art/geometry.ts` | `CANVAS = 112 × 168`, `AXIS = 56`, and every landmark (`HEAD`, `FACE`, `TORSO`, `ARM`, `HAND`, `LEG`, `SHOE`, `HAT_BRIM`) |
| Raster + shading | `lib/character/sprite.ts` | Rasterises shapes to a **material** grid, then derives a **tone** grid: `outline · light · base · shade · ink · fixed:<key>@<step>` |
| Cache | `lib/character/art/index.ts` | Tone grid + bounding box **per slug**, once per process. Colour is never in the cache |
| Composite | `lib/character/composite.ts` | Stacks tone grids in `LAYER_ORDER`, adds contact shadows and selective outlines, resolves tone → hex, run-length encodes |
| Colour | `lib/character/palette.ts` | `HOUSE` = the locked 32. 4 skin ramps, 8 hair ramps, 8 top ramps, ~19 `FIXED` ramps. **Three steps each** (`light · base · shade`) plus `ink-900` |
| Render | `components/character/character-view.tsx` | One `<svg shapeRendering="crispEdges">` of a few hundred `<rect>`s |

**Colour is a runtime parameter, not a property of a drawing.** That is the
single most important architectural fact: `composeCharacter` attaches a `Paint`
to each layer and `coloursFor` resolves it per request, which is how 29 layers
produce 11,520 combinations with no combinatorial art. Any proposal that draws a
layer from a finished full-colour PNG deletes that (`ROOMS_BOUNDARY §14.1` —
132 files, and seven of eight hair colours silently stop existing).

**Where the character is rendered — four call sites, one figure each:**

| Surface | Scale |
|---|---|
| `/rooms`, `/rooms/[userId]` (`components/rooms/furnishings.tsx`) | `fit="container"`, into `roomObject('manager').rect` = `[126, 334, 112, 168]` |
| `/profile` | `scale="row"` (0.5×) |
| `/profile/character` | `scale="hero"` (1.5×) |
| the customiser preview | `scale="customiser"` (1.5×), same pure `composeCharacter` in the browser |

**Contracts that protect it** — `lib/character/character.test.ts` (858 lines),
`shading.test.ts` (27 tests incl. a flood fill from outside the canvas),
`separation.test.ts` (wearables can never reach the loot table),
`driver-coverage.test.ts`, `lib/rooms/objects.test.ts` (**the sprite canvas *is*
`roomObject('manager').rect`**), `app/actions/use-server-exports.test.ts`, and in
the browser `checkCharacter` + `checkManagerBelongsInTheRoom` across 13
`character-*` states and the `rooms-*` states at 390/375/360.

**Registry position.** All 29 slugs are `family: "avatar"`, `canvas: "112x168"`,
`art_status: "placeholder"` — meaning **no PNG exists at any size**. The
per-layer art-swap contract is live: a registry row gaining a `path` makes that
one layer draw an `<img>` and the rest keep drawing themselves.

---

## B. Why it looks bad

### B.1 Already fixed, and genuinely — do not re-litigate

**Pixel density.** Until 2026-08-10 the sprite was authored `64 × 96` and
magnified into a `112 × 168` rectangle: 1.75 room units per art pixel against
1.00 for the shell and every collectible. That is fixed, measured, and pinned by
two tests. `MANAGER_SPRITE_BOUNDARY`'s rule 1 is load-bearing and this
investigation does not touch it. The remaining problem is **not** resolution.

### B.2 What is still wrong — the art construction, measured

All numbers below are from the shipped renderer against the shipped Tony asset.

| | Tony (`88 × 240`, approved) | Manager (`112 × 168`, shipped) |
|---|---|---|
| Distinct colours in the figure | **40** | **14–16** |
| Interior detail (share of interior pixels whose neighbour differs) | **70.9%** | **25.6–28.4%** |
| Shoulder span in head-widths | **2.05** | **2.5 – 2.85** |
| Values in the largest garment | **8 blues**, all inside rows 54–104 (the jersey) | **3** + ink |
| Pose | asymmetric — one hand behind the back, head turned, apron over jersey | perfectly mirrored, both arms straight down |

Seven specific construction defects follow from those numbers:

1. **The silhouette is a rectangle.** Row widths run `74 74 72 72 72` for ~50
   rows and then drop straight to two 18-wide tubes. There is no waist, no hip,
   no chest, and the transition from torso to legs is a step function. This is
   the whole of *boxy*.
2. **The arms are inside the body.** `ARM.overlap = 4` deliberately tucks the arm
   under the torso to close a hole (defect 11 of the last pass), and the
   separation that remains is two columns of the garment's own `shade`. At a
   3-step ramp that is nearly invisible: a long-sleeved manager renders as one
   slab with hands at the corners — exactly what the sleeve shadow was added to
   prevent, working only at the very edge of legibility.
3. **The shading is a distance transform, not a form.** `formRole` bands each
   edge by its distance to the boundary. It can only ever produce a lit rim and a
   shaded flank. It cannot produce a fold, a cast shadow across a chest, a
   cylinder that turns, or the specular on Tony's apron — because none of those
   is a function of the silhouette.
4. **Three tones is a hard ceiling.** Tony's jersey uses eight blues in a 50-row
   band. Every manager garment has `light · base · shade` and nothing else, and
   two top ramps (Bottle green, Grape) have `light: null` and draw with **two**.
   No amount of authoring changes this; it is a palette fact.
5. **Everything is bilaterally symmetric.** Both arms, both legs, both boots,
   both hands, both ears, both eyes are mirrored by construction, and
   `character.test.ts` asserts the mirroring. Symmetry is the strongest single
   signal of *generated* rather than *drawn*.
6. **Hands and boots are generic terminators.** A mitten with a 2-px thumb and a
   polygon boot. At 112 × 168 there is room for knuckles, a cuff break and a
   heel; the reference has all three.
7. **The crew collar reads as a ring.** `crewCollar` draws an ellipse and cuts
   `CREW_NECK` from it, so on a T-shirt the neck is circled by a dark torus
   rather than gathered into a neckline. Visible in the evidence sheet on every
   crew-necked top.

### B.3 The cause underneath all seven — and it is architectural

**Every layer must work with every other layer, so no layer may commit to
anything.** Six tops × one body means the body's arms have to be correct under a
hoodie, a jersey and a flannel; the arms therefore hang straight down in a
neutral position and the garment is a shell traced over the same six numbers.
Tony's pose — one arm behind his back, the apron overlapping the jersey, the
head slightly turned — **is not expressible in this architecture at all**, at any
resolution, in any drawing style.

That is the finding that matters most in this report: *stiff* and *symmetric* are
not authoring failures. They are what a fully-independent layer stack looks like.

---

## C. The gap to Tony, stated as differences

| | Tony | Manager | Closable by? |
|---|---|---|---|
| Pose and asymmetry | weight shift, hand behind back, turned head | mirrored T-pose-at-rest | **architecture** (§B.3) |
| Occlusion depth | apron over jersey over body, pencil behind ear | nothing overlaps anything meaningfully | **architecture** |
| Values per material | 6–8 | 2–3 | **palette** |
| Interior detail | 70.9% | 27% | art + palette |
| Anatomy | shaped chest, tapered waist, real deltoid/bicep read | slab + tubes | art |
| Hands, shoes | fingers implied, laced boots with a heel | mitten, polygon | art |
| Face | full expression — brow, cheeks, moustache, smile, catchlight | eyes/nose/mouth present and correct, no expression beyond a smile | art |
| Outline discipline | ink outside, coloured interior lines, warm rim light | ink outside, `shade` interior seams — correct rule, too little contrast to read | palette |
| **Pixel density** | 0.82 room units/px | **1.00** | **already correct — do not touch** |

Two palette facts sit under this and are easy to miss:

- **Tony is not painted from the shared 32.** He uses `character-01…16`, a
  measured **family extension** added on 2026-08-06. The manager's `family` is
  `avatar`, which has **no extension** — it quantizes against the shared 32, and
  `lib/character/palette.ts` only ever names those 32. *Tony has 48 colours
  available and uses 40; a manager has 32 available and uses 14.*
- `art/ART_SPEC.md §4` sets a **detail budget of ≤ 8 interior shapes for a
  character body and ≤ 6 for a face**. The approved Tony asset exceeds both by a
  wide margin, and the shipped manager obeys them. **This is a real contradiction
  between the spec and the approved reference, and it is reported rather than
  resolved** (per `CLAUDE.md`). `ART_SPEC §5` is also stale — it still describes
  a `32 × 48` avatar canvas with anchors the product stopped using two canvases
  ago, and `§2.2` still says the avatar canvas is "REOPENED" when the registry and
  `lib/rooms/objects.test.ts` have settled it at `112 × 168`.

---

## D. Architecture options

Four are real for this repository. Asset counts are honest and derived from the
catalog; all masks are `112 × 168`, which is `roomObject('manager').rect`.

### Option 1 — Refine the drawn shape system in place

Better shapes, asymmetric authored limbs, more `alt`/`fixed` marks, and an
`avatar` palette extension to widen the ramps to five steps.

| | |
|---|---|
| Visual ceiling | **Medium.** Interior detail plausibly 27% → ~45%; colours 14 → ~24. Reaches "competent programmer-drawn sprite", not "illustrated" |
| Customisation | Unchanged — 11,520 |
| New artwork | **None** |
| Engineering | Low — it is data in existing files |
| Runtime | Unchanged (~500 rects) |
| Migration risk | **Lowest.** Nothing stored moves |
| Saved configs | Fully preserved |
| The catch | Every improvement is a numeric shape edited blind and judged only by rendering. The last pass at this found **18 defects that way**, two of which had shipped for months. Doubling the detail budget multiplies that count. And it cannot fix §B.3 |

### Option 2 — Role-masked painted layers, layer set unchanged

Each of the 29 layers becomes a painted PNG whose pixels are **role indices**
(`outline · shade2 · shade · base · light` + `fixed:<key>@<step>`), not final
colours. `toneGrid(slug)` decodes the mask instead of rasterising shapes;
everything downstream — contact shadow, selective outline, colour resolution, run
length, SVG — is untouched.

| | |
|---|---|
| Visual ceiling | **High per layer.** Painted anatomy, folds, hands, faces |
| Customisation | **Unchanged — 11,520.** Colour stays a runtime parameter |
| New artwork | **17 masks** for v1 (1 body + 6 hair + 4 facial hair + 6 tops); the 12 wearables can stay drawn because nothing awards one |
| Engineering | Medium — a decode step, a role palette, a `prepare-incoming` verifier, a new acceptance gate |
| Runtime | **Rises.** A painted figure run-length encodes to ≈ **4,800 rects** (measured on Tony, scaled to this canvas) against ~500 today. Probably needs a raster path |
| Migration risk | **Low.** Per-slug swap: one layer at a time, revert is a registry row |
| Saved configs | Fully preserved |
| The catch | Does not fix §B.3 — the pose stays frontal and symmetric because the body must serve six tops. And 17 masks must register to the pixel, which `prepare-incoming.ts` exists because generators cannot do |

### Option 3 — Painted whole figures, customisation collapses

Paint 8–12 complete manager characters. Customisation becomes "pick one", plus
whatever tinting a role mask still allows.

| | |
|---|---|
| Visual ceiling | **Highest.** A single coherent painting per manager |
| Customisation | **Collapses.** ~12 looks, or ~2,500 with tinting, from 11,520 — and hair/beard become baked, so two managers who pick the same figure are the same person |
| New artwork | 8–12 figures, and **every future option is a whole new figure** |
| Engineering | Low |
| Runtime | Same as Option 2 |
| Migration risk | **High** — the stored `hair` / `facial_hair` / `top` integers stop meaning anything |
| Saved configs | **Not preserved** |

### Option 4 — Painted **build** masks below the neck, painted layers above — *recommended*

The cut line is anatomical rather than technical. **Below the neck**, the figure
is painted as **one mask per top**: torso, arms, hands, garment, legs and boots
in a single painting, so the arms can be posed, one hand can go in a pocket, a
sleeve can overlap a hip, and the garment can be cut for that body. **The head
stays at a fixed position on every build** — same skull, same `FACE` landmarks —
so hair and facial hair register **once** against one head and still combine
freely.

| | |
|---|---|
| Visual ceiling | **High, and it is the only option that reaches asymmetry and overlap** |
| Customisation | **6 builds × 4 skin × 6 hair × 8 hair colour × 5 facial hair × 8 top colour = 46,080 nominal** — more than today, because a build's *pose* now varies too. The honest number is that it is **the same six traits with the same six stored integers**; what changes is that `top` now selects a pose-and-garment rather than a garment |
| New artwork | **17 masks** — 6 builds, 1 head/face plate, 6 hair, 4 facial hair. Same count as Option 2 |
| Engineering | Medium — identical to Option 2 plus a head plate. `LAYER_ORDER`, `TRAIT_LAYER`, the catalog and `composeCharacter` need **no structural change**: `base-body` becomes the build layer, painted per `top` index |
| Runtime | Same as Option 2 |
| Migration risk | **Low**, if build *k* is painted wearing top *k*'s garment. Then every stored `top` value still means what it meant |
| Saved configs | **Fully preserved** under that constraint |
| The catch | The 4 body-slot **wearables** (apron, jersey, tracksuit, delivery uniform) would need one mask per build — 4 × 6 = 24 — because a garment drawn over a posed body must match that pose. **Deferrable**: nothing awards a wearable in v1 and the wardrobe is empty. It is a real future cost and it is stated here rather than discovered later |

**Rejected without a table: CSS/SVG filter recolouring** of finished full-colour
art (`hue-rotate`, `feColorMatrix`). It produces colours that are not in the
locked palette, which `palette.test.ts` and `process-art.ts` both exist to
prevent, and it cannot give a ramp different *shapes* of shadow per tone.

---

## E. Recommendation — Option 4

**Painted role-masked builds below the neck, painted role-masked hair and facial
hair above a fixed head. 17 assets. Same six traits, same six stored integers,
same 112 × 168 canvas, same room contract.**

Why this one:

1. **It is the only option that addresses the actual cause.** §B.3 is
   architectural: the figure is stiff because the body must serve six garments.
   Merging body-and-garment into one painted build is the smallest change that
   makes an asymmetric, overlapping, *illustrated* pose possible — and it costs
   nothing, because **every manager always has a top** (`TOP_OPTIONS` has no
   `null` option), so the separate base body was never buying variety below the
   neck.
2. **It keeps colour as a runtime parameter**, which is the invariant
   `MANAGER_SPRITE_BOUNDARY`, `OPEN_ITEMS` **A4** and `ROOMS_BOUNDARY §14.1` all
   protect. Nothing in this repo's 132-file objection applies: the masks carry
   roles, not colours.
3. **The art budget is realistic for a ten-person game** — 17 pieces, at one
   canvas, with the head shared. Option 2 costs the same 17 and buys less.
4. **It preserves every saved manager configuration** provided build *k* wears
   top *k*'s garment, which is a constraint on the brief rather than on the code.
5. **It is reversible per layer.** `art_status: placeholder` still means "draw
   yourself"; a build that comes back wrong is a registry row reverted, and the
   shipped drawn sprite is the fallback for as long as it is needed.
6. **It respects the closed boundaries.** No trait added or removed, no schema
   change, no migration, no `ACTIVATION.md` step, no change to the room's
   geometry, the density rule, Tony, or the customiser's screen design.

The honest cost: **the pose becomes part of the `top` choice**, so a manager
cannot have the flannel with the hoodie's stance. That is a real reduction in
independence, and it is what buys the illustrated look. It is a commissioner
decision (§H, decision 1).

---

## F. Exact art requirement

**Do not commission any of this until §H is answered.** Nothing here has been
generated.

**Canvas: `112 × 168`, hard alpha, no anti-aliasing, feet on row 167, symmetric
about column 56 only where the drawing intends it.** Every piece is delivered as
a **role mask**, not as finished colour.

### The role vocabulary

| Role | Meaning | Maps to |
|---|---|---|
| `outline` | the figure's own silhouette | `ink-900` |
| `light` | key light, upper-left | ramp step above base |
| `base` | the material | ramp base |
| `shade` | turned away | ramp step below base |
| `shade2` | core shadow / contact *(new — needs the palette extension)* | two steps below |
| `fixed:<key>@<step>` | trousers, boots, buttons, eyes, teeth — anything not the manager's to choose | `FIXED` in `palette.ts` |
| transparent | not this layer | — |

Each mask additionally declares which **channel** each region belongs to —
`skin`, `garment`, or a `fixed:` key — because a build contains both a skin
region (hands, neck, forearms) and a garment region.

### The 17 pieces

| # | Piece | Slug | Notes |
|---|---|---|---|
| 1 | Head and face plate | `avatar_body_base` | Skull, ears, eyes, nose, mouth, neck. **Fixed position on every build.** Skin channel throughout |
| 2–7 | Six builds — torso, arms, hands, garment, legs, boots | `avatar_body_starter_02…07` | Hoodie · Button-up · T-shirt · Jersey · Flannel · Sweater, **in that order** so every stored `top` keeps its meaning. Garment on the garment channel; hands/forearms on the skin channel; trousers/boots on `fixed:denim` / `fixed:leather` / `fixed:sole`. **Each build is posed differently** — that is the point |
| 8–13 | Six hairstyles | `avatar_hair_01…06` | Short · Buzzed · Long · Curly · Receding · Ponytail. Hair channel. **The ponytail hangs on the wearer's left** — the right hand holds props |
| 14–17 | Four facial hairs | `avatar_face_hair_01…04` | Stubble · Moustache · Goatee · Full beard. Hair channel (facial hair takes the hair colour, by design) |

**Deferred, and not part of this batch:** the 12 wearables. Head/face/hand items
(7 of them) will still register against a fixed head and can be masked later at
one piece each. The 4 **body** items need one mask per build — 24 pieces — and
that bill comes due only when something awards a wearable, which nothing does.

### The three things that make the batch land

1. **A registration jig, emitted by the current renderer.** The shipped sprite
   already knows exactly where the skull, brow, eye line, shoulder, wrist, hem,
   knee and contact row are. Export that as a `112 × 168` plate and require every
   piece to be painted over it. The one documented failure mode of art in this
   repository is framing — *"across three rounds of candidates not one arrived
   correctly cropped"* — and a jig is the mechanical answer to it.
2. **A mechanical verifier in `scripts/prepare-incoming.ts`**: canvas exact,
   alpha hard, feet on 167, head landmarks inside tolerance, role count within
   the declared vocabulary, no colour outside the role palette. A piece that
   fails is regenerated, never compensated for in the renderer
   (`ASSET_PIPELINE §9`).
3. **An `avatar` family palette extension, sized by measurement after the first
   piece lands** — not chosen up front. `scripts/derive-family-palette.mts`
   already does this and `character`'s 16 colours are the precedent. Five roles
   per ramp cannot come out of the shared 32; this is the same gap Tony's own art
   had, closed the same way.

---

## G. Implementation plan, smallest safe sequence

Every step is behind the existing per-slug art-swap contract, so **at every point
the product still renders** and reverting is a registry row.

| # | Step | Files | Gate |
|---|---|---|---|
| 0 | Claim the area in `docs/ACTIVE_WORK.md` | that file | — |
| 1 | **Emit the registration jig** — a script that renders the current sprite plus landmark guides to `art/jigs/manager-112x168.png` | `scripts/` (new), reads `lib/character/art/geometry.ts` | new unit test: the jig's landmarks equal `geometry.ts`'s constants |
| 2 | **Decode path**, with no art yet: `toneGrid(slug)` may come from a mask instead of shapes; add the role palette and `shade2`. Nothing changes on screen | `lib/character/art/index.ts`, `lib/character/sprite.ts` (Tone type), `lib/character/palette.ts` | existing suites must stay green **unchanged**; a new test decodes a synthetic mask |
| 3 | **Commission and land ONE build** — the T-shirt (`avatar_body_starter_04`), the most exposed garment. Judge it in the room at 390 before anything else is commissioned | `art/incoming/`, `scripts/prepare-incoming.ts`, `art/assets.inventory.json` | `checkManagerBelongsInTheRoom`; visual review at all three widths |
| 4 | **Measure the render cost** on that real asset. If runs ≫ 2,000, add a server-rendered raster path keyed by `compositeKey` | `components/character/character-view.tsx` | `checkCharacter` reworked — see risks below |
| 5 | Derive the `avatar` palette extension from the landed asset | `art/palette.json`, `lib/character/palette.ts` | `palette.test.ts` — every runtime colour is in the locked file |
| 6 | Land the head plate + the remaining five builds | as step 3 | as step 3 |
| 7 | Land 6 hair + 4 facial hair; verify the **matrix** (every hair × every build × balding × hats) | as step 3 | the existing preview-fixture matrix in `character.test.ts` |
| 8 | Re-photograph all 13 `character-*` states and the `rooms-*` states | `scripts/visual-qa.mts` | full `npm run check` + `npm run visual:qa` |

**Schema: no change.** Six integer columns, same meanings, same indices. No
migration, no backfill, nothing moves in `docs/ACTIVATION.md`.

**Saved configurations: preserved exactly**, on the one condition that build *k*
is painted wearing top *k*'s garment (§F). If the commissioner wants a build
order that breaks that, say so before art is briefed — it becomes a data
migration and the whole "no schema change" claim goes with it.

**Contracts that must survive untouched:**

- `lib/rooms/objects.test.ts` — the sprite canvas **is** `roomObject('manager').rect`
- `checkManagerBelongsInTheRoom` — sprite scale and room scale within 2%, not
  stretched, shadow at the feet
- `lib/character/separation.test.ts` — wearables can never reach the loot table
- `app/actions/use-server-exports.test.ts` — the E352 guard
- `character.test.ts`'s catalog-order assertions — indices are append-only
- `shading.test.ts`'s **flood fill from outside the canvas** — this one must be
  rewritten to run on decoded masks rather than deleted. A painted layer can have
  a hole in it exactly as a drawn one can, and it caught two on the last pass

**Gates that will need rework, and this is the main engineering risk:**
`checkCharacter` asserts an `<svg>`, `rects >= 200`, `fills >= 8` and
`shape-rendering="crispEdges"`. If step 4 concludes a raster path is needed,
**three of those four stop being meaningful** and the replacement has to measure
the same properties on a canvas — that the figure is drawn, has tonal structure,
is not smoothed, and lands on whole pixels. Write the replacement before the
switch, and make it fail on the old build.

**Visual QA at 390 / 375 / 360** is unchanged in shape: 13 `character-*` states
plus the `rooms-*` states, driven from `lib/character/previews.ts`'s fixtures,
which already cover the tallest, widest, balding-with-visor and every-slot cases.
The mandatory addition is a **side-by-side capture of a manager and Tony at their
true room scales at 390** — the gap in §C is only judgeable that way, and no such
capture exists in the repository.

---

## H. Decisions I need from you before anything is implemented

1. **Does the pose belong to the top?** Option 4 merges body and garment, so
   choosing the flannel also chooses that build's stance. It is what buys the
   illustrated look. Yes / no — and if no, the answer is Option 2 (same 17
   assets, frontal symmetric pose, ceiling lower).
2. **Approve the option**, or name a different one. Option 1 needs no art and no
   decision from you; Option 3 costs saved configurations and is not recommended.
3. **Art production route.** Who paints 17 masks, and against the jig? This is
   the step the repository has historically been worst at, and step 3 exists to
   test it on one asset before spending on sixteen more. Also confirm this stays
   inside the no-paid-API ruling.
4. **The `ART_SPEC §4` detail budget** (≤ 8 interior shapes on a body, ≤ 6 on a
   face) is contradicted by the approved Tony asset and would be contradicted by
   every piece in §F. Amend the spec to describe what Tony actually is, or hold
   managers to the lower budget. Reported, not resolved.
5. **Whether an `avatar` palette extension is acceptable in principle**
   (additive, family-scoped, byte-identical for every other family — the same
   mechanism `zone` and `character` already use). Without it, five tonal roles
   are not available and the ceiling drops back toward Option 1's.
6. **Whether the wearables' future 24-mask body bill is acceptable**, or whether
   body-slot wearables should be constrained to one neutral build when something
   finally awards one.

Nothing proceeds until 1, 2 and 3 are answered.
