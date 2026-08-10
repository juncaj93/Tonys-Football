# Batch E — the manager’s basement

**Status:** **storeroom delivered and live (2026-08-10).** Two shells outstanding.
**Purpose:** replace the basement's drawn stand-in with painted shells, so `/rooms` is a room rather than a diagram of one.

> ## The storeroom is the master. Draw the other two to it.
>
> `zone_room_shell_storeroom` is delivered, processed and shipped, and the runtime
> geometry in `lib/rooms/objects.ts` was **aligned to it** — the coordinates in
> §3 below are no longer a proposal, they are measurements off the art that is
> live. The remaining two shells are *the same room refitted*, so every fixture
> must sit where the storeroom puts it, at the same size, or a manager who
> changes the theme finds their things have moved.
>
> The fastest way to get that right: **generate from the storeroom image as a
> reference**, changing only materials and light.

This file is meant to be **pasted into an image-generation session as-is**. Every number in it is the number `lib/rooms/objects.ts` holds, read off the running product. Nothing here is a question for the commissioner.

---

## 0. Read this first — the art is drawn to the geometry, not the other way round

The basement's hit regions are already fixed in code, already tested and already photographed at three widths. **The shell must be drawn to those coordinates.** A shell whose shelf is fifteen units left of the shelf slot produces a room where the tap lands on the wall next to the thing you tapped — a defect no gate can see, because both halves are individually correct.

That is the reverse of how the parlor was done (art first, geometry measured off it afterwards), and it is deliberate: the room already works, so the cheaper thing to move is the paint.

| | |
|---|---|
| Canvas | **320 × 569** — the **logical** size in CSS pixels, exactly what the shipped `zone_parlor_shell` is on disk. `process-art.ts` resizes to it and the device scales up with `image-rendering: pixelated`. Generate large, deliver large; the pipeline downscales |
| Coordinates below | given in **room units**, which ARE the delivered pixels one-for-one |
| Background | **opaque.** This is an environment, not a cutout |
| Delivery | `art/incoming/`, then `npm run art:prepare-incoming && npm run art:process` |

---

## 1. What to generate

Three shells. **They are the same room, fitted out three ways** — same architecture, same furniture in the same places, same camera. Only the materials and the light change.

| # | Slug | The room |
|---|---|---|
| 1 | `zone_room_shell_storeroom` | **The storeroom.** Bare painted cinder block, exposed joists and pipes, concrete floor, one green enamel pendant lamp. What is actually under a pizza place. This is the default and the one every manager starts in — **generate this one first.** |
| 2 | `zone_room_shell_rec_room` | **The rec room.** Somebody panelled the walls in dark wood, laid a carpet, and put a warmer shade on the lamp. The basement of a house rather than of a business. |
| 3 | `zone_room_shell_cold_store` | **The cold store.** The walk-in, cleared out. White tile to head height, steel shelving, a bare fluorescent strip instead of the pendant. Cold, clean, slightly unwelcoming — deliberately the least cosy of the three. |

**Each one is independently useful.** The code resolves the shell per theme, so #1 can ship alone and #2 and #3 can follow whenever; no theme is gated on another and nothing has to arrive all at once.

---

## 2. The prompt — three parts, in this order, always

1. **THE BLOCK** from [`art/prompts/_style_preamble.md`](../../art/prompts/_style_preamble.md), **pasted verbatim**
2. The **FAMILY — room shells** block from [`art/prompts/zone_tile.md §2`](../../art/prompts/zone_tile.md), **pasted verbatim**
3. One **SUBJECT** block from §4 below
4. The **NEGATIVE** block from `zone_tile.md §2.1`

Paraphrasing the preamble is how style drift starts. It is invisible until the third asset and then all three have to be redrawn.

---

## 3. The prepared places — the part that is not negotiable

`zone_tile.md §2` already says it: *"Certain fixtures are drawn completely but left entirely blank… These are not mistakes and must not be filled in, decorated, or made interesting."*

**Six places must be empty in all three shells.** A manager's own things are composited into them at runtime, and anything painted there will be covered by a sprite and read as a bug.

| Place | Room units | Must be drawn as | Must **not** contain |
|---|---|---|---|
| **The frame on the back wall** | outer edge `x 150–250`, `y 140–222`. A 46 × 46 sprite is composited centred at `[177, 153]` | An empty picture frame with a plain backing board and its own soft interior shadow | A picture, a poster, a photograph, lettering |
| **The shelf** | surface at `y 262`, spanning `x 136–250`. Two sprites stand on it at `x 140` and `x 196` | A bare shelf, its top surface clear across the full span | Books, ornaments, tins, anything standing on it |
| **The desk top** | usable surface `x 256–316`, `y 286–346`. A sprite stands at `[263, 292]` | A clear working surface, foreground right | Papers, a lamp, a mug, a pencil cup, a keyboard |
| **The pennant rod** | `x 138–252` at `y ≈ 120`, four units thick | A bare metal rod on two brackets | Pennants, flags, bunting |
| **The noticeboard** | `x 280–320`, `y 118–230` (it runs off the right edge) | A cork board in a frame, with pins in it | Notes, paper, photographs, lettering |
| **The rug / front floor** | roughly `x 96–276`, `y 356–532` | A rug, patterned, laid flat and unobstructed | Furniture, boxes, anything standing on it |

**The rug is the character's ground line.** A flat, front-facing manager sprite is composited standing on it, **feet at `y 502`, 112 × 168 room units**, centred on `x 182`. The floor's recession must be shallow enough that a completely non-perspective figure standing there looks correct.

### 3.1 The fixed architecture

These are drawn fully and are never covered. Coordinates are where the code expects them.

| Feature | Room units | Notes |
|---|---|---|
| **Ceiling** | `y 0–62` | Exposed timber joists running left–right, with two pipe runs across them |
| **Back wall** | `y 62–340` | The wall material. This is the theme's biggest single difference |
| **Floor** | `y 340–569` | Recedes gently. Front strip along the bottom edge stays clear |
| **The staircase** | opening `x 48–130`, `y 92–332` | A full wooden flight in its own framed opening, rising away from the viewer, with **warm light at the top** where the hall is. It is the room's largest feature and the way you got in |
| **The pendant lamp** | shade around `x 196–230` at `y ≈ 80` | One hanging light, centred, throwing a warm pool. In the cold store it is a fluorescent strip instead |
| **The window** | `x 184–222`, `y 98–124` | A small high basement window on the back wall, just above the rod. Dim daylight or dark glass |
| **The desk body** | `x 250–320`, top at `y ≈ 340`, standing forward of the wall | Foreground right, below the noticeboard |
| **Scenery, free choice** | left floor and near corners | Milk crates, flattened boxes, a folded chair, a side table with an old radio, a pizza box. **Keep clear of the rug and of every prepared place above.** |

---

## 4. SUBJECT blocks — paste one per generation

### 4.1 `zone_room_shell_storeroom` — **delivered 2026-08-10.** Kept as the record of what the master shell was drawn from.

```
SUBJECT: The storeroom basement beneath an old neighbourhood pizza parlor, seen straight on
from just inside the room at standing eye level, portrait orientation.

WALLS: Painted cinder block, warm grey-brown, courses and joints visible. Slightly grubby
near the floor.

CEILING: Exposed dark timber joists running left to right, with two galvanised pipe runs
crossing them and one dropping down the right-hand wall.

FLOOR: Bare concrete, warm grey, receding gently toward the back wall.

LIGHT: One dark green enamel pendant lamp hanging on a cord from the centre of the ceiling,
throwing a warm amber pool onto the wall and floor beneath it. The corners fall away into
shadow. A small high basement window on the upper left wall, glazed dim and cool, giving no
useful light.

STAIRCASE: On the left third of the room, a full wooden flight in its own dark timber framed
opening, rising away from the viewer with a plain banister. Warm light spills down from a
doorway at the top of the flight.

FIXTURES, ALL DRAWN COMPLETELY EMPTY: an empty picture frame centred on the back wall; a bare
wooden shelf plank on two brackets below it; a bare metal pennant rod above it; a clear
wooden desk against the right wall; an empty cork noticeboard in a frame on the right wall
above the desk.

FLOOR DRESSING: A patterned rug laid flat in the centre of the floor, completely clear and
unobstructed. To the left of the rug, on the floor: a stacked milk crate, a couple of
flattened cardboard boxes, and a small side table with an old radio on it.

MOOD: A real hidden personal room under an old pizza place. Warm, nostalgic, slightly secret,
lived in. Cozy clutter around the edges and a clear middle.
```

### 4.2 `zone_room_shell_rec_room` — outstanding

```
SUBJECT: The same basement room as the storeroom shell, with identical architecture, identical
camera, and every fixture in exactly the same place — refitted as a rec room.

WALLS: Dark wood panelling to full height, with a moulded chair rail. Warmer and lower-feeling
than bare block.

CEILING: The same exposed joists and pipes, stained darker.

FLOOR: Wall-to-wall carpet in a worn deep red.

LIGHT: The same pendant, with a warmer amber shade, throwing more light into the room. The
corners are less severe than in the storeroom.

EVERYTHING ELSE — the staircase, the empty frame, the bare shelf plank, the bare pennant rod,
the clear desk, the empty cork noticeboard, the clear rug, the window — is in the same place,
at the same size, drawn just as empty.
```

### 4.3 `zone_room_shell_cold_store` — outstanding

```
SUBJECT: The same basement room as the storeroom shell, with identical architecture, identical
camera, and every fixture in exactly the same place — refitted as a walk-in cold store that
has been cleared out.

WALLS: White ceramic tile to head height with a dark steel rail above it, then cold painted
block to the ceiling.

CEILING: The same exposed joists and pipes, painted white, with insulation lagging on the
pipe runs.

FLOOR: Pale sealed concrete with a drainage channel.

LIGHT: A bare fluorescent strip instead of the pendant, throwing a flat cool blue-white light
with hard edges. No warm pool. The room is evenly lit and unwelcoming.

FIXTURES: The staircase, the empty frame, the bare shelf plank, the bare pennant rod, the
clear desk and the empty cork noticeboard are all in the same place at the same size, but
made of steel and laminate rather than timber where that reads naturally.

FLOOR DRESSING: The rug is the same size and in the same place, and looks out of place in
here — which is the joke. Scenery is steel crates and a stack of empty plastic trays.

MOOD: Clean, cold, slightly clinical, and deliberately the least cosy of the three rooms.
```

---

## 5. Acceptance — what a delivered shell has to satisfy

Checked mechanically by `npm run art:process` and by `npm run visual:qa` once the registry row gains a `path`.

1. **Opaque** and exactly `320 × 569` after processing. Deliver **large** — the pipeline downscales — but at this **aspect** (`0.562`); `process-art.ts` uses `fit: 'fill'`, so a wrong-aspect source is stretched rather than cropped. The delivered storeroom was 940 × 1672, which is exact.
2. **Quantized to the `zone` family palette** — 64 colours, per `docs/PALETTE_FIDELITY_BOUNDARY.md`. The pipeline does this; a source with smooth gradients survives it badly, so keep fills flat.
3. **No text anywhere.** Not on the noticeboard, not on the pennant rod, not on a box. Every word in this product is runtime HTML.
4. **No people.** The manager is composited.
5. **No glow, bloom or highlight on any object.** Every affordance is CSS at runtime; a painted highlight teaches the room's grammar wrong.
6. **The six prepared places are empty**, at the coordinates in §3.
7. **The three shells register as the same room.** Put them side by side: the staircase, the frame, the shelf, the desk and the noticeboard must be in the same places at the same sizes. A manager changes the theme and finds their things where they left them.

---

## 6. What this batch does **not** include

- **Room objects.** There are none: every interactive thing in this room is either baked into the shell (the frame, the shelf, the desk, the noticeboard, the stairs) or is a collectible the manager already owns. No new `object_*` slug is needed.
- **Championship pennants.** `object_champion_banner` already exists with approved art and is what hangs on the rail.
- **The manager sprite.** Separate, and separately blocked — see `docs/ROOMS_BOUNDARY.md §14`.
