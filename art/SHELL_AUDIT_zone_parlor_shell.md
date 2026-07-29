# Shell Audit — `zone_parlor_shell.png` (candidate 1)

**Source:** 941 × 1672 · **Proposed production canvas:** 960 × 1707
**Status:** audit only. Not processed, not registered, not integrated.
**Revision 2** — re-inspected against the approved Option C assignments.

---

## 0. What this audit can and cannot check

**The binary is still not on the filesystem.** It has been shown in the conversation
twice; both times it arrived as an image in context rather than as a file in
`art/incoming/`. Everything in §7 was therefore **read by eye at full size**, tolerance
**±3 logical units** (±9 source px).

Read-by-eye is enough to confirm the approved assignments, to plan overlays, and to
answer the shell-revision question in §11. It is **not** enough to:

- run `npm run art:process` and see what the quantizer does to the cream panel;
- verify the palette conformance of the new fixtures;
- trace production polygons for `lib/parlor/objects.ts`;
- confirm there is no stray lettering at 1:1 (nothing visible at display size).

Committing the PNG to `art/incoming/zone_parlor_shell.png` on this branch unblocks all
four. Until then §7's numbers carry ±3 and the polygons cannot be authored.

Everything in §2–§6 and §8 is arithmetic, or measured off the existing same-generator
source, and is exact regardless.

---

## 1. Approved architecture, and what this shell has to satisfy

The approved composition is:

- one prepared parlor shell;
- separate **transparent Door overlays**;
- **baked blank Displays**;
- separate foreground counter layer;
- separate Tony sprite;
- the old 320 × 200 homepage zone tiles retired.

Two consequences matter for this audit, and they pull in opposite directions:

**Displays are baked, so the shell must already contain them.** A Display that is not
painted into the shell does not exist. The shell delivers all three — Tonight, the
prediction slate, the receipt. **Pass.**

**Doors are transparent overlays, so the shell does not need to contain them — it needs
to contain somewhere they can go.** That is the weaker requirement, and it is the one
this shell fails twice. See §11.

### Against the canonical art requirements

| Requirement | Source | Result |
|---|---|---|
| Shallow stage box, floor visible, gentle recession | `zone_tile.md` | **Pass.** |
| Front ground line clear for composited sprites | `zone_tile.md` | **Pass.** |
| Flat front-facing sprite looks right standing on it | `zone_tile.md` | **Pass.** |
| Outer ~16px of left/right edges free of load-bearing content | `zone_tile.md` | **Left pass. Right marginal** — booths and window run to the frame edge. |
| Warm overhead light, no rim light | `_style_preamble` | **Pass.** Consistent with `character_tony_neutral`. |
| Text surfaces blank | `surface.md` | **Pass.** The cream panel, the slate and the receipt are all clean. No lettering anywhere in frame. This is the family's most common failure and this candidate avoids it. |

**Improvements over the shipped room, confirmed:** the floor is calmer, the rug is one
readable shape instead of competing checker, and — the one that matters — the back wall
carries *prepared blank fixtures* where the old room carried a painted mural that
nothing could be mounted on.

---

## 2. Composition at iPhone portrait

The room is pinned to the top of a `100dvh` screen under a 44px utility bar, so the
bottom of the drawing is always cut off:

| Device | Room renders at | Visible below the bar | Logical y visible |
|---|---|---|---|
| iPhone 14 (390 × 664) | 693 px | 620 px | **0 – 509** |
| iPhone SE (375 × 667) | 667 px | 623 px | 0 – 532 |
| iPhone 12 mini (375 × 629) | 667 px | 585 px | 0 – 499 |

**Worst case: logical y = 499.**

The shell handles this well. The bottom ~80 logical units are plain carpet — exactly
the right thing to lose — and every assigned location sits above y = 316. The lowest,
the receipt at y ≈ 307, clears the worst case by 192 units. **Pass, with room to spare.**

---

## 3–6. Canvas: 941 × 1672 → 960 × 1707

### 960 × 1707 is exactly 3 × the logical 320 × 569

(320 × 3 = 960, 569 × 3 = 1707.) That is the whole significance of the number — and it
makes 960 × 1707 the correct **output** of the pipeline, not the correct **input** to it.

### What the pipeline does

`scripts/process-art.ts` **downscales, nearest-neighbour only**, to the declared canvas,
then quantizes to `palette.json`. The shipped room went 941 × 1672 → 320 × 291 + 320 × 278.
The browser upscales with `image-rendering: pixelated`.

The source's entire job is to be downsampled once. Upscaling 1.02× first adds a lossy
resample and then discards it in a 2.94× downscale.

### Is there a pixel grid to protect?

Column-edge periodicity on the existing 941 × 1672 source — same generator, same size:

```
lag 1  1.000   lag 4  0.274   lag 7  0.137   lag 10  0.109
lag 2  0.850   lag 5  0.191   lag 8  0.181   lag 11  0.095
lag 3  0.474   lag 6  0.166   lag 9  0.072   lag 12  0.086
```

Monotonic decay, **no peak at any lag**. No pixel grid in the source — it is a smooth
high-resolution painting *in the style of* pixel art, exactly as `process-art.ts`
documents. The grid is created by the downscale.

So a 941 → 960 upscale would not shatter a grid, because there isn't one. It would
simply be a wasted lossy step.

### Options, ranked

1. **Recommended — leave the source at 941 × 1672.** Run it through the pipeline to the
   declared canvas. For a 3× review PNG, nearest-neighbour ×3 from the 320 × 569 output:
   exact, lossless, identical to what the browser renders.
2. **If a 960-wide source is mandatory — pad, never stretch.** Lanczos by the *width*
   ratio to 960 × 1706, then pad one row of edge-replicated carpet to reach 1707. The pad
   lands in a band no phone shows. Do **not** use the height ratio: it costs a 1px crop
   off the right edge, which is where the booths are.
3. **Not recommended — force it directly.** Non-uniform, but the distortion is only
   **0.073% horizontal** (~0.2 px across the full width) — invisible. It is not a
   distortion problem, it is a pointless-resample problem.

### Regeneration at 960 × 1707

**Small win, not material on its own — but see §11.**

960/320 = **3.0000** exactly; 941/320 = **2.9406**. Under nearest-neighbour a non-integer
ratio drifts the sampled pixel across each block, which can put a 1px jitter into thin
high-contrast details — the rail, the slate's inner moulding. At 3.0000 each output pixel
samples a fixed position in an exact 3 × 3 block.

The shipped room came down the identical 2.94 path and looks correct at every size
screenshotted. The artefact is real and small.

**Original recommendation was: don't spend a regeneration cycle on the ratio alone — ask
for 960 × 1707 if the shell ever goes back for a revision on artistic grounds.**
§11 concludes it must. So the ratio fix is now free, and should be taken.

---

## 7. Placement map — approved assignments

Logical 320 × 569 space. `x, y, w, h`. **By eye, ±3 units** (see §0).
Conversion: logical = source × 0.340.

All nine approved assignments were confirmed against the file. **Seven are present in
the shell; two have no prepared location.**

| Approved assignment | In the shell | Logical `x, y, w, h` | Kind |
|---|---|---|---|
| Large cream wall panel → **Tonight at Tony's** | ✅ present | `52, 78, 131, 98` | Display (baked) |
| Rail above it → **trophy banners** | ✅ present | `57, 65, 126, 7` | Door → `/timeline` |
| Dark framed slate → **Tony's prediction** | ✅ present | `154, 183, 38, 61` | Display (baked) |
| Counter glass area → **Collection display case** | ✅ present | `155, 284, 101, 25` | Door → `/collection` |
| Receipt on counter → **manager record** | ✅ present | `84, 293, 25, 14` | Display (baked) |
| Existing wooden door → **Rooms / basement** | ✅ present | `203, 122, 42, 127` | Door, locked |
| **Tony's standing lane** → recessed left-centre alcove | ✅ present | `62, 173, 72, 111` visible | Toy |
| **Newspaper rack** → `/slice` | ❌ **absent** | — | Door |
| **Underground / Casino entrance** | ❌ **absent** | — | Door, locked |

Supporting geometry:

| Feature | Logical | Role |
|---|---|---|
| Recessed checkered alcove + shelf | `54, 184, 92, 70` | Tony's lane — **scenery, keep clear** |
| Tall arched nook, far left | `6, 181, 46, 105` | scenery · **rack candidate, see §11** |
| Counter top — back edge | **y = 285** | **the layer cut** |
| Counter top — front edge | y = 316 | |
| Counter front panel | `0, 316, 320, 72` | foreground |
| Floor rug | `71, 394, 150, 59` | scenery |
| Clear floor, left of the rug | `4, 396, 62, 58` | **hatch candidate, see §11** |
| Clear floor, right of the counter | `272, 323, 48, 68` | **rack candidate, see §11** |
| Booths, right | `248, 199, 72, 93` | scenery |
| Bottom carpet band | `0, 490, 320, 79` | never visible on a phone |
| **Worst-case phone fold** | **y = 499** | |

### Hit-target check

Three assigned locations are under the 44-unit minimum on one axis and need padded
polygons, as the Tonight board did on the shipped room:

- **Trophy banner rail** — 7 units tall. Likely self-solving: the banner overlays will
  hang well below the rail. Trace the banners, not the rail.
- **Prediction slate** — 38 wide. Pad to 44, centred. Nothing within 44 to collide with.
- **Receipt** — 25 × 14. Pad both axes. Open counter around it, so safe.

---

## 8. Tony and the foreground layer

**Confirmed, and the fit is near-exact.**

Cut the shell at **logical y = 285** — the counter top's back edge, which is also the top
edge of the glass case.

```
  shell (rear)      logical y   0 – 285    (source y   0 –  838)
  Tony sprite                   drawn between
  counter (front)   logical y 285 – 569    (source y 838 – 1672)
```

That puts the counter top, the glass case, the receipt, the counter front, the rug and
the carpet **in front of** Tony — correct, since the case sits on the counter between him
and the viewer.

**Tony's visible band: y 173 → 285 = 112 logical units.** On the shipped room it is
291 − 179 = **112**. Identical. `character_tony_neutral` transfers with no re-authoring.

### The lane is the only one that works, and it is tight

Tony is 72 wide. Across the back wall: nook `6–52`, alcove `54–146`, slate `154–192`,
door `203–245`, booths `248–320`; the Tonight panel spans `52–183` above.

The gap between the Tonight panel's right edge (183) and the door's left edge (203) is
**20 units** — too narrow. The approved alcove lane is the **only** 72-wide column that
is not an assigned location.

At `x = 62` Tony sits centred in the alcove with **10 units of clearance from the nook**
on his left and **20 from the slate** on his right, head finishing at y 173, **2 units
below** the Tonight panel. Every assigned location stays unobstructed.

⚠️ **This lane has no slack.** Any revision that widens the alcove's neighbours, or that
puts anything into `x 54–146`, evicts Tony. **The revision brief in §11 must protect
`x 54–146, y 173–285` explicitly.**

---

## 11. Do the two missing locations require a revised shell?

# Yes. Both. One regeneration resolves them together.

The approved architecture makes Doors *transparent overlays*, so the fair question is
not "is it painted?" but **"is there somewhere an overlay could convincingly go?"** I
checked both against the actual file.

### Underground / Casino — a revised shell is **unavoidable**

**There is no unallocated wall surface left.** Reading the back wall left to right:
pillar → Tonight panel (`52–183`) → alcove, Tony's lane (`54–146`) → slate (`154–192`)
→ door (`203–245`) → corner into the booth area (`248+`).

The only gap is `245–248`, three units. The wall is **fully assigned**.

An overlay door has to be painted over something, and everything is now something. This
cannot be solved by compositing — only by generating wall for it to stand in.

*(Noting: the casino is Phase 10 and out of v1 scope per `16 §Approved Scope`. But
whether its entrance is **visible and locked** from day one is a composition decision,
not a P10 decision, and the shell is being fixed now. Deciding it later means a second
regeneration.)*

### Newspaper rack — **technically possible as an overlay, and still not good enough**

Unlike the door, there *is* clear floor: `272, 323, 48, 68`, right of the counter's end.
An overlay rack there would composite over the foreground counter layer, the lighting
matches, and 48 × 68 clears the 44-unit minimum.

I am recommending against it anyway, for three reasons:

1. It touches the **right frame edge**, against `zone_tile.md`'s ~16px safe-edge rule —
   the same edge already flagged marginal in §1.
2. It sits in the **walkway to the booths**. A rack there reads as clutter dropped into
   a corridor, not as a fixture of the shop.
3. **48 units is 4 over the minimum.** Any future crop, any 1px trim, and `/slice`'s only
   entrance fails its tap target.

`/slice` is a first-class v1 destination. Its entrance should not be the worst-placed
object in the room.

**The better fix costs nothing extra in a regeneration:** convert the **tall arched nook
at far left** (`6, 181, 46, 105`) into a built-in newspaper rack. It is already a
prepared recess with correct lighting and depth, it is currently decorative with no
assignment, and it sits **10 units clear of Tony's lane**. Widening it from 46 to ~58
gives the tap target real margin.

### What to ask the Art Designer for

One regeneration, four changes:

1. **Canvas: 960 × 1707.** Free now that the shell is being regenerated, and it removes
   the non-integer downsample drift on thin details (§3–6). Aspect is effectively
   unchanged — 0.073% — so the composition does not move.
2. **Convert the far-left arched nook into a built-in newspaper rack.** Widen to ~58
   logical units (~174 source px). Masthead area **completely blank** — the headline is
   rendered at runtime; drawn lettering makes it unusable.
3. **Add a second locked entrance for the Underground.** Two options, in preference
   order:
   - **A floor hatch** in the clear floor left of the rug — `4, 396, 62, 58` logical
     (~12–195, 1165–1335 source). Preferred: it uses genuinely empty floor, competes
     with nothing on the back wall, sits 100 units above the worst-case fold, and "down
     to the Underground" is what a hatch means. A padlock on it reads as locked without
     a single word of UI.
   - **A second door**, which requires extending the back wall right of the existing one
     by ~50 logical units and pushing the booth corner further right. More disruptive,
     and it costs booth seating.
4. **Protect Tony's lane.** Keep `x 54–146, y 173–285` free of any new fixture. It is the
   only column he fits in, with no slack (§8).

Everything else in the shell is approved and should not move.

---

## Also flagged

- **The old 320 × 200 homepage zone tiles are retired**, per the ruling. Six entries in
  `assets.inventory.json` still carry the superseded 320 × 228 B1 sizing —
  `zone_tonight_board`, `zone_menu_board`, `zone_newspaper_rack`, `zone_display_case`,
  `zone_wall`, plus the `dressing_door_*` pair at 64 × 96. They should be removed or
  restated against the shell architecture, or the next person to read the inventory will
  generate assets nothing can use. **Registry edit, not a build step — not done here.**
- **`/timeline` still does not exist as a route.** The trophy-banner Door is assigned and
  present in the shell, so it will have somewhere to go the moment the page is built.

---

## Bottom line for the Art Designer

**Do not integrate this shell.** It is a clear improvement and the right direction — it
delivers **7 of the 9** approved locations against 1 today, all three baked Displays are
correct and clean, and Tony fits to within a single logical unit.

**But it needs one more pass.** `/slice` and the Underground have nowhere to go, and
neither gap can be closed by compositing: the back wall is fully assigned, and the only
floor a rack could stand on is the wrong floor. Regenerate at **960 × 1707** with the
four changes in §11 and the shell closes the navigation map completely.
