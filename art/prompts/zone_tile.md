# Prompt Template — Zone Tiles

**Family:** `zone` · **Canvas:** 320 × 200 ⚠️ **PROVISIONAL — see `ART_SPEC.md §2.1`**

Six zones make up the parlor. They are authored as **discrete tiles, never as one wide background image** — desktop composes them into a scene, mobile stacks them as full-width cards. That single decision is what makes the shop work on a phone without shrinking a desktop scene into unusability.

**Perspective: shallow stage box** (`ART_SPEC.md §3`). The floor is visible and recedes gently toward a back wall, giving arcade carpet, booths, and furniture somewhere to live. Characters are composited in separately as flat front-facing sprites standing on a fixed front ground line, so **the floor angle must never be steep enough to make a flat sprite look wrong standing on it.**

Tile dimensions are provisional pending the B0 phone composite test. Keep the outer ~16px of the left and right edges free of anything load-bearing so tiles can be cropped rather than fractionally resized.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: One interior zone of a pizza parlor — a self-contained slice of the room,
not a whole room and not a wide establishing shot. Framed as if standing just inside the
door, directly in front of that part of the shop.

STAGE BOX: The scene is a shallow interior space. A visible floor occupies roughly the
lower quarter to third of the frame and recedes gently toward a back wall. Side walls may
angle in very slightly or not at all. The recession is shallow — enough that this reads as
a room you are standing in rather than a flat wall, but never a deep corridor and never an
aggressive vanishing point. The floor/wall junction is a gently angled line, and floor
pattern compresses slightly toward the back.

FLOOR: The floor is genuinely visible and carries patterned arcade carpet — small repeating
geometric shapes in muted colors on a dark ground. There is believable room on it to seat a
booth or a piece of furniture.

FRONT GROUND LINE: Keep the very front strip of floor, along the bottom edge, clear and
unobstructed. Flat front-facing character sprites are composited standing there. The floor
angle must be shallow enough that a completely flat, non-perspective character standing on
that line looks correct in the scene.

COMPOSITION: The zone's primary feature is centered and unobstructed, with clear empty
space around it where interface elements will sit. Do not fill every pixel — negative space
is required for readability. Keep the outer edges of the left and right sides free of
anything essential.

DEPTH BEYOND THE FLOOR: Expressed by overlap and value. Background elements are one value
lighter and lose their outline.

OUTLINE: Mid-ground props carry a 1-pixel outline in a warm dark brown. Background elements
carry no outline and are separated by value alone.

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
SUBJECT: The front service counter of a 1990s neighborhood pizza parlor, seen from just
inside the door. A worn laminate counter running across the middle distance, with a chunky
beige cash register on it. Behind the counter, a pizza oven with a dark mouth and warm glow.
A corkboard on the wall with blank papers pinned to it. A spike holding blank receipts.
Patterned arcade carpet on the floor, running from the bottom edge back to the base of the
counter. Warm amber overhead light. The front strip of floor is clear and open where a
character will stand.
```

### `zone_tonight_board`

```
SUBJECT: A corner of the parlor with a large blank letter-board sign mounted on the back
wall, the kind with slotted plastic letters, framed in dark wood. Completely blank — no
letters, no text. Beneath it, a small side table with a coffee pot. A checkered wallpaper
border runs along the top of the wall. Patterned arcade carpet covers the floor, receding
gently to the wall. Warm light from the left. The front strip of floor is clear.
```

### `zone_menu_board`

```
SUBJECT: A service area with a large blank menu board mounted high on the back wall,
backlit with a warm glow, divided into empty panels by thin dark dividers. No text, no
prices, no lettering of any kind. A blank chalkboard hangs beneath it in a wooden frame.
Faint grease marks on the wall. A low counter or ledge below. Patterned arcade carpet on
the floor receding to the wall. The front strip of floor is clear.
```

### `zone_newspaper_rack`

```
SUBJECT: A seating area of the parlor with a wire newspaper rack standing against a
wood-paneled back wall, holding folded newspapers whose headlines are illegible smudged
shapes. Beside it, a red vinyl booth with a checkered tablecloth, seated on the floor at a
slight angle so its depth is visible. A small window in the back wall with warm evening
light coming through. Patterned arcade carpet across the floor. The front strip of floor
is clear.
```

### `zone_display_case`

```
SUBJECT: A glass display case with brass edging and internal lighting, standing against a
wood-paneled back wall, with three empty glass shelves visible through the front. Completely
empty — no objects inside. A small blank engraved plaque on the front of the case. Warm
light spilling from inside the case down onto the patterned arcade carpet, which recedes
gently from the bottom edge to the base of the case. The front strip of floor is clear.
```

### `zone_wall`

```
SUBJECT: A stretch of pizza parlor wall — wood paneling on the lower half, faded painted
plaster above, with a checkered border strip between them. Three empty rectangular light
patches where posters have hung and been removed, slightly less faded than the surrounding
wall. A neon sign shape mounted high in one corner, unlit and abstract with no lettering.
A single wooden chair against the wall. Patterned arcade carpet covering the floor and
receding gently to the base of the wall. The front strip of floor is clear.
```

---

## Rights

- No team logos, marks, or insignia anywhere in the scene
- No real brand names on packaging, signage, or props
- No legible text of any kind — all text is rendered at runtime into safe areas
- Neon signage is abstract shape only, never a wordmark

## Acceptance

- Tiles read correctly both side by side (desktop) and stacked full-width (mobile)
- **All six share one horizon height, one floor angle, and one front ground line.** A tile that disagrees is regenerated — mismatched floors are the most visible failure when tiles sit together.
- All six share one light direction
- The floor is genuinely visible and carries arcade carpet
- Recession reads as shallow — a room, not a corridor
- **A flat, non-perspective character sprite standing on the front ground line looks correct**, not pasted on
- Each zone's primary feature is obvious at a glance on a phone
- Sufficient negative space for interface elements and composited characters
- Nothing load-bearing within roughly 16px of the left or right edge
- Quantizes to `palette.json` without banding across the large flat wall areas
