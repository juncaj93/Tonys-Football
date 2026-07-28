# Prompt Template — Zone Tiles

**Family:** `zone` · **Canvas:** 320 × 200

Six zones make up the parlor. They are authored as **discrete tiles, never as one wide background image** — desktop composes them into a scene, mobile stacks them as full-width cards. That single decision is what makes the shop work on a phone without shrinking a desktop scene into unusability.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: One interior zone of a pizza parlor — a self-contained slice of the room,
not a whole room and not a wide establishing shot. Framed as if standing directly in
front of that part of the shop.

COMPOSITION: The zone's primary feature is centered and unobstructed, with clear empty
space around it where interface elements will sit. Leave the lower third relatively
uncluttered. Do not fill every pixel — negative space is required for readability.

DEPTH: Expressed by overlap and value only. Background elements are one value lighter
and lose their outline. There is no receding floor plane, no converging lines, no
vanishing point.

OUTLINE: Mid-ground props carry a 1-pixel outline in a warm dark brown. Background
elements carry no outline and are separated by value alone.

DETAIL BUDGET: No more than six distinct interior shapes per mid-ground prop, and no
more than three per background element. Texture is suggested, never rendered.

CHARACTERS: None. Zone tiles contain no people. Characters are composited separately.

BACKGROUND: Opaque. This is an environment, not a cutout.

TEXT: None. Any signage in the scene is blank or illegible shapes — all real text is
rendered at runtime.
```

---

## SUBJECT lines

### `zone_front_counter` — **in test batch B0**

```
SUBJECT: The front service counter of a 1990s neighborhood pizza parlor. A worn laminate
counter running horizontally, with a chunky beige cash register on it. Behind the counter,
a pizza oven with a dark mouth and warm glow. A corkboard on the wall with blank papers
pinned to it. A spike holding blank receipts. Warm amber overhead light. Empty space above
and in front of the counter where a character will stand.
```

### `zone_tonight_board`

```
SUBJECT: A section of parlor wall with a large blank letter-board sign mounted on it, the
kind with slotted plastic letters, framed in dark wood. Completely blank — no letters, no
text. Beside it, a small shelf with a coffee pot. Checkered wallpaper border along the top.
Warm light from the left.
```

### `zone_menu_board`

```
SUBJECT: A large blank menu board mounted high on the wall behind a service area, backlit
with a warm glow, divided into empty panels by thin dark dividers. No text, no prices, no
lettering of any kind. A blank chalkboard hangs beneath it in a wooden frame. Faint grease
marks on the wall around them.
```

### `zone_newspaper_rack`

```
SUBJECT: A wire newspaper rack standing against a wood-paneled wall, holding a stack of
folded newspapers whose headlines are illegible smudged shapes. Beside it, a red vinyl
booth with a checkered tablecloth. A small window in the background with warm evening light
coming through. Arcade-patterned carpet on the floor.
```

### `zone_display_case`

```
SUBJECT: A glass display case with brass edging and internal lighting, mounted against a
wood-paneled wall, with three empty glass shelves visible through the front. Completely
empty — no objects inside. A small blank engraved plaque on the front of the case. Warm
light spilling from inside the case onto the floor.
```

### `zone_wall`

```
SUBJECT: A stretch of pizza parlor wall — wood paneling on the lower half, faded painted
plaster above, with a checkered border strip between them. Three empty rectangular light
patches where posters have hung and been removed, slightly less faded than the surrounding
wall. A neon sign shape mounted high in one corner, unlit and abstract with no lettering.
Arcade carpet at the bottom edge.
```

---

## Rights

- No team logos, marks, or insignia anywhere in the scene
- No real brand names on packaging, signage, or props
- No legible text of any kind — all text is rendered at runtime into safe areas
- Neon signage is abstract shape only, never a wordmark

## Acceptance

- Tiles read correctly both side by side (desktop) and stacked full-width (mobile)
- All six share one light direction and one perspective
- Each zone's primary feature is obvious at a glance on a phone
- Sufficient negative space for interface elements and composited characters
- A character composited into the scene sits at plausible scale against the props
- Quantizes to `palette.json` without banding across the large flat wall areas
