# Prompt Template — Rooms and Room Objects

**Family:** `zone`
**Filename retained** as `zone_tile.md` so existing `prompt_ref` values keep resolving. The *contents* are superseded: this template no longer produces zone tiles.

---

## 0. What changed

The six-landscape-tile parlor is **withdrawn** (`PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` v2.0 §0). Composing a room from six 320×200 tiles produced a room whose objects were *drawn* and therefore became hotspots, which is exactly the failure the navigation ruling exists to prevent.

The parlor is now **one portrait shell plus transparent overlays**:

| Layer | What it is | Prompted here |
|---|---|---|
| **Architectural shell** | Walls, fixtures, recesses, **blank** Display surfaces | §2 · §4 |
| **State overlays** | Transparent objects placed into the shell's prepared spots | §3 |
| **Runtime HTML/CSS** | Every changing word, number, and **every glow** | **Never prompted** |
| **Feature-flagged** | Tony's Line, Rooms, Underground | Art in §3.2; behaviour is gated |

Retired subjects, not to be regenerated: `zone_tonight_board` · `zone_chalkboard` · `zone_newspaper_rack` · `zone_display_case` · `zone_trophy_wall` · `dressing_door_basement` · `dressing_door_boarded`. `zone_front_counter` survives **only** as the B0 style-lock composite subject, not as a room tile.

---

## 1. Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The relevant FAMILY section below, verbatim
3. One SUBJECT line
4. The NEGATIVE block for that family

**Never paraphrase the preamble between batches.** Paraphrasing is how drift starts, and it is invisible until assets sit side by side.

**Never prompt for final pixel dimensions.** Generate large, downscale nearest-neighbor, quantize to `palette.json` (`ASSET_PIPELINE.md §4`).

---

## 2. FAMILY — room shells

Applies to `zone_parlor_shell` and `zone_back_hall_shell`.

```
SUBJECT TYPE: One complete interior room, portrait orientation, seen from just inside the
door at standing eye level. Not a wide establishing shot and not a corridor.

STAGE BOX: A shallow interior space. The floor is genuinely visible and recedes gently
toward a back wall. Side walls may angle in very slightly or not at all. The recession is
shallow — enough that this reads as a room you are standing in, never a deep corridor and
never an aggressive vanishing point.

FRONT GROUND LINE: Keep the front strip of floor, along the bottom edge, clear and
unobstructed. Flat front-facing character sprites are composited standing there. The floor
angle must be shallow enough that a completely flat, non-perspective character standing on
that line looks correct in the scene.

PREPARED PLACES: Certain fixtures are drawn completely but left entirely blank, and certain
architectural features are drawn as empty recesses containing nothing. These are not
mistakes and must not be filled in, decorated, or made interesting. Objects and text are
composited in later. Each recess and opening carries its own soft interior shadow so that a
later overlay sits INTO the room rather than on top of it.

DEPTH: Expressed by overlap and value. Background elements are one value lighter and lose
their outline.

OUTLINE: Mid-ground props carry a 1-pixel outline in a warm dark brown. Background elements
carry no outline and are separated by value alone.

DETAIL BUDGET: No more than six distinct interior shapes per mid-ground prop, and no more
than three per background element. Texture is suggested, never rendered.

CHARACTERS: None. Rooms contain no people.

BACKGROUND: Opaque. This is an environment, not a cutout.

TEXT: None anywhere. Every surface that will carry words is drawn completely blank.

EFFECTS: None. No glow, bloom, rim light, or highlight on any object. All affordance is
applied at runtime in CSS.
```

### 2.1 NEGATIVE — room shells

```
no people or characters · no letters, numerals, words, or lettering shapes anywhere ·
no glow, bloom, or highlight effects · no team logos, marks, or insignia · no real brand
names on packaging, signage, or props · neon signage is abstract shape only, never a
wordmark
```

---

## 3. FAMILY — room objects (transparent overlays)

Applies to every `object_*` slug.

```
SUBJECT TYPE: One single object, drawn alone, at the same scale, perspective, and light
direction as the room it will sit in.

BACKGROUND: Fully transparent. No floor, no wall, no shadow plate, no ground contact
shading. The object only.

SILHOUETTE: The outline is load-bearing. The object's affordance glow is derived
mechanically from its own alpha channel, so a vague or fussy outline produces a vague or
fussy glow. The shape must be readable and nameable at phone size, in one value, with no
interior detail at all.

GUESSABILITY: A manager must be able to name where this object leads before tapping it. If
the object needs a label to explain the destination, the drawing has failed the ruling
regardless of how good it looks — redraw rather than adding a label.

TIGHT CROP: Trim hard to the object. Transparent margin is what makes the tap target land
on the object rather than on the wall beside it.

DETAIL BUDGET: No more than six distinct interior shapes.

OUTLINE: 1-pixel warm dark brown, all the way around.

TEXT: None. Any words the object appears to carry are rendered at runtime.

EFFECTS: None. No glow, no rarity treatment, no sparkle, no rays. Rarity and availability
are runtime CSS.
```

### 3.1 NEGATIVE — room objects

```
no background of any kind · no cast shadow or ground plate · no letters, numerals, or
lettering shapes · no glow, bloom, sparkle, rays, or rarity treatment · no people · no
team logos · no brand marks
```

---

## 4. SUBJECT — `zone_parlor_shell`

**Canvas 960 × 1707** — exactly 3× the 320×569 logical room. This is the canonical brief; it is reproduced verbatim in `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §11`.

```
SUBJECT: A 1990s neighbourhood pizza parlor interior, shallow stage box, portrait, seen
from just inside the door at standing eye level. Warm key light from the upper left, cool
fill from the lower right. Booths, counter, pizza oven, wood panelling, checkered
detailing, clean patterned carpet, warm pizza-shop clutter.

Draw these four fixtures completely, with every face entirely blank — no letters, numerals,
words or marks of any kind: a large cream wall board; a small dark sign to the right of the
counter's centre; a single paper receipt lying flat on the counter toward the front; a bare
horizontal rail mounted above the large board.

Include these two empty architectural features, prepared but containing nothing:
- a shallow empty arched alcove at floor level on the far left — plain recessed wall and
  floor, no rack, stand or newspapers
- a plain framed doorway opening in the right rear wall near the booths — no door leaf,
  curtain, handle or sign

Leave a clear empty section of countertop with nothing standing on it. Leave the counter's
centre-left standing area clear for a character who is not drawn here.

Each recess and opening carries its own soft interior shadow. Leave the front strip of
floor clear.

NEGATIVE: no people or characters · no newspaper rack · no banners or pennants · no box or
package on the counter · no display case or vitrine · no door leaf · no curtain · no second
doorway · no floor hatch · no letters, numerals or lettering shapes anywhere · no glow,
bloom or highlight effects · no team logos · no brand marks.
```

### 4.1 Tony's protected lane

`x 54–146, y 173–285` in logical units (×3 for the shell: `x 162–438, y 519–855`).

Nothing load-bearing may enter the lane. The alcove stays left of it. No doorway in it. The counter's centre-left standing area is inside it and must be clear.

### 4.2 `zone_parlor_counter_front`

```
SUBJECT: The front face and top lip of the same pizza parlor counter, drawn as a separate
foreground layer on a fully transparent background. Same laminate, same wear, same light
direction as the room. Nothing standing on it. The top edge is where a character standing
behind the counter is cut off at roughly hip height.
```

Composited **over** Tony so he stands behind the counter rather than on it.

---

## 5. SUBJECT — `zone_back_hall_shell`

**Canvas 960 × 1707.** Reached through the parlor's one rear doorway.

```
SUBJECT: The narrow staff hallway behind a 1990s pizza parlor, shallow stage box, portrait,
seen from the parlor doorway at standing eye level. Cheap scuffed wall panelling, a bare
bulb or a single caged wall light, stacked crates, a mop bucket, a stained floor. Dimmer
and cooler than the dining room, but not sinister. Two prepared openings and one prepared
return.

Include these three empty architectural features, prepared but containing nothing:
- a plain descending stairwell opening in the floor at the left, walled and railed, going
  down into darkness — no stairs treads highlighted, no sign, no gate
- a plain framed doorway opening at the far end — no door leaf, no curtain, no sign
- a plain framed doorway opening on the right, back toward the dining room, with warm light
  spilling through it — no door leaf, no sign

Each opening carries its own soft interior shadow. Leave the front strip of floor clear.

NEGATIVE: no people or characters · no stairs object drawn as a separate highlighted prop ·
no curtain · no door leaf · no letters, numerals or lettering shapes anywhere · no glow or
highlight effects · no team logos · no brand marks.
```

The Back Hall is **one compact screen with two obvious environmental choices and an in-world return.** It must not read as a menu, a card grid, or a lobby.

---

## 6. SUBJECT lines — parlor overlays

Every one is a **transparent, tightly cropped single object**.

### `object_newspaper_rack` — Door → `/slice`

```
SUBJECT: A wire newspaper rack standing on the floor, holding folded newspapers whose
headlines are illegible smudged shapes. Slightly leaning. Read as a rack of papers at a
glance and from across the room.
```

Sits in the shell's left arched alcove. Glows when a Slice is unread.

### `object_champion_banner` — Display · 18 × 15 · **generated and registered**

> **Superseded and delivered.** This section described `object_banner`, a Door to
> `/timeline` whose banners scaled together from the seventh season. Both are
> withdrawn. The asset exists, at `/assets/zone/object_champion_banner.png`, and
> needs no further generation — it is kept here as the record of what was asked for.

```
SUBJECT: A single felt championship pennant banner hanging from its top edge, with a
scalloped bottom edge and a contrasting border stripe. The face is completely blank — no
letters, no numerals, no emblem. Slight fabric sag along the top.
```

One reusable pennant serves **every championship, forever**. **Only the two-digit year is
runtime text**, composited onto the red field; the champion's name is *not* on the fabric —
18 × 15 cannot hold it — and appears in the panel that opens on activation, with **View
season** routing to `/timeline`. Baked lettering is rejected: it would force regeneration
every January and make historical names unfixable.

The rail holds **exactly six fixed slots** at `x 56 · 78 · 100 · 122 · 144 · 166`, gap 4.
**They never scale and never move between visits** — gap 4 is load-bearing, because narrowing
it to 3 drops the hit pitch to 23.6 CSS px on a 360 px viewport, below the WCAG 2.5.8 AA floor.
Slots fill from the left; the current season reveals `TBD`; empty slots render nothing.

**A Display, not a Door, and it never glows.** The banners are their own affordance. Full
geometry in `art/B2_CHAMPION_BANNER.md`.

### `object_box_standard` · `object_box_rare` · `object_box_legendary` · `object_box_owned`

Four mutually exclusive states of **the one countertop tray**.

```
SUBJECT (standard): A closed square pizza box sitting flat, plain corrugated cardboard,
slightly grease-marked, lid down. Blank — no printing, no label, no lettering.

SUBJECT (rare): The same closed pizza box in a deeper, richer board colour with a single
band of contrasting trim around the lid edge. Blank — no printing, no lettering.

SUBJECT (legendary): The same closed pizza box, gold-foil-edged with an embossed border and
a heavier, more formal lid. Blank — no printing, no lettering.

SUBJECT (owned): The same closed pizza box with one corner of the lid lifted a fraction and
a receipt tucked under the string, as though it has been set aside for someone.
```

**Rarity must be distinguishable in greyscale** — the four differ in geometry as well as colour, per `ART_SPEC.md`. **No glow or rays in the art;** rarity treatment is runtime CSS.

Tapping an owned box **opens it at the tray, in place** — never after a navigation. The art must therefore read as openable where it sits.

---

## 7. SUBJECT lines — Back Hall overlays

### `object_stairs_rooms` — Door → `/rooms` (locked until V2)

```
SUBJECT: A short flight of wooden cellar steps descending, seen from the top, with a plain
handrail on one side. Warm-ish darkness below, no visible bottom. Read as "stairs down"
instantly.
```

### `object_door_underground_locked` — Door → `/underground` (locked)

```
SUBJECT: A heavy dark curtain hanging across a doorway, drawn closed, with a single
weighted fold. Completely unmarked. No sign, no handle, no letters.
```

**Never labelled `CASINO`** on first discovery. Its locked line is: *"Don't worry about it."*

### `object_door_underground_open`

```
SUBJECT: The same heavy dark curtain, drawn back to one side, with the opening beyond it
reading as a warm but unresolved dark. Completely unmarked.
```

### `object_door_return` — in-world return to the parlor

```
SUBJECT: An open doorway seen from the dim side, with warm amber light spilling through it,
and the suggestion of checkered detailing beyond. Completely unmarked.
```

No browser-back dependency. This is the way back.

---

## 8. Acceptance

### Shells

- The room reads as one place on a phone at 320×569 logical, in portrait, without scrolling
- The four blank fixtures are **fully drawn and completely blank** — board, small sign, receipt, bare rail
- The two prepared openings contain **nothing** — the alcove has no rack, the doorway has no leaf and no curtain
- A **clear empty section of countertop** exists with nothing standing on it
- Tony's protected lane is unobstructed and a flat sprite standing in it looks correct
- Each recess and opening has its own soft interior shadow
- **No lettering anywhere**, at any size, in any language, including illegible lettering shapes
- **No glow or bloom anywhere**
- Quantizes to `palette.json` without banding across the large flat wall areas

### Objects

- Fully transparent background, tightly cropped, no cast shadow
- The silhouette alone identifies the object at phone size — test it as a solid black shape
- Perspective, scale, and light direction match the shell exactly
- **Nameable before tapping.** Show it to someone who has not seen the product and ask where it goes.
- No baked text and no baked glow

---

## 9. Rights

- No team logos, marks, or insignia anywhere
- No real brand names on packaging, signage, or props
- No legible text of any kind — all text is rendered at runtime into safe areas
- Neon signage is abstract shape only, never a wordmark
