# Prompt Template — Zone Tiles

**Family:** `zone` · **Canvas:** 320 × 200 ⚠️ **PROVISIONAL — see `ART_SPEC.md §2.1`**

Six zones make up the parlor. They are authored as **discrete tiles, never as one wide background image** — desktop composes them into a scene, mobile stacks them as full-width cards. That single decision is what makes the shop work on a phone without shrinking a desktop scene into unusability.

**Perspective: shallow stage box** (`ART_SPEC.md §3`). The floor is visible and recedes gently toward a back wall, giving arcade carpet, booths, and furniture somewhere to live. Characters are composited in separately as flat front-facing sprites standing on a fixed front ground line, so **the floor angle must never be steep enough to make a flat sprite look wrong standing on it.**

Tile dimensions are provisional pending the B0 phone composite test. Keep the outer ~16px of the left and right edges free of anything load-bearing so tiles can be cropped rather than fractionally resized.

### Interaction roles (`PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md`)

Each zone's interactive object is exactly one role, and this changes how it must be drawn:

| Zone | Role | Drawing consequence |
|---|---|---|
| `zone_newspaper_rack` | **Door** | Must read as a rack of papers at a glance; ships a silhouette path |
| `zone_display_case` | **Door** | Must read as a glass case; ships a silhouette path |
| `zone_trophy_wall` | **Door** | Must carry hanging banners; ships a silhouette path over the banner group |
| `zone_tonight_board` | **Display** | Large, legible board with a generous safe area |
| `zone_chalkboard` | **Display** | Clean writing surface, smudges at the edges only |
| `zone_front_counter` | **Display** + **Toy** | A loose receipt on the counter; clear standing room for Tony |

**Doors need a distinct, guessable silhouette.** A manager must be able to name where an
object leads before tapping it. If the drawn object is ambiguous at phone size, the art has
failed the ruling regardless of how good it looks — redraw rather than adding a label.

**Everything else in a tile is scenery** and must not read as interactive: no glowing
edges, no isolated highlighted props, no objects that look like buttons.

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
**One blank receipt lies flat on the counter, face up, slightly askew** — leave its face
completely clean, as the manager's record is printed onto it at runtime. Patterned arcade
carpet on the floor, running from the bottom edge back to the base of the counter. Warm
amber overhead light. The front strip of floor is clear and open where a character will
stand.
```

The loose receipt is the manager's own record (`18 §3.3`) and replaces the clipboard
entirely. It is a **Display** — it expands in place and never navigates.

### `zone_tonight_board`

```
SUBJECT: A corner of the parlor with a large blank letter-board sign mounted on the back
wall, the kind with slotted plastic letters, framed in dark wood. Completely blank — no
letters, no text. Beneath it, a small side table with a coffee pot. A checkered wallpaper
border runs along the top of the wall. Patterned arcade carpet covers the floor, receding
gently to the wall. Warm light from the left. The front strip of floor is clear.
```

### `zone_chalkboard`

Carries Tony's weekly prediction. A **Display**, not a Door — it is read in place and
never navigates (`18 §3.3`). Renamed from `zone_menu_board`: the separate menu board was
merged into the board by the door, because two boards both answering "what's happening"
was the redundancy driving the navigation confusion.

```
SUBJECT: A large blank chalkboard in a worn wooden frame, mounted on the back wall behind
a service counter, with a narrow ledge along the bottom holding a stub of chalk and a felt
eraser. Dark slate surface with faint ghost smudges of previous erasing near the edges
only — the writing surface itself is completely clean, with no letters, words, numbers or
marks of any kind. Faint grease marks on the wall around the frame. Patterned arcade
carpet on the floor receding to the wall. The front strip of floor is clear.
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

### `zone_trophy_wall`

**A Door** → History (`18 §3.1`). Renamed from `zone_wall`, and the content changed with
it: empty poster patches gave managers nothing to read, so the wall now carries hanging
championship banners. The banners are the live text and the reason the wall is tappable —
you look up at banners without being told to.

Ships with a **silhouette path** covering the banner group, not the whole wall.

```
SUBJECT: A stretch of pizza parlor wall — wood paneling on the lower half, faded painted
plaster above, with a checkered border strip between them. Two felt championship banners
hang from a rail high on the wall, side by side, with scalloped bottom edges and a
contrasting border stripe. Both banners are completely blank — no letters, no numerals, no
emblem — as the years and names are rendered at runtime. A small brass wall lamp angled up
at them. Patterned arcade carpet covering the floor and receding gently to the base of the
wall. The front strip of floor is clear.
```

Leave room on the rail for more banners. One is added every season, permanently.

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
