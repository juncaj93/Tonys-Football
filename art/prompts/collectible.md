# Prompt Template — Collectibles

**Family:** `collectible` · **Canvas:** 46 × 46 · **Anchor:** bottom-centre

> **Corrected 2026-07-31.** This file said **32 × 32**, and named three display
> sizes — 16px, 32px, 96px — that no surface in the product uses. Both numbers
> predate the implemented slots. A source drawn at 32 is resampled into the
> reveal at **1.4375×**, which is fractional and forbidden. `ART_SPEC §2.3` has
> the measurement; `lib/assets/art-slots.test.ts` fails the build if the registry
> drifts from it again.

One source serves three surfaces, at sizes measured off the running product:

| Surface | Drawn at | Ratio to the 46 × 46 source |
|---|---|---|
| Reveal, on the tray | 46 room units — **56.06 CSS px** at 390 | 1 art pixel = 1 room unit |
| Collection shelf | **46 CSS px** | exactly 1 : 1 |
| Showcase, the manager's own | **56 CSS px** | 1.217× |
| Showcase, a league row | **23 CSS px** | exactly 0.5× |

**Readability at 23px is the binding constraint** — design for the smallest, not the largest.

Twenty-four items ship in the launch catalog. Twelve receive finished art at launch; the rest ship as `placeholder_pizza_box` — an item still in its box, which is thematically perfect rather than obviously unfinished — and upgrade on any Tuesday without a code change.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

> ⚠️ **Measured 2026-08-12: the block below asks for something the shipped art does
> not have, and the block is deliberately left unchanged.**
>
> `OUTLINE: Fully enclosed 1-pixel outline in a warm near-black` — none of the
> twelve shipped sprites carries one. They are form-shaded, 12–28 distinct colours
> each, four to six value steps per material with visible dithering. A candidate
> generated to this block alone comes out flatter than the set it has to join.
>
> It is **not rewritten here** because this block is pasted verbatim into every
> prompt and editing it changes all future art on one session's authority. The
> measurement, and the open question of which side is wrong, are in
> [`docs/COLLECTIBLE_CATALOG_READINESS.md §4.1`](../../docs/COLLECTIBLE_CATALOG_READINESS.md).
> Until that is settled, add a `SHADING:` line to the subject and attach the
> shipped sprites as a reference sheet.

```
SUBJECT TYPE: A single object, isolated, presented straight-on as if photographed for a
catalogue. One object only. No scene, no setting, no hands holding it, no surface beneath it.

COMPOSITION: The object RESTS ON THE BOTTOM EDGE of the frame, horizontally centered.
Its lowest pixel is the bottom row. Empty space goes ABOVE it, never below and never
split evenly. A short object is short, not floating. Horizontally it is centered with a
small even margin. The object's most identifiable angle. No dramatic foreshortening.

SILHOUETTE: The object must be identifiable from its outline alone. If filled with a
single flat color it should still be recognizable. This is the primary requirement —
an object that fails the silhouette test fails regardless of how good the interior looks.

DETAIL BUDGET: No more than ten distinct interior shapes, excluding the outline. Fewer
is better. Texture is suggested by two or three value steps, never rendered.

OUTLINE: Fully enclosed 1-pixel outline in a warm near-black.

BACKGROUND: Fully transparent. No shadow, no ground plane, no frame, no rarity border —
rarity framing is composited separately at runtime.
```

---

## SUBJECT lines by rarity

### Legendary — must be exceptional

| Slug | Subject |
|---|---|
| `collectible_bapple_tree` | **Revised 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md` item 4 — supersedes the fruit concept below.** A small potted tree bearing **six** (the intentional target, not a ceiling — do not proactively trim toward four) Busch Light Apple-style cans hanging like fruit — red cans, a recognizable white label region, a blue mountain/crest treatment. Presented completely straight, as if it were an ordinary houseplant. Terracotta pot. ~~A small potted tree bearing fruit that is unmistakably half apple and half banana. Absurd, sincere, presented completely straight, as if it were an ordinary houseplant. Terracotta pot.~~ |
| `collectible_signed_jersey_legend` | A football jersey in a wooden display frame behind glass, blue and silver, **no numbers, no logos, no wordmarks**. A looping silver signature scrawled across the chest that is decorative and completely illegible — not any real person's signature. |

### Epic

| Slug | Subject |
|---|---|
| `collectible_portable_sauna` | **Revised 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md` item 6.** A compact cylindrical wooden barrel sauna — rounded wooden facade, open door showing a dark interior, short chimney, warm cedar wood. Isolated object, no outdoor setting. ~~A one-person portable fabric sauna tent, zipped, with a head-sized opening at the top and a small control box on a cord. Slightly ridiculous.~~ |
| `collectible_burn_barrel` | A rusted steel drum with flames rising from the open top and scorch marks up the sides. Charred paper visible at the rim. |
| `collectible_neon_tony_sign` | **Revised 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md` item 2.** A neon sign reading "Tony's" and "Pizza" in glowing tube lettering, with a pizza-slice motif and a simplified chef accent, mounted on a small dark backing plate. Red and warm-yellow neon. Emissive, unaffected by scene light. Lettering must stay simple enough to survive 23px. ~~No lettering.~~ |
| `collectible_arcade_cabinet` | An upright arcade cabinet with a dark CRT screen showing abstract colored shapes, a joystick and two buttons, and side art of abstract geometric patterns. No text, no recognizable game. |

### Rare

| Slug | Subject |
|---|---|
| `collectible_cookie_tote` | A small cardboard fast-food carry tote, unbranded, with cookies visible in the top. |
| `collectible_reddiwip` | **Revised 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md` item 3.** A Reddi-wip-inspired aerosol whipped-cream can — red-and-white packaging, recognizable whipped-cream imagery, aerosol top with angled nozzle. Illegible microtext may be simplified away. ~~unbranded, with a red cap and nozzle~~ |
| `collectible_lava_lamp` | A lava lamp with a conical brass base and cap, glowing orange blobs suspended in amber liquid. |
| `collectible_singing_fish` | A novelty plastic fish mounted on a wooden plaque, mouth open mid-song. |
| `collectible_crt_tv` | A small boxy CRT television with a rounded screen, chunky dials on the right, and a rabbit-ear antenna. Screen showing abstract static. |
| `collectible_pinball_machine` | A pinball machine seen from the front, backglass showing abstract colorful shapes with no text, legs visible. |
| `collectible_revolution_poster` | A rolled-up propaganda-style poster, partly unfurled, showing a bold abstract graphic with a raised fist silhouette. Illegible lettering shapes only. |
| `collectible_freddy_bowl` | A ceramic dog bowl with a decorative band around the rim, a few kibble pieces inside. No name on it. |

### Common — keep these very simple

`collectible_pizza_cutter` (rolling cutter, wooden handle) · `collectible_parmesan_shaker` (glass shaker, perforated metal top) · `collectible_napkin_dispenser` (chrome countertop dispenser with napkins showing) · `collectible_ketchup_bottle` (red plastic squeeze bottle, unbranded) · `collectible_paper_menu` (single folded paper menu, illegible text shapes) · `collectible_booth_cushion` (red vinyl booth cushion, buttoned, slightly split seam) · `collectible_arcade_token` (**revised 2026-08-03, `docs/art/BRAND_EXCEPTIONS.md` item 1:** brass token with a simplified Tony's wordmark and chef-mascot accent, embossed or stamped, no ® symbol — ~~abstract embossed design, no lettering~~) · `collectible_receipt_spike` (metal spike on a weighted base, blank receipts impaled) · `collectible_coffee_mug` (thick white diner mug with a colored stripe) · `collectible_checkered_cloth` (folded red-and-white checkered tablecloth)

### System item — **not one of the 24 collectibles**

Listed here because it shares the family's style, not because it is in the catalog. The launch catalog is 10 common · 8 rare · 4 epic · 2 legendary, and a championship ring is none of them — it is a season award. Do not count it toward a collectible batch.

| Slug | Subject |
|---|---|
| `item_championship_ring` | A chunky gold championship ring seen at a three-quarter angle, large faceted stone in the center, blank flat panels on both sides where an engraving would go. **No text, no numbers, no year** — the season is rendered at runtime, so one asset serves every championship forever. |

---

## Rights — read before generating

- **No real player names, likenesses, or signatures.** Signed memorabilia uses decorative illegible scrawl.
- **No team logos, marks, or wordmarks.** "Detroit football" is blue and silver only.
- **No brand names** on any packaging or product.
- Fast-food and consumer-product items are generic equivalents, never the real thing.

## Acceptance

- Identifiable at **23px** — test this before anything else
- **Sits on the bottom edge.** Nothing floats; the slot is bottom-centre anchored
- Silhouette test passes
- Reads correctly at all three display sizes from one source
- No rarity framing baked into the asset
- Quantizes to `palette.json` without losing the identifying detail
