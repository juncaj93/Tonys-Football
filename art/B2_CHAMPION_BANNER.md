# B2 — Champion Banner

**Slug:** `object_champion_banner` · **Canvas:** 18 × 15 · **Approved 2026-07-29**

One reusable pennant serves every championship, forever. The year is rendered at
runtime; the asset carries no year, name, logo, emblem, trophy or glow.

---

## Geometry

| | Logical |
|---|---|
| Canvas | **18 × 15** |
| Opaque silhouette | x 0–17, y 0–14 — fills the canvas |
| Runtime year field | two 5 × 7 digits, x 4–14, y 4–10, centred on the red field |
| Placements | **(52, 69) (74, 69) (96, 69) (118, 69) (140, 69) (162, 69)** |
| Row extent | x 52–180 |
| Lowest occupied row | **y 83** |
| Board usable text begins | y 88 — **4 units of clearance, no obstruction** |
| Attachment points | inset 3 from each edge; leftmost lands on x 55, the rail's first pixel |

Order is **oldest first, left-aligned**. Six positions; on overflow the six most
recent completed seasons are shown.

### The right-side overhang is deliberate

The row ends at x 180; the board's outer frame ends at x 179. **The one-unit
overhang is accepted and must not be "fixed".**

Shifting the row one unit left would narrow the first interaction partition from
20 to 19 logical units — 23.2 CSS px on an iPhone 14 — which drops it below the
WCAG 2.5.8 minimum of 24 × 24. **A one-pixel visual nicety is not worth failing an
accessibility criterion.** Do not adjust the spacing to remove it either.

---

## Why 18 × 15 and not 18 × 19

The source is 567 × 458 — wider than tall, aspect 1.238. The slot was specified as
18 × 19 (0.947). Forcing it would squash the banner 24% horizontally, so the
aspect is preserved and the canvas is 15 tall.

### What the reduction costs, and why it was accepted

The source's gold trim is **14 pixels on a 567-wide canvas**. At 18 logical that is
a 31.5 : 1 reduction, rendering the trim at **0.44 logical px** — below one pixel,
so it cannot survive. A size sweep found the design needs **≥ 30 logical px wide**
before the split tail and trim read as drawn.

30 wide does not fit. At the source aspect a 30-wide banner is 24 tall and bottoms
at y 93 — five units inside the board's protected text region. The vertical budget
(rail 69 → board text 88) caps the banner at 23 wide. **Readability needs ≥ 30;
clearance allows ≤ 23. The ranges do not overlap.** Six 30-wide banners would also
need 180 units of rail against the 130 available.

The commissioner ruled on the room view rather than on fidelity to the source: at
final size the banner reads as a compact red championship pennant with a
recognisable lower silhouette and legible years, and stays visually secondary to
the board. **The simplification is accepted.**

**Do not** enlarge the banners, modify the board, expand the rail, or commission
another art pass to recover high-resolution detail.

### Top hardware

At production size the source's top element reduces to two small gold nubs at the
upper corners. It does **not** read as a repeated miniature rod, so the
rod-removal correction was never required and none was applied.

---

## Interaction ruling

- **Each occupied banner is its own real DOM button.** Not one row-wide target.
- First activation reveals that season's champion.
- Selected state is a **one-logical-unit inset**. No outset outline, no soft
  border, no baked glow.
- The winner panel shows the **full four-digit season**, the **canonical finalized
  champion display name**, and **View season**.
- **View season** routes to that season on `/timeline`.
- The panel may transiently cover part of the board and must be dismissible.
- **Unoccupied future positions are not interactive** — no empty buttons.

### Hit regions

Row bounds **y 58–88**. Six partitions tiled at the gap midpoints: contiguous,
non-overlapping, no dead zones.

| # | x range | Logical | CSS @ iPhone 14 |
|---|---|---|---|
| 1 | 52–72 | 20 × 30 | 24.4 × 36.6 |
| 2–5 | 72–160 | 22 × 30 | 26.8 × 36.6 |
| 6 | 160–180 | 20 × 30 | 24.4 × 36.6 |

The Tonight board's hit region begins at y 88 — no overlap. Audited clear against
Tony's lane, the newspaper rack, the prediction sign, the tray, the receipt and
the doorway.

### Accessibility framing — stated accurately

- **All banner partitions pass WCAG 2.5.8 (Target Size Minimum, AA).** The
  criterion requires 24 × 24 CSS px; the narrowest partition is 24.4 × 36.6.
- **No WCAG AA exception is claimed or required.**
- The row is a documented departure **only** from the room's preferred **44 × 44
  (WCAG 2.5.5, AAA)** convention, which every other object in the parlor meets.

The 0.4 px margin on partitions 1 and 6 is what makes the overhang non-negotiable.

---

## Remaining implementation work

The asset is registered; **the homepage behaviour is not wired**. Still to build:

1. Six banner buttons over the shell at the placements above, rendered only for
   completed seasons, oldest first.
2. Runtime two-digit year composited onto the red field.
3. The champion panel, and `View season` → `/timeline`.
4. `/timeline` itself, which does not yet exist as a route.
