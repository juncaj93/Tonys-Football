# Prompt Template — Parlor Props

**Family:** `prop` · **Canvas:** varies · **Composited over the approved counter room**

---

## Why this family exists

The Environmental Navigation Map names nine objects in the parlor. The approved
artwork contains **one** of them.

`zone_front_counter` (320 × 291) and `zone_counter_front` (320 × 278) are the only
two `generated` zone tiles. Stacked, they are the room: a ceiling, a back wall with
the mural, a soda fountain, pizza boxes, a lit display case, the counter, the floor,
booths and a window. There is no newspaper rack, no trophy wall, no chalkboard, no
basement door, no back door and no receipt on the counter.

### The contradiction to resolve before generating any of these

`assets.inventory.json` already lists most of the missing objects — `zone_tonight_board`,
`zone_newspaper_rack`, `zone_display_case`, `zone_menu_board`, `zone_wall` — as **B1
zone tiles at 320 × 228 each**. That sizing belongs to the six-zone Dynamic Pizza Shop,
where each object is its own tile and the phone stacks them as full-width cards.

The approved B0 art is not that. It is **one room seen from one position**, cut at the
counter's near edge so Tony can stand between the halves. A separate 320 × 228 tile
cannot be dropped into it — different framing, different perspective, different light.

So the missing objects need to be **props authored at the room's own scale and
composited into it**, not zone tiles. That is what this file specifies. It is a
material departure from the B1 plan and is flagged for the commissioner rather than
resolved here.

Two entries have no inventory slot at all: the **trophy wall** and the **paper
receipt on the counter** (`surface_receipt_strip` exists, but as a standalone surface,
not as a thing lying on Tony's counter).

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: A single piece of furniture or fixture from inside a 1980s American pizza
parlor, drawn as a standalone object to be composited into an existing painted interior.
The object only — no room around it, no floor under it, no wall behind it.

MATCHING SHOT: The object is seen from straight ahead and very slightly above, as if by
somebody standing at the counter about two metres away. Verticals stay vertical. Any
horizontal top surface recedes only a few degrees. This must sit convincingly beside an
existing counter drawn at that same shallow angle, so an aggressive perspective makes the
asset unusable.

LIGHTING: Warm overhead light from recessed ceiling cans, slightly in front and above.
Highlights on upward-facing surfaces, soft shadow under overhangs. No rim light, no cool
fill, no light source implied from behind.

CONTACT SHADOW: A small, hard-edged contact shadow where the object meets the ground or
the wall, on the object's own transparent background, so it settles into the scene rather
than floating on it.

OUTLINE: 1-pixel outline in a warm near-black around the object's outer silhouette.

BACKGROUND: Fully transparent outside the object.
```

---

## SUBJECT lines

Each is followed by where it sits in the room's 320 × 569 coordinate space, so the
polygon in `lib/parlor/objects.ts` can be traced the moment the asset lands.

### `prop_newspaper_rack` · 72 × 104 · **Door → `/slice`**

Placement: left of the counter, standing on the floor, roughly `(14, 300)`.

```
SUBJECT: A short wire newspaper rack standing on the floor, chest high, holding a folded
stack of newsprint in its top tray and a few loose sections in the wire basket below. The
top paper is folded so its masthead area faces the viewer as a clean blank rectangle with
no lettering of any kind. Chipped white paint on the wire, one bent leg.
```

⚠️ The masthead area must be **completely blank** — the Slice headline is rendered at
runtime, the same way every `surface` asset works. Any drawn lettering makes it unusable.

### `prop_trophy_wall` · 96 × 88 · **Door → `/timeline`**

Placement: on the back wall right of the mural, roughly `(196, 96)`. No inventory entry
exists for this object yet; one needs adding.

```
SUBJECT: A small wall-mounted wooden trophy shelf with a scalloped edge, carrying three
gold-coloured league trophies of slightly different heights and two flat engraved plaques
mounted on the wall beneath it. Every plaque face and every trophy base is smooth blank
metal with no engraving, no letters and no numbers. Dark stained wood, warm brass fittings,
lightly dusty.
```

### `prop_door_basement` · 64 × 118 · **Door, locked → Rooms**

Placement: right rear wall, floor to head height, roughly `(240, 168)`. Supersedes
`dressing_door_basement` (64 × 96), which was sized for the zone-tile composition.

```
SUBJECT: A closed narrow interior door leading down to a basement, painted the same dull
cream as the parlor walls with the paint worn through to bare wood around the handle. A
brass knob, a simple frame, a gap of darkness under the bottom edge. Firmly shut.
```

### `prop_door_boarded` · 64 × 118 · **Door, permanently locked**

Placement: back wall behind the counter, roughly `(268, 168)`. Supersedes
`dressing_door_boarded` (64 × 96).

```
SUBJECT: A closed back door boarded shut with three rough timber planks nailed diagonally
across it, the nail heads visible and the wood a different tone from the door beneath. The
door itself is old and scuffed. No signage, no notices, no writing on the planks.
```

### `prop_chalkboard` · 88 × 64 · **Display**

Placement: on the back wall left of the mural, roughly `(20, 96)`. This can instead be a
re-skin of `surface_chalkboard` (96 × 64) if that asset is generated to the FAMILY block
above rather than the `surface` one — the difference is the contact shadow and the shot.

```
SUBJECT: A small wall-hung chalkboard in a scuffed wooden frame, the slate wiped down but
still ghosted with old chalk dust in the corners. A stub of chalk resting on the ledge at
the bottom. The writing surface is entirely clean and evenly toned with nothing written on
it anywhere.
```

### `prop_receipt_on_counter` · 40 × 52 · **Display**

Placement: counter top, left of the display case, roughly `(140, 258)`. Must read as
lying flat on a surface rather than hanging, which is what separates it from
`surface_receipt_strip`.

```
SUBJECT: A short curled paper receipt lying flat on a counter, the top edge slightly lifted
where it curls, thermal-paper cream going faintly grey at the edges. The printed area is
completely blank — no lines of text, no marks, no ruled rows. One corner is dog-eared.
```

---

## What is already there and needs nothing

- **The display case** — painted into `zone_front_counter` at `(186, 247)`. It is the
  one Door the room currently supports, and it is already wired to `/collection`.
- **Tony** — `character_tony_neutral`, 88 × 240, generated and approved.
