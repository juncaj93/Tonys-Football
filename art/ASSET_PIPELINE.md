# ASSET_PIPELINE.md — Placeholder-First Asset Registry

**Version:** 1.0
**Purpose:** How art gets from a prompt into the application without ever blocking engineering.

---

## 1. The core mechanism

**Every asset is referenced by slug, never by file path.**

```
Component  →  asset_slug  →  registry lookup  →  file path (or placeholder)
```

Application code asks for `collectible_bapple_tree`. It never knows, and never needs to know, whether that resolves to finished art or to a closed pizza box with a handwritten label.

**Swapping a placeholder for final art is a registry row change.** No component edit. No refactor. No code review. No conditional branches, no `TODO` markers, no "art pending" states scattered through the codebase.

This is the entire reason art and engineering can run in parallel.

---

## 2. Placeholder-first, in order

1. **Inventory first — it is data, not art.** `assets.inventory.json` defines every slug, its family, canvas size, alt text, and placeholder fallback *before any image exists*.
2. **The registry seeds every slug pointing at a placeholder.** Day one, `art_status: "placeholder"` across the board.
3. **Engineering builds against slugs.** Every screen renders. Every flow is playable end to end — as handwritten signs and closed pizza boxes. Nothing is stubbed, nothing is disabled, nothing waits.
4. **Batches get generated, processed, and registered.** Each registration is a data change plus a file.
5. **`/admin/assets` shows the truth** — every slug, its current state, and a "still placeholder" filter, so progress is visible and nothing is quietly forgotten.

### Why placeholders are in-world

A grey box reads as broken software. A hand-torn cardboard sign taped to the wall reads as **a shop held together with tape** — which is exactly what Tony's is.

The product can ship with most art unfinished and still look deliberate. That is not a compromise; for this world it is arguably funnier than the finished version.

---

## 3. Registry record

Every asset carries this metadata, per `06 §16`:

| Field | Purpose |
|---|---|
| `slug` | Stable identifier. **Never changes.** Code references this and only this. |
| `family` | character · avatar · zone · collectible · surface · frame · ui |
| `canvas` | Logical pixel dimensions |
| `path` | Current file, or null while placeholder |
| `placeholder_slug` | What renders while `art_status = placeholder` |
| `art_status` | placeholder → generated → approved → retired |
| `batch` | B0 … B5+ |
| `version` | Increments on every replacement |
| `source` | Which tool generated it |
| `prompt_ref` | Which template and subject line produced it |
| `rights_status` | original · derived · licensed. **No asset ships with this unclear.** |
| `alt_text` | Required. Accessibility is not optional. |
| `attachment_anchors` | Avatar layers only |
| `safe_area` | Text-bearing surfaces only |
| `created_at` / `updated_at` | Audit trail |

**Retiring an asset never deletes its history.** A retired asset keeps its record so past Slice issues and archived seasons continue to render exactly as published.

---

## 4. Processing pipeline

Run on every batch, without exception — with one deliberately different path for
portrait room shells.

### Portrait room-shell fidelity rule

`zone_*` scenery is a composed room painting, not a small sprite. It ships at
**3× its logical canvas** with normal browser interpolation; the registry canvas
still owns layout and hit-map coordinates. Do not downscale it to its logical
size, force `image-rendering: pixelated`, or quantize it to the collectible
palette. Any of those steps discards the approved lamp gradients, material
texture and clean edges, and Safari then magnifies the damage.

Small props — including the `zone`-family rack, banner and box — remain sprites
and follow the normal hard-edge, palette-closed route below.

### Step 1 — Downscale, nearest-neighbor

Image models **cannot** produce true pixel art at 32px. They produce 1024px approximations *of the look*. Generate large, downscale hard, nearest-neighbor only. Never prompt for final dimensions directly.

### Step 2 — Quantize to `palette.json`

**The single most important step in the entire art plan.**

Mechanical quantization is what makes fifty independently generated images look like one world. Without it every batch drifts a few degrees — individually fine, collectively wrong — and the seams become visible around batch four, by which point the earlier batches have to be redone.

**Amended 2026-08-06: that argument is about collectibles, and it is not about
the room.** It holds for 46 × 46 sprites drawn in independent batches months
apart. It does not hold for a 941 × 1672 painting with 153,738 distinct colours
that ships as one asset and has no batch to drift from — and forcing the
collectible palette onto it destroyed most of what the approved art contained.

So the shared 32 remain **shared**, and a family whose art measurably needs more
declares its own additive extension in `familyExtensions`. The **size of an
extension is measured, not chosen**: derive it with
`npx tsx scripts/derive-family-palette.mts <family> <count>` and read the ladder
in `docs/PALETTE_FIDELITY_BOUNDARY.md §4` for how the count is settled. Today
`zone` declares 64 and `character` 16; every other family quantizes against the
shared 32 exactly as before, byte for byte.

The prompt gets close. **The pipeline makes it exact.**

Also strips `#000000` and `#FFFFFF`, which are common model defaults and are prohibited by the palette.

#### The colour metric: plain Euclidean RGB. Ruled 2026-07-29.

Nearest-palette matching uses **plain Euclidean distance on raw sRGB channel
differences**:

```ts
const dr = r - colour[0];
const dg = g - colour[1];
const db = b - colour[2];
const distance = dr * dr + dg * dg + db * db;
```

No weights, no linear-light conversion, no tuning constants.

**Do not reintroduce luma weighting.** The reason is not stylistic preference — it
shipped, and it broke assets.

##### What went wrong

The original implementation applied luma coefficients to each channel **before**
squaring:

```ts
const db = (b - colour[2]) * 0.11;   // then db * db
```

Squaring a 0.11 coefficient leaves blue contributing **1.21%** of the total
distance. Green, at 0.59² = 34.8%, dominates. The metric therefore ranks
candidates almost entirely by brightness and is nearly blind to hue.

That is the wrong tool for this job. `palette.json` is not a greyscale ramp — it
is 32 shared colours across **ten deliberately separated hue families** — plus a
family's own extension where one is declared — and the
matcher's first job is to choose the right family. Luma weighting is appropriate
for converting colour to grey. It is not appropriate for a cross-ramp palette
matcher.

##### The failure mode: warm browns turn violet

**Blue is the axis that separates the warm dark woods from `violet.violet-deep
#3B2050`.** The two are close in red and green and far apart only in blue —
exactly the channel that had been discounted to near-nothing.

Backsplash tile `#500E01`, a dark warm red-brown:

| Candidate | Weighted | Euclidean |
|---|---|---|
| `#3B2050` violet-deep | **15 — chosen** | 84 |
| `#4A2E1C` wood-dark | 19 | **42 — chosen** |

Across `zone_parlor_shell` the weighted metric painted **8.48% of the image
violet** — the checkerboard backsplash, the doorway recess and the carpet. It
also mapped Tony's **blue jersey to `#C99A63`, a tan**, for the same reason.

It survived two batches unnoticed because the earlier assets' dark areas were
near-black and landed on the `ink` ramp under either metric. `zone_parlor_shell`
was the first asset with large mid-dark warm-brown fields.

##### Why plain Euclidean specifically

Measured, simple, and free of tuning constants. It maps 0% of the shell to
violet-deep. A linear-light variant scores the same on that measure and was not
chosen: the extra conversion buys nothing observable here and adds a step to
reason about. Any coefficient placed in front of a channel is a thumb on the
scale that will eventually drag some other hue across a ramp boundary — silently,
in an asset nobody happens to be looking at.

##### Remediation rule

If an asset comes out with a wrong-hue cast, **count the pixels before adjusting
anything.** `scripts/process-art.test.ts` asserts palette closure and the shell's
violet share on every run; extend it with the new asset rather than eyeballing
the output. Do not add palette colours or reweight the metric to fix a single
asset — a source that needs either is usually a source that needs revising.

### Step 3 — Alpha cleanup

Remove background, harden edges, eliminate anti-aliasing fringe. Pixel art has no partial alpha except where deliberately authored.

**For room objects (`object_*`) the alpha channel is load-bearing, not incidental.** It is the
silhouette the affordance is derived from — see Step 5. A fringe, a stray pixel, or a stub of
leftover floor plate becomes a visible defect in the glow. Objects ship on a fully transparent
background with **no cast shadow and no ground plate**.

### Step 4 — Trim and anchor

Trim to the declared canvas. For avatar layers, verify each attachment anchor and record the offset. **A layer that does not land on its anchor is regenerated — the renderer is never adjusted to compensate.**

**Room objects are trimmed hard to the object.** The transparent margin is what makes a tap land
on the object rather than on the wall beside it.

### Step 5 — Emit

Sprite sheet plus JSON metadata into `/public/assets/<family>/`.

**Silhouettes are alpha-derived. No authored paths.** The affordance glow is
`filter: drop-shadow()` applied to the overlay's **own alpha channel**, so it follows the
outline exactly, never covers the wall beside the object, and updates automatically the moment
a placeholder is swapped for final art.

**Nothing is emitted for this step** — no SVG polygon, no mask, no hit-map image. The authored
`needsSilhouette` path requirement of the earlier ruling is withdrawn
(`PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §0`, §9.4), and `needsSilhouette` is no longer a
field in `assets.inventory.json`.

A rectangle around an irregular pixel object swallows the empty wall beside it, so taps land
on nothing and the highlight covers scenery — that is the failure the navigation map exists to
prevent. Alpha derivation solves it mechanically rather than by hand, which also removes the
class of bug where the art changes and the traced polygon does not.

The **hit region** is the tightly-cropped overlay's bounding box expanded to a **44px minimum**
effective target. Expand the hit region, never the glow.

### Step 6 — Register

Write the registry row: source, prompt reference, rights status, version, alt text. Flip `art_status` to `generated`, then `approved` after review.

---

## 4a. The one recorded correction — and why there is no Step 7

**The pipeline has six steps. Every asset is a pure function of its source file, and that property is not negotiable** — one source, one command, one output, a regeneration that cannot drift.

**`zone_parlor_shell` carries one exception, applied once and recorded.** Its Tonight board sits five logical units left of where the championship rail needs it. The correction could not be made in the source: 5 logical units is **14.7 source pixels** at the shell's 2.9406:1 ratio, and moving a painted board by a fractional pixel then downsampling resamples the frame's one-pixel bevel into mush. It had to happen after quantization, on the 320 × 569 grid, where a unit is a unit. `art/incoming/` was not touched.

`scripts/shift-tonight-board.ts` is the record of what was done. **It is not a pipeline stage and must not become one.**

That is a deliberate choice with a cost, and the cost is stated plainly: **reprocessing the shell from source reverts the board.** Wiring the correction into `art:process` would fix that and would also turn a one-off into architecture — a registry, a concept, and an invitation to add a second entry rather than fix the second asset's source. The trade taken is the other one.

So the revert is caught rather than prevented, in two places:

- `art:process` **prints a notice** naming the script whenever it rewrites that slug.
- `scripts/shift-tonight-board.test.ts` **fails**, with the command in the failure message, if a reverted shell is ever committed.

The correction also **cannot double-apply**, which matters more than it sounds: a blind "copy the block right by 5" run twice slides the board ten units into the wall with no exception and no failed check — just a room that is quietly wrong. It measures instead. It finds the board's right edge by walking in from the lit wall (the only side that moves with the board — the dark panel on the left is architecture that stays put), confirms the frame's own colour profile is there, then decides: **180 shifts, 185 is already done, anything else is an error.**

**If a second asset ever seems to need this, fix its source instead.** Almost always it can be fixed there, and then it should be.

---

## 5. Batch order

Ordered by visible return, so the product looks better earlier.

| Batch | Contents | Effect |
|---|---|---|
| **B0** | Test set (7) | **Locks `ART_SPEC.md`.** Approved as one composite, not individually. |
| **B1** | Tony (3) + parlor shell + counter-front + 6 parlor overlays + Back Hall shell + 4 Back Hall overlays (15) | The shop becomes a place |
| **B2** | Avatar layers + wearables (22) | Managers become themselves |
| **B3** | Collectibles (12 priority of 24) | Pulls feel worth the tokens |
| **B4** | Surfaces, frames, placeholders, UI | Dressings and rarity go live |
| **B5+** | Additional dressings, seasonal, v1.1 | Continuous, forever |

**B0 gates everything.** No other batch begins until the composite is approved and the spec locks.

---

## 6. Generation guidance

- **Budget a 50–70% cull rate.** Roughly four candidates per needed asset — about 150 generations for twelve sheets. Generation is cheap; **reviewing is the real cost.** Cull hard and early rather than trying to rescue a near-miss.
- **Reuse the style preamble verbatim.** Never paraphrase between batches. Paraphrasing is how drift starts, and it is invisible until assets sit side by side.
- **Every prompt carries the negative block.** No third-party trademarks, no team logos, no real player likenesses, no real signatures, no copied restaurant branding, no unapproved brand marks, no Mario, no existing game characters. This enforces `06 §17` and the publicity-rights concerns at the prompt level rather than at review.
  - **Tony's Pizza's own marks are exempt on first-party assets** (`ART_SPEC.md §10`, ruled 2026-07-29) — the house wordmark and logo treatment, no TM symbol, and nothing beyond Tony's own branding. `zone_parlor_shell.png` stays excluded: shop signage is an overlay, never baked into the room.
- **Never prompt for final pixel dimensions.** Always generate large and downscale.

---

## 7. What is never generated

Fourteen visual effects require **zero assets** — they are CSS, SVG, or a few lines of canvas. Listed in `ART_SPEC.md §8` and flagged in `assets.inventory.json` under `notGenerated`.

Auras · punishment flies · stink lines · ring sparkle · legendary rays · frame glow · snow · steam · CRT scanlines · screen shake · box wobble · confetti · newspaper landing · seasonal lighting.

**Do not add these to a generation batch.** An asset with a baked-in glow cannot be animated, cannot respect `prefers-reduced-motion`, and cannot be reused across rarity tiers.

---

## 8. Storage

**v1: static files in the repository**, served by the Vercel CDN. Pixel art is kilobytes. This removes object storage, signed URLs, MIME validation, and upload scanning from v1 entirely.

Swapping an asset is a commit that auto-deploys in about a minute. Free, versioned, and diffable.

**The slug indirection means a blob store can be added later without touching a single line of game code** — only the registry's `path` resolution changes. Defer it until the commissioner genuinely needs to upload art without a deploy.

---

## 9. Failure modes and their fixes

| Symptom | Cause | Fix |
|---|---|---|
| Batch 4 doesn't match batch 1 | Preamble was paraphrased | Regenerate batch 4 with the verbatim block |
| Hat floats above the head | Layer not authored to anchors | **Regenerate the layer.** Never adjust the renderer. |
| Collectible unreadable in inventory | Designed for 96px, not 16px | Regenerate with a simpler silhouette and lower detail budget |
| Text illegible on a poster | Safe area has interior detail | Regenerate the surface with a flatter center |
| **Warm dark browns map to violet** | **Colour metric discounts blue** | **Use plain Euclidean RGB distance; do not reintroduce luma weighting** |
| Banding across a wall | Too many source colors for the palette | Re-quantize; if it persists, simplify the source |
| Rarity indistinguishable in greyscale | Frames differ by color only | Regenerate with distinct geometry per tier |
| Model bakes text into a blank surface | Most common surface failure | Regenerate. Strengthen the NO TEXT instruction. |
| Glow bleeds onto the wall beside an object | Leftover ground plate or alpha fringe | **Re-run alpha cleanup, then re-trim.** Never hand-author a mask to compensate. |
| An overlay floats above its prepared spot | Shell recess has no interior shadow | Regenerate the shell with the shadow; do not add a drop shadow in CSS |
| The model fills a prepared empty recess | "Prepared places" instruction was weakened | Regenerate with the negative block verbatim |

---

## 10. The irreversible decisions

Everything can be regenerated cheaply **except**:

1. **The pixel grid** (`ART_SPEC.md §2`)
2. **The camera perspective** (`ART_SPEC.md §3`)

Those two define how every asset relates to every other. Changing them means regenerating the entire environment and character library.

**That is the whole reason test batch B0 exists, and why it is approved as a composite rather than as seven separate images.**
