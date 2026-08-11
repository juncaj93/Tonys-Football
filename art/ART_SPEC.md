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

> **Revised 2026-07-29, against approved batch B0.** The numbers below the line
> are the settled ones. What changed, and why, is §2.2 — read it before
> generating anything in a character or avatar family.

**Master unit: Tony's height = 240px.** Everything scales from this.

| Family | Logical canvas | Notes |
|---|---|---|
| Character (Tony) | 88 × 240 | Feet on the bottom edge. Renders 1:1 in CSS pixels at phone width. |
| Avatar layers | **112 × 168** | Settled 2026-08-10 — `roomObject('manager').rect` exactly, so one art pixel is one room unit. Identical across every layer. See §2.2. |
| Zone tile | 320 wide, height by content | The parlor is 320 × 569, cut at the counter into 320 × 291 and 320 × 278. See §2.1. |
| Collectible | **46 × 46** | One source serves all three surfaces. Bottom-centre anchor. Measured, not chosen — see below. |
| Surface (text-driven) | 96 × 64 | Blank; text is rendered at runtime into the safe area (§7) |
| Rarity frame | 40 × 40 | One geometry, four palette states |
| Placeholder | 32 × 32 and 96 × 64 | Two assets covering every unfilled slot |
| UI icon | 16 × 16 | Separate family; not held to the environment grid |

**Scaling: authored at display size, then integer only.** Every asset is drawn at the size it is shown in CSS pixels, so the only scaling that happens is the device's own pixel ratio — 2× or 3×, always whole. Nothing is authored small and blown up, and nothing is authored large and shrunk.

The one place this bends is width: the room is sized to the viewport, so a 430px-wide phone renders it about 1.1× rather than exactly 1×. That is the price of the room filling the screen, it is bounded and near unity, and it is a very different thing from the 4–5× blow-ups this rule exists to forbid.

**No mixed pixel density within a single scene.** The parlor's room and Tony are drawn at the same effective pixel size; an asset authored at a different one never shares that frame.

### 2.3 The collectible canvas is 46 × 46, and this row used to be wrong

It said **32 × 32**, and it said the one source serves "thumbnail (16px), case (32px), and reveal (96px)" — three sizes, none of which any surface actually uses.

The measured truth, from `lib/parlor/objects.ts` and the three pages that draw a collectible:

| Where | Size drawn | Ratio to a 46 × 46 source |
|---|---|---|
| **Reveal** — `TRAY_REVEAL [180, 262, 46, 46]` | 46 **room units** | 1 art pixel = 1 room unit |
| **Collection** — the shelf cell | 46 **CSS px** | exactly 1 : 1 |
| **Showcase**, the manager's own | 56 CSS px | 1.217× |
| **Showcase**, a league row | 23 CSS px | exactly 0.5× |

A source authored at 32 would be resampled into the reveal slot at **1.4375×** — fractional, and the thing this whole section exists to forbid. Nothing looked wrong, because the stand-in is drawn in CSS and CSS does not care about the number in a registry; it would have become visible only after twenty-four sprites had been drawn at the wrong size, which is the expensive moment to find out.

`lib/assets/art-slots.test.ts` now fails the build if any collectible's `canvas` or `anchor` drifts from `TRAY_REVEAL`, so the number in this table and the number the renderer uses cannot disagree again. **The registry and that test are the authority; this row is a description of them.**

### 2.1 Zone tile dimensions — **settled**

The B0 composite ran on a phone on 2026-07-29. What settled:

- **Width is 320.** That is the one-column measure the whole layout is built on, and it is fixed.
- **Height is whatever the tile contains.** The 8:5 guess did not survive contact: the approved parlor came back as a portrait room — ceiling, wall, counter, floor — because a phone held upright is a portrait window and a shallow letterbox band inside it reads as a picture of a room rather than as a room.
- **The parlor is 320 × 569**, drawn once and cut at the counter's near edge into `zone_front_counter` (320 × 291) and `zone_counter_front` (320 × 278). Tony is drawn between the two halves. The cut is the occlusion, and it is why he is in the shop rather than pasted onto it.
- **Croppable margins held.** Nothing load-bearing sits within ~16px of the left and right edges, and the room is sized by width so those edges are never cropped in practice; what crops on a short phone is floor, off the bottom.

### 2.2 The character canvas changed, and the avatar canvas is reopened

**Tony was 32 × 48. He is now 88 × 240.**

The old number was set before any room existed. Against the approved parlor it produces a 46px-tall figure roughly the height of the pizza boxes on the shelf behind him — at which size his eyes, eyebrows, moustache, the cigarette behind his ear, and the join between jersey and apron are not merely small, they are not present. The parlor's whole premise is that a person is standing behind that counter looking at you, and the master unit has to be large enough for that to be true.

So the master unit moved with the room. Both numbers are now read off the same drawing rather than guessed, and Tony renders at **1:1 in CSS pixels** at phone width, which is what keeps `image-rendering: pixelated` honest.

**Consequence — this is a live decision, not a settled one.** §5 requires every avatar layer to share one canvas so that a hat drawn once sits on a body drawn once. That invariant is untouched. What is no longer obvious is *which* canvas, because §2's old answer was "identical to Tony" and Tony is now sized for one specific fixture in one specific room. Avatars appear in the Showcase and, later, in basements — not behind that counter, and not necessarily at that scale.

~~**Nothing in a character or avatar family may be generated until this is decided.**~~ It affects `character_tony_pleased`, `character_tony_unimpressed` (B1 — these must match Tony exactly, and are already updated), and every `avatar_*` and `wear_*` slug.

> **Decided, and recorded 2026-08-11.** The avatar canvas is **`112 × 168`**, and
> it was settled by measurement on 2026-08-10 rather than by argument: it is
> `roomObject('manager').rect` exactly, so one avatar pixel is one room unit — the
> same relationship the shell and every collectible already keep, and the one the
> old `64 × 96` broke at 1.75. `lib/rooms/objects.test.ts` pins the two together,
> `checkManagerBelongsInTheRoom` measures the rendered ratio in a browser, and
> `art/assets.inventory.json` carries it on every `avatar_*` and `wear_*` row.
> The generation hold above is lifted for that canvas and that canvas only.
> `docs/MANAGER_SPRITE_BOUNDARY.md` is the account.

---

## 3. Camera perspective — **shallow stage box**

> **Revised 2026-07-28.** This replaces an earlier flat-frontal elevation. Flat elevation gave nowhere to put arcade carpet, booths, or furniture, and a room with no floor reads as a wall you are facing rather than a place you have walked into — which fails the product's central premise.

**The decision:** a shallow stage box. Picture a shoebox diorama, or a theatre set seen from the front row. You are standing just inside the door of the parlor.

- The **floor is visible**, receding gently toward a back wall
- Side walls may angle in **very slightly**, or not at all
- The recession is **shallow, never dramatic** — a suggestion of depth, not a corridor
- Camera stays at standing eye level, straight on, no tilt, no isometric projection

### 3.1 Environments and characters use different rules

This is the load-bearing distinction, and it is what makes the change nearly free:

| | Perspective |
|---|---|
| **Environments** (zone tiles) | Shallow stage box with a receding floor |
| **Characters, avatars, collectibles, surfaces** | **Flat, front-facing, no perspective at all** |

Flat sprite characters standing on a perspective background is exactly how a great many mid-to-late-1990s games worked. It is period-correct rather than a compromise.

### 3.2 Why this preserves the avatar system

The original reason for choosing flat elevation was modular avatar layering: a hat drawn once must sit correctly on a body drawn once, and any perspective involving rotation or foreshortening would require multiple variants per facing.

**That reason is fully preserved**, because characters are not drawn in perspective at all. They remain flat, front-facing sprites. One variant per garment, forever.

### 3.3 The fixed ground line — no depth scaling

**Characters only ever stand at one depth: the front ground line**, at the near edge of the floor plane.

Because character position never varies in depth, **character scale never varies either.** There is no depth-based scaling, no per-depth sprite variants, and no runtime size calculation. A manager avatar is the same 46px-family height in every scene, always.

Props and furniture may sit deeper in the room. Characters may not.

### 3.4 Rules

- The floor occupies roughly the **lower quarter to third** of a zone tile, enough to carry arcade carpet pattern and to seat booths and furniture believably
- Floor recession is suggested by a **gently angled floor/wall junction and pattern compression** toward the back — not by aggressive converging lines
- Any convergence is shallow enough that a straight-on prop never looks distorted
- Depth beyond the floor is expressed by **overlap and value**: background elements step one value lighter and lose outline weight
- Characters always face the viewer, three-quarter at most. No profiles, no back views.
- **Consistency across all six tiles is mandatory.** One horizon height, one floor angle, one ground line. A tile that disagrees is regenerated.

---

## 4. Outline and detail

| Element | Outline |
|---|---|
| Characters, avatars, held props | **1px, `ink-900`**, fully enclosed |
| Foreground collectibles | **1px, `ink-900`** |
| Zone-tile props (mid-ground) | **1px, `ink-700`** |
| Zone-tile background elements | **No outline.** Separated by value only. |

**Detail budget** — the count of distinct interior shapes inside a silhouette, excluding the outline:

> **Amended 2026-08-11 by commissioner ruling R3. The character and avatar rows below the line are withdrawn; Tony is the authority.**
>
> The two numbers were written before any character art existed and the approved `character_tony_neutral` exceeds both by a wide margin — he carries roughly **forty colours** and an interior-detail density of **71%**, against a manager sprite that obeyed the budget exactly and measured **27%**. Held to the letter, these rows say the approved benchmark asset is out of spec and that managers must stay simpler than the character they stand beside.
>
> **For the `character` and `avatar` families the budget is Tony**: match the level of construction, anatomy and interior detail in the approved asset. Where this table and Tony disagree, Tony wins. Nothing about Tony changes.
>
> The rows for collectibles, props and background elements are **unaffected and still binding** — they are about legibility at 46 × 46 and at a distance, which is a different problem with a different answer. `docs/MANAGER_SPRITE_QUALITY_INVESTIGATION.md §C` carries the measurements.

- ~~Character face: ≤ 6 (eyes, brow, nose, mouth, mustache, one accent)~~ — withdrawn, see above
- ~~Character body: ≤ 8~~ — withdrawn, see above
- Collectible: ≤ 10
- Zone-tile prop: ≤ 6
- Zone-tile background element: ≤ 3

**Silhouette first.** Any character or collectible must remain identifiable when filled with a single flat color. If it fails that test, it fails.

---

## 5. Avatar attachment points

> **Stale, and recorded as stale 2026-08-11.** The canvas below is **not** the
> product's. Avatar layers share `112 × 168` — `roomObject('manager').rect`
> exactly, so one art pixel is one room unit — pinned by
> `lib/rooms/objects.test.ts` and `art/assets.inventory.json`, and §2.2's
> "REOPENED" note is settled by those two. The anchor coordinates below are
> likewise superseded: `lib/character/art/geometry.ts` is the single coordinate
> authority, and `npm run art:jig` emits the landmarks from it rather than from
> any table. The **render order** below is still correct and still governs.

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

- **No third-party trademarks, no team logos, no real player likenesses, no real signatures, no copied restaurant branding, no unapproved brand marks, no existing game characters.**
  - **Six narrow, itemized exceptions exist.** Commissioner ruling, 2026-08-03,
    `docs/art/BRAND_EXCEPTIONS.md` — the canonical record. Covers
    `collectible_arcade_token`, `collectible_neon_tony_sign`, `collectible_reddiwip`,
    `collectible_bapple_tree`, `object_box_owned`, and `collectible_portable_sauna`
    only. This is a private, non-commercial friend-group project; the exceptions do
    not extend to any other asset and are not a general loosening of this rule.
- **Tony's Pizza's own marks are permitted on first-party Tony's Pizza assets.** The house wordmark and logo treatment are the project's own property, and a pizza parlor with no name on anything reads as a stock asset rather than as somewhere. Ruled 2026-07-29. Specifically approved: the simplified `Tony's` wordmark on the apron in `character_tony_neutral.png`. **No TM symbol**, and the exception covers Tony's Pizza branding only — it does not open the door to any other mark.
  - **`zone_parlor_shell.png` is excluded.** No logo is baked into the shell: the shop's signage is a separate overlay so it can change without regenerating the room. The shell keeps the absolute no-brand-marks rule.
- Tony evokes classic platform-game energy without copying Mario's design, proportions, clothing, face, or iconography (`06 §5`).
- "Detroit football" is expressed through **color, silhouette, and a generic number**. Tony wears blue-and-silver with a **`16`**, and that is approved character styling rather than a player identity — a football character in an unnumbered jersey reads as an unfinished asset. Ruled 2026-07-29.
  - **Still prohibited on any uniform:** real team logos, league marks, player names, signatures, helmet marks, sponsor marks, and any other distinctive third-party uniform branding.
  - **The line is identifiability, not decoration.** A number on its own identifies nobody. Do not add anything that moves the jersey toward a specific professional team or a specific player — that is what the prohibitions above are protecting, and it is the concern in `PROJECT_SPEC/06 §7`.
  - `scripts/prepare-b0.ts` carried a correction that painted Tony's numbers out. **It is superseded and must not be re-run.**
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

**Stage-box checks (§3):**

- [ ] The floor is clearly visible and carries arcade carpet pattern
- [ ] Recession reads as shallow — a room, not a corridor
- [ ] Flat front-facing characters sit convincingly on the perspective floor, with no visual mismatch
- [ ] The front ground line is unambiguous and characters plainly stand on it
- [ ] There is believable room to seat a booth or a piece of furniture
- [ ] Straight-on props show no distortion from the floor angle

**Dimension checks (§2.1) — on a real phone:**

- [ ] Tile aspect ratio reads well stacked full-width
- [ ] Nothing load-bearing falls within ~16px of the left or right edge
- [ ] The chosen integer scale plus crop produces no blurring

Once locked, changes to §2 or §3 require regenerating the affected families.
