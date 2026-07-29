# Shell Audit — `zone_parlor_shell.png`

**Source:** `art/incoming/zone_parlor_shell.png` — **941 × 1672, PNG, sRGB, 8-bit, 3 channels, no alpha**
**Production canvas:** 320 × 569 · **Registered** (canvas only; no path, nothing resolves it)
**Revision 5** — B0 gate passed. Object map untouched, nothing integrated.

---

## B0 re-approval — approved 2026-07-29

The quantizer change invalidated the earlier B0 palette approval, so the composite was
rebuilt from the corrected outputs and re-approved: **corrected Euclidean quantizer,
canonical branded Tony, shell layering, cream board, shadow separation, and foreground
counter integration all accepted.**

The composite is the shell cut at **logical y 292**, Tony at **`64, 180`** sized 72 × 197,
and the shell's own rows 292–568 drawn back over him. There is no separate
`zone_parlor_counter_front` asset — the shell is one image and its lower half *is* the
foreground layer. `zone_counter_front.png` belongs to the superseded two-tile room.

Measured on the rendered composite: palette **closed** across every pixel, 28 of 32 colours
used, **0 violet**, no partial alpha, no unfilled pixels. Tony's visible band 112 units,
13 clear of the nook and 18 of the prediction sign.

**One limitation accepted rather than fixed.** The alcove backsplash reads brown where the
source is dark maroon: the palette has nothing between `red-dark #8C1F22` and near-black, so
dark reds land on wood. Accepted for B0. **It does not justify a palette change** — see
`ASSET_PIPELINE.md §4`, which says not to add palette colours to rescue a single asset.

**B1 requires separate explicit authorization.**

---

## Verdict

# The shell passes. The pipeline did not, and now does.

The art is approved from my side: all eight assignments are present, every text surface is
clean, Tony fits to within one logical unit, and every coordinate below is now **measured,
not estimated**.

**The blocker moved.** It is no longer delivery or composition — it is that
`scripts/process-art.ts` paints **8.48% of this shell violet**. One pixel in twelve. That is
a pre-existing defect in the quantizer's distance metric, not a fault in the shell, and it
is a one-line fix. Evidence in §5.

The defective output was **deleted rather than committed.** Nothing broken is on the branch.

---

## 1. The file, verified

| Property | Value |
|---|---|
| Dimensions | **941 × 1672** — as stated |
| Format | PNG, sRGB, 8-bit, 3 channels, **no alpha** (correct for a shell) |
| Unique colours | **153,738** |
| Pixel grid | **none** — column autocorrelation decays monotonically (1:0.57 2:0.52 3:0.23 4:0.11 5:0.02 6:0.00) |

No grid means this is a high-resolution painting *in the style of* pixel art, exactly as
`process-art.ts` documents. The grid is created by the downscale. **Nothing to protect, so
nothing to damage** — the source is correct as delivered.

---

## 2. All eight assignments are present and usable

| Assignment | Destination | Usable |
|---|---|---|
| Left arched nook | `/slice` | ✅ 45 × 112 — clears the 44 tap minimum by 1 |
| Large board | Tonight at Tony's | ✅ the best surface in the room |
| Banner rail | `/timeline` | ⚠️ **3.4 units tall** — see §4 |
| Small dark sign | prediction, later Tony's Line | ✅ 37 wide, pad to 44 |
| Receipt | manager record | ✅ as a target; ⚠️ as a text surface |
| Countertop tray | `/counter` | ✅ genuinely empty, reads as a tray not a case |
| Right-rear doorway | `/back-hall` | ✅ 42 wide, pad to 44 |
| Centre-left lane | Tony, dialogue only | ✅ clear, 112-unit band |

All four exclusions hold: no display case, no separate basement door, no separate
Underground door, no floor hatch, no second doorway.

**No lettering anywhere**, verified at 1:1 across every text surface.

---

## 3. Composition at iPhone portrait

| Device | Room renders at | Visible below the 44px bar | Logical y visible |
|---|---|---|---|
| iPhone 14 (390 × 664) | 693 px | 620 px | 0 – 509 |
| iPhone SE (375 × 667) | 667 px | 623 px | 0 – 532 |
| iPhone 12 mini (375 × 629) | 667 px | 585 px | **0 – 499** |

Worst case **y = 499**; the lowest feature is the tray at 308. Clears by 191 units. The
bottom 79 units are plain carpet — the right thing to lose. **Pass.**

---

## 4. Measured coordinates

Logical 320 × 569, derived from edge detection on the real file. Source px in brackets.
**These are production figures**, not estimates.

### Feature bounds

| Feature | Logical `x, y, w, h` | Source | Tap target |
|---|---|---|---|
| Nook → `/slice` | `6, 180, 45, 112` | 18–151, 529–858 | ✅ |
| Board → Tonight | `49, 79, 132, 97` | 143–531, 233–518 | ✅ |
| Rail → `/timeline` | `58, 66, 122, 3` | 170–530, 193–203 | ❌ **3 tall** |
| Rail incl. brackets | `58, 58, 122, 13` | 170–530, 171–210 | ❌ 13 tall |
| Sign → prediction | `154, 184, 37, 59` | 454–563, 542–714 | pad → `151, 184, 44, 59` |
| Receipt | `86, 292, 23, 18` | 253–320, 858–910 | pad → `75, 279, 44, 44` |
| Tray → `/counter` | `156, 284, 94, 25` | 458–733, 833–906 | pad → `156, 275, 94, 44` |
| Doorway → `/back-hall` | `203, 124, 42, 131` | 596–720, 363–749 | pad → `202, 124, 44, 131` |
| **Tony** | `64, 180, 72, 112` | — | ✅ |

Padded targets checked for collisions: sign `151–195` clears the alcove (ends 149) and the
doorway (starts 202); receipt `75–119` clears the tray (starts 156); tray `275–319` clears
Tony's band (ends 292) horizontally by 20 units. **No overlaps.**

### The layer cut — measured, not guessed

**y = 292** (source 858). A strong horizontal edge appears at source 858 in **every** x band
sampled — far left, Tony's lane, mid, tray, right — which is what a counter's back edge
should look like. The counter's front edge is source 919 (logical 313), equally uniform.

```
  shell (rear)      logical y   0 – 292    (source y   0 –  858)
  Tony sprite                   drawn between
  counter (front)   logical y 292 – 569    (source y 858 – 1672)
```

This puts the counter top, the tray, the receipt, the counter front and the floor in front
of Tony — correct, since the tray sits on the counter between him and the viewer.

**Tony's visible band: 292 − 180 = 112 units.** The shipped room's is 291 − 179 = **112**.
Identical, so `character_tony_neutral` transfers with no re-authoring. His head at y 180
lands 4 units below the board and level with the nook's top edge.

*(A false lead worth recording: source y 828 reads as a strong edge in Tony's lane only. It
is the back service unit's lip, which sits* behind *him. Cutting there would draw a strip of
back-unit tile over his chest.)*

### Runtime-text safe rectangles

Inset from the measured inner field to clear the frame bevel and the quantizer's edge:

| Surface | Inner field | **Safe text rect** | At 3× | Verdict |
|---|---|---|---|---|
| Board — Tonight | `56, 84, 119, 87` | **`60, 88, 111, 79`** | 333 × 237 px | ✅ Comfortable for four board lines. |
| Sign — prediction | `158, 188, 30, 51` | **`161, 191, 24, 45`** | 72 × 135 px | ⚠️ Narrow. A short stacked prediction only. Tony's Line will need a panel. |
| Receipt — manager record | `86, 292, 23, 18` | **`88, 294, 19, 14`** | 57 × 42 px | ❌ Not usable for baked text. |

### Surface classifications — ruled

Both open questions above are settled. Recorded 2026-07-29.

| Surface | Classification | Basis |
|---|---|---|
| Tonight board | **surface-rendered** | `60, 88, 111, 79` — 333 × 237 device px at 3×, comfortable for four board lines |
| Champion banner | **surface-rendered** | text rendered onto the banner overlay when it ships |
| **Prediction sign** | **trigger-only** | usable text area 24–36 units wide against a ~40 × 20 threshold — below it on the width axis under every reading. Tapping opens a panel; nothing is baked onto the slate. |
| Receipt | **trigger-only** | `88, 294, 19, 14` = 57 × 42 device px. Tapping opens the expanded manager-record panel; nothing is printed onto the paper. This is what it already did in PR #8. |

Neither trigger-only surface is a defect. Both are legible objects at room scale that are
too small to *carry* text, which is a different thing — and the panel was always the better
place to read a record anyway.

### The rail

Measured at **3 logical units tall** — thinner than the ±3 estimate suggested, and not
paddable in place: reaching 44 means growing it 14× and swallowing the board below.

It solves itself when the banners exist, because banners hang *below* the rod and the Door's
polygon should trace the banners. **Recommendation unchanged: no `/timeline` Door until the
banner overlay ships.** Not a shell defect.

---

## 5. The pipeline defect

`npm run art:process -- zone_parlor_shell` runs clean and reports `100% recoloured`. The
output is not usable.

### What goes wrong

`nearest()` in `scripts/process-art.ts` measures colour distance with luminance weights:

```js
const dr = (r - colour[0]) * 0.3;
const dg = (g - colour[1]) * 0.59;
const db = (b - colour[2]) * 0.11;
```

Green at 0.59 and blue at 0.11 means **hue is nearly invisible to the metric**. Two colours
of similar brightness match regardless of what colour they actually are.

Worked example — the backsplash tile, source `#500e01`, a dark warm red-brown:

| Candidate | Weighted distance | Plain Euclidean |
|---|---|---|
| `#3B2050` violet-dark | **15 — wins** | 84 |
| `#4A2E1C` wood-dark | 19 | **42 — wins** |
| `#5E3A25` skin-4 | 27 | 55 |

The violet's blue channel is 79 units away from the source's, and that difference is
multiplied by 0.11 until it stops mattering. So dark warm browns land on violet.

### Measured across the whole shell

| Metric | Pixels painted `#3B2050` violet | Palette entries used |
|---|---|---|
| **weighted (current)** | **8.48%** | 30/32 |
| plain Euclidean sRGB | **0.00%** | 26/32 |
| Euclidean in linear light | **0.00%** | 28/32 |

Side by side, plain Euclidean is clearly the best of the three: the checkerboard reads red
and cream, the rug is red, the counter is warm, and the room looks like the source.

### Why this never surfaced before

The shipped `zone_front_counter.png` went through the same code and looks fine. Its dark
areas are the near-black soda machine, which lands on the `ink` ramp either way. **This is
the first asset with large mid-dark warm-brown fields** — the backsplash, the doorway
recess, the carpet — and they are exactly where the metric fails.

### The second, smaller defect

The large board blotches. Source `#fbc575` and `#fcc879` are 4 units apart and land on
`#F2C94C` (yellow) and `#F2C9A0` (pale pink) respectively — distances 6 and 5. The board's
gentle gradient crosses that boundary repeatedly, so a flat cream field comes out mottled.

That is a **palette gap**, not a metric bug: there is no mid-cream between yellow-cheese,
skin-1 and amber-glow, and the board sits equidistant from all three. Fixing the metric
reduces it; a palette entry would remove it.

### Recommended fix

**Change `nearest()` to plain Euclidean** — delete the three weight multipliers. One line,
removes the violet entirely, and the "weighted so warm browns match properly" comment is
exactly backwards: the weighting is what breaks warm browns.

This changes every asset the pipeline produces, so it needs re-running for the whole batch
and a look at `character_tony_neutral` before and after. **Not done here** — it is a change
to shipped behaviour, and the shell audit is not the place to make it unilaterally.

---

## 6. Go / no-go

**Shell source: GO.** No regeneration needed. Everything asked for is present, measured and
usable; the two sizing constraints (rail, receipt) are sequencing and intent questions, not
art defects.

**Pipeline output: ~~NO-GO~~ → GO.** It was no-go pending the metric decision; nothing
defective was ever committed. Resolved by the Euclidean ruling.

### To ship the shell — all five closed

1. ~~Decide on the `nearest()` metric.~~ **Ruled: plain Euclidean.** `ASSET_PIPELINE.md §4`.
2. ~~Re-run the whole batch and compare Tony.~~ **Done.** Five assets, all palette-closed at
   0% violet. The comparison found a second defect the metric had been causing: Tony's blue
   jersey was quantizing to a tan.
3. ~~Optionally add a mid-cream palette entry for the board.~~ **Not needed.** The board's
   failure was a hue flip between yellow and pink; under Euclidean it is a three-step warm
   vignette that reads as aged paper. Palette unchanged.
4. Set `path` and `art_status: "generated"` on the inventory row — **still open**, a
   separate reviewed edit.
5. ~~State the receipt's intent.~~ **Ruled: trigger-only**, opening a panel. So is the
   prediction sign.

### Recorded, not acted on

- **`/collection` has no homepage Door** under this ruling. It is the one working Door in
  PR #8 today. `lib/parlor/objects.ts` will need rewriting when integration is authorised.
- **`/counter`, `/back-hall` and `/timeline` do not exist as routes.**
- **Canvas stays 941 × 1672.** 960 × 1707 would be an exact 3:1 downsample; 941 is 2.9406:1.
  The shell is not going back, so the sub-pixel sampling drift is accepted rather than
  overlooked.
- Six inventory rows still carry the retired 320 × 228 / 64 × 96 sizings.
