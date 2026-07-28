# Prompt Template — Avatar Layers

**Family:** `avatar` · **Canvas:** 32 × 48 (identical to Tony) · **Slots:** head · body · face · hand · aura

Managers build their own avatars from these layers. This replaces drawing ten custom likeness sprites, which removes both the art cost and the caricature problem in `11 §20` — nobody has to decide how to draw a real person.

**This is the highest-risk family in the plan.** If layer registration fails, every wearable is wrong. Test batch B0 exists largely to prove it.

---

## Prompt structure

1. `_style_preamble.md` → THE BLOCK, verbatim
2. The FAMILY section below, verbatim
3. The SLOT section for the relevant slot
4. One SUBJECT line

---

## FAMILY

```
SUBJECT TYPE: A single clothing or accessory layer, drawn in isolation, intended to be
composited over a base character body. NOT a complete character.

CANVAS DISCIPLINE: The layer occupies its correct position on a full-body canvas, as if
the base character were present but invisible. Do not center the item in the frame — place
it where it would sit on a standing person whose feet are at the bottom edge and whose
head center is roughly one fifth down from the top.

SCALE: Drawn to fit a character approximately four-and-a-half heads tall with a slightly
enlarged head. Consistent with all other layers in this family.

OUTLINE: Fully enclosed 1-pixel outline in a warm near-black, matching the base body.

BACKGROUND: Fully transparent. Only the item itself. No body parts, no skin, no character
beneath it, no shadow, no ground.
```

---

## SLOT sections

### Base body

```
SLOT: The complete base character body — a neutral standing person, front-facing, arms at
sides, feet flat at the bottom edge. Simplified mitten hands, block feet, plain
undergarments only. Neutral, unremarkable face with minimal features so that accessories
read clearly on top. This is the foundation every other layer composites onto, so it must
be plain rather than characterful.
```

### Head slot

```
SLOT: Headwear only. Sits on top of the skull, covering the upper head. Nothing below
the ears. The item alone — no head, no hair, no face, no neck.
```

### Body slot

```
SLOT: Upper-body clothing only. Covers torso and arms, ending at roughly mid-thigh.
Sleeves drawn to fit arms hanging at the sides. The garment alone — no head, no hands,
no legs, no skin visible.
```

### Face slot

```
SLOT: A facial accessory only, sitting across the eye or mouth region. The item alone —
no face, no head, no skin.
```

### Hand slot

```
SLOT: A held object only, positioned as if gripped in a hand hanging at the character's
right side. The object alone — no hand, no arm, no fingers.
```

---

## SUBJECT lines

**Free / starter layers** — available at claim time, no rarity:

| Slug | Subject |
|---|---|
| `avatar_base_body` | Neutral base body, plain grey t-shirt and dark trousers, minimal face |
| `avatar_hair_01` | Short cropped hair |
| `avatar_hair_02` | Buzzed hair, very close |
| `avatar_hair_03` | Long hair past the shoulders |
| `avatar_hair_04` | Curly hair, voluminous |
| `avatar_hair_05` | Balding on top with hair at the sides |
| `avatar_hair_06` | Hair pulled back into a ponytail |
| `avatar_body_starter_01` | Plain t-shirt |
| `avatar_body_starter_02` | Pullover hoodie, drawstrings visible |
| `avatar_body_starter_03` | Button-up shirt, collar visible |

**Earned wearables** — part of the 24-item catalog:

| Slug | Slot | Subject |
|---|---|---|
| `wear_head_ballcap` | head | Plain ballcap, blue, no logo or lettering |
| `wear_head_pizza_visor` | head | Foam visor, red, with a small pizza-slice shape on the front |
| `wear_head_beanie_winter` | head | Knitted winter beanie with a folded brim |
| `wear_head_paper_hat` | head | Folded white paper cook's hat, slightly crumpled |
| `wear_body_apron_tony` | body | White pizza apron with tie strings, well-used, faint stains |
| `wear_body_jersey_blank` | body | Blue-and-silver football jersey, **no numbers, no logos, no wordmarks** |
| `wear_body_tracksuit` | body | Zip-up tracksuit jacket with contrast stripes down the sleeves |
| `wear_body_delivery_uniform` | body | Delivery driver's jacket with an insulated bag strap across the chest (**suppresses head**) |
| `wear_face_shades` | face | Dark rectangular sunglasses |
| `wear_face_mustache_fake` | face | Obviously fake stick-on mustache, comically oversized |
| `wear_hand_pizza_peel` | hand | Long wooden pizza peel, held upright |
| `wear_hand_slice` | hand | Single slice of pepperoni pizza, held flat |
| `wear_hand_trophy_mini` | hand | Small gold trophy cup, held up |

---

## Attachment points — `ART_SPEC.md §5`

| Anchor | Coordinate |
|---|---|
| `head_center` | (16, 10) |
| `hair_root` | (16, 8) |
| `face_center` | (16, 13) |
| `body_origin` | (16, 24) |
| `hand_right` | (25, 30) |
| `feet_line` | (16, 47) |

**Render order, back to front:** aura → base body → body → hair → head → face → hand → system overlay

Clipping is prevented by **fixed anchors and slot suppression**, never by runtime warping or scaling. If a layer clips, the layer is wrong and gets regenerated — the renderer is never adjusted to compensate.

## Acceptance

- Every layer lands on its anchor with **zero manual adjustment**
- Layers are visually consistent with each other and with Tony
- The base body is plain enough that accessories read clearly on top
- No layer includes any part of the body it sits on
- Ten managers can build visibly distinct avatars from this set
