# Batch B2 — the four that finish the launch commitment

**Status:** specified and ready to generate. Prepared by the Technical Lead, 2026-07-31.
**Purpose:** take finished collectible art from **eight to twelve**, which is the launch commitment recorded in `art/ASSET_PIPELINE.md §5`, `art/assets.inventory.json` and `art/prompts/collectible.md`. The remaining twelve ship as `placeholder_pizza_box` and upgrade on any Tuesday.

**Do not start this batch before Batch B is in hand.** [`BATCH_B_COLLECTIBLES_HANDOFF.md`](BATCH_B_COLLECTIBLES_HANDOFF.md) is the batch that proves the pipeline; these four are drawn against a pipeline that has already produced eight sprites and been corrected. Generating twelve at once and finding a systematic problem at the end costs twelve regenerations.

This file is meant to be **pasted into an image-generation session as-is**, exactly like Batch B. Every dimension in it was measured off the running product.

---

## 0. What this batch is for, and why these four

Batch B was chosen to prove the *system*: every rarity, both silhouette extremes, the detail-budget ceiling, an emissive material, a frame that must not read as a UI plate, and the tiny-object anchor case.

It therefore left four kinds of object **untested**, and each of these four is here because it is the cleanest instance of one of them.

| | Slug | Tier | The case it adds |
|---|---|---|---|
| 1 | `collectible_portable_sauna` | epic | The only **wide** silhouette. Everything in Batch B is compact or tall; nothing tested an object that wants more width than height inside a square canvas. |
| 2 | `collectible_burn_barrel` | epic | An **open-topped container with light coming out of the opening**. Batch B's emissive piece — the neon sign — glows outward from a flat face. This one glows *from inside a hole in the silhouette*. |
| 3 | `collectible_cookie_tote` | rare | The only **soft-sided** object with a **handle loop**. The coffee mug proved a hole in the alpha; this proves a hole in a shape that has no rigid edges to hang it from. |
| 4 | `collectible_checkered_cloth` | common | **Drape and pattern.** No rigid silhouette at all, and a repeating pattern that has to survive the 23 px Showcase draw without turning into noise. This is the hardest legibility case in the whole catalog. |

Together with Batch B the twelve cover **3 common · 3 rare · 4 epic · 2 legendary**, which finishes every epic in the catalog.

### One inconsistency, reported rather than resolved

`art/assets.inventory.json` describes its own twelve as *"the 2 legendary, 4 epic, and 6 marked priority"*, and only **three** non-legendary, non-epic slugs actually carry `priority: true` — `collectible_cookie_tote`, `collectible_crt_tv`, `collectible_revolution_poster`. The comment and the flags do not reconcile.

This batch takes `cookie_tote` (flagged) and `checkered_cloth` (not flagged) and leaves `crt_tv` and `revolution_poster` for later, on coverage grounds: a CRT is a box with a lit screen, which the arcade cabinet already is, and a poster is a flat framed rectangle, which the signed jersey already is. **Choosing coverage over the flag is a Technical Lead decision and it is recorded here so it can be reversed in one edit** — swap the slugs in `lib/assets/batches.ts` and this document's §3.

---

## 1. Shared style and environmental reference

**Identical to Batch B. Do not re-derive it.** Read [`BATCH_B_COLLECTIBLES_HANDOFF.md §1`](BATCH_B_COLLECTIBLES_HANDOFF.md) and use it verbatim:

1. **THE BLOCK** from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md), pasted without paraphrase
2. the world, the perspective, the lighting and the palette as `§1.2`–`§1.5` state them
3. the per-item subject line from `§3` below

The reference crops in `§1.6` of that file are the actual slots at actual size. Look at them before generating; they are the only honest answer to *"how big is this really?"*

---

## 2. Production constraints

**Identical to Batch B `§2`.** The five that break a batch when they are missed, restated so nobody has to open two files while generating:

| | |
|---|---|
| **Final logical canvas** | **46 × 46**, no exceptions |
| **Background** | Fully transparent, no partial alpha anywhere |
| **Anchor** | **Bottom-centre.** The lowest opaque pixel must be in **row 45** |
| **Horizontal centre** | The occupied box's centre within **3 px of x = 23** |
| **Maximum extent** | **44 px** on the sides and top; the bottom is exempt and must be occupied |

Plus, and these are the ones this batch is most likely to trip:

- **Generate large, never at 46 px.** The pipeline downscales with nearest-neighbour and quantizes to `palette.json`. Prompting for final dimensions produces a blurry 46 px image that no amount of processing can recover.
- **No more than ten distinct interior shapes.** `checkered_cloth` will want to break this and must not; see `§3.4`.
- **The binding readability target is 23 px** — the Showcase draws every collectible at exactly half.
- **The art is rarity-neutral.** Nothing in the PNG says what tier the item is. Rarity is composited at runtime so the P3 simulation can rebalance tiers without redrawing anything.
- **One static sprite each.** No animation frames, no variants, no alternate angles.

`npm run art:validate` measures all of the above. `npm run art:batch -- B2` runs the whole sequence.

---

## 3. The four briefs

### 3.1 Portable sauna

| | |
|---|---|
| **Display name** | Portable sauna |
| **Slug** | `collectible_portable_sauna` |
| **Production filename** | `public/assets/collectible/collectible_portable_sauna.png` |
| **Generation filename** | `art/incoming/collectible_portable_sauna_01.png` |
| **Tier** | epic |
| **Occupied box** | **≈ 42 w × 30 h**, rows **16–45**, columns 2–43 |
| **Centre of visual mass** | x 23, y 32 |
| **Contact point** | The base of the tent and the front of the folding stool both rest on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A one-person portable steam sauna: a zipped fabric tent on a low folding frame, with a head-sized opening at the top and a small towel folded over the front rail. Wider than it is tall. Nobody inside.

**Why this one.** It is the **only wide object in the twelve**, and width inside a square canvas is where the centring rule bites hardest: an object 42 px across has two pixels of margin on each side, so the occupied box's centre and the object's *visual* centre have to be the same thing. A towel hanging on one rail will pull the bounding box off-centre while the sauna itself still looks centred — **centre the tent, not the box**, exactly as the coffee mug's handle required in Batch B.

**Trap.** Do not draw steam. Steam is partial alpha by nature and `art:validate` refuses partial alpha outright; a two-value hard-edged wisp is the only acceptable form, and the safer answer is none at all. The object reads as a sauna from the shape.

---

### 3.2 Burn barrel

| | |
|---|---|
| **Display name** | Burn barrel |
| **Slug** | `collectible_burn_barrel` |
| **Production filename** | `public/assets/collectible/collectible_burn_barrel.png` |
| **Generation filename** | `art/incoming/collectible_burn_barrel_01.png` |
| **Tier** | epic |
| **Occupied box** | **≈ 26 w × 34 h**, rows **12–45**, columns 10–35 |
| **Centre of visual mass** | x 23, y 30 |
| **Contact point** | The barrel's base rests flat on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A dented steel oil drum with its lid removed, rust streaks down the sides, and a low fire burning inside so the flame tips rise just above the rim. Seen straight on.

**Why this one.** Batch B's emissive piece — the neon sign — glows outward from a flat face. This one glows **out of an opening in the silhouette**, which is a different problem: the rim has to stay a hard closed outline while the light inside it is brighter than anything else on the canvas, and the flame must not spill over the rim edge into a fringe.

**Traps, in order of likelihood:**

1. **The flame is not a light source in the render.** No bloom, no gradient falloff, no soft glow. Two or three flat value steps of warm colour, hard-edged, inside the rim. The room's own glow is composited at runtime and a baked one fights it.
2. **The rim stays enclosed.** `§2.4`'s fully-enclosed one-pixel outline applies to the barrel *including* the rim ellipse. The fire sits inside that outline, never on top of it.
3. **Flame tips above the rim are part of the silhouette.** They must be chunky enough to survive the 23 px draw — a single-pixel tongue of flame disappears entirely, and the object then reads as an empty bin.

---

### 3.3 Cookie tote

| | |
|---|---|
| **Display name** | Cookie tote |
| **Slug** | `collectible_cookie_tote` |
| **Production filename** | `public/assets/collectible/collectible_cookie_tote.png` |
| **Generation filename** | `art/incoming/collectible_cookie_tote_01.png` |
| **Tier** | rare |
| **Occupied box** | **≈ 30 w × 34 h**, rows **12–45**, columns 8–37 |
| **Centre of visual mass** | x 23, y 31 |
| **Contact point** | The flat bottom of the bag sits on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A canvas tote bag standing upright with its handles up, sagging slightly under the weight of the cookies inside, two or three of which show above the rim. Plain fabric with a single printed band.

**Why this one.** The **handle loop is a hole in the alpha with no rigid edge to hang it from.** The coffee mug proved the pipeline can carry a hole; a mug handle is a rigid ceramic ring and it is easy to keep clean. A fabric handle wants to be drawn with a soft taper, and a soft taper becomes either partial alpha — refused — or a one-pixel thread that vanishes at 23 px.

**Draw the handle loop at a minimum of two pixels thick throughout, and keep the enclosed gap at least three pixels across.** Under that, the Showcase draw closes the hole and the bag reads as a solid block with a lump on top.

**Second trap.** The sag is the only thing that says *soft*, and it is easy to overdo: a bag that slumps loses its vertical silhouette and reads as a cushion. One value step of shading down each side and a slightly bowed base line is enough.

---

### 3.4 Checkered tablecloth

| | |
|---|---|
| **Display name** | Checkered tablecloth |
| **Slug** | `collectible_checkered_cloth` |
| **Production filename** | `public/assets/collectible/collectible_checkered_cloth.png` |
| **Generation filename** | `art/incoming/collectible_checkered_cloth_01.png` |
| **Tier** | common |
| **Occupied box** | **≈ 34 w × 26 h**, rows **20–45**, columns 6–39 |
| **Centre of visual mass** | x 23, y 34 |
| **Contact point** | The lowest fold rests on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A red and white checkered tablecloth, folded once and stacked, sitting as a soft rectangular pile with the fold visible along the top edge and one corner draping down the front.

**Why this one.** It is the **hardest legibility case in the catalog**, and it is worth having in the twelve for exactly that reason: a repeating pattern drawn at 46 px and then displayed at 23 px is one downscale away from grey noise.

**The pattern is the object's identity, so the pattern has to be legible at half size.** That means:

- **Squares no smaller than 4 × 4 pixels** on the 46 px canvas. At the Showcase draw they become 2 × 2, which is the floor at which a check still reads as a check rather than as dithering.
- **Two colours only**, plus the outline. No third tone inside the check, no highlight on individual squares.
- The check may be interrupted by a fold — that is what says *cloth* — but it must not be *perspective-warped* square by square. `§1.3` of the Batch B handoff: collectibles are flat and front-facing, and a warped check is the same foreshortening that rule forbids, arriving through a texture instead of through a shape.

**Trap.** This is the one item where `§2.4`'s ten-shape budget will feel wrong, because a check is dozens of squares. **The budget counts distinct *shapes*, not repetitions of one.** The cloth is: the pile, the fold line, the draping corner, and one repeating check fill. That is four.

**Second trap.** It has **no rigid silhouette**, which makes it the one object where the enclosed outline does the entire job of separating it from the tray. Keep the outline a full unbroken loop around the pile including the draped corner; a break anywhere and the affordance glow — which is derived from the alpha — leaks into the shape.

---

## 4. Delivery

Identical to Batch B, and it is now one command.

```bash
# 1. drop the four PNGs in art/incoming/ as <slug>_01.png
# 2.
npm run art:batch -- B2
# 3. when the screenshots look right
npm run art:batch -- B2 --register
```

`art:batch` matches filenames, refuses a missing or duplicated asset by name, processes, validates all ten mechanical rules, checks the registry row, captures the Reveal, Collection and Showcase states, and prints a per-asset status table. **No feature code changes.** `lib/assets/batches.test.ts` fails the build if this document and the manifest ever disagree about which four.

The screenshots need a production build on `:3111` with `DEMO_FIXTURES=1` set on the **server process**; `docs/CHECKPOINT.md` has the exact invocation.

---

## 5. The acceptance question

Same as Batch B, and it is not arithmetic:

> **Would a manager who pulled this be pleased?**

Everything `art:validate` measures is necessary and none of it answers that. Look at the Reveal at 390, the Collection at 360, and the Showcase at 375 before running `--register`.
