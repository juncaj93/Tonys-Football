# ART_SPEC.md — Frozen Visual Specification

**Version:** 1.0
**Status:** ⚠️ **PROVISIONAL.** Locks on approval of test batch B0.
**Authority:** This document plus `palette.json` govern every asset. Where `06_ART_BIBLE_PIXEL_STYLE_AND_ASSET_RULES.md` describes intent, this document supplies the numbers.

---

## 0. What is irreversible

Two decisions cannot be cheaply undone once volume production starts:

1. **The pixel grid** (§2)
2. **The camera perspective** (§3)

Everything else — palette entries, individual assets, even whole families — can be regenerated for a few cents. These two cannot, because they define how every asset relates to every other. **This is the entire reason test batch B0 exists.**

---

## 1. The composite gate

Batch B0 is seven images. They are **not** approved individually. They are approved as one assembled screen:

> The front-counter tile, with Tony behind it, an avatar wearing the test hat and test shirt standing in front, the test collectible in frame, and the test poster on the wall carrying live rendered text.

If that screen reads as a single coherent place, the whole library is unblocked and this document locks. If it does not, we have learned it for the price of seven images instead of fifty.

**Failure modes the composite catches that individual review will not:**

- Tony and avatars at inconsistent scale
- Light arriving from two different directions
- Mismatched outline weights (1px against 2px reads as two different games)
- Environment detail density overwhelming the characters
- A hat sitting two pixels off the head
- Palette drift between families

---

## 2. Grid and canvas

**Master unit: Tony's height = 46px.** Everything scales from this.

| Family | Logical canvas | Notes |
|---|---|---|
| Character (Tony) | 32 × 48 | Tony occupies 46px of the 48px height, feet on the bottom edge |
| Avatar layers | 32 × 48 | Identical canvas to Tony. Every layer uses the full canvas with fixed anchors (§5). |
| Zone tile | 320 × 200 | Composed side by side on desktop, stacked full-width on mobile |
| Collectible | 32 × 32 | One source asset serves thumbnail (16px), case (32px), and reveal (96px) |
| Surface (text-driven) | 96 × 64 | Blank; text is rendered at runtime into the safe area (§7) |
| Rarity frame | 40 × 40 | One geometry, four palette states |
| Placeholder | 32 × 32 and 96 × 64 | Two assets covering every unfilled slot |
| UI icon | 16 × 16 | Separate family; not held to the environment grid |

**Scaling: integer only, nearest-neighbor.** No fractional scaling anywhere. Display sizes are 1×, 2×, 3×, 4× exactly. Mobile typically renders zone tiles at 1× width-fit with the device pixel ratio handled by integer step, never by smooth interpolation.

**No mixed pixel density within a single scene.** A character at 32×48 never shares a frame with an asset authored at a different effective pixel size.

---

## 3. Camera perspective — **flat frontal elevation**

**The decision:** a straight-on side elevation, camera at character eye level, as if looking at a lit stage or a diorama. No vanishing point. No convergence. No isometric.

**Why this and not isometric:**

- Modular avatar layering requires that a hat drawn once sits correctly on a body drawn once. Any perspective with rotation or foreshortening means every layer needs multiple variants per facing. Flat elevation means **one variant, forever.**
- Zone tiles compose horizontally on desktop and stack vertically on mobile. Isometric tiles cannot do both without redrawing.
- It is the cheapest perspective for an image model to hold consistently across independent generations.

**Rules:**

- Floors are implied by a horizontal band, never by a receding plane
- Props sit on the floor line or hang on the wall plane — nothing sits "in depth"
- Depth is expressed by **overlap and value**, never by geometry: background elements step one value lighter and lose outline weight
- Characters always face the viewer, three-quarter at most. No profiles, no back views.

---

## 4. Outline and detail

| Element | Outline |
|---|---|
| Characters, avatars, held props | **1px, `ink-900`**, fully enclosed |
| Foreground collectibles | **1px, `ink-900`** |
| Zone-tile props (mid-ground) | **1px, `ink-700`** |
| Zone-tile background elements | **No outline.** Separated by value only. |

**Detail budget** — the count of distinct interior shapes inside a silhouette, excluding the outline:

- Character face: ≤ 6 (eyes, brow, nose, mouth, mustache, one accent)
- Character body: ≤ 8
- Collectible: ≤ 10
- Zone-tile prop: ≤ 6
- Zone-tile background element: ≤ 3

**Silhouette first.** Any character or collectible must remain identifiable when filled with a single flat color. If it fails that test, it fails.

---

## 5. Avatar attachment points

All avatar layers share the 32 × 48 canvas. Anchors are absolute pixel coordinates on that canvas, origin top-left.

| Anchor | Coordinate | Used by |
|---|---|---|
| `head_center` | (16, 10) | Head slot — hats, helmets, hair covers |
| `hair_root` | (16, 8) | Hair layers |
| `face_center` | (16, 13) | Face slot — glasses, mustaches, masks |
| `body_origin` | (16, 24) | Body slot — shirts, jackets, costumes |
| `hand_right` | (25, 30) | Hand slot — held props |
| `feet_line` | (16, 47) | Ground contact; every layer aligns to this |

**Render order, back to front:**

```
aura (full canvas, behind)
  → base body
  → body layer (shirt/jacket/costume)
  → hair
  → head layer (hat)
  → face layer
  → hand layer
  → system overlay (punishment effects, championship ring sparkle)
```

**Slot suppression.** A full-body costume declares `suppresses: ["head", "hand"]` in the item record so incompatible layers are hidden rather than clipped. Clipping is prevented by construction — fixed anchors and suppression — never by runtime warping or scaling.

**The system overlay layer is reserved.** Punishment effects and championship indicators render above all player-controlled cosmetics and cannot be unequipped. Players never compete with the system for a slot.

---

## 6. Lighting

- **Single key light, warm, from upper-left**, color `amber-glow`. This is the parlor's incandescent fixture and it never moves.
- **Ambient fill, cool**, `blue-mid` at low influence, from lower-right.
- **Shadows step one value darker within the same ramp.** Never `ink-900`, never black. A shadow on `wood-mid` is `wood-dark`, not a dark grey.
- **Neon is emissive**, not lit — a neon sign is drawn at full palette value with a one-pixel bloom of the same hue, and it does not receive the key light.
- **Underground and seasonal states shift lighting via CSS filter over the whole scene**, never by re-authoring assets.

---

## 7. Text-driven surfaces

Six blank surfaces carry all runtime text. Each defines a **safe area** — the inset rectangle where rendered text is guaranteed to sit on flat, high-contrast ground with no interior detail.

| Surface | Canvas | Safe area (x, y, w, h) | Typical content |
|---|---|---|---|
| `surface_poster_blank` | 96 × 64 | (8, 12, 80, 40) | Losing streak, rivalry, wanted, high score, undefeated, bracket |
| `surface_banner_blank` | 96 × 32 | (10, 8, 76, 16) | Championship banners, one per year |
| `surface_chalkboard` | 96 × 64 | (6, 10, 84, 44) | Tony's prediction, Tonight board |
| `surface_receipt_strip` | 48 × 96 | (6, 8, 36, 80) | Weekly receipt, trade receipts |
| `surface_plaque` | 64 × 24 | (4, 6, 56, 12) | First-owner plaques, name plates |
| `surface_menu_board_blank` | 128 × 80 | (10, 14, 108, 52) | Featured rotator |

**Typography:** body text uses a readable web font, not a pixel font — per `06 §11.2`, long text must never be set in pixel type. Display headings may use a pixel face. Minimum contrast 4.5:1 against the safe-area ground, verified per surface.

---

## 8. Motion — what is code, not art

Fourteen effects require **zero generated assets**. They are CSS, SVG, or a few lines of canvas:

| Effect | Technique |
|---|---|
| All four auras | Radial gradient + keyframes |
| Punishment flies | Three animated dots on orbital paths |
| Stink lines | Animated SVG paths |
| Championship ring sparkle | CSS keyframe on a pseudo-element |
| Legendary reveal rays and flash | CSS conic gradient + transform |
| Rarity frame glow | `box-shadow` / `filter` |
| Snow in the window | Canvas particles |
| Steam off the pizza | CSS keyframes |
| CRT scanlines and flicker | Repeating-gradient overlay |
| Screen shake | CSS transform |
| Box wobble | CSS keyframes |
| Confetti | Canvas |
| Newspaper landing | CSS transform + easing |
| Playoff / night / offseason lighting | Single CSS filter over the scene |

**Only three sequences need frame-based sprite animation in v1:** the box-open reveal, the legendary flourish (~3s, the only sequence over three seconds), and the newspaper landing.

**Every animation is skippable after first view.** `prefers-reduced-motion` disables all of the above and substitutes an instant state change.

---

## 9. Accessibility constraints on art

- **Rarity is never communicated by color alone** — frame geometry differs per tier and a text label is always present
- Every asset carries alt text in the registry
- Contrast verified on every text-bearing surface
- Nothing meaningful is conveyed by animation alone
- Touch targets are sized in layout, never constrained by asset size

---

## 10. Rights

- **No team logos, no real player likenesses, no real signatures, no brand marks, no existing game characters.**
- Tony evokes classic platform-game energy without copying Mario's design, proportions, clothing, face, or iconography (`06 §5`).
- "Detroit football" is expressed through **color and silhouette only** — a blue-and-silver jersey with no mark, no wordmark, no logo.
- Signed memorabilia uses invented names or first-name nicknames. Never a real player's name on a collectible.
- Every asset records source, prompt, creator, rights status, and version in the registry. **No asset ships with unclear rights.**

---

## 11. Locking checklist

This document moves from PROVISIONAL to LOCKED when all of the following are true for test batch B0:

- [ ] Tony reads clearly at 46px and is recognizable at 1× on a phone
- [ ] Avatar base sits in the same visual family as Tony without looking like the same person
- [ ] Test hat lands on `head_center` with zero manual adjustment
- [ ] Test shirt lands on `body_origin` with zero manual adjustment
- [ ] Counter tile and characters share one light direction
- [ ] Outline weights match across character and prop families
- [ ] Test collectible is identifiable at 16px
- [ ] Rendered text on the test poster meets 4.5:1 and sits inside the safe area
- [ ] All seven assets quantize to `palette.json` without visible banding or lost detail
- [ ] The assembled composite reads as one place

Once locked, changes to §2 or §3 require regenerating the affected families.
