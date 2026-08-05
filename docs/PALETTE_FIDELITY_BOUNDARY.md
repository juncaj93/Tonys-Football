# Homepage art fidelity — where the colour is lost, and what closes it

**Status:** **applied and locally verified** (`b4815a1`). The four colours are in
`art/palette.json`, six `zone` assets are reprocessed, and the two one-time
corrections baked into the shell were re-derived rather than relaxed. §7 records
what the re-derivation cost and the three defects it exposed; §7a records what is
verified and what is still open.

**Not verified in production.** No branch carrying this has been merged or
deployed — see the Actions-conservation note in `AUTONOMY.md §4`.

---

## 1. The report, and the answer

**Commissioner, 2026-08-05:** *"Much of the homepage art now has distorted
coloring and shading… similar distortion appears in the ceiling and other room
art."*

**The distortion originates in preprocessing — specifically palette
quantization.** Not the source art, not the browser, not CSS scaling, not
filters, not masks, not interpolation. **No new art is required.**

That is established by rendering the pipeline's own intermediate stage rather
than by comparing memories:

| Stage | Result |
|---|---|
| A — incoming source (`art/incoming/zone_parlor_shell.png`) | **clean**; cream walls, calm ceiling, warm wood, clean checkerboard |
| B — lanczos downscale to 320×569, *unquantized* | **clean**; smooth, warm, no speckle, materials separated |
| C — after quantization against the shared 32 | **the defect**: orange ceiling and walls, gold floor tiles, wood counter gone red, hanging plant a brown blob, stipple throughout |

Stage C is what the room looked like when the report was written. Reproduce any
stage with `scripts/palette-preview.mts`, which renders an asset under any
candidate palette without touching `public/assets`.

The pictures are `docs/evidence/palette-fidelity/` — the whole shell at 1:1 and
five 4× crops, before and after, read out of git so the pair cannot drift.

## 2. The mechanism, measured

There is **no dithering step in this pipeline**. The speckle is a hard per-pixel
snap landing adjacent pixels on opposite sides of a decision boundary, and it is
counted as the **isolated-pixel rate** — pixels whose assigned colour matches
none of their four neighbours.

On the shell, against the shared 32:

| | measured |
|---|---|
| `paper` ramp usage | **0.1%** |
| `amber` (lamp-glow) ramp usage | **27.3%** |
| mean quantization error | **35.0** of a possible 441 |
| isolated pixels | **2.30%** |

The palette *has* three creams. They are essentially never chosen, because the
room's dominant surfaces sit in a warm mid range that falls between
`paper-dark #BFAE8E` (light, desaturated), `wood-pale #C99A63` (mid brown) and
`amber-mid #F2A94B` (mid, saturated orange). With nothing in range, walls,
ceiling and light floor tiles route onto lamp-glow colours and the room reads as
lit by sodium light.

A second symptom of the same gap, found while re-measuring the Tonight board's
integrity check: the board's frame shadow was landing on **`skin-4 #5E3A25`** — a
*skin* colour, on a wooden frame — because nothing better was in range.

## 3. Tony is the control case, and he says something different

| | shell | Tony |
|---|---|---|
| mean error | 35.0 | 30.3 |
| paper ramp | 0.1% | 25.4% |
| amber ramp | 27.3% | 10.1% |
| isolated pixels | 2.30% | **11.06%** |

Tony's coverage is *fine* — his skin ramp and white apron are well served. His
problem is the **isolated-pixel rate**, five times the shell's.

**More colours do not fix that.** Measured across candidates, isolated pixels
stay flat or get slightly worse as the palette grows (shell 2.30% → 2.23% →
2.58%; Tony 11.06% → 11.95% → 12.42%). More colours mean more decision
boundaries.

So the acceptance criteria that name Tony — *"cleaner contiguous shading"*,
*"fewer isolated noisy pixels"* — **are not delivered by a palette extension**,
and this slice should not claim them. They need a spatial-coherence remedy, which
is a separate mechanism and a separate decision. Recorded as open rather than
quietly dropped.

## 4. The candidate, and how it was chosen

Weighted k-means over the worst-served pixels — a colour earns its place by how
much error it removes. `scripts/palette-report.mts`.

**The first run had to be corrected.** Unconstrained, k-means proposed a *blue*
as its very first addition and the resulting palettes swallowed the approved
`wood` and `red` ramps whole — the shell's wood share falling 32.8% → 4.3% and
red 24.6% → 2.1%. Minimising an average is not the same as extending a palette.
The pool is now warm-only.

Four colours, measured:

| | hex | what it serves |
|---|---|---|
| `zone-foliage` | `#455806` | the hanging plant, which was rendering as a brown blob |
| `zone-ember` | `#661505` | the largest single error contributor — deep booth and carpet red |
| `zone-brick` | `#A02F02` | mid red-brown; counter and trim |
| `zone-ochre` | `#B46110` | the warm ceiling and wall mid-tone |

Every study asset improves on mean error and none regresses. **The third column
is the one that shipped** — the second is the study that justified scoping it
(§6), and quoting it as the result would claim improvements on seven assets when
three of them were deliberately left alone:

| asset | family | shared 32 | +4 **globally** (the study) | **shipped** (`zone` only) |
|---|---|---|---|---|
| shell | `zone` | 35.0 | 21.6 | **21.6** |
| counter-front | `zone` | 36.4 | 20.1 | **20.1** |
| newspaper-rack | `zone` | 28.4 | 23.1 | **23.1** |
| tony | `character` | 30.3 | 29.3 | 30.3 — *unchanged* |
| neon-sign | `collectible` | 34.5 | 29.7 | 34.5 — *unchanged* |
| signed-jersey | `collectible` | 31.9 | 27.6 | 31.9 — *unchanged* |
| burn-barrel | `collectible` | 26.3 | 23.8 | 26.3 — *unchanged* |

`scripts/palette-report.mts` prints both tables side by side, and it prints the
shipped one **unconditionally rather than behind a flag** — the failure mode being
closed is a reader taking the shared table for the shipped one, and a flag nobody
passes reproduces that exactly.

**The `wood` and `red` ramp shares fall on the shell** — 32.8% → 6.8% and 24.6% →
0.2% — and that is the defect leaving, not the ramps being swallowed. The error
census names the reason: `#670d07`, `#681306` and `#580d07` are deep booth red,
they were landing on `wood-dark #4A2E1C` at a mean distance of 42–47, and they now
land on `zone-ember #661505`. That is the opposite of §4's rejected first
candidate, which moved warm pixels onto an unrelated *blue* to minimise an
average. Here the pixels move to a **nearer, warmer** colour and the mean error
falls with them.

### Two ways to count a share, and they have been confused once already

Everything above **quantizes the source** and reports where each source pixel
*would land*. Counting the colours in the **finished PNG** is a different
question with different answers, and `b4815a1`'s own message quoted one beside
the other:

| the shipped shell | `paper` | `amber` | `wood` | `red` | the four new |
|---|---|---|---|---|---|
| before | 5.6% | 24.8% | 31.5% | 24.6% | — |
| after | 5.6% | 16.8% | 6.4% | 0.2% | **62.3%** |

**The room's only cream was painted on, not chosen.** `paper` is 5.6% of the
finished asset before *and* after, while the quantizer routes 0.1% of the source
there either way — the difference is `clean-parlor-surfaces.ts` painting the
Tonight board's face flat `paper-white` after quantization. Every cream pixel in
the old room came from a repair script; none of it was the palette reaching the
walls. That is §2's coverage gap stated from the other side, and it is the
stronger version of the argument.

Both assets are **palette-closed before and after** — zero off-palette pixels —
with dimensions and alpha unchanged.

**And the room stops being three colours.** Before, its three largest were
`wood-dark` 25.9%, `red-dark` 22.4% and `amber-deep` 18.1% — one brown, one
crimson and one gold holding up walls, ceiling, floor, furniture and counter
between them. After, they are `zone-ember` 35.8%, `zone-brick` 14.7% and
`zone-ochre` 11.2%: three warm neighbours, and the materials separate. The ceiling
alone was **68% a single colour** and is now two tile tones, which is what a
ceiling with depth actually is.

**The floor is the case worth reading carefully**, because appearance and
arithmetic disagree about it. Its light tiles look transformed and are
**untouched** — `amber-mid` is 14.5% of the band before and after, the same
pixels. What changed is the dark half: `red-dark` 47.5% *and* `wood-dark` 21.4%,
crimson and brown rendering one tile, became `zone-ember` 51.9% and `zone-brick`
24.0%, two values of one material. The tiles read cleaner because their surround
stopped being two unrelated hues — **not** because any cream was added. A
description written from the picture would have got this backwards, which is why
`docs/evidence/palette-fidelity/README.md` states every claim as a count.

## 5. Is 32 a contract?

**No.** No test asserts it; the generation prompts say *"roughly 32 colors"*;
`docs/TECH_LEAD_OPERATING_MODEL.md`'s "palette stays 32 colours" records a past
decision that a metric fix sufficed *then*, not a standing aesthetic rule.

What `palette.json` does carry is a **process** obligation: *"do not add, remove,
or edit a color without regenerating every affected asset."*
`scripts/palette-impact.mts` exists so "affected" is measured rather than guessed.

## 6. Scope — `zone` only

`palette-impact.mts` reported the blast radius of a **global** extension:
**21 of 21 assets change, none byte-identical**, including every approved Batch B
collectible — arcade token 37%, singing fish 39%, champion banner 37%, portable
sauna 35%, neon sign 29%, cookie tote 26%.

That is a re-approval event for the whole art set, not a defect fix. A 46×46
collectible is punchy authored shape and has no coverage gap; only the large
painterly interiors do.

**Commissioner decision, 2026-08-05: scope the extension to the `zone` family.**
`art/palette.json` grows a `familyExtensions` section, `loadPalette(family)`
appends it, and the extension is **additive** — it never replaces a shared
colour, so every other family is byte-identical to what it was. Six assets
change, all `zone`; Tony and all twelve Batch B collectibles do not.

## 7. The two one-time corrections, and why re-deriving them was the work

The shell carries two corrections that are *baked into the shipped PNG*, and both
are keyed to colours the requantization moves. Reprocessing therefore undoes them
unless each is re-derived first:

1. **`shift-tonight-board.ts`** — its `FRAME_PROFILE` integrity check, a run of
   seven colours read across the board's frame. Re-measured to
   `#C97A22 #B46110 #661505 #A02F02 #A02F02 #661505 #A9713F`, and it runs clean.
   *Re-measured, not relaxed* — a profile that tolerated any colour would stop
   being a check.
2. **`clean-parlor-surfaces.ts`** — `ALCOVE_TONES` extended by measurement and
   passing, but `clearCeilingScorch` **refused**. It is not a constant swap: the
   mechanism is a morphological opening tuned to a specific distribution of field
   and scorch tones, and every one of those tones had moved.

A trial run confirmed the risk was real rather than theoretical — the reprocessed
ceiling visibly re-acquired the blotching that visual debt 9 removed. **Ceiling
scorch is on the must-not-regress list**, so the first pass was reverted whole
rather than shipped half-corrected, and the re-derivation was done properly. That
is what §7a is.

### 7a. What the re-derivation found

Three defects, each **exposed** by the requantization rather than caused by it.
That distinction matters: all three were latent before this slice and two of them
had been quietly costing correctness for longer.

1. **The ceiling has two field tones now, and the cleanup wrote one constant.**
   `CEILING_FIELD` was `#C97A22`; after requantization the dominant tone is
   `#B46110` (7,558 px against 4,082) and both are real — the ceiling is *shaded*
   across its depth. A constant fill would have replaced a smear inside a shaded
   tile with a bright patch, which is a different defect at the same coordinates.
   `fieldToneNear()` fills from the field tone already surrounding each pixel, so
   the fix is local to the tile it lands in.

2. **One morphological opening only shrinks a thick blob by a ring.** The
   mechanism was written against smears thin enough that a single pass cleared
   them, so nothing ever revealed that it was not a fixed point.
   `clearCeilingScorch` now wraps `clearCeilingScorchOnce` in a convergence loop
   bounded by `MAX_PASSES`. **Idempotency was always the claim; it is now the
   behaviour.**

3. **The back-wall despeckle overlaps the ceiling rectangle by eight rows
   (y 55–62) and ran after it.** So the ceiling's careful opening was partly
   re-dashed by a lone-pixel filter immediately afterwards, and running the script
   twice produced a different image than running it once. Despeckle now runs
   **first**. This had been true since before the extension and is the oldest of
   the three.

Three test fixtures were also reading colours that had moved. One of them had
spoiled a coordinate — `(55, 2)` — that had **stopped being probed**, so it was
passing while checking nothing. Each fixture now reads the constant rather than a
literal, so a colour that moves fails the test instead of silently detaching it.

### 7b. What is verified, and what is not

| | |
|---|---|
| `npm run typecheck`, `npm run lint` | clean |
| `npm run test` | **1368 passed / 84 files**, 2 skipped |
| `npm run art:validate` | clean |
| `npm run build` (production) | clean |
| `npm run visual:qa`, production build, fresh database | **88 states × 3 widths, passed.** See `docs/CHECKPOINT.md` for the intermittent `#418` that appeared once on this branch and did not reproduce — it is visual debt 16 and it is not this slice |
| Evidence | `docs/evidence/palette-fidelity/`, regenerable with `scripts/palette-evidence.mts` |
| **Production** | **not verified.** Nothing carrying this has been merged or deployed. |

**Still open, and not claimed by this slice:**

- **The isolated-pixel rate.** §3 measured that more colours make it slightly
  *worse*, and the shipped numbers agree: the shell moves 2.30% → 2.23%,
  counter-front 2.49% → 2.86%, newspaper-rack 15.27% → 16.39%. The acceptance
  criteria's *"fewer isolated noisy pixels"* needs a spatial-coherence remedy,
  which is a different mechanism and a separate decision.
- **Tony.** Untouched by design — his family is not extended, and his 11.06%
  isolated rate is the thing a palette cannot fix.

**Merged before this pass:** the four measurement scripts. They change nothing and
are what any future palette argument should be made from — which is exactly why
the one defect in them mattered. `palette-study.mts`'s `loadPalette` never gained
the `family` parameter `process-art.ts` has, so for one commit the measurement
tool **could not see the palette that had shipped** and every number it printed
was silently the shared 32. Nothing failed; the tool simply answered a question
nobody had asked. It has the parameter now, and `palette-report.mts` prints both
tables so the two can never be confused for each other again.

## 8. Superseded

`art/SHELL_AUDIT_zone_parlor_shell.md` and the earlier conclusion that the
homepage needed **targeted regeneration of source art** are superseded. The
source is clean at full resolution and clean after downscale; the loss is entirely
in the snap to the shared palette, and it is closable deterministically without
new art.
