# Manager hair and facial hair — the art brief

Ten layers: **six hairstyles and four facial-hair pieces**. They are the last part
of the manager still drawn by the shape rasteriser, and against the painted head
and the painted T-shirt they are the thing that now looks wrong.

This is the mechanical contract. It says nothing about how the hair should look
beyond what another layer depends on — length, parting, volume, whether it covers
an ear, which side a ponytail hangs on are all the drawing's business
(commissioner ruling **R2**, which left a build's pose alone for the same reason).

---

## 1. What to deliver, per layer

One PNG per layer, ten in all. **Each one is a whole manager with that layer
painted onto him**, not the layer on its own.

| Slug | Layer | Plate to paint on |
|---|---|---|
| `avatar_hair_01` | Short | `art/jigs/manager_hair_paintover_672x1008.png` |
| `avatar_hair_02` | Buzzed | ″ |
| `avatar_hair_03` | Long | ″ |
| `avatar_hair_04` | Curly | ″ |
| `avatar_hair_05` | Receding | ″ |
| `avatar_hair_06` | Ponytail | ″ |
| `avatar_face_hair_01` | Stubble | `art/jigs/manager_facial_hair_paintover_672x1008.png` |
| `avatar_face_hair_02` | Moustache | ″ |
| `avatar_face_hair_03` | Goatee | ″ |
| `avatar_face_hair_04` | Full beard | ″ |

**Size:** `672 × 1008`, or any size at the same `2 : 3` aspect and at least
`112 × 168`. `1024 × 1536` is fine. Do **not** crop, pad or re-frame — the plate's
frame is the registration.

---

## 2. Why the head is in the picture

A build has feet on a contact row. A head has an eye line and a jaw. **A hairstyle
on its own has no landmark of any kind** — nothing inside a drawing of hair says
where the head it belongs to was, so a file containing only hair cannot be placed
except by trusting that it was placed correctly, and two rounds of head deliveries
established that placement is the thing a generator is worst at.

Painted onto the supplied manager, the frame carries the placement and the head
gives the hair something to sit on. The ingest then **separates the hair back out**
and throws the head away — so the face is not the deliverable and does not need to
survive. What matters is that the hair sits on *a* head of the right size in the
right place.

---

## 3. The three colours — this is the part that is easy to get wrong

Paint the hair in **exactly these three**, and nothing else:

| Role | Hex |
|---|---|
| Hair light | `#5FD98A` |
| Hair base | `#35A05C` |
| Hair shade | `#2A7D45` |

**Yes, green. It is deliberate and it is not the colour anybody sees.** These are
an *encoding*: the pipeline separates the hair from the head by which of the keys
each pixel snapped to, and the eight real hair colours are applied afterwards, at
render time, per manager. Brown hair on brown skin is the exact collision that
already put a quarter of one head delivery onto boot-leather colours.

The ingest prints a preview of the result in four real hair colours. That preview
is what the hair actually looks like; the green file never reaches the product.

**Outline the hair in `#1A1214`** — a one-pixel stroke *around* the painted mass.
Ink is a stroke, never the mass itself: a mark drawn entirely in ink cannot be told
from the head's own outline and is dropped.

Everything else — face, ears, neck, shirt, trousers, boots, background — **leave
exactly as it is on the plate**. It is discarded, so it costs nothing to leave
alone and redrawing it risks moving the head the hair is registered to.

---

## 4. What the validator refuses

Everything below is checked mechanically. Nothing is written unless all of it
passes, and the renderer is never adjusted to compensate (`ART_SPEC §9`).

### Both kinds

- **Nothing may cover an eye.** Rows 37–39, columns 48–52 and 59–63. A fringe stops
  at the brow. All ten layers this replaces clear both eye rectangles completely —
  not nearly, exactly — so any overlap at all is a placement error.
- **The silhouette is enclosed** in `#1A1214`.
- The layer is not empty and is not the whole canvas.

### A hairstyle

- **Starts between rows 9 and 30.** The skull's top is row 24: a tall style may
  rise above it (the current Curly starts at 11) and a receding one may start below
  it (the current Receding starts at 28).
- **Reaches no lower than row 85.** Long hair and a ponytail fall onto the
  shoulders; nothing reaches a waistband. The current Long ends at 77.
- **At least 60 pixels sit on the skull** — rows 24–52, columns 43–68. A style that
  floats beside the head is a style drawn to the wrong centre.
- Between 60 and 2,400 pixels in total. The smallest current style is 112 and the
  largest is 974.

### Facial hair

- **Nothing above row 33** — that is the brow, and a layer that reaches it is a
  hairstyle submitted as facial hair.
- **Nothing below row 63** — the collar closes there and would cut it off.
- **Stays on the face**, columns 40–71.
- **At least 24 pixels across the mouth** — rows 43–51, columns 48–63. The four
  current pieces put 44, 50, 70 and 122 there. A layer that misses this box is a
  pair of sideburns rather than facial hair.
- Between 24 and 900 pixels in total. The largest current piece is 326.

---

## 5. Style — what the ten should look like

The commissioner's reference sheet
(`art/incoming/4214B2A5-42E9-41D0-90D9-70FB48FAE8D2.png`) is the visual target for
all ten and is the best statement of it anybody has produced. It cannot be
ingested — it is one flat opaque image of ten independently drawn heads, with no
alpha and the shirt baked in — but it is what the layers should end up looking
like.

Three tones plus the outline, and the number is measured rather than chosen:
sampled over the hair mass of that sheet, 90% of it falls into two tone families
with the outline as the third. It is also what the eight hair ramps are deep.

Match the density of the painted head and T-shirt already on the plate. One art
pixel is one room unit (`ASSET_PIPELINE` rule 4) — at `672 × 1008` that is one
6 × 6 block per game pixel, and detail finer than a block does not survive.

### What the ten currently occupy

Every bound in §4 is one of these, widened. A repaint does not have to match its
predecessor's extent — these are the shape of the problem, not a specification.

| Layer | Rows | Columns | Pixels |
|---|---|---|---|
| Short | 20–47 | 41–70 | 381 |
| Buzzed | 24–43 | 42–69 | 112 |
| Long | 20–77 | 39–72 | 974 |
| Curly | 11–42 | 35–75 | 735 |
| Receding | 28–50 | 42–69 | 214 |
| Ponytail | 20–62 | 29–70 | 668 |
| Stubble | 39–52 | 44–67 | 100 |
| Moustache | 44–47 | 48–63 | 50 |
| Goatee | 44–56 | 48–63 | 112 |
| Full beard | 41–56 | 43–68 | 326 |

---

## 6. Ingesting one

```
npm run art:mask -- art/incoming/<file>.png avatar_hair_03
```

The slug decides everything — which plate the file is read as, which landmarks it
is checked against, which colours it is allowed to contain. There is no flag to get
wrong.

It prints the snap distance, which is the honest measure of whether the file was
painted in the three keys or merely near them: **under about 12 means painted in
them; forty means painted in something else and the mask is the script's guess at
what was meant.** Every head delivery so far has come back between 19 and 25, so
this is worth watching.

Nothing is registered automatically. A mask becomes live when it is imported into
`lib/character/art/masks/index.ts` — one line, and deleting the line reverts that
layer to the drawn one with nothing else to undo.

---

## 7. Order

**Send one first — `avatar_hair_01`, Short.** It is the most common style and the
one the whole loop can be judged on. Nothing about the remaining nine is worth
generating until one has been through the pipeline and looked at in the basement.
