# Prompt Template — Text-Driven Surfaces

**Family:** `surface`

**This is the single largest art saving in the project.** Six blank surfaces carry more than twenty-five distinct states, because the text is rendered at runtime rather than drawn.

One blank poster becomes the losing-streak poster, the rivalry poster, the wanted poster, the high-score poster, the undefeated tally, and the playoff bracket. Six assets do the work of twenty-five.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: A blank physical surface intended to carry text that will be added later
by software. The surface itself only.

CRITICAL — NO TEXT: Generate absolutely no letters, words, numbers, glyphs, or
text-like marks anywhere on the surface. Not placeholder text, not lorem ipsum, not
decorative lettering, not illegible squiggles standing in for writing. The text area
must be completely clean. This is the most common failure mode for this family and it
makes the asset unusable.

SAFE AREA: The central region of the surface must be flat, evenly lit, and free of
interior detail, texture variation, and decoration. Wear, grain, stains, and ornament
belong at the edges only. Contrast within the safe area must be low and even so that
rendered text of any color will remain legible against it.

COMPOSITION: The surface fills the frame, presented straight-on with no perspective
skew. Slight physical imperfection — a curled corner, a pin, a piece of tape — is
welcome at the edges and adds character.

OUTLINE: 1-pixel outline in a warm near-black around the surface's outer edge.

BACKGROUND: Transparent outside the surface itself.
```

---

## SUBJECT lines

### `surface_poster_blank` — **in test batch B0** · 96 × 64 · safe area (8, 12, 80, 40)

```
SUBJECT: A blank paper poster taped to a wall, portrait-ish proportions, slightly
yellowed cream stock with a thin decorative border a few pixels in from the edge. One
corner curled. A strip of tape at the top. The entire center is clean flat paper with
no marks whatsoever.
```

Carries: losing streak · rivalry · wanted · high score · undefeated · playoff bracket

### `surface_banner_blank` · 96 × 32 · safe area (10, 8, 76, 16)

```
SUBJECT: A blank championship banner in the style of a gymnasium pennant — a horizontal
felt banner with a scalloped or pointed bottom edge, a contrasting border stripe along
the top and bottom, and two small grommets at the upper corners. The entire field is
clean flat felt with no lettering, no numerals, no emblem.
```

Carries: one championship banner per season, permanently

### `surface_chalkboard` · 96 × 64 · safe area (6, 10, 84, 44)

```
SUBJECT: A blank chalkboard in a worn wooden frame, dark slate surface with faint ghost
smudges of previous erasing near the edges only. A narrow ledge along the bottom holding
a stub of chalk and an eraser. The writing surface is completely clean.
```

Carries: Tony's chalkboard prediction · Tonight at Tony's

### `surface_receipt_strip` · 48 × 96 · safe area (6, 8, 36, 80)

```
SUBJECT: A blank thermal receipt strip, tall and narrow, white-cream paper with a
slightly torn top edge and a zigzag perforated bottom edge. A faint vertical fold line.
Completely blank — no printing, no lines, no logo, no ruling.
```

Carries: weekly manager receipt · trade receipts

### `surface_plaque` · 64 × 24 · safe area (4, 6, 56, 12)

```
SUBJECT: A small blank engraved plaque — a brass rectangle mounted on a dark wooden
backing, with a beveled inner edge and a tiny screw at each corner. The brass face is
completely blank and unengraved.
```

Carries: first-owner plaques · name plates

### `surface_menu_board_blank` · 128 × 80 · safe area (10, 14, 108, 52)

```
SUBJECT: A blank illuminated menu board panel, warm backlit cream surface in a dark
metal frame, divided into two or three empty columns by thin vertical dividers. Faint
grease marks at the outer edges. All panels completely blank.
```

Carries: the featured rotator

### `placeholder_sign` · 96 × 64 · safe area (8, 12, 80, 40)

The universal placeholder. Every unfinished slot in the building renders this.

```
SUBJECT: A hand-torn piece of cardboard, roughly rectangular with uneven edges, stuck to
a wall with two strips of masking tape at odd angles. Slightly bent. The face is
completely blank. It should read as something an overworked shop owner tore off a pizza
box and taped up in a hurry.
```

---

## Why the placeholder is in-world

A grey box reads as broken software. A handwritten sign reads as **a shop held together with tape**, which is exactly what this shop is. It means the product can ship with most art unfinished and still look intentional — and it means art genuinely never blocks engineering.

## Acceptance

- **Zero text or text-like marks anywhere** — the most common failure for this family
- Safe area is flat, even, and free of interior detail
- Rendered text at 4.5:1 minimum contrast is legible against the safe area
- Edge wear reads as character rather than noise
- All six share one light direction and one outline weight
