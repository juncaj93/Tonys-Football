# Prompt Template — Rarity Frames

**Family:** `frame` · **Canvas:** 40 × 40 · **Four assets, one per tier**

Four frames apply to every collectible in the catalog — currently 24 items, growing to ~100. Four assets doing the work of a hundred.

---

## The binding constraint

**Rarity must never be communicated by color alone.** `06 §8` and `02 §14` both require this, and it is an accessibility requirement, not a preference.

The four frames therefore differ in **geometry first**, color second:

| Tier | Geometry | Color | Runtime effect (code, no asset) |
|---|---|---|---|
| **Common** | Plain thin square border, square corners | `ink-300` | None |
| **Rare** | Thicker border with a small notch cut into each corner | `blue-light` | Subtle shimmer |
| **Epic** | Border with angled, chamfered corners and a small emblem centered on the top edge | `magenta-neon` | Ambient pulse |
| **Legendary** | Ornate border with elaborate corner flourishes extending beyond the frame, and a crown-like crest centered on the top edge | `amber-glow` | Rays, flash, environment reaction |

A colorblind viewer must be able to name the tier from shape alone. **Test this by rendering all four in greyscale** — if they are not immediately distinguishable, they fail.

A text label always accompanies the frame regardless.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: A decorative border frame, drawn as a hollow rectangle. The center is
completely empty and transparent — a collectible sprite is composited inside it at runtime.

COMPOSITION: The frame sits at the outer edge of the canvas. The interior opening is a
clean transparent square with a consistent inner margin on all four sides. Ornament
extends outward and along the border, never inward into the opening.

FLATNESS: Flat color only. No glow, no bloom, no gradient, no lighting effect, no
sparkle, no particles. All animated effects are added in code at runtime — an asset that
bakes in a glow cannot be animated and cannot be reused.

OUTLINE: 1-pixel outline in a warm near-black on both the outer and inner edges of the
frame.

BACKGROUND: Fully transparent, including the entire center opening.
```

---

## SUBJECT lines

### `frame_rarity_common`

```
SUBJECT: A plain thin rectangular border, two pixels thick, perfectly square corners,
no ornament of any kind. Muted warm grey. Utilitarian — the visual equivalent of a
price sticker.
```

### `frame_rarity_rare`

```
SUBJECT: A rectangular border, three pixels thick, with a small square notch cut into
each of the four corners. A single thin accent line running inside the border. Muted
blue. Slightly more considered than plain.
```

### `frame_rarity_epic`

```
SUBJECT: A rectangular border with angled chamfered corners, giving the frame an
octagonal outer silhouette. A small diamond emblem centered on the top edge, breaking
the border line. Magenta-violet. Distinctly more elaborate in shape, not just in color.
```

### `frame_rarity_legendary`

```
SUBJECT: An ornate rectangular border with elaborate scrolled flourishes at each corner
that extend outward beyond the frame's bounding rectangle. A crown-like crest centered
on the top edge, rising above the border. A double line running the full perimeter. Warm
gold. Unmistakably the most elaborate of the four — recognizable as the top tier from
its silhouette alone, with the color removed.
```

---

## Acceptance

- All four are distinguishable **in greyscale** — the primary test
- The center opening is fully transparent with a consistent margin
- No baked-in glow, sparkle, or lighting
- Legendary is unmistakable from silhouette alone
- Common is genuinely plain — restraint here is what makes legendary land
- All four quantize to `palette.json` exactly
