# Homepage art fidelity — why the room looked worse than its own source art

**Status:** **architecture changed, applied, and locally verified.** The homepage's
two painterly families quantize against **their own palettes** rather than the
shared 32. No new art was required at any point.

**Not verified in production.** Nothing carrying this has been merged or
deployed — see `AUTONOMY.md §4`.

---

## 1. Two reports, and the second one is the real defect

**2026-08-05:** *"Much of the homepage art now has distorted coloring and
shading."* Answered by adding four colours to the `zone` family. Mean
quantization error on the shell fell from 35.0 to 21.6.

**2026-08-06:** *"The entire homepage, including Tony, does not preserve the
visual quality of the original approved art… more compressed, noisy, harsh, and
color-distorted than the clean source artwork."* With the ruling that
*"visual fidelity at true phone size is the acceptance criterion"* and that
aggregate error, palette usage and isolated-pixel rate are **not** sufficient.

The second report is correct and the first fix was **the right diagnosis at the
wrong scale**. Four colours halved a number and left a room that was still
visibly orange and posterized on a phone. §3 is the picture that shows it.

## 2. The source art is not pixel art, and that is the whole finding

Measured across every file in `art/incoming/`:

| | dimensions | distinct colours | blockiness¹ |
|---|---|---|---|
| `zone_parlor_shell.png` | 941 × 1672 | **153,738** | 2.9% |
| `character_tony_neutral_02.png` | 480 × 1315 | **72,004** | 5.7% |
| `zone_counter_front_01.png` | 941 × 817 | 97,724 | 2.2% |

¹ share of horizontally adjacent opaque pixel pairs that are identical. True
pixel art is mostly flat runs and scores high; these are continuous-tone
paintings.

**The pixel-art look is manufactured by the pipeline, not present in the
approved art.** `process-art.ts` downscales the shell 941 → 320 (2.94:1) and then
snaps 153,738 colours onto 32. The commissioner's ruling anticipated this in so
many words — *"clean source art being converted into faux pixel art instead of
preserved faithfully"* — and it is what the measurements say happened.

That is not an argument for abandoning the pixel-art look. `MANDATE` requires a
*"native interactive pixel-art world"* and the room still is one: 320 units wide,
hard-edged, `image-rendering: pixelated`. It is an argument that **the number of
colours was a convention rather than a measurement**, and it was set for a
different kind of asset.

### What the room is actually drawn at

The shell ships at 320 px and the browser draws it across the full viewport at
`devicePixelRatio` 3:

| viewport | device px | upscale from 320 |
|---|---|---|
| 390 | 1170 | 3.66× |
| 375 | 1125 | 3.52× |
| 360 | 1080 | 3.38× |

So every quantization artifact is magnified between three and four times before
anybody sees it. **Comparing 320-pixel files to each other flatters the
pipeline**, and every comparison in this document is therefore rendered *through*
that upscale.

**Integer scaling is not available and cannot be bought.** A canvas that lands on
a whole-number scale at all three widths must divide 1080, 1125 and 1170, whose
greatest common divisor is **45**. There is no useful canvas size. The
integer-scale-mismatch hypothesis is closed by arithmetic rather than by
experiment.

## 3. The comparison that decided it

Same region, same device resolution, rendered through the real upscale:

| variant | what it is |
|---|---|
| **A** | the approved source, reduced straight to 1170 px — the benchmark |
| **B** | what shipped after the four-colour pass |
| **F** | the source reduced to 320 and **not quantized**, then upscaled |

On the ceiling, **A and F are hard to tell apart** and **B is neither**: a flat
orange field with the tile grid broken into dashes. On the floor, on the wall,
on the counter and on Tony's face the result is the same.

The conclusion is narrow and load-bearing: **at 320 px the resolution is already
enough. Quantization to the shared palette is the entire defect.**

## 4. The four architectures, measured

The ruling named four and asked for the least complex that closes the gap.

### A — improved shared palette · **rejected, with numbers**

The shared 32 serve the homepage almost not at all. Measured on the shipped
shell after this change, the `zone` extension carries **97.93%** of the room and
the shared ramps carry **2.07%** between them. Growing a palette that is 2%
relevant is not the smallest change; it is the change that keeps every other
family hostage to the room's needs.

### B — typed asset-family palettes · **chosen**

Already the mechanism in the file. `familyExtensions` shipped on 2026-08-05 with
four colours for `zone`; what was wrong was the **size**, which was a guess. It
is now derived from each family's own art.

The ladder, rendered at device resolution and judged on the picture:

| `zone` palette | mean error | verdict |
|---|---|---|
| shared 32 | 35.0 | orange, posterized, stippled |
| +4 (2026-08-05) | 21.6 | still visibly orange |
| +16 | 10.3 | close, banding on the rug and the wall |
| +32 | 7.7 | banding still visible on large fields |
| **+64** | **5.4** | indistinguishable from the source |
| +128 | 4.4 | no visible improvement over +64 |

### C — preserve the authored source colours · **rejected on cost, not on looks**

Skipping quantization is visually the benchmark by definition. It costs
**406 KB** for the shell at 320 and 1.6 MB at 640, against 60 KB for B — and it
gives up palette closure, which `colour-fidelity` and every art test depend on.
B is indistinguishable from it at a fifteenth of the bytes.

### D — higher-resolution production assets · **not needed, and that is measured**

Doubling the shell to 640 halves the magnification, and the ladder shows it is
**not where the loss is**: the unquantized 320 render is already close to the
source, and the quantized 640 render is still orange. Resolution is a second-order
lever and this slice does not pull it. Recorded with numbers so it can be
revisited if a future report is about *sharpness* rather than colour.

## 5. What shipped

| family | extension | derived from | mean error |
|---|---|---|---|
| `zone` | **64 colours** | all six `zone` sources | 35.0 → **5.9** |
| `character` | **16 colours** | Tony | 30.3 → **14.5** |

Derived by weighted k-means over each family's own pixels, ranked by how badly
the shared palette already served them — `scripts/derive-family-palette.mts`,
which prints a block to paste into `art/palette.json`. The hexes are **literals
in the palette file and are never recomputed at build time**: a palette that
re-derived itself would make every asset a function of whatever happened to be in
`art/incoming/`, and that directory is an archive rather than a build input.

Measured on the shipped shell:

| | shared 32 | +4 | **shipped** |
|---|---|---|---|
| mean quantization error | 35.0 | 21.6 | **5.9** |
| `amber` (lamp-glow) share | 27.3% | 20.7% | **0.9%** |
| busiest single colour | 35.8% | 35.8% | **4.2%** |
| distinct colours in the asset | 26 | 30 | **90** |
| file size | 19 KB | 19 KB | 60 KB |

**Additive, so everything else is byte-identical.** The asset-family impact,
measured pixel by pixel against the four-colour state:

| family | changed | detail |
|---|---|---|
| `zone` | **6 of 6** | shell 98.0% · counter-front 97.7% · champion banner 100% · front counter 81.4% · newspaper rack 73.1% · owned box 19.6% |
| `character` | **1 of 1** | Tony, 62.6% |
| `collectible` | **0 of 12** | every approved Batch B piece byte-identical |

That last row is the property the whole mechanism exists for. An extension that
*replaced* a shared colour would have rewritten the collectibles too, which is
the re-approval event the 2026-08-05 scoping decision refused.

### Tony

His skin was landing on the shared palette's muddy tans because nothing in it is
his yellow-orange; his jersey blue and apron cream were served no better. Sixteen
colours take his error from 30.3 to 14.5.

**Sixteen and not thirty-two**, and the reason is the one the ruling asks for:
past sixteen his **isolated-pixel rate keeps climbing** (11.1% → 16.0% → 17.6% →
20.5%) without the face looking better. His shading stops being contiguous and
starts being speckle, which is exactly what *"clean and intentional shading"*
rules out. Nothing about his geometry, placement, layering, glow or entrance is
touched.

## 6. The isolated-pixel rate is the wrong instrument here, and it is worth saying so

The shell's isolated-pixel rate went **2.23% → 13.46%** across this change, while
the picture became far more faithful. Both facts are true. The metric counts
pixels differing from all four neighbours, which on a **smooth gradient rendered
honestly** is most of them — so it rewards flat posterized fields and penalises
the shading the ruling asked to be restored.

A second instrument failed the same way and is recorded because it nearly shipped
as a test: an all-dark-3×3 scan of the ceiling reports **593 blocks on the
faithful ceiling against 18 on the posterized one**, because the faithful ceiling
has continuous grout lines where the posterized one had broken dashes. A gate
that prefers the worse picture is not a gate.

`scripts/shell-surfaces.test.ts` therefore tests three things that are true
regardless of style — the board face is a light even writing surface, the alcove
reads as a recess, the shell is palette-closed — and leaves *"the ceiling is
calm"* to the screenshot, where it belongs.

## 7. Two repair scripts, one retired

**`clean-parlor-surfaces.ts` is deleted**, with its thirty-four tests and
`measure-ceiling.mts`. It repaired a dithered board face, a speckled alcove and a
scorched ceiling — and **all three defects were made by the quantizer**, in its
own words: *"both defects are created by the downscale and the palette snap, not
present in [the painting]"* and *"the palette has nothing between `red-dark
#8C1F22` and near-black, so dark reds land on wood."* The family palette removes
the cause.

Keeping it would have been worse than dead code: it **overpaints the approved
art**. The board's face was being replaced with a flat fill the painting does not
have, which is the opposite of what this document is now for. Visual debts 8 and
9 stay closed — by the cause going, rather than by the repair.

**`shift-tonight-board.ts` stays.** It is a *geometric* correction — the board
sits five units left of where the championship rail needs it — and nothing about
colour retires it. Two of its constants were re-measured rather than relaxed:

- `FRAME_PROFILE`, now for the third time. Under the shared 32 it read
  `#C97A22 #C97A22 #4A2E1C #8C1F22 #8C1F22 #5E3A25 #A9713F` — **`skin-4` on a
  wooden frame**, and two pairs of repeats where the painting has a graded bevel.
  It now reads seven distinct values, which is what the source has.
- `LIT_WALL` was the single colour `#F2A94B` and is now a **set of three**,
  because the wall has depth again. A scan for one exact colour stopped on the
  first row and reported the board at x 195. The board's own lip tones are
  deliberately excluded, which is what keeps it a boundary test.

## 8. Verified

| | |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| `npm run test` | **1338 passed / 84 files**, 2 skipped. Thirty fewer than before: the thirty-four `clean-parlor-surfaces` tests are gone and four took their place |
| `npm run build` | clean |
| `npm run art:validate` | clean — 12 of 24 collectibles, every one fits its slot |
| `npm run visual:qa` | see `docs/CHECKPOINT.md` |
| Full-page evidence | `docs/evidence/homepage-fidelity/` — 390 / 375 / 360, before and after, device resolution and 1:1 |
| Asset evidence | `docs/evidence/palette-fidelity/` — three-way: shared 32, +4, shipped |
| **Production** | **not verified.** Nothing has been merged or deployed. |

## 9. Superseded

- `art/SHELL_AUDIT_zone_parlor_shell.md` and the conclusion that the homepage
  needed **targeted regeneration of source art**. The source is clean at full
  resolution and clean after downscale.
- The 2026-08-05 four-colour extension, by the same mechanism at a measured size.
  It was not wrong; it was 4 where the measurement says 64.
- `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §6`'s per-surface repair table, for the
  three surfaces `clean-parlor-surfaces.ts` owned. The mechanism chosen for each
  is now *"do not damage it in the first place"*.

## 10. Still open

- **No new art is required and none was requested.** The one asset-level defect
  that a pipeline cannot fix is Tony's inherent detail at 88 px, and at 88 px he
  reads as deliberate pixel art rather than as damage. If a future report is
  about his *sharpness* rather than his colour, §4's option D is the lever and
  the numbers are there.
- **Collectibles still quantize to the shared 32**, by commissioner decision.
  They now sit in a room drawn with 96 colours. Nothing in the evidence shows
  them clashing — they are small, punchy, authored shapes on a tray — but it is a
  coherence question that only a real screen answers, and it is recorded rather
  than assumed.
