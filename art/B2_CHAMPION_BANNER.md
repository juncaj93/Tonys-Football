# B2 — Champion Banner

**Slug:** `object_champion_banner` · **Canvas:** 18 × 15 · **Approved 2026-07-29**

One reusable pennant serves every championship, forever. The year is rendered at
runtime; the asset carries no year, name, logo, emblem, trophy or glow.

---

## Geometry — reconciled 2026-07-29

Measured on the registered production shell, **inclusive** 0-based indices
(`width = last − first + 1`), stable across three darkness thresholds and
matching `art/incoming/zone_parlor_shell.png`.

| Feature | Extent | Width | Centre |
|---|---|---|---|
| Rail rod — rows y 65, 68, 69 | **x 54–184** | 131 | 119.0 |
| Board outer frame, current | x 49–178 | 130 | 113.5 |
| Board outer frame, **after +6** | **x 55–184** | 130 | **119.5** |
| Board cream field, after +6 | x 63–179 | 117 | 121.0 |
| Board usable text, after +6 | x 66–176 | 111 | 121.0 |
| **Banner row — bodies** | **x 56–183** | **128** | **119.5** |
| **Banner row — hit regions** | **x 54–185** | **132** | **119.5** |

Board vertical is unchanged: outer frame y 79–177, cream field y 84–170, usable
text y 88–166.

**Slots: 56, 78, 100, 122, 144, 166.** Banner 18 × 15, gap 4, pitch 22.
Row bottoms at y 83; board usable text begins y 88 — **4 units of clearance**.

**Board and row co-centre at 119.5 — delta 0.0.** The banner *bodies* sit wholly
within the rod with a 2 px left margin and 1 px right. All four attachment nubs —
59 and 70 on slot 1, 169 and 180 on slot 6 — land on rod pixels. The *hit
regions* extend 2 units past the bodies at each end, onto plain wall; see below.

### Rail anatomy, and three earlier errors

- **Rod** x 54–184, the only feature spanning >100 px continuously.
- **Brackets** x 58–62, 118–122, 176–180, descending to y 73.
- **End caps** x 54–57 and 180–184 on row y 66.
- **Not rail:** the left pillar (x 30–48) and the right wall corner (x 197–220).
  Both are dark on *every* row in the band, which is what identifies them as
  architecture.

Three figures previously on record were all wrong, each by measuring a different
feature: `55–185` (rod ±1), `58–180` (bracket-to-bracket, not the rod), and
`58–185` (first bracket to rod +1). **The rod is 54–184.**

### Why the row is 56 and not 58

At 58 the row runs x 58–185, and the rod's last pixel is 184 — the sixth
banner's rightmost column would hang off the end of the rail with nothing
supporting it. At 56 the row ends at 183, inside the rod, **and** co-centres
with the shifted board exactly. Widths and gaps are unchanged, so every hit
partition keeps its size.

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

Hit row **x 54–185, y 58–87** — inclusive, so 132 × 30 logical units. Six
partitions tiled at the gap midpoints: contiguous, non-overlapping, no dead
zones, **uniform 22-unit pitch**.

| # | x range | Logical | @360 | @375 | @390 |
|---|---|---|---|---|---|
| 1 | 54–75 | 22 × 30 | 24.75 | 25.78 | 26.81 |
| 2 | 76–97 | 22 × 30 | 24.75 | 25.78 | 26.81 |
| 3 | 98–119 | 22 × 30 | 24.75 | 25.78 | 26.81 |
| 4 | 120–141 | 22 × 30 | 24.75 | 25.78 | 26.81 |
| 5 | 142–163 | 22 × 30 | 24.75 | 25.78 | 26.81 |
| 6 | 164–185 | 22 × 30 | 24.75 | 25.78 | 26.81 |

CSS px, width only; the height is 33.75 at the narrowest viewport. Every banner
body sits **exactly centred** in its own partition — offset 0.0 on all six.

The Tonight board's hit region begins at **y 88** — the row's last row is 87, so
they abut without sharing a pixel. Audited clear against Tony's lane, the
newspaper rack, the prediction sign, the tray, the receipt and the doorway.

#### The correction the reconciliation forced

The partitions were first recorded as **20/22/22/22/22/20**, with the two end
partitions clipped to the outermost banner bodies at x 56 and 183. Those two
pass at 390 px and **fail everywhere below it**:

| | @360 | @375 | @390 |
|---|---|---|---|
| 20-unit end partition | **22.50** ❌ | **23.44** ❌ | 24.38 ✅ |
| 22-unit partition | 24.75 ✅ | 25.78 ✅ | 26.81 ✅ |

The original figure was checked at iPhone 14's 390 px only. iPhone SE and iPhone
12 mini are both 375 and are both supported, so as recorded the row failed AA on
two of the three devices this room is tested on.

**The fix costs nothing.** Each end partition is extended outward by `gap / 2`
= 2 units into plain wall, which is where the tiling would have put the boundary
anyway had there been a seventh slot. **No banner moves**; the bodies stay at
56, 78, 100, 122, 144, 166. Only the invisible boundary moves, and the result is
the uniform 22-unit pitch the rail geometry was designed around.

x 54 is flush with the rod's first pixel; x 185 overhangs its last by one unit of
plain wall, which is wall the rail does not use and no other target claims.

### Accessibility framing — stated accurately

- **All six banner partitions pass WCAG 2.5.8 (Target Size Minimum, AA)** on every
  supported viewport. The criterion requires 24 × 24 CSS px; the narrowest
  partition anywhere is 24.75 × 33.75, at 360 px.
- **No WCAG AA exception is claimed or required.**
- The row is a documented departure **only** from the room's preferred **44 × 44
  (WCAG 2.5.5, AAA)** convention, which every other object in the parlor meets.

The 0.75 px margin at 360 px is why the row may be **translated** but never
re-anchored against a fixed edge, and why **gap 4 is load-bearing rather than
cosmetic**: at gap 3 the pitch drops to 21 units and 23.63 CSS px, which fails.
A uniform shift preserves every partition width; re-anchoring or tightening the
gap narrows partitions below the criterion.

---

## Population behaviour

- Banners fill **fixed slots from the left, oldest to newest**. A banner never moves
  between visits.
- **Completed seasons plus the current season** appear. Today: `24`, `25`, `26` in
  slots 1–3.
- The **current season reveals `TBD`** in its panel until the season is finalised.
- **No future placeholders.** Slots 4–6 render nothing and are not interactive —
  there is no empty button to tab into.
- At season seven the six-season window **shifts left once** and shows the six most
  recent seasons.

## Remaining implementation work

The asset is registered; **the homepage behaviour is not wired**. Still to build:

1. Six banner buttons over the shell at the placements above, rendered only for
   completed seasons, oldest first.
2. Runtime two-digit year composited onto the red field.
3. The champion panel, and `View season` → `/timeline`.
4. `/timeline` itself, which does not yet exist as a route.
