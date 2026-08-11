# `manager_build_tshirt` — art-generation brief, round 2

**One asset.** Commissioner authorisation, 2026-08-11: the T-shirt build is the
only manager artwork approved, and the remaining sixteen pieces are not
commissioned until this one has been seen in the real basement on a real phone.

- **Production slug:** `avatar_body_starter_04` — the T-shirt, top index **2**
- **Upload:** `art/jigs/manager_paintover_672x1008.png` and
  `art/jigs/manager_reference_sheet.png`
- **Deliver:** one PNG, **672 × 1008** (or any size at that 2:3 aspect),
  transparent background
- **Then run:** `npm run art:mask -- <file.png> avatar_body_starter_04`

---

## Round 1, and what changed on our side because of it

The first concept was **approved as visual direction** — anatomy, shoulder
construction, asymmetric stance, hand in pocket, readable hand, dimensional
T-shirt, denim folds, knee break, boots. That is the target and it is not being
re-litigated.

It failed the *file* contract, and three of those failures were ours to fix
rather than the artist's:

| Round 1 failure | Fixed how |
|---|---|
| Delivered at ~1024 × 1536; the tool demanded a whole multiple of 112 × 168 | **Our rule was too strict.** Any size at the right aspect is now accepted — see §2 |
| The trousers could only be painted in two very dark blues | **Our palette was too thin.** A trouser highlight is now paintable, recorded pending a ruling |
| The shirt could only carry three tones against Tony's five | **Same.** Five shirt tones are now paintable, two of them recorded pending |
| Painted as a standalone portrait filling the frame | **The plate now says so.** The head region is hatched, labelled and visually occupied |
| Black background with a warm glow | Unchanged rule — transparent, and the validator refuses a background by name |

---

## Part 1 — the prompt

Paste everything between the rules. Upload the two images with it, and re-attach
your round-1 concept so the pose can be carried over.

---

> **What this is.** A single character sprite for a late-1990s / early-2000s
> pixel-art game set in a neighbourhood pizza parlour. One manager — an ordinary
> adult — standing in a basement rec room, seen straight on. Production game art.
>
> **You have made this figure once already and it was very good.** Keep the
> drawing: the pose, the weight shift, the hand in the pocket, the relaxed
> opposite arm, the shoulder and torso construction, the sleeve drape, the denim
> folds and knee break, the boots, the anatomy, the personality. **Only the file
> was wrong.** Do not redesign it, do not simplify it, and do not make it
> symmetric or geometric.
>
> ### The six things to fix
>
> 1. **Paint on the supplied plate, `manager_paintover_672x1008.png`.** It is a
>    canvas, not a mood board. Do not reframe, re-centre, crop or rescale it.
> 2. **Paint nothing in the hatched band at the top.** That is where the head goes
>    — the game draws the head separately, and you can see it on the plate. Your
>    figure starts at the shoulders, just below the hatching, about a third of the
>    way down.
> 3. **The soles sit on the very bottom row**, on the marked line. The figure
>    stands on the floor.
> 4. **Transparent background.** No black field, no glow, no vignette, no cast
>    shadow, no ground plate.
> 5. **Only the seventeen colours on the reference sheet**, and no others.
> 6. **Hard pixel blocks, no anti-aliasing**, no gradients, no soft edges, no blur.
>    Every mark is a crisp 6 × 6 block on this canvas.
>
> ### Quality target
>
> Match **Tony** on the reference sheet — believable anatomy, arms built as arms
> with an upper arm and elbow and forearm, readable hands, clothing that sits *on*
> a body with real folds, trousers with a hip and a knee break, shoes with a sole
> and a toe and a heel, a hard dark outline around the whole figure with softer
> internal edges, warm highlights facing up and left, and **asymmetry**.
>
> **Do not copy Tony's identity** — not his apron, moustache, hair, jersey or
> face. He is the quality bar and the world, not the character.
>
> ### The light
>
> One source, from the upper left, consistently across the whole figure.
>
> ### The palette — seventeen colours
>
> | Where | Highlight | Light | Base | Shade | Deep shadow |
> |---|---|---|---|---|---|
> | Outline (whole figure) | | | `#1A1214` | | |
> | **Shirt** | `#F58A80` | `#E4534A` | `#C42B2B` | `#8C1F22` | `#5A1216` |
> | **Bare skin** — forearms, hands | | `#F2C9A0` | `#D9A173` | `#9C6640` | |
> | **Trousers** | `#4A7FB8` | `#2C5A8C` | `#14233D` | | |
> | **Boots** | | `#C99A63` | `#7A4A2A` | `#4A2E1C` | |
> | **Soles** | | `#4A3B3F` | `#2E2226` | | |
>
> Use the full range on the shirt and the trousers — five and three steps — because
> that is what makes fabric read as fabric. Skin and boots use three.
>
> **The shirt is a plain crew-neck T-shirt with short sleeves**, so the forearms
> are bare. No logo, no print, no team mark, no text, no numbers.

---

## Part 2 — how the returned file becomes production art

**An image generator cannot emit an exact machine-readable encoding, and this
pipeline does not pretend otherwise.** The middle step is deterministic:

```
painted PNG, any size at 2:3
   ↓  snap    every SOURCE pixel to its nearest role key — nothing is averaged
   ↓  mode    the majority role of the source cell under each output pixel
role mask, 112 x 168
   ↓  validate  registration · outline · coverage · head clearance · framing
lib/character/art/masks/avatar_body_starter_04.ts
```

**Why any size now works.** Snapping *before* downscaling means no colour between
two keys is ever created, so no pixel can land on a role nobody painted. Mode is
the correct operator for indexed data; an average would blend skin into shirt and
produce a tan that snaps to *boot light*. A correctly painted 6 × file still
decodes byte-for-byte to what it was painted as — the generalisation costs
nothing.

**Read the snap distance in the report:**

| Mean | Meaning |
|---|---|
| **0** | painted in the exact colours — the mask *is* the art |
| **under ~5** | close; the conversion is a faithful reading |
| **over ~12** | painted in another palette. The tool warns; the mask is its **guess**. Repaint |

**Nothing is written if validation fails.** `ART_SPEC §9` — a layer that misses
its anchor is regenerated, and the renderer is never adjusted to compensate.

| Refusal | Fix |
|---|---|
| *drawn to fill the frame* | the figure reaches into the head band |
| *outside the shoulder band* | drawn too small, or floating |
| *the lowest painted row is N* | soles not on the bottom row |
| *the neck is open at row 63* | the collar does not close over the neck |
| *without an outline* | the silhouette is not fully enclosed in `#1A1214` |
| *is a background, a vignette* | something is painted behind the figure |
| *aspect of N* | delivered squashed or stretched |

Then register it — one import and one entry in
`lib/character/art/masks/index.ts`. Until that line exists every manager keeps
rendering the drawn sprite.

## Part 3 — two of the seventeen colours do not exist yet

`#F58A80`, `#5A1216` and `#4A7FB8` are marked `*` on the sheet. They are the
shirt's highlight and deep shadow and the trousers' highlight, and the locked
palette has no colour for them.

**Paint them anyway.** The mask *records* them faithfully; the renderer collapses
them onto the nearest step it can paint until the commissioner rules on an
`avatar` palette extension. The day that ruling lands, three rows in
`lib/character/mask.ts` change and every delivered mask renders at full depth
**with no regeneration**.

So the first render of this prototype will be flatter than what you paint — three
shirt tones instead of five, two trouser tones instead of three. That is expected,
it is measured, and it is the evidence for the ruling rather than a defect.
`docs/MANAGER_BUILD_PROTOTYPE.md §3` carries the measurement against Tony.
