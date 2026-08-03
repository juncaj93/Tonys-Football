# Batch B — the first eight collectibles

**Status:** ready to generate. Prepared by the Technical Lead, 2026-07-31.
**Purpose:** prove the production collectible-art system end to end — Reveal, Collection, Showcase — with eight real sprites, before the remaining sixteen are drawn against an unproven pipeline.

This file is meant to be **pasted into an image-generation session as-is**. Every dimension, anchor and ratio in it was measured off the running product, not chosen. Nothing here is a question for the commissioner.

---

## 0. Read this first — three numbers that were wrong until today

Three separate approved documents specified a collectible canvas of **32 × 32**. The implemented slot is **46 × 46**, and has been since 2026-07-30. A batch generated against the old number would have been resampled at 1.4375× — fractional, blurring exactly the hard edges the whole pipeline exists to protect — and it would have looked fine in every document and wrong only on a phone.

| Document | Said | Now says |
|---|---|---|
| `art/ART_SPEC.md §2` | Collectible 32 × 32, serving 16 / 32 / 96px | **46 × 46**, serving 23 / 46 / 56px, with §2.3 showing the measurement |
| `art/prompts/collectible.md` | Canvas 32 × 32, *"readability at 16px is the binding constraint"*, *"centered in the frame"* | **46 × 46**, *"readability at 23px"*, **rests on the bottom edge** |
| `docs/art/ART_PRODUCTION_BACKLOG.md` | A Batch B list naming four slugs that do not exist | The eight below, all canonical |

`lib/assets/art-slots.test.ts` fails the build if the registry drifts from the slot again, and `npm run art:validate` now measures a delivered PNG against it. **Use the numbers in this file; they are the ones the code holds.**

---

## 1. Shared style and environmental reference

### 1.1 The style preamble — paste verbatim, never paraphrase

Every prompt is three parts in this order, always:

1. **THE BLOCK** from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md), pasted verbatim
2. The **FAMILY** section from [`art/prompts/collectible.md`](../../art/prompts/collectible.md), pasted verbatim
3. One **SUBJECT** line from §3 below

Paraphrasing the preamble is how style drift starts. It is invisible until batch four, at which point batches one through three have to be redrawn.

### 1.2 The world these objects come from

A neighbourhood pizza parlor in a fictionalised Metro Detroit, running since the 1990s. Red-and-white checkered cloth, worn wood panelling, amber incandescent light, neon signage, arcade carpet, CRT glow, paper menus taped to things. Warm, lived-in, slightly shady. **Not** tourist-board Detroit, not a neon casino, not steampunk.

These eight are objects **from that room** — things a manager would recognise off a shelf in the back. They are catalogue photographs of junk with sentimental value, not fantasy loot.

### 1.3 Perspective — collectibles are flat

`ART_SPEC §3.1` splits this, and it is load-bearing:

| | Perspective |
|---|---|
| Environments (the parlor itself) | Shallow stage box, floor receding gently |
| **Characters, collectibles, surfaces** | **Completely flat and front-facing. No perspective, no foreshortening, no rotation, no isometric.** |

Flat sprites on a perspective background is how a great many late-1990s games worked. It is period-correct, not a compromise.

### 1.4 Lighting — one warm key from the upper left

- **Single key light, warm, upper-left**, the colour of an incandescent bulb (`amber` ramp).
- Cool low-influence ambient fill from the lower right.
- **Shadows step one value darker inside the same colour family.** A shadow on `wood-mid` is `wood-dark` — never grey, never black.
- **Neon is emissive**: drawn at full palette value with a **one-pixel bloom of its own hue**, and it does **not** receive the key light. That one-pixel bloom is authored and is *not* the prohibited rarity glow — see §2.5.

### 1.5 Palette

Quantized mechanically to [`art/palette.json`](../../art/palette.json) — 32 colours across ten hue families. Generate in the spirit of it; the pipeline makes it exact.

```
ink     #1A1214 #2E2226 #4A3B3F #7A6A6E #B5A8A9
wood    #4A2E1C #7A4A2A #A9713F #C99A63
red     #8C1F22 #C42B2B #E4534A
paper   #F5EDDC #E0D2B8 #BFAE8E
amber   #FFD98A #F2A94B #C97A22
blue    #14233D #2C5A8C #5C9BD1 #7FD4F0
green   #1E4A32 #5FD98A
yellow  #F2C94C #FFF07A
violet  #3B2050 #E060B0
skin    #F2C9A0 #D9A173 #9C6640 #5E3A25
```

**Never pure black `#000000`. Never pure white `#FFFFFF`.** Both are common model defaults and both are stripped by the pipeline, which means a sprite that relies on them loses its darkest and lightest values.

### 1.6 Reference crops — the actual slots, at actual size

Captured from the running product at 390 px, `deviceScaleFactor: 3`, with the current stand-in in place. These are the holes the art fills.

| File | What it shows |
|---|---|
| [`reference/slot-reveal.png`](reference/slot-reveal.png) | The reveal slot alone — 168 device px = **56.06 CSS px** |
| [`reference/slot-reveal-in-room.png`](reference/slot-reveal-in-room.png) | The same slot with the room and the plate around it, so the scale against the counter is visible |
| [`reference/slot-collection.png`](reference/slot-collection.png) | A Collection cell — 138 device px = **46 CSS px, exactly 1 : 1 with the source** |
| [`reference/slot-collection-in-context.png`](reference/slot-collection-in-context.png) | The same cell on its shelf board, with its name and tier |
| [`reference/slot-showcase-hero.png`](reference/slot-showcase-hero.png) | The Showcase's "Yours" panel — 168 device px = **56 CSS px** |

---

## 2. Shared production constraints

### 2.1 Canvas, anchor and occupancy

| | |
|---|---|
| **Final logical canvas** | **46 × 46**, no exceptions |
| **Background** | Fully transparent |
| **Anchor** | **Bottom-centre.** Row 45 is the contact row. |
| **Baseline / contact point** | The object's lowest opaque pixel **must be in row 45**. Not row 43, not row 44. |
| **Horizontal centre** | The occupied box's centre must fall within **3 px of x = 23** |
| **Maximum extent** | **44 px** on the sides and top. See §2.2. |
| **Vertical space** | Goes **above** the object. Never below, never split evenly. |

**A short object is short, not floating.** An arcade token occupies maybe 18 × 18 of the 46 × 46 canvas, sitting on row 45 with 28 rows of transparency above it. That is correct and it is what bottom-centre anchoring is for: a tall replacement grows upward instead of sinking through the tray it stands on.

### 2.2 Safe area for the landing overshoot

The reveal animation settles with an overshoot — `scale(1.06)` at its 62% keyframe. For about 160 ms the sprite is drawn 6% larger than its slot.

**Do not add padding for this.** The transform scales the rendered element, not the canvas, and the maths works out to roughly a third of a pixel below the baseline at peak — invisible. What it *does* mean is that an object occupying all 46 px edge-to-edge briefly grows past its neighbours. **Keep the occupied box within 44 px on the sides and the top.** The bottom is exempt: row 45 must be occupied.

`npm run art:validate` measures this.

### 2.3 Pixel density

**One art pixel = one room unit = one Collection CSS pixel.** The Collection draws the source at exactly 1 : 1, which makes it the reference surface: if it reads there, it reads.

Generate **large** and let the pipeline downscale — `ASSET_PIPELINE §4` step 1. Image models cannot produce true pixel art at 46 px; they produce 1024 px approximations of the look. **Never prompt for final dimensions.**

### 2.4 Detail budget and the silhouette test

- **No more than ten distinct interior shapes**, excluding the outline. Fewer is better.
- Texture is suggested by two or three value steps, never rendered.
- **Fully enclosed 1-pixel outline** in a warm near-black (`ink-900 #1A1214`).
- **Silhouette first.** Filled with a single flat colour, the object must still be recognisable. An object that fails this fails regardless of how good its interior is.

**The binding readability target is 23 px** — the Showcase's league row draws every collectible at exactly half. Design for that and the other two surfaces come free. A shape carried by single-pixel detail disappears there, and `art:validate` has a check for exactly that failure.

### 2.5 The art is rarity-neutral

**Nothing in the PNG says what tier the item is.** Rarity is composited at runtime — the frame geometry, the printed word, the tinted burst, the coloured light — and it is composited that way so the P3 simulation can rebalance tiers without redrawing anything.

A legendary and a common are drawn with the same care and the same lighting. What makes a legendary feel legendary is the room's reaction to it, not the sprite.

The **one** exception is a canonical emissive object: `collectible_neon_tony_sign` is a neon sign, so it carries its own one-pixel bloom because that is what neon looks like. That is the object's material, not a tier signal.

### 2.6 Prohibited, absolutely

| Never bake in | Why |
|---|---|
| **Text or lettering of any kind** | Illegible at 46 px and impossible to translate or re-word. The one licensed exception is Tony's own wordmark *as a neon tube shape*, §3.6. |
| **A rarity glow, aura, sparkle or ray** | Runtime, tier-tinted, and `prefers-reduced-motion` has to be able to remove it |
| **A UI plate, card, border or rarity frame** | Composited at runtime. A baked frame cannot be re-tiered and reads as a card inside a card. |
| **A drop shadow or cast shadow** | The room lights the object; a baked shadow lands on a surface that is not there |
| **A ground plane, plinth, pedestal or surface** | The tray, the shelf board and the Showcase panel are each a different surface. A baked one is wrong on at least two. |
| **A room background of any kind** | Transparent, always |
| **Anti-aliased or soft edges** | The affordance glow is `drop-shadow()` on the sprite's **own alpha channel**. A soft fringe corrupts the silhouette it is derived from. |
| **Team logos, league marks, real player likenesses or signatures, brand names, other companies' wordmarks** | `ART_SPEC §10`. Signed memorabilia uses decorative illegible scrawl. |

### 2.7 One static sprite is sufficient

For all eight. There is no per-rarity variant, no hover state, no open/closed pair, and no animation frames. Everything that moves is CSS.

The lava lamp does not need bubbling frames; the burn barrel does not need flame frames. If the commissioner later wants either to animate, that is a second asset and a separate decision — do not pre-emptively produce frames.

### 2.8 Generate individually

**One image per collectible. Not a sprite sheet.** `npm run art:process` reads one file per slug from `art/incoming/` and emits one PNG per slug. There is no sheet-slicing step, so a contact sheet of eight would have to be cut up by hand — which is exactly the manual step the pipeline exists to remove.

---

## 3. The eight

Chosen to exercise every treatment rather than to fill the shelf. Two per tier, and between them they cover the humour, the extremes of silhouette, the complexity ceiling, and the two things most likely to break — a tiny object in a large canvas, and an object whose subject is a frame.

| # | Item | Slug | Tier | What it proves |
|---|---|---|---|---|
| 1 | Arcade token | `collectible_arcade_token` | common | The **smallest silhouette**, and the anchor. Most likely to be drawn floating or oversized. |
| 2 | Diner coffee mug | `collectible_coffee_mug` | common | **Visually simple**, and a real hole in the alpha (the handle) |
| 3 | Novelty singing fish | `collectible_singing_fish` | rare | **Humorous junk**, and the **widest** silhouette |
| 4 | Can of whipped cream | `collectible_reddiwip` | rare | **The commissioner's named reference piece.** Tall and slim. |
| 5 | Arcade cabinet | `collectible_arcade_cabinet` | epic | **Visually complex** — the detail-budget ceiling |
| 6 | Neon Tony's Pizza sign | `collectible_neon_tony_sign` | epic | **Emissive material** without a baked rarity glow; wide |
| 7 | Framed signed jersey | `collectible_signed_jersey_legend` | legendary | **Wearable candidate**, and the **frame trap** |
| 8 | The Bapple Tree | `collectible_bapple_tree` | legendary | Canon humour, **organic silhouette** among seven hard-edged objects |

> **On the wearable.** None of the twenty-four is a wearable today — wearables are a separate family (`_wearables_B2`) and equipping belongs to M3. The framed jersey is the **only** future-wearable candidate in the catalog, and it is included so M3's first wearable can be derived from art direction that already exists rather than invented later. Do not substitute a hat or apron: neither is a canonical collectible, and inventing one to make the batch tidier is exactly what the ruling forbids.

> **On the missing championship ring.** The earlier Batch B list named `collectible_championship_ring`. There is no such collectible — `item_championship_ring` is a **season award**, a different family, and the two legendaries in the catalog are the framed jersey and the Bapple Tree. The old list also named `collectible_diner_coffee_mug` and `collectible_can_whipped_cream`; the real slugs are `collectible_coffee_mug` and `collectible_reddiwip`. Generating against those names would have produced files `art:process` refuses by design.

---

### 3.1 Arcade token

| | |
|---|---|
| **Display name** | Arcade token |
| **Slug** | `collectible_arcade_token` |
| **Production filename** | `public/assets/collectible/collectible_arcade_token.png` |
| **Generation filename** | `art/incoming/collectible_arcade_token_01.png` |
| **Tier** | common |
| **Occupied box** | **≈ 18 w × 18 h**, rows **28–45**, columns 14–31 |
| **Centre of visual mass** | x 23, y 37 |
| **Contact point** | The bottom of the disc rests on row 45 |
| **One sprite?** | Yes |

**Subject line — revised, commissioner ruling 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md`**

> A brass arcade token with a simplified Tony's wordmark and a small chef-mascot accent, embossed or stamped into the face. Standing on its edge, seen face-on, so the full circular face is visible. No registered-trademark symbol.

> ~~A brass arcade token with an abstract embossed design, no lettering.~~ **Superseded.** This is now intentionally a **Tony's token**, not an abstract one — see `docs/art/BRAND_EXCEPTIONS.md` item 1.

**Why this one.** It is the item most likely to expose a scale or anchor problem, and it will do so silently. A token drawn to fill 46 × 46 would render on the tray at the size of the pizza box that produced it, and nothing would error. **Small is correct here.** Twenty-eight rows of transparency above it is the right answer, not a mistake.

Standing on edge rather than lying flat, because collectibles are drawn flat and front-facing — a token lying flat would have to be foreshortened, which §1.3 forbids.

**The logo trap.** The wordmark and mascot must survive quantization and 23px legibility, which the first candidate's full-detail engraving does not — simplify the mascot to a silhouette-level accent and keep the wordmark to its boldest strokes. A strong circular silhouette still governs over logo fidelity.

---

### 3.2 Diner coffee mug

| | |
|---|---|
| **Display name** | Diner coffee mug |
| **Slug** | `collectible_coffee_mug` |
| **Production filename** | `public/assets/collectible/collectible_coffee_mug.png` |
| **Generation filename** | `art/incoming/collectible_coffee_mug_01.png` |
| **Tier** | common |
| **Occupied box** | **≈ 28 w × 24 h**, rows **22–45**, columns 9–36 |
| **Centre of visual mass** | x 22, y 34 — slightly left of centre, because the handle adds width on one side without adding mass |
| **Contact point** | The mug's base sits flat on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A thick white diner mug with a single coloured stripe near the rim, handle to the right. Squat and heavy, the kind that lives in a warmer behind a counter.

**Why this one.** The handle is a **genuine hole in the alpha channel** — the gap between handle and body must be fully transparent, not filled and not fringed. That is the case most likely to arrive with a soft edge, and the affordance glow is derived from the alpha, so a filled handle produces a glow around a shape the object does not have.

The visual centre is offset by the handle. Centre the **body**, not the bounding box, or the mug will appear to lean.

---

### 3.3 Novelty singing fish

| | |
|---|---|
| **Display name** | Novelty singing fish |
| **Slug** | `collectible_singing_fish` |
| **Production filename** | `public/assets/collectible/collectible_singing_fish.png` |
| **Generation filename** | `art/incoming/collectible_singing_fish_01.png` |
| **Tier** | rare |
| **Occupied box** | **≈ 42 w × 26 h**, rows **20–45**, columns 2–43 — the **widest** in the batch |
| **Centre of visual mass** | x 23, y 33 |
| **Contact point** | The bottom edge of the wooden plaque rests on row 45 |
| **One sprite?** | Yes — no singing frames |
| **Watch** | 42 px is inside the 44 px limit with 1 px to spare on each side. Do not let it grow. |

**Subject line**

> A novelty plastic fish mounted on a varnished wooden plaque, body angled slightly upward, mouth open mid-song. Cheerful and cheap.

**Why this one.** The set's humour depends on items like this, and it is the widest object in the batch — the one that proves a horizontal silhouette survives a canvas built around a vertical one. It is also the clearest test of §2.7: the joke is that it sings, and it still ships as **one static sprite**.

---

### 3.4 Can of whipped cream — the reference piece

| | |
|---|---|
| **Display name** | Can of whipped cream |
| **Slug** | `collectible_reddiwip` |
| **Production filename** | `public/assets/collectible/collectible_reddiwip.png` |
| **Generation filename** | `art/incoming/collectible_reddiwip_01.png` |
| **Tier** | rare |
| **Occupied box** | **≈ 18 w × 40 h**, rows **6–45**, columns 14–31 |
| **Centre of visual mass** | x 23, y 27 |
| **Contact point** | The can's base sits flat on row 45 |
| **One sprite?** | Yes |

**Subject line — revised, commissioner ruling 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md`**

> A Reddi-wip-inspired aerosol whipped-cream can, cylindrical, predominantly red-and-white packaging, recognizable whipped-cream imagery on the label, aerosol top with an angled nozzle. Illegible or tiny microtext may be simplified away, but the can should read as an intentional homage to the classic can, not a generic unbranded one.

> ~~An unbranded aerosol whipped-cream can... Plain metal body with a simple band.~~ **Superseded.** See `docs/art/BRAND_EXCEPTIONS.md` item 3.

**Why this one.** The commissioner named it, and the backlog records that its perspective, crop and anchor are **the reference the other seven are measured against** — the Technical Lead owed that measurement before Batch B was generated, and §2.1 is it.

Tall and slim: 40 of the 46 rows, 18 of the 46 columns. It is the item that proves vertical objects grow **upward** from the contact row rather than being centred and left hovering.

**Reddi-wip-inspired, deliberately.** The slug names the reference and the ruling now means it literally: red-and-white trade dress and the whipped-cream illustration are wanted. What still gets simplified is anything that stops reading cleanly at 23px — fine label microtext, not the overall look.

---

### 3.5 Arcade cabinet

| | |
|---|---|
| **Display name** | Arcade cabinet |
| **Slug** | `collectible_arcade_cabinet` |
| **Production filename** | `public/assets/collectible/collectible_arcade_cabinet.png` |
| **Generation filename** | `art/incoming/collectible_arcade_cabinet_01.png` |
| **Tier** | epic |
| **Occupied box** | **≈ 30 w × 44 h**, rows **2–45**, columns 8–37 — the **tallest** in the batch |
| **Centre of visual mass** | x 23, y 24 |
| **Contact point** | Both feet of the cabinet rest on row 45 |
| **One sprite?** | Yes — the screen does not animate |
| **Watch** | 44 rows is exactly the limit. Do not exceed it. |

**Subject line**

> An upright arcade cabinet with a dark CRT screen showing abstract coloured shapes, a joystick and two buttons on the control panel, and side art of abstract geometric patterns. No text, no recognisable game.

**Why this one.** It is the **detail-budget ceiling**. A real arcade cabinet wants a marquee, a bezel, a control panel, coin doors, side art, feet and a screen — comfortably twenty interior shapes. The budget is **ten**. This is the item that proves the budget is workable rather than aspirational, and the one where the temptation to exceed it is strongest.

At 23 px in the Showcase row, a cabinet reduces to a dark upright box with a lighter rectangle in it. **That is the target**, and everything that does not survive to it is detail that was spent for nothing.

---

### 3.6 Neon Tony's Pizza sign

| | |
|---|---|
| **Display name** | Neon Tony's Pizza sign |
| **Slug** | `collectible_neon_tony_sign` |
| **Production filename** | `public/assets/collectible/collectible_neon_tony_sign.png` |
| **Generation filename** | `art/incoming/collectible_neon_tony_sign_01.png` |
| **Tier** | epic |
| **Occupied box** | **≈ 40 w × 28 h**, rows **18–45**, columns 3–42 |
| **Centre of visual mass** | x 23, y 31 |
| **Contact point** | The bottom edge of the dark backing plate rests on row 45 |
| **One sprite?** | Yes — no flicker frames |
| **Lighting** | **Emissive.** Full palette value plus a **one-pixel bloom of its own hue**. Does **not** receive the upper-left key light. |

**Subject line — revised, commissioner ruling 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md`**

> A neon sign reading "Tony's" and "Pizza" in glowing tube lettering, with a simplified chef accent and a pizza-slice motif, mounted on a small dark backing plate. Red and warm-yellow neon tubing. Emissive, unaffected by scene light.

> ~~No lettering.~~ **Superseded.** This is now intentionally a **Tony's Pizza neon sign** with the wordmark legible — see `docs/art/BRAND_EXCEPTIONS.md` item 2. The reasoning below about *why* lettering was excluded (readability at 46px/23px) still applies as a simplification requirement, just not as a ban.

**Why this one, and the traps in it.**

**The glow trap, unchanged.** This is the only object in the batch that legitimately glows, and it is one word away from a prohibited baked rarity glow. The distinction is exact: **a one-pixel bloom of the tube's own hue is the material.** A soft halo, a radial gradient, rays, or any glow that extends past one pixel is the rarity system's job and must not be in the PNG.

**The legibility trap, revised.** The wordmark no longer has to be removed, but it still has to survive the same 46px/23px readability floor every asset in this batch is held to. If "Tony's Pizza" in neon tubing turns to mush at 23px, simplify the letterforms (bolder strokes, fewer flourishes) rather than shrinking the sign or adding more detail to compensate. Drop any extra unbriefed elements (a mascot silhouette, sparkle particles) before you add more lettering detail — the detail budget is still ten shapes, and lettering now competes for it.

---

### 3.7 Framed signed jersey

| | |
|---|---|
| **Display name** | Framed signed jersey |
| **Slug** | `collectible_signed_jersey_legend` |
| **Production filename** | `public/assets/collectible/collectible_signed_jersey_legend.png` |
| **Generation filename** | `art/incoming/collectible_signed_jersey_legend_01.png` |
| **Tier** | legendary |
| **Occupied box** | **≈ 34 w × 40 h**, rows **6–45**, columns 6–39 |
| **Centre of visual mass** | x 23, y 26 |
| **Contact point** | The bottom edge of the wooden frame rests on row 45 |
| **One sprite?** | Yes |

**Subject line**

> A football jersey in a wooden display frame behind glass, blue and silver, no numbers, no logos, no wordmarks. A looping silver signature scrawled across the chest, decorative and completely illegible — not any real person's signature.

**Why this one, and its trap.**

**The frame trap.** The subject *is* a framed object, and §2.6 prohibits baking a frame. Those do not contradict, and the difference has to be drawn deliberately: **a wooden picture frame with visible mitred corners, grain and depth is furniture.** A flat rectangular border of even width around the edge of the canvas is a UI plate, and at 23 px the two collapse into each other.

So: the frame must read as **wood, with thickness and a warm value step**, and it must sit inside the canvas with transparency around all four sides. It must never touch the canvas edge — an object whose border runs to the edge of its own image is indistinguishable from a card.

**Rights.** Blue and silver only. No number, no team mark, no real signature. The scrawl is decorative and must not resolve into letters.

**As a wearable candidate.** M3's wearable system will need a jersey. Draw the garment inside the frame as a **complete, symmetrical, front-facing jersey** — not cropped by the frame, not angled — so an unframed derivative can be lifted from this art direction rather than invented from nothing.

---

### 3.8 The Bapple Tree

| | |
|---|---|
| **Display name** | The Bapple Tree |
| **Slug** | `collectible_bapple_tree` |
| **Production filename** | `public/assets/collectible/collectible_bapple_tree.png` |
| **Generation filename** | `art/incoming/collectible_bapple_tree_01.png` |
| **Tier** | legendary |
| **Occupied box** | **≈ 32 w × 42 h**, rows **4–45**, columns 7–38 |
| **Centre of visual mass** | x 23, y 25 |
| **Contact point** | The base of the terracotta pot rests on row 45 |
| **One sprite?** | Yes |

**Subject line — revised, commissioner ruling 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md`**

> A small potted tree bearing four to six Busch Light Apple-style cans hanging like fruit — red cans, a recognizable white label region, a blue mountain/crest treatment. Presented completely straight, as if it were an ordinary houseplant. Terracotta pot.

> ~~A small potted tree bearing fruit that is unmistakably half apple and half banana.~~ **Superseded in full.** The half-apple/half-banana fruit concept is replaced, not supplemented — see `docs/art/BRAND_EXCEPTIONS.md` item 4. Do not draw both; the cans are the fruit now.

**Why this one.** It is still the only **organic-adjacent** silhouette test in the batch, though the specific shapes hanging in the canopy are now cylindrical cans rather than fruit — the ten-shape budget and the 1-pixel outline still have to survive a canopy that isn't made of straight architectural lines. Draw the foliage as **two or three flat value masses**, not as individual leaves, same as before; the cans hang **within and below** that canopy, clearly separated from each other so they don't merge into noise at 23px. Prefer 4–6 clearly separated cans over a crowded canopy if a denser count stops reading.

**Canon** (`PROJECT_SPEC/14 §7`): Bapple is deliberately underexplained and slightly absurd. **Do not overexplain it visually** — no explanatory label beyond what the can's own trade dress carries, no sign. It is a houseplant that happens to be impossible, presented as though nobody has remarked on it. At 46×46 and especially 23px, the joke has to read as "beer-can tree" at a glance — if the cans are too small or too numerous to identify as cans, the joke has failed even if the composition is otherwise clean.

---

## 4. Required output naming

```
art/incoming/<slug>_NN.png      ← what you deliver; NN is the candidate number, 01, 02, …
```

Then:

```bash
npm run art:process             # downscale → quantize → alpha cleanup → trim → emit
npm run art:validate            # measure every delivered sprite against its slot
```

`art:process` emits `public/assets/collectible/<slug>.png` and prints the registry line to add. **A filename that does not resolve to a registry slug is rejected rather than skipped** — a silent skip means waiting for art that was never going to appear.

**Keep the originals.** `art/incoming/` is the only copy of the pre-quantization image, and a regeneration almost always starts from adjusting one that was close. Source files are preserved separately from the emitted PNGs and are never deleted.

The eight expected filenames:

```
collectible_arcade_token_01.png
collectible_coffee_mug_01.png
collectible_singing_fish_01.png
collectible_reddiwip_01.png
collectible_arcade_cabinet_01.png
collectible_neon_tony_sign_01.png
collectible_signed_jersey_legend_01.png
collectible_bapple_tree_01.png
```

**Budget a 50–70% cull rate** — roughly four candidates per needed asset, so about thirty generations for eight sprites. Generation is cheap; reviewing is the real cost. Cull hard and early rather than trying to rescue a near-miss.

---

## 5. Validation procedure

### 5.1 Mechanical — `npm run art:validate`

Runs against every delivered PNG and fails the command on any of:

| Rule | What it catches |
|---|---|
| `canvas` | Not 46 × 46 — the defect that survived three approved documents |
| `alpha` | Any partially-transparent pixel; the affordance glow is derived from this channel |
| `palette` | Any colour outside `palette.json`, or pure black/white |
| `anchor` | Lowest opaque row is not 45 (it floats), or the visual centre is more than 3 px off |
| `overshoot` | Occupies more than 44 px on the sides or top, so the landing animation pushes it past its slot |
| `legibility` | The shape dissolves when the Showcase halves it to 23 px |
| `empty` | Every pixel transparent |

Each rule is tested against a deliberately-broken image in `scripts/validate-collectible.test.ts` — the validator has been watched failing, which is the only way to know it works.

### 5.2 Visual — three surfaces, three widths

After registering the art:

```bash
npm run db:reset && npm run db:migrate && npm run db:seed
npm run build
DEMO_FIXTURES=1 npx next start -p 3111 &
DEMO_FIXTURES=1 npm run visual:qa
```

Then look at, for each of the eight:

- **Reveal** — `reveal-common` / `reveal-rare` / `reveal-epic` / `reveal-legendary`, and `reveal-first-offer`
- **Collection** — `collection`, `demo-collection-full`, `demo-collection-empty`
- **Showcase** — `showcase-chosen`, `demo-showcase-chosen`

at **390, 375 and 360**, judged **at actual iPhone size** and never zoomed (`VISUAL_ACCEPTANCE.md §7`).

### 5.3 The acceptance question

**The same collectible must read as the same object on all three surfaces.** Not merely present on all three — recognisably the same thing at 56 px on a tray, at 46 px on a shelf, and at 23 px in a league row.

If it does not, the fix is **the art or its anchor metadata**, never the layout. `ASSET_PIPELINE §9`: *"a layer that does not land on its anchor is regenerated — the renderer is never adjusted to compensate."* If a swap needs a code change, the slot was built wrong; fix the slot, not the feature.

**Do not introduce CSS scaling to make a sprite fit.** Fractional scaling blurs the hard edges the quantizer exists to guarantee, and `image-rendering: pixelated` is enforced globally precisely so that never happens quietly.

---

## 6. What happens after these eight

The remaining sixteen are drawn against a pipeline that has been proven end to end, using this same file with new subject lines — the style preamble and the family block **pasted verbatim**, never paraphrased.

Whether M2 closes on eight or waits for all twenty-four is a milestone question, answered in [`docs/CHECKPOINT.md`](../CHECKPOINT.md) from the specification rather than from convenience.
