# Shell Audit — `zone_parlor_shell.png`

**Source:** 941 × 1672 (as stated) · **Production canvas:** 320 × 569
**Status:** audit only. Not processed, not registered, not integrated.
**Revision 3** — against the approved Counter Shop + Back Hall ruling.

---

## 0. Blocker: the file is not on the filesystem

**This is the one genuine blocker, and it is not about the art.**

The shell has been presented four times. Each time it arrives as an image *in the
conversation*, not as a file in the container. `art/incoming/` still holds only the six
files from the B0 batch, and a filesystem-wide search for any image written in the last
six hours returns nothing. There is no mechanism to extract a pasted image out of the
model's context and write it to disk.

### What this blocks outright

| Asked for | Status |
|---|---|
| Verify real dimensions and format | **Blocked.** 941 × 1672 is taken on trust. Colour depth, alpha channel, and bit depth are unknown. |
| Place the file at the incoming-art location | **Blocked.** |
| Run the pipeline / produce the 320 × 569 shell | **Blocked.** |
| Confirm the pipeline output is clean at iPhone size | **Blocked** — there is no output to look at. |
| Register the shell asset | **Blocked** — registering an asset whose file does not exist would put a broken path in the registry. |
| Trace production polygons | **Blocked** — §4's numbers carry ±3 units. |

### How to unblock it

Commit the file to this branch from wherever it lives:

```
git checkout claude/v0-pipeline-v1-doors-open-n9imrr
cp <wherever>/zone_parlor_shell.png art/incoming/zone_parlor_shell_01.png
git add art/incoming/zone_parlor_shell_01.png
git commit -m "Add the approved parlor shell source"
git push
```

The `_01` suffix is required — `process-art.ts` strips `_NN` to derive the slug, and a
file that resolves to no slug throws rather than being skipped. Once it is pushed I pull
it, and §5's procedure is a single command.

### What is *not* blocked

The canonical ruling is text, so §1–§3 are complete and final. §4's coordinates are read
by eye at full size, tolerance **±3 logical units**, and are good for planning overlays
and answering the go/no-go — not for authoring polygons.

---

## 1. The approved map is now complete

For the first time, **every assignment has a home in the shell.** Nothing is missing.

| Assignment | Destination | In the shell |
|---|---|---|
| Left arched nook | `/slice` | ✅ present |
| Large board | Tonight at Tony's | ✅ present, blank |
| Banner rail | `/timeline` | ✅ present, bare |
| Small dark sign | prediction, later Tony's Line | ✅ present, blank |
| Receipt | manager record | ✅ present, blank |
| Countertop tray | `/counter` | ✅ present, empty |
| Single right-rear doorway | `/back-hall` | ✅ present |
| Clear centre-left lane | Tony, dialogue only | ✅ present, clear |

And the four explicit exclusions are all satisfied: no homepage display case, no separate
basement door, no separate Underground door, no floor hatch, no second doorway.

**Both blockers from revision 2 are resolved.** The newspaper rack found a home in the
arched nook — which was the recommendation — and the second-doorway problem was dissolved
rather than solved, by making the one doorway `/back-hall` and moving everything behind it.
That is a better answer than either option I put forward, because it needs no new wall.

### Consequences for the application, recorded not acted on

Per instruction the object map is **untouched**. Three things follow from this ruling that
the app does not yet satisfy:

1. **`/collection` loses its homepage Door.** The display case is the one working Door in
   PR #8 today. Under this ruling the Collection is reached from `/counter` or `/back-hall`
   instead. `lib/parlor/objects.ts` will need rewriting when integration is authorised.
2. **`/counter` and `/back-hall` do not exist as routes.** Neither does `/timeline`.
3. `/slice` exists and is currently unreachable from the room; the nook fixes that.

---

## 2. Are the eight features usable?

Judged on presence, blankness, lighting and size. **Seven yes, one qualified.**

| Feature | Usable | Note |
|---|---|---|
| Left arched nook | ✅ | Genuine recess, correct depth and lighting. 46 units wide — clears the 44 tap minimum by **2**. Tight but legal. |
| Large board | ✅ | The best surface in the room. Big, flat, evenly lit, completely clean. |
| Bare rail | ⚠️ **Qualified** | Present and bare as intended, but **7 units tall**. Fails the 44-unit tap minimum badly. See §4. |
| Blank sign | ✅ | Clean slate, ornate frame reads well. 38 wide — pad to 44. |
| Receipt | ✅ as a target, ⚠️ as a surface | Fine to tap once padded. **Too small to carry baked text** — see §4. |
| Empty tray | ✅ | Genuinely empty, recessed, reads as a serving tray rather than a display case — correct for `/counter`. |
| Rear doorway | ✅ | Closed, unambiguous, correctly lit. 42 wide — pad to 44. |
| Tony lane | ✅ | Clear. 112-unit visible band, identical to the shipped room. |

**No lettering anywhere in frame.** At display size every text surface is clean — the
family's most common failure mode, avoided. *Not verifiable at 1:1 without the file.*

---

## 3. Composition at iPhone portrait

| Device | Room renders at | Visible below the 44px bar | Logical y visible |
|---|---|---|---|
| iPhone 14 (390 × 664) | 693 px | 620 px | 0 – 509 |
| iPhone SE (375 × 667) | 667 px | 623 px | 0 – 532 |
| iPhone 12 mini (375 × 629) | 667 px | 585 px | **0 – 499** |

**Worst case y = 499.** Lowest assigned feature is the tray at y 309 — clears by 190
units. The bottom ~80 units are plain carpet, which is the right thing to lose. **Pass.**

---

## 4. Coordinates and safe text rectangles

Logical 320 × 569. **By eye, ±3 units.** Provisional until the file lands.

### Feature bounds

| Feature | `x, y, w, h` | Tap target |
|---|---|---|
| Left arched nook → `/slice` | `6, 181, 46, 105` | ✅ 46 × 105 |
| Large board → Tonight | `52, 78, 131, 98` | ✅ |
| Banner rail → `/timeline` | `57, 65, 126, 7` | ❌ **7 tall** |
| Small sign → prediction | `154, 183, 38, 61` | ❌ 38 wide → pad to `151, 183, 44, 61` |
| Receipt → manager record | `84, 293, 25, 14` | ❌ → pad to `74, 278, 44, 44` |
| Tray → `/counter` | `155, 284, 101, 25` | ❌ 25 tall → pad to `155, 275, 101, 44` |
| Rear doorway → `/back-hall` | `203, 122, 42, 127` | ❌ 42 wide → pad to `202, 122, 44, 127` |
| Tony lane (visible band) | `62, 173, 72, 112` | ✅ |

Padded targets checked for collisions: sign (151–195) clears Tony's lane (ends 146) and
the doorway (starts 202); receipt (74–118) clears the tray (starts 155); tray (275–319)
clears Tony's band (ends 285) horizontally by 21 units. **No overlaps.**

### The rail is the one real sizing problem

7 units is not paddable in place — reaching 44 means growing it 6× and swallowing the
bottom of the wall trim above and the top of the Tonight board below.

**It solves itself when the banners exist.** Champion banners hang *below* the rail; the
Door's polygon should trace the banners, not the rod. Until then `/timeline` either has no
homepage entrance or gets a target that overlaps the Tonight board. **Recommend: no
`/timeline` Door until the banner overlay ships.** Not a shell defect.

### Supporting geometry

| Feature | Logical |
|---|---|
| **Layer cut — counter top back edge** | **y = 285** |
| Counter top front edge | y = 316 |
| Counter front panel | `0, 316, 320, 72` |
| Recessed alcove behind Tony | `54, 184, 92, 70` — scenery, keep clear |
| Floor rug | `71, 394, 150, 59` |
| Booths, right | `248, 199, 72, 93` |
| Bottom carpet band | `0, 490, 320, 79` |

### Runtime-text safe rectangles

Inset from the drawn field to clear bevels, frame shadow and the quantizer's edge:

| Surface | Field | **Safe text rect** | Verdict |
|---|---|---|---|
| Large board — Tonight | `58, 83, 119, 88` | **`62, 87, 111, 80`** | ✅ Generous. At 3× that is 333 × 240 device px — comfortable for four board lines. |
| Small sign — prediction | `160, 190, 27, 48` | **`162, 193, 23, 42`** | ⚠️ Narrow. 23 units is ~69 device px at 3×. Enough for a short stacked prediction, **not** for a sentence. Tony's Line will need to open a panel rather than render on the slate. |
| Receipt — manager record | `86, 295, 21, 10` | **`87, 296, 19, 8`** | ❌ **Not usable for baked text.** 19 × 8 logical is ~57 × 24 device px. |

**On the receipt:** this is not a defect if the manager record opens a panel — which is
what a Display does, and what the receipt did in PR #8. It *is* a defect if the intent was
to print the record onto the receipt in place. Flagging so the intent is stated rather than
discovered later.

---

## 5. The processing procedure, ready to run

Verified against `scripts/process-art.ts`. Nothing here has been executed.

**"Without stretching the source" is already how the pipeline behaves.** It resizes with
`fit: 'fill'` to the declared canvas — so the only geometric change is the aspect
difference between 941 : 1672 and 320 : 569:

```
horizontal squash = 0.0727%  →  0.233 px across the full 320-unit width
```

Sub-pixel. There is no stretch to avoid.

It is **not** nearest-neighbour, despite what `ASSET_PIPELINE.md §4` says. The script
documents why: at 2.94 : 1 each output pixel represents **9 source pixels**, and
nearest-neighbour would pick one and discard eight. It uses `lanczos3` and then quantizes,
so the averaging is thrown away a step later when every pixel snaps to `palette.json`.
The output still has no intermediate colours and no anti-aliased edge.

### Order of operations — registration comes first

`processOne` reads `record.canvas` from the registry to drive the resize, so **an
unregistered slug throws.** The sequence is:

1. Land `art/incoming/zone_parlor_shell_01.png`.
2. Add the inventory row **declaring the canvas** (below).
3. `npm run art:process -- zone_parlor_shell`
4. Set `path` and `art_status: "generated"` on the row — a second, reviewed edit.

### Proposed inventory row — not applied

```json
"zone_parlor_shell": {
  "family": "zone",
  "canvas": "320x569",
  "batch": "B1",
  "art_status": "placeholder",
  "alt": "Tony's Pizza — the parlor",
  "$comment": "The prepared shell. Doors arrive as transparent overlays; Displays are baked. Supersedes zone_front_counter and zone_counter_front."
}
```

### The one risk worth watching in the output

**Banding on the large cream board.** It is the biggest flat, softly-lit area in the
image, and large flat fields are exactly where palette quantization posterizes — a smooth
tonal fall-off collapsing into two or three visible steps. Everything else in the room is
high-frequency detail that hides quantization well.

If it bands, the fix is a palette question, not a regeneration: the cream ramp in
`palette.json` may need an intermediate step. **First thing to look at in the output.**

---

## 6. Go / no-go

# Conditional go — on the composition. No-go on shipping, pending the file.

**The composition is approved from my side.** This is the first candidate where the
navigation map closes completely: all eight assignments have a home, all four exclusions
hold, every text surface is clean, Tony fits to within one logical unit of the shipped
room, and nothing sits near the phone fold. Revision 2's two blockers are both gone.

**Three things stand between this and a shipped shell:**

1. **The file must reach the repository.** Everything else is waiting on it. §0 has the
   commands.
2. **The rail cannot carry a `/timeline` Door until the banners exist** (§4). Not a shell
   defect — a sequencing constraint.
3. **State the receipt's intent** (§4). Panel: fine as drawn. Baked text: it is too small
   and the shell needs a bigger receipt.

Nothing found in this shell requires another regeneration.

### One open question from revision 2, still open

**The canvas.** 960 × 1707 is exactly 3 × 320 × 569, and 941 × 1672 is 2.9406 × — a
non-integer ratio that can put a 1px jitter into thin details like the rail and the sign's
inner moulding. My standing position: not worth a regeneration on its own; take it if the
shell goes back anyway. **It is not going back**, so 941 × 1672 stands and the jitter is
accepted. Recorded so it is a decision rather than an oversight.
