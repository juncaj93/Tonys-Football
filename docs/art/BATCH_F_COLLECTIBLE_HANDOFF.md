# Batch F — finishing the collectible catalog

**Status:** P0 completed 2026-08-23. The seven remaining approved catalog slugs
now have final art; the future P1/P2 catalog-growth briefs below remain deferred
until their separately recorded season gates.
**Purpose:** paint the twelve catalog items that have no art, then add the eight the season-one simulation says are missing.

This file is meant to be **pasted into an image-generation session as-is**. Every slug, tier and dimension is read off the running product.

---

## 0. Read this first — the priority is not the interesting items

Twelve of the twenty-four catalog items have no art. They are **not** a random twelve: every epic and every legendary is already painted, so the unpainted ones are exactly the **most frequently pulled** ones.

| | items | share of every box opened |
|---|---|---|
| unpainted commons | 7 | **42.0%** |
| unpainted rares | 5 | **17.5%** |
| **the placeholder together** | **12** | **59.5%** |

Three in five boxes opened this season produce the same picture of a closed pizza box. **P0 is those twelve, and the commons come first** — one common sprite is seen 1.7× as often as a rare one and 6× as often as a legendary one.

**No new item is needed before kickoff.** The shipped catalog first hands somebody tokens instead of an object in **week 12** of season one, which is the deadline for P1, not the deadline for the season.

---

## 1. Shared style — unchanged, and not restated here

Every prompt is three parts, in this order, always:

1. **THE BLOCK** from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md), pasted **verbatim**
2. The **FAMILY** block from [`art/prompts/collectible.md`](../../art/prompts/collectible.md), pasted **verbatim**
3. One **SUBJECT** line from §3, §4 or §5 below

Paraphrasing the preamble is how style drift starts, and it is invisible until the fourth asset.

| | |
|---|---|
| Canvas | **46 × 46**, anchor `bottom-center`, transparent background |
| Binding constraint | **readable at 23 px** — the Showcase league row |
| Palette | quantized mechanically to `art/palette.json`; never pure black or pure white |
| Perspective | **completely flat and front-facing.** No foreshortening, no isometric |
| Light | one warm key from the upper left; shadows step one value darker **inside the same colour family** |
| Delivery | `art/incoming/<slug>_01.png`, then `npm run art:prepare-incoming && npm run art:process` |
| Check | `npm run art:validate` measures a delivered PNG against the slot |

**No rarity glow, no border, no ground shadow.** Rarity framing is composited at runtime.

### 1.1 Two things this batch adds to the brief

**Form.** Three of the P1 commons and two of the P1 rares must be **wall items** — flat things that hang. The room gives every manager a picture frame and the catalog currently offers **no common that belongs in it**, so half the league has nothing to hang in the opening month. A wall item is drawn as the object *including whatever it hangs by* — a frame, a hook, a pin, a taped corner — and reads as flat.

**Nothing new is furniture.** The catalog already holds five furniture-scale objects (arcade cabinet, pinball machine, burn barrel, sauna, Bapple tree) and the room has **no floor slot**, so they sit on a shelf plank at 46 px next to a coffee mug. That is accepted for the five that exist; **do not draw a sixth.** Every new item in this batch is wall or tabletop scale.

---

## 2. What is being asked for, in order

| batch | items | new slugs? | deadline |
|---|---|---|---|
| **P0** | 7 commons + 5 rares — **repaints of approved slugs** | no | **kickoff, 10 Sep 2026** |
| **P1** | 5 commons + 2 rares + 1 legendary | **yes, 8** | week 12 of season one |
| **P1** | `item_championship_ring` | no | before the first title is awarded |
| **P2** | 3 commons + 2 rares + 1 epic | **yes, 6** | offseason |

> **P1 is approved; P2 is not, and neither may touch the registry yet.**
>
> **P1 (24 → 32) is commissioner-approved**, with execution intentionally deferred to **approximately week 12 of season one** (`docs/OPEN_ITEMS.md` **G2**). Approved is not *do it now*: `16` approves *"one loot box and a 24-item catalog"*, `lib/counter/catalog.ts` asserts `CATALOG_SIZE = 24`, and **that assertion stays at 24 until an execution slice is separately instructed.** The seed failing loudly is the guard working.
>
> **P2 (→ 38) remains a simulation recommendation**, not a ruling, and offseason at the earliest.
>
> **Generating the art costs nothing and commits nothing** — a PNG in `art/incoming/` changes no behaviour. Wiring a new slug into the registry is the step that is still gated.

---

## 3. P0 — the twelve that exist and have no picture

No slug changes. No registry field changes except `art_status` and `path`, which `art:process` writes.

### 3.1 The seven commons — generate these first

| # | Slug | Registry name | Subject line |
|---|---|---|---|
| 1 | `collectible_pizza_cutter` | Pizza cutter | A well-used steel pizza wheel with a worn wooden handle, standing on its blade, handle upright. Flour dust in the seams. Handle scuffed pale where a hand goes. |
| 2 | `collectible_parmesan_shaker` | Parmesan shaker | A stainless-topped glass parmesan shaker, half full, perforated cap. Squat and slightly wide. The kind that lives on every table and is never quite clean. |
| 3 | `collectible_napkin_dispenser` | Napkin dispenser | A chrome tabletop napkin dispenser, curved front, a wedge of white napkins showing at the slot. One napkin pulled slightly proud of the rest. |
| 4 | `collectible_ketchup_bottle` | Squeeze bottle | A red plastic squeeze bottle, conical, crusted at the nozzle. No label, no brand — the anonymous diner bottle. |
| 5 | `collectible_receipt_spike` | Receipt spike | A cast-iron receipt spike with a dozen impaled tickets fanned around the shaft, the top ones curling. Heavy round base. |
| 6 | `collectible_booth_cushion` | Red vinyl booth cushion | A single red vinyl booth cushion, buttoned, one corner split with a wisp of foam showing. Wide and low, resting on the bottom edge. |
| 7 | **`collectible_paper_menu`** | Paper menu | **Rebriefed as a wall item.** A laminated paper menu board hanging from a single nail, corner curled, grease-spotted, hand-lettered prices. Reads as flat, hangs from the top. |

> **Item 7 is the free half of the room fix.** It is an approved slug, already a placeholder, already common — briefing it as something that hangs gives the picture frame its first common-tier occupant at **no extra art and no catalog change**. It takes the chance that a manager owns something for the frame by week 8 from 65% to 84%.

### 3.2 The five rares

| # | Slug | Registry name | Subject line |
|---|---|---|---|
| 8 | `collectible_lava_lamp` | Lava lamp | A conical lava lamp, lit, three blobs suspended in amber fluid, chrome cap and base. Emissive interior — full palette value with a one-pixel bloom, no key light on the glass. |
| 9 | `collectible_crt_tv` | CRT television | A small dark-plastic CRT television on stubby feet, rabbit-ear antenna, screen showing flat static. Deep body, front-facing. Wider than tall. |
| 10 | `collectible_pinball_machine` | Pinball machine | The **backglass and head only** of a pinball machine, seen straight on — illuminated artwork, score reels, chrome trim. Not the whole cabinet. |
| 11 | `collectible_revolution_poster` | Join the revolution poster | A creased paper poster reading JOIN THE REVOLUTION in heavy block letters, taped at two corners, one corner peeling. Flat, hangs. |
| 12 | `collectible_freddy_bowl` | Dog bowl | A dented stainless dog bowl with the name FREDDY stencilled on the side in worn paint. Low, wide, resting on the bottom edge. |

> **Item 10 is a scope correction, not a redesign.** A whole pinball cabinet at 46 px is a grey rectangle at 23 px, and it is the second-largest furniture silhouette in a catalog that already has too much furniture. The backglass is the identifiable part, it is flat, and the slug does not change.

### 3.3 The ring — not loot, and counted separately

| Slug | Tier | Subject line |
|---|---|---|
| `item_championship_ring` | legendary, `systemLayer` | A heavy gold championship ring seen face-on, large flat bezel, small stones around the crown. **The bezel must be a clear, empty, flat field** — the season year is drawn over it as runtime text, so nothing may be engraved there. |

One asset serves every championship forever. It is **not** one of the catalog's legendaries and must never be added to a box.

---

## 4. P1 — the eight the simulation asks for

Five of the eight are **wall items**, which is the point of the batch: it takes "owns something for the frame by week 8" from 84% to 95%, and it moves the week the box stops giving objects from week 12 of season one to season two.

### 4.1 Commons — five, three of them wall

| # | Proposed slug | Name | Form | Subject line |
|---|---|---|---|---|
| 13 | `collectible_wall_clock` | Parlor wall clock | **wall** | A round diner wall clock with a cracked plastic bezel, the minute hand shaped like a pizza slice, hands stopped at 4:20. Flat, front-facing, hangs. |
| 14 | `collectible_dart_board` | Dartboard | **wall** | A worn cork dartboard, wire spider bent out of true, three darts clustered off-centre in the 5. Flat, hangs. |
| 15 | `collectible_taped_schedule` | Taped-up schedule | **wall** | A season schedule photocopied onto paper and taped to the wall at four corners, several weeks crossed off in pen, one corner torn. Flat, hangs. |
| 16 | `collectible_order_pad` | Order pad | surface | A spiral-bound green order pad, top sheet half-filled in pencil, a stub of pencil laid across it. Low and flat on the bottom edge. |
| 17 | `collectible_pizza_saver` | Pizza saver | surface | The tiny white plastic three-legged table that stops the box lid touching the cheese. **Deliberately the smallest silhouette in the catalog** — thirty rows of transparency above it is correct, not a mistake. |

### 4.2 Rares — two

| # | Proposed slug | Name | Form | Subject line |
|---|---|---|---|---|
| 18 | `collectible_framed_photo` | Framed staff photo | **wall** | A cheap black frame holding a faded photo of eight people in aprons lined up outside a pizza parlor, colours shifted warm with age. Faces are two or three pixels — suggestion, not detail. Flat, hangs. |
| 19 | `collectible_bowling_trophy` | Bowling league trophy | surface | A small gold-plastic bowling trophy on a marbled base, the figure's arm snapped off and glued back crooked. Nameplate is a blank brass rectangle — **no lettering**. |

### 4.3 Legendary — one

| # | Proposed slug | Name | Form | Subject line |
|---|---|---|---|---|
| 20 | `collectible_scoreboard_panel` | Salvaged scoreboard panel | **wall** | A rescued section of an old stadium scoreboard mounted on a wall — a steel frame, a grid of round amber bulbs, a few dead, reading a two-digit number. Emissive bulbs at full palette value with a one-pixel bloom, no key light on the lit faces. Heavy, industrial, unmistakably from a stadium. |

> **Why a third legendary is a product decision rather than a pull-rate one.** A manager pulls 0.3 legendaries a season, so two items would last a decade on pace alone. But with exactly two, a legendary pull is a coin flip between two known objects and half of them is the framed jersey. Three is the minimum for the moment to be a surprise. The odds of pulling *a* legendary do not move — rarity mass is per tier and is split among the tier's items, so this changes which object appears and never how often.

---

## 5. P2 — six more, offseason

Not needed for season one. They hold season two's no-object rate near 4%.

| # | Proposed slug | Name | Tier | Form | Subject line |
|---|---|---|---|---|---|
| 21 | `collectible_tin_sign` | Dented tin sign | common | **wall** | A dented enamel tin sign for a soda that does not exist, rust blooming at the screw holes, colours faded. Flat, hangs. No real brand. |
| 22 | `collectible_glass_ashtray` | Glass ashtray | common | surface | A heavy cut-glass ashtray with four notches, one cigarette burn scar on the rim. From before the ban. Low and wide. |
| 23 | `collectible_matchbook` | Tony's matchbook | common | surface | A closed paper matchbook with Tony's simplified wordmark on the cover, corner scorched, standing on its long edge. |
| 24 | `collectible_game_ball` | Game ball on a stand | rare | surface | A scuffed football on a small wooden stand, one white panel signed in a scrawl too small to read. **No legible name.** |
| 25 | `collectible_framed_ticket` | Framed ticket stub | rare | **wall** | A single torn ticket stub in a thin frame, matted with too much board around it, the print faded to illegibility. Flat, hangs. |
| 26 | `collectible_oven_door` | Deck-oven door | epic | **wall** | The cast-iron door off the original deck oven, mounted on the wall as an ornament — heavy hinges, a brass handle worn to bare metal, a small soot-blackened viewing port. |

---

## 6. Rules that apply to every item in this batch

- **No third-party brands.** The six approved exceptions in [`docs/art/BRAND_EXCEPTIONS.md`](BRAND_EXCEPTIONS.md) are a closed list and none of them is in this batch. Tony's own wordmark is house branding and is fine (items 23, and the existing token and neon sign).
- **No legible names on anything.** Signatures, nameplates and stencils are texture, not text — the exception is `FREDDY` on the existing dog bowl, which is canon and already approved.
- **No real people, no real teams, no real logos.**
- **No text the product needs to read.** The only runtime text over a collectible is the championship year on the ring's bezel, which is why that bezel must be empty.
- **Silhouette first.** If it is not identifiable as a single flat colour, it fails regardless of the interior.
- **A wall item hangs, and shows what it hangs by.** A poster with no tape and a frame with no hook read as objects lying on a shelf.

---

## 7. What this batch deliberately does not ask for

- **No epics beyond the one in P2.** All four exist, all four are painted, and each is seen in 2.5% of openings — the least valuable art in the catalog.
- **No wearables.** `wear_*` is a separate family; the 2026-07-31 ruling is explicit that a pizza box awards `collectible_*` and character equipment does not cross over.
- **No basement themes, no auras, no entrance animations.** `03 §9` lists them as collectible categories; none is implemented, and drawing for them would be inventing scope.
- **No new furniture.** §1.1.
- **No replacement of an approved sprite.** Every one of the twelve existing pieces of art stays exactly as it is.
