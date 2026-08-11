# Batch G — the Back Hall

**Status:** briefed, not commissioned. **One asset:** `zone_back_hall_shell`.
**Purpose:** the room between the parlor and the basement is the only space in the product still drawn in flat rectangles. This replaces the stand-in with a painted shell on the parlor's own terms.

This file is meant to be **pasted into an image-generation session as-is**. Every number in it was read off the running product on 2026-08-11 — see `docs/evidence/back-hall/`. Nothing here is a question for the commissioner.

---

## 0. Read this first — one asset, and why it is only one

The Back Hall's registry carries five slots (`18 §9.2`): the shell, `object_stairs_rooms`, `object_door_underground_locked`, `object_door_underground_open`, `object_door_return`. **This batch commissions the shell alone, and the shell draws all three openings complete** — including the closed curtain.

That is a decision, not a shortcut, and it is worth stating because it differs from the parlor.

| | Parlor | Back Hall |
|---|---|---|
| Rear doorway | baked as a **plain framed opening**, no leaf, no curtain | — |
| The curtain | — | **baked, closed**, inside its frame |

The parlor bakes its openings empty because things get *composited into* them — a rack into the alcove, banners onto the rail. Nothing is ever composited into the Back Hall's three openings in v1. The one future state that needs an overlay is `object_door_underground_open`, which is **Phase 10**, is an announced event `18 §6` says happens once, and is drawn *over* the same rectangle — so baking the closed curtain costs one overlay in a phase that has not been scheduled, and saves an entire second asset now.

**The one thing that constrains:** draw the curtain **inside a frame that is drawn around it**, so a later drawn-back curtain fits the same opening without the frame moving.

**The chain across the stairs stays runtime CSS.** It is a state of the door, not part of the room — `BACK_HALL_BOUNDARY §8.3` records the round where it was part of the room and the open state photographed a chained stairwell. Do not paint it.

| | |
|---|---|
| Slug | `zone_back_hall_shell` |
| Canvas | **320 × 569** — the **logical** size in CSS pixels, exactly what the shipped `zone_parlor_shell` and `zone_room_shell_storeroom` are on disk. `process-art.ts` resizes to it and the device scales up with `image-rendering: pixelated` |
| Deliver at | **≈ 940 × 1672.** Generate large; the pipeline downscales with lanczos then quantizes. `fit: 'fill'`, so a wrong **aspect** is stretched rather than cropped — hold `0.5624` |
| Palette | the `zone` family's **96 colours** (32 shared + a 64-colour measured extension). The pipeline applies it; keep fills flat and it survives |
| Background | **opaque.** This is an environment, not a cutout |
| Coordinates below | **room units**, which are the delivered 320 × 569 pixels one-for-one |
| Delivery | `art/incoming/zone_back_hall_shell.png`, then `npm run art:prepare-incoming && npm run art:process` |

⚠️ **`art/prompts/zone_tile.md §4` and `§5` still say "Canvas 960 × 1707".** That is stale for every room shell — the registry was corrected to `320 × 569` on 2026-08-10 after all four shells were found registered three times oversized (`OPEN_ITEMS` **A3**). This file's number is the live one.

---

## 1. What this room is

It is reached through the parlor's one rear doorway (`18 §5`), and it is the only way to two places:

```
the dining room  ──►  THE BACK HALL  ──►  down the stairs → a manager's basement
                            │
                            └──────────►  behind the curtain → not open
```

So it is **the employee side of Tony's building**: the passage between the room the public sits in and the cellar under it. It has three openings and no other job.

Two neighbours are already painted and both are authoritative:

- **`zone_parlor_shell`** — the primary benchmark. Warm, dense, believable, late-90s adventure-game pixel art. The hall is *the same building*.
- **`zone_room_shell_storeroom`** — the room at the bottom of these stairs. It paints its own staircase as **a full wooden flight in a dark timber framed opening, rising away from the viewer, with warm light at the top**. That light is this room. The two shells must agree about one staircase.

---

## 2. The prompt — four parts, in this order, always

1. **THE BLOCK** from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md), **pasted verbatim**
2. The **FAMILY — room shells** block from [`art/prompts/zone_tile.md §2`](../../art/prompts/zone_tile.md), **pasted verbatim**
3. The **SUBJECT** block from §4 below
4. The **NEGATIVE** block from §4.1 below

Paraphrasing the preamble is how style drift starts. It is invisible until the third asset and then all three have to be redrawn.

---

## 3. The geometry

### 3.1 The three openings — the part that is not negotiable in *kind*

Every one is a Door. There are exactly three objects in this room and there will never be a fourth without a ruling (`backhall.test.ts` fails on four).

| Object | Recommended rect | Must read, before anything is tapped, as |
|---|---|---|
| **Stairs** → `/rooms` | `[12, 156, 106, 244]` | a stair head going **down** |
| **Curtain** → the Underground | `[130, 128, 92, 252]` | a curtained opening that says nothing about what is behind it |
| **Return** → `/` | `[234, 132, 74, 248]` | a doorway back into the dining room |

**The positions are a recommendation; the kinds are not.** The storeroom set the precedent on 2026-08-10 — the art came back close to the briefed coordinates, and the code was re-aimed to the painting rather than the painting redrawn to the code, because a room that already works is cheaper to move than a picture is. The same applies here. Compose the room properly and the rects follow.

What the rects may **not** do, whatever the composition:

1. **≥ 39.2 room units in both dimensions**, so every target clears 44 CSS px on a 360px phone.
2. **No two may overlap.** Neighbours that overlap steal each other's taps and the symptom is a door that "sometimes" works.
3. **A lockable door must END above y 465.** A shut door answers with a line rendered 8 units *below* its own rectangle, and that line is up to 68 CSS px tall. Today the stairs end at y 542 and their answer lands **off the bottom of the screen at 390** — visual debt 19. The stairs and the curtain are both lockable. The return never is.
4. **Nothing load-bearing below y 544.** See §3.2.

### 3.2 The safe band — measured, not assumed

The room is anchored to the **top** of the viewport and aspect-locked, so the bottom is what a taller phone loses:

| Width | Visible room units | |
|---|---|---|
| 390 | 0 – **544** | rows 545–568 **cropped** |
| 375 | 0 – 566 | rows 567–568 cropped |
| 360 | all 569 | 23.9 CSS px of flat `#1a1214` below the art |

- **Design the composition for rows 0–544.** Rows 545–568 are the front lip of the floor: keep them plain floor so the crop at 390 and the letterbox at 360 are both invisible.
- **Rows 0–48 sit under the iOS status bar** on this route, which unlike the homepage carries no scrim today. Keep the top of the frame dark and quiet — ceiling, a beam, a conduit run. Nothing that has to be read.

### 3.3 The fixed architecture

| Feature | Room units | Notes |
|---|---|---|
| Ceiling | `y 0–70` | Low. One painted beam, one conduit run. Dark |
| Back wall | `y 70–370` | Panelling below the chair rail, patched plaster above |
| Chair rail | `y ≈ 230` | The dining room's own rail, carried through. The single strongest continuity device in the room |
| Floor | `y 370–569` | Recedes gently. The front strip stays clear |
| Front ground line | `y 500–569` | Clear and unobstructed |

---

## 4. SUBJECT — `zone_back_hall_shell`

```
SUBJECT: The service passage behind the dining room of an old neighbourhood pizza parlor,
seen straight on from just inside the dining-room door at standing eye level, portrait
orientation. A shallow stage box: one back wall, the floor visible and receding gently, side
walls angling in very slightly. Not a corridor and not a deep perspective.

WALLS: The dining room's worn wood panelling carries through to a moulded chair rail at
about two-fifths height, then stops. Above the rail the wall is patched, unpainted plaster,
scuffed and repaired in mismatched squares, with a surface conduit run and a small grey fuse
box. Below the rail the panelling is the same material as the dining room's, scratched at
trolley height and mopped pale along the skirting. It is the same building, kept less well.

CEILING: Low, dark, with one painted timber beam crossing it and a galvanised conduit
following the corner.

FLOOR: Worn sheet vinyl in a plain warm grey-brown, joined by a metal threshold strip,
receding gently. Mopped clean in the middle, dark at the edges. The front strip along the
bottom edge is completely clear.

LIGHT: One caged utility bulb high on the left-hand wall is the key light — warm
incandescent, but weak and yellowed, the kind nobody has replaced. Two other sources matter,
and both of them are ways out: brighter, warmer amber light spills in through the open
doorway on the right, which is the dining room; and a soft warm pool rises out of the
stairwell opening on the left, which is one bulb a floor below. The corners fall away into
shadow one step darker in the same colour family. The curtained opening in the centre of the
back wall gives off nothing at all, and is the one dark thing in a room with three lights
in it.

STAIRWELL, LEFT: A cellar stair head in its own dark timber framed opening, cut into the
left of the back wall and the floor in front of it. The flight descends away from the viewer
— three or four treads and the shoulder of the flight visible before it turns out of sight,
with a plain iron handrail fixed to the wall. Warm light comes up out of it. It must read as
going DOWN at a glance, with no label and no sign.

CURTAINED OPENING, CENTRE: A plain framed opening in the middle of the back wall, hung with
a heavy dark maroon curtain on a rail. The curtain is closed, hanging straight and still,
its hem just clear of the floor, with the frame drawn completely around it. There is no door
leaf, no handle, no sign, no marking and nothing visible past it. Draw it as though it has
always been there and nobody mentions it.

RETURN DOORWAY, RIGHT: A plain framed doorway on the right, standing open onto the dining
room, with warm amber light coming through it and a glimpse of red-and-white checkered floor
tile past the threshold. No door leaf, no sign.

BACK-OF-HOUSE DRESSING — all of it scenery, all of it clear of the three openings: a deep
mop sink with a mop standing in a bucket beside it; an apron and a jacket on a row of wall
hooks; a stack of grey dough trays; two milk crates; a chest freezer with a folded flattened
box on top of it; a small fire extinguisher on a wall bracket; a round wall clock with a
completely blank face. Nothing tidy, nothing filthy, nothing precious.

MOOD: The employee side of a good pizza place. Mundane, worn, warm-adjacent, slightly
off-limits — somewhere you are allowed to be but nobody shows you. Not sinister, not a
basement, not a boiler room, not a horror corridor, not a nightclub back hallway. The only
strange thing in the room is the curtain, and it is only strange because everything around
it is so ordinary.
```

### 4.1 NEGATIVE — paste after the subject

```
no people or characters · no letters, numerals, words, or lettering shapes anywhere · no
illuminated exit sign · no signage, plaque, arrow, notice or taped note of any kind · no
casino, gambling, card, chip, dice or neon-nightclub imagery · no door leaf, handle, latch or
lock on the curtained opening · no chain, rope, gate or barrier across the stairs · no second
staircase and no floor hatch · no glow, bloom, rim light, sparkle or highlight applied to any
object · no team logos, marks or insignia · no real brand names on packaging, signage or
props · no smooth gradients, anti-aliasing, drop shadows or lens effects
```

---

## 5. Acceptance — what a delivered shell has to satisfy

Checked by `npm run art:process` and, once the registry row gains a `path`, by `npm run visual:qa`.

1. **Opaque**, and exactly `320 × 569` after processing. Delivered at aspect `0.5624`.
2. **Survives the `zone` quantization** to 96 colours. Flat fills survive; smooth gradients do not.
3. **No text anywhere.** Not on the clock, not on a crate, not on the fuse box. Every word in this product is runtime HTML.
4. **No people.** Nobody is composited into this room either — it is the one room in the product with no character in it.
5. **No painted affordance on any of the three openings.** Warm light *coming out of* a doorway is architecture and is wanted; a highlight, outline or bloom drawn *around* an opening is an affordance, and affordance is CSS at runtime (`18 §9.4`). The difference is whether the light is in the opening or on its edge.
6. **The three openings are guessable without labels.** Cover the file with your hand except one opening and ask where it goes. If the answer needs a word, redraw it — `18 §5` sets that test and it outranks how good the drawing is.
7. **Nothing says what is behind the curtain**, in any form, ever. `18 §5`, and `backhall.test.ts` already scans every string this route can render for it.
8. **The staircase agrees with `zone_room_shell_storeroom`.** Same dark timber framed opening, same warm bulb below, same building. Put the two files side by side before delivering.
9. **Rows 545–568 carry nothing but plain floor**, and rows 0–48 nothing that has to be read.
10. **It is denser than the storeroom and no denser than the parlor.** The measured target is roughly **25–48 colours covering ≥ 0.5% of the frame** — the storeroom is 25, the parlor is 48, the current stand-in is **9**.

---

## 6. What this batch does **not** include

- **`object_door_underground_open`.** Phase 10, and an overlay over the same rectangle when it comes.
- **`object_stairs_rooms`, `object_door_underground_locked`, `object_door_return`.** All three are baked into the shell by the decision in §0. The registry rows stay, unused, exactly as the unused rarity-tiered box slots do.
- **The chain across the stairs.** Runtime, and it must stay runtime.
- **Anything in the Underground.** `/underground` is deliberately not a route and the decision about what is behind the curtain is the commissioner's (`OPEN_ITEMS` **G1**).
- **Any character work.** The manager sprite is `docs/OPEN_ITEMS.md` **C3** and no manager ever stands in this room.
