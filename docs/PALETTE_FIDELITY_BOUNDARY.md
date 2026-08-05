# Homepage art fidelity — where the colour is lost, and what closes it

**Status:** diagnosed, measured, scope decided, **not yet applied.** The
measurement tooling is merged; the palette change is not. §7 is the exact
remaining work.

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
| C — after quantization (shipped) | **the defect**: orange ceiling and walls, gold floor tiles, wood counter gone red, hanging plant a brown blob, stipple throughout |

Reproduce with `scripts/palette-preview.mts`, which renders any asset under any
candidate palette without touching `public/assets`.

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

Every study asset improves on mean error and none regresses:

| asset | before | after |
|---|---|---|
| shell | 35.0 | **21.6** |
| counter-front | 36.4 | **20.1** |
| newspaper-rack | 28.4 | 23.1 |
| neon-sign | 34.5 | 29.7 |
| signed-jersey | 31.9 | 27.6 |
| burn-barrel | 26.3 | 23.8 |
| tony | 30.3 | 29.3 |

Rendered, the shell gains cream walls, a calm ceiling, red-and-cream floor tiles
instead of all-gold, wood that is wood rather than flat red, and a hanging plant
that reads as foliage again.

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

## 7. What remains, and why it was not shipped in this pass

Applying the extension **reverts two one-time corrections baked into the shipped
shell**, because both are keyed to colours that the requantization moves:

1. **`shift-tonight-board.ts`** — its `FRAME_PROFILE` integrity check. Re-measured
   and updated: `#C97A22 #B46110 #661505 #A02F02 #A02F02 #661505 #A9713F`. It runs
   clean. *(Re-measured, not relaxed — a profile that tolerated any colour would
   stop being a check.)*
2. **`clean-parlor-surfaces.ts`** — `ALCOVE_TONES` extended by measurement and
   passing, but **`clearCeilingScorch` does not**. Its `CEILING_FIELD` is
   `#C97A22`, and after requantization the ceiling's dominant tone is
   `#B46110` (7,558 px against 4,082). This is not a constant swap: the whole
   mechanism is a morphological opening tuned to a specific distribution of field
   and scorch tones, and those have all moved.

A trial run confirmed the risk is real rather than theoretical — the reprocessed
ceiling visibly re-acquires the blotching that visual debt 9 removed. **Ceiling
scorch is on the must-not-regress list**, so the pass was reverted to a
consistent state rather than shipped half-corrected.

**The remaining work, in order:**

1. Re-derive `clearCeilingScorch` against the extended `zone` palette — field
   tone, scorch tones, and the purity guard, each re-measured on the requantized
   shell the same way they were originally derived.
2. Re-apply the palette extension and reprocess (`npm run art:process`, then
   `shift-tonight-board`, then `clean-parlor-surfaces`).
3. Regression tests for the mechanism: warm-cream samples no longer land on
   saturated amber; shell error improves past a threshold; paper usage up and
   amber usage down; dimensions and alpha unchanged; output palette-closed;
   reprocessing deterministic; **non-`zone` families byte-identical**.
4. Evidence at 390 / 375 / 360, at 1:1 as well as enlarged.

**Merged already:** the four measurement scripts. They change nothing and are what
any future palette argument should be made from.

## 8. Superseded

`art/SHELL_AUDIT_zone_parlor_shell.md` and the earlier conclusion that the
homepage needed **targeted regeneration of source art** are superseded. The
source is clean at full resolution and clean after downscale; the loss is entirely
in the snap to the shared palette, and it is closable deterministically without
new art.
