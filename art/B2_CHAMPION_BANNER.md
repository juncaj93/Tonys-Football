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
| **Banner row** | **x 56–183** | **128** | **119.5** |

Board vertical is unchanged: outer frame y 79–177, cream field y 84–170, usable
text y 88–166.

**Slots: 56, 78, 100, 122, 144, 166.** Banner 18 × 15, gap 4, pitch 22.
Row bottoms at y 83; board usable text begins y 88 — **4 units of clearance**.

**Board and row co-centre at 119.5 — delta 0.0.** The row sits wholly within the
rod with a 2 px left margin and 1 px right. All four attachment nubs — 59 and 70
on slot 1, 169 and 180 on slot 6 — land on rod pixels.

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

Row bounds **y 58–88**. Six partitions tiled at the gap midpoints: contiguous,
non-overlapping, no dead zones.

| # | x range | Logical | CSS @ iPhone 14 |
|---|---|---|---|
| 1 | 56–75 | 20 × 30 | 24.4 × 36.6 |
| 2 | 76–97 | 22 × 30 | 26.8 × 36.6 |
| 3 | 98–119 | 22 × 30 | 26.8 × 36.6 |
| 4 | 120–141 | 22 × 30 | 26.8 × 36.6 |
| 5 | 142–163 | 22 × 30 | 26.8 × 36.6 |
| 6 | 164–183 | 20 × 30 | 24.4 × 36.6 |

The Tonight board's hit region begins at y 88 — no overlap. Audited clear against
Tony's lane, the newspaper rack, the prediction sign, the tray, the receipt and
the doorway.

### Accessibility framing — stated accurately

- **All banner partitions pass WCAG 2.5.8 (Target Size Minimum, AA).** The
  criterion requires 24 × 24 CSS px; the narrowest partition is 24.4 × 36.6.
- **No WCAG AA exception is claimed or required.**
- The row is a documented departure **only** from the room's preferred **44 × 44
  (WCAG 2.5.5, AAA)** convention, which every other object in the parlor meets.

The 0.4 px margin on partitions 1 and 6 is why the row may be **translated** but never
re-anchored against a fixed edge: a uniform shift preserves every partition width,
whereas re-anchoring narrows partition 1 below the criterion.

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
