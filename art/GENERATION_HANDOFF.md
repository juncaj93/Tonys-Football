# Visual Asset Handoff — V1 Atmosphere

**For:** the commissioner, generating images in ChatGPT / Gemini
**Against:** the parlor scene as built in this PR
**Authority:** `ART_SPEC.md` and `palette.json` govern. This document says *which* assets, *in what order*, and *where they land in the code*. It does not change the frozen visual direction.

---

## 0. One conflict to settle before you generate anything

Your brief asks for **"cohesive stylized illustration"**. `ART_SPEC.md` and `prompts/_style_preamble.md` — both approved — specify **hand-crafted pixel art**: flat fills, crisp 1-pixel outlines, no gradients, no anti-aliasing, no soft shadows.

Those are different art forms, and it is not a preference I should quietly pick for you.

**My recommendation: stay with pixel art.** Not for consistency's sake — for four concrete reasons:

1. **The pipeline is built for it.** Assets are downscaled nearest-neighbor and quantized to `palette.json`. That mechanical step, not the prompt, is what actually makes fifty images look like one library. Soft illustration cannot be quantized this way; it bands and muddies.
2. **The canvases are pixel-art canvases.** Tony is 32×48 with a 46px body. Collectibles are 32×32. Avatar layers anchor to Tony's grid pixel-for-pixel so a hat lands on a head. Illustration would invalidate `ART_SPEC §2` and every wearable that follows in V2.
3. **It is the only style that survives AI generation at volume.** Pixel art's flat fills and hard edges are exactly what quantization can repair. Illustration's value is in rendering quality, which is where generators are least consistent between runs — you would be culling on subtle shading mismatches forever.
4. **Pixel art composites.** Tony is a separate sprite standing on the zone tile's front ground line. That only works if both were authored to one grid with one light direction.

**If you want illustration anyway**, that is a legitimate product call — but it is a change to a frozen spec, and it means: new canvas sizes, no palette quantization, avatar layering redesigned or dropped, and `ART_SPEC §2`/`§3` rewritten. Tell me and I will re-plan properly rather than half-applying it.

**Everything below assumes pixel art.** The good news is that your brief's *content* — 1990s neighborhood parlor, warm and worn, red-and-white, neon, arcade glow, booths, tiled floor, hidden fantasy-football jokes — is exactly what the approved preamble already describes. Only the rendering technique is in question.

---

## 1. Immediate asset list

What the page looks like today: every fixture is drawn in CSS — the counter, Tony, the corkboard, the rack, the case, the doors, the booths, the arcade cabinet. It reads as a room. The assets below replace those drawings one at a time, each through the registry, with no layout change.

**Ordered by how much each one improves the screen per image generated.**

| # | Asset slug | Priority | What it replaces | Form | Canvas | Transparent | Where on mobile |
|---|---|---|---|---|---|---|---|
| 1 | `zone_front_counter` | **Required now** | The CSS counter band + back bar | Opaque environment tile | 320 × 200 | No | Top third, directly under the window header |
| 2 | `character_tony_neutral` | **Required now** | The CSS silhouette figure | Sprite | 32 × 48 | **Yes** | Standing behind the counter, left side |
| 3 | `character_tony_pleased` | **Required now** | — same figure, warm rim | Sprite | 32 × 48 | **Yes** | Same anchor |
| 4 | `character_tony_unimpressed` | **Required now** | — same figure, cool rim | Sprite | 32 × 48 | **Yes** | Same anchor |
| 5 | `zone_tonight_board` | Useful now | The CSS corkboard | Opaque tile | 320 × 200 | No | Second screen, full width |
| 6 | `zone_newspaper_rack` | Useful now | `RackArt` | Opaque tile | 320 × 200 | No | Paired card, left |
| 7 | `zone_display_case` | Useful now | `CaseArt` | Opaque tile | 320 × 200 | No | Paired card, right |
| 8 | `dressing_door_basement` | Useful now | `DoorArt` | Opaque tile | 64 × 96 | No | Back of room, paired card |
| 9 | `dressing_door_boarded` | Useful now | `BoardedArt` | Opaque tile | 64 × 96 | No | Back of room, paired card |
| 10 | `zone_menu_board` | Useful now | The CSS slate | Opaque tile | 320 × 200 | No | Behind the counter, right |
| 11 | `zone_wall` | Later | The back-of-room band | Opaque tile | 320 × 200 | No | Below the booths |
| 12 | `surface_poster_blank` | Useful now | — (new capability) | Blank surface, runtime text | 96 × 64 | **Yes** | Wall dressings, from V3 |
| 13 | `surface_receipt_strip` | Later | Nothing — the receipt is live text | Blank surface | 48 × 96 | Yes | Behind the HTML receipt |

### Assets I recommend you do **not** generate

Stating these explicitly so you do not spend generations on them.

| Asked about | Why not |
|---|---|
| **Steam, haze, glow, dust, light shafts** | Already CSS, and CSS is strictly better here: it animates, it costs zero bytes, it respects `prefers-reduced-motion` automatically, and it re-lights itself when the palette changes. A haze PNG is a fixed puff of smoke you cannot move. |
| **Neon "Tony's Pizza" sign** | The neon is CSS text with a glow, mirrored in the window. Generated lettering is unreliable and a baked sign cannot flicker or be re-worded. If you want a neon *shape* — a slice, an arrow — that is worth one asset; a wordmark is not. |
| **A single main parlor background** | `16 §7.1` is explicit: zones are **discrete tiles, never one wide background**. One big image cannot stack on a phone, cannot be partially replaced, and forces a redesign the day any part of it changes. |
| **Receipt / counter surface with content** | The receipt is live imported data and must stay HTML text. A textured *blank* strip behind it is the later, optional version. |
| **Arcade machine as a separate asset** | It lives inside `zone_wall`. A floating cabinet would need its own ground line to match. |
| **Anything with text on it** | Every sign, board, poster and plaque is blank by design; the site renders real text over it. This is already in the prompt templates and it is the single most common way generated assets become unusable. |

### Safe areas, measured from the built layout

Not guesses — these come from the running page at 390 × 844 (iPhone 14):

- **`zone_front_counter`** — Tony stands at the **left third**, feet on the front ground line. Keep the **middle and right of the lower half quiet**: the menu board sits at the right, and the dialogue plate covers the full width immediately below the tile. The **top ~24px** sits under the window header — nothing load-bearing there.
- **All zone tiles** — keep the outer **~16px left and right** free of anything essential. A 320px tile renders at 4× device scale on a 3× phone and is cropped ~18 CSS px per side. This validates the provisional number in `ART_SPEC §2.1`: **320 × 200 works** — do not change it.
- **Bottom 88px of every screen** is under the fixed nav. No tile is anchored there, but never put the subject of a tile in its lowest strip.
- **Paired cards** (rack/case, the two doors) render at roughly **170 × 96 CSS px** on a phone. Anything smaller than about 4 source pixels disappears. Keep those two tiles simple — one clear object each.

---

## 2. Image-generation prompts

**Every prompt is three parts, in this order, always:**

1. `prompts/_style_preamble.md` → **THE BLOCK**, pasted verbatim
2. The FAMILY section from `prompts/zone_tile.md` or `prompts/character_tony.md`, verbatim
3. The SUBJECT line

The subject lines for all six zone tiles already exist in `prompts/zone_tile.md`, and Tony's in `prompts/character_tony.md`. **Use those.** Section 8 below assembles the first three for you end to end so you can copy one block per image.

**Do not paraphrase the preamble.** A reworded block in batch four produces assets that are individually fine and collectively wrong, and you will not see the drift until they sit next to each other.

---

## 3. Cohesion rules

`ART_SPEC.md` is the full specification. The rules that most often break between generators, restated:

| Rule | Value |
|---|---|
| **Perspective** | Shallow stage box. Floor visible, receding gently to a back wall. Never a corridor, never isometric, never a dutch angle. Characters are drawn **completely flat**, front-facing, no foreshortening. |
| **Light** | One warm key from the **upper left**, incandescent. Cool low fill from the lower right. This never varies. Two tiles lit from opposite sides is the most visible failure there is. |
| **Line weight** | 1-pixel outline, warm dark brown, on mid-ground props only. Background elements carry **no** outline and separate by value. |
| **Shadow** | One step darker in the same colour family. Never black, never grey, never soft, never a drop shadow. |
| **Palette** | ~32 warm, slightly desaturated colours. Never `#000000`, never `#FFFFFF`. Enforced afterwards by quantization to `palette.json`. |
| **Detail budget** | ≤ 6 interior shapes per mid-ground prop, ≤ 3 per background element. Texture suggested, never rendered. |
| **Character scale** | Tony is **46px tall** on a 32 × 48 canvas, feet on the bottom edge. Everything scales from this. |
| **Edges** | Hard. No anti-aliasing, no feathering, no glow except emissive neon with a 1px bloom. |
| **Animation** | Assets are static. Motion is CSS. Do not generate motion blur, and do not generate the same object twice hoping for frames. |
| **Text** | None. Ever. Signs are blank shapes. |

**The reusable style prefix is `prompts/_style_preamble.md` → THE BLOCK.** It already exists, it is frozen, and it is reproduced in §8 so you can copy it without opening another file.

---

## 4. Generation order

| Phase | What | Why this order |
|---|---|---|
| **B0 — style test** | 3 images: `zone_front_counter`, `character_tony_neutral`, `surface_poster_blank` | These three, composited, answer every question that matters: is the grid right, is the camera right, does a flat Tony stand correctly on that floor, does runtime text sit legibly on a blank surface. Three images to find out, instead of fifty. |
| **B1 — the counter works** | `character_tony_pleased`, `character_tony_unimpressed` | Same subject, two moods. Cheap once neutral is approved, and the greeting already selects between all three. |
| **B2 — the wall** | `zone_tonight_board`, `zone_newspaper_rack`, `zone_display_case` | The three fixtures a manager looks at after the counter. |
| **B3 — the back** | `dressing_door_basement`, `dressing_door_boarded`, `zone_menu_board`, `zone_wall` | Completes the room. |
| **B4 — polish** | Collectibles, frames, UI icons, wearables | Belongs with V2 and V4, not here. |

**Stop after B0 and send me the three images.** I will composite them into the real page on a real phone viewport and tell you whether the style holds before you generate another thing.

> **One caveat on the gate.** `ART_SPEC §1` defines B0 as **seven** images, including avatar layers, approved as one screen — the composite that catches Tony and avatars being at inconsistent scale. Avatars do not exist until V2, so the three above cannot close that gate; they can only validate grid, camera and light for V1. **The full seven-image composite still has to happen before avatar production starts.** I am narrowing the test for V1, not retiring it.

---

## 5. After you download each image

1. **Format:** PNG. Keep it PNG — do not convert to JPG at any point; JPG destroys hard pixel edges.
2. **Transparency:** required for Tony (all three). The background must be genuinely transparent, not white. If the generator gives you a white or checkered background, say so and send it anyway — removing it is a two-minute job at my end and doing it badly is worse than not doing it.
3. **Do not resize, crop, upscale, or compress.** Send the largest version the generator gives you. Downscaling is a pipeline step with specific settings; doing it in an image editor first loses information permanently.
4. **Do not edit out text.** If a generator has put lettering on a sign, that image is a reject — regenerate it rather than painting over it.
5. **Naming:** exactly the slug, plus a candidate number:
   ```
   zone_front_counter_01.png
   zone_front_counter_02.png
   character_tony_neutral_01.png
   ```
   The slug is the whole point — it is how the file finds its way into the registry.
6. **Where to put them:** commit them to `art/incoming/` on a branch, or attach them to a comment on the PR. Either works; the branch is easier if there are several.
7. **What to tell me:** just the filenames, and which candidate you prefer if you have a view. If something felt wrong and you cannot say why, say that — "the third one looks flat" is useful.

**Expect to cull hard.** Budget about four candidates per asset. Generation is cheap; reviewing is the real cost, so reject fast rather than trying to rescue a near-miss.

---

## 6. How these land in the code

The page is already built as a layered scene, which is what makes this a swap rather than a redesign:

```
fixed lighting layer      ParlorAir — wall gradient, lamp pools, haze     ← stays CSS
environment tiles         zone_* ....................................... ← generated art
architecture              Counter, Wall, Floor ......................... ← CSS, keeps the tiles apart
focal layer               Tony sprite, occluded by the counter front .... ← generated art
interactive surfaces      dialogue, receipt, corkboard slips, nav ....... ← stays HTML
ambient motion            neon buzz, lamp breathe, haze drift, arcade ... ← stays CSS
```

Every fixture that stands in for an asset already routes through **`SceneSurface`**, which asks the registry for the slug and renders the drawn CSS version only while the answer is "placeholder". So swapping in real art is:

1. drop the file in `art/`
2. set `path` and `art_status: "approved"` on that slug in `art/assets.inventory.json`
3. done — no component changes, no layout changes

That is the contract in `ASSET_PIPELINE.md`, and it is why the CSS work is not throwaway: it is the placeholder tier, and it stays as the fallback for any slug that has no art yet.

**Nothing changing is ever baked into an image.** No names, no records, no greetings, no counts, no button labels. All of it is rendered text over blank surfaces — which is also why the assets stay correct in 2027 when the numbers are different.

---

## 7. What I am doing meanwhile

Continuing the CSS atmosphere pass in this PR. The room does not wait on art, and when the art arrives the room does not get rebuilt around it.

---

## 8. Run these three now

### The style prefix — paste first, every time

```
STYLE: Hand-crafted pixel art in the manner of late-1990s / early-2000s console and
handheld games. Limited palette, flat color fills, crisp 1-pixel outlines, strong
readable silhouettes. Cozy, warm, slightly worn. Nothing glossy, nothing 3D-rendered,
no gradients, no anti-aliasing, no soft shadows, no lens effects, no drop shadows.

SETTING: A neighborhood pizza parlor in a fictionalized Metro Detroit, operating since
the 1990s. Red-and-white checkered cloth, worn wood paneling and laminate, amber
incandescent light, neon beer and sports signage, arcade carpet, CRT glow, paper menus,
faded football memorabilia, handwritten signs taped to things. Familiar, lived-in,
a little shady. Not a tourist-board Detroit, not a generic neon casino, not steampunk,
not cyberpunk, not fantasy-medieval.

CAMERA: Straight-on, at standing eye level, no tilt, no isometric projection, no dutch
angle, no dramatic or wide-angle lens. Two rules apply depending on what is being drawn:

  ENVIRONMENTS are a shallow stage box — like a shoebox diorama or a theatre set seen
  from the front row. The floor is visible and recedes gently toward a back wall. Side
  walls may angle in very slightly. The recession is shallow: a suggestion of depth, not
  a corridor, never an aggressive vanishing point.

  SUBJECTS — characters, objects, clothing layers, and surfaces — are drawn completely
  flat and front-facing with no perspective, no foreshortening, and no rotation.

LIGHT: One warm key light from the upper left, the color of an incandescent bulb. Cool
low-influence ambient fill from the lower right. Shadows are one step darker in the same
color family, never black and never grey. Neon is emissive: full-value color with a
one-pixel bloom, unaffected by the key light.

PALETTE: Restrict to a warm, slightly desaturated palette of roughly 32 colors —
warm near-blacks, browns, brick reds, cream paper tones, amber, muted blues, with a
few saturated neon accents in cyan, green, yellow, and magenta. Never pure black
(#000000). Never pure white (#FFFFFF).

OUTPUT: Generate at high resolution in this style. Do not attempt to output at the final
tiny pixel dimensions — the asset will be downscaled with nearest-neighbor and quantized
afterward. Transparent background unless the prompt says otherwise. Single subject,
centered, full subject visible with a small margin, no cropping at the edges.

NEGATIVE — never include any of the following:
team logos, league marks, or any sports-team insignia; real athletes or recognizable
likenesses of real people; real signatures or autographs; brand names, wordmarks, or
corporate logos; Mario, Luigi, or any Nintendo character; any existing video-game,
film, or cartoon character; watermarks; signatures; text or lettering of any kind
unless the prompt explicitly requests it; photorealism; 3D rendering; smooth gradients;
anti-aliased edges; drop shadows; lens flare; motion blur; multiple subjects when one
was requested.
```

---

### Prompt 1 — `zone_front_counter` (aspect 8:5, opaque)

Paste the style prefix, then:

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

SUBJECT: The front service counter of a 1990s neighborhood pizza parlor, seen from just
inside the door. A worn laminate counter running across the middle distance, with a chunky
beige cash register on it. Behind the counter, a pizza oven with a dark mouth and warm glow.
A corkboard on the wall with blank papers pinned to it. A spike holding blank receipts.
Patterned arcade carpet on the floor, running from the bottom edge back to the base of the
counter. Warm amber overhead light. The front strip of floor is clear and open where a
character will stand.

FRAMING FOR THIS ASSET: Aspect ratio 8:5, landscape. The left third of the floor must stay
clear — a character stands there. The lower right must stay visually quiet; interface text
sits over it.
```

---

### Prompt 2 — `character_tony_neutral` (aspect 2:3, transparent)

Paste the style prefix, then:

```
SUBJECT TYPE: A single standing character, full body, facing the viewer straight-on or
at a slight three-quarter turn. Feet flat on an implied floor line at the bottom edge.
Arms visible. Compact, stocky, animated posture — a person who has been on his feet all
day and has opinions about it.

PROPORTIONS: Roughly four-and-a-half heads tall. Slightly large head for readability at
small size. Hands simplified to mitten-like shapes. Feet simplified to solid blocks.

DETAIL BUDGET: No more than six distinct interior shapes on the face and eight on the
body, excluding the outline. The silhouette alone must identify the character — if it
were filled with one flat color, you would still know who it is.

OUTLINE: Fully enclosed 1-pixel outline in a warm near-black.

BACKGROUND: Fully transparent. No floor, no shadow, no scenery, no props except those
named in the subject line.

SUBJECT: Tony, the middle-aged owner of the pizza parlor. Slightly balding with dark
hair at the sides. A thick dark mustache — his strongest facial identifier. A white
pizza apron, stained with use, carrying the simplified Tony's Pizza wordmark on the
chest in the house red. Worn over a plain blue-and-silver football jersey with NO
markings, NO numbers, NO logos, and NO wordmarks of any kind. A single cigarette
tucked behind his right ear. Practical dark work shoes. Expression: confident and
mildly exhausted, like a man who has seen every bad beat and claims he predicted all
of them. Arms relaxed at his sides. Neutral standing pose.

FRAMING FOR THIS ASSET: Aspect ratio 2:3, portrait. Single figure, centered, full body
visible with a small margin, nothing cropped at any edge. Transparent background — not
white, not a checkerboard drawn into the image.
```

> Both blocks above are copied verbatim from `prompts/character_tony.md`. The only
> line I have added is the framing note at the end, which is about the output file
> rather than the drawing.

---

### Prompt 3 — `surface_poster_blank` (aspect 3:2, transparent)

Paste the style prefix, then:

```
SUBJECT TYPE: A blank physical surface intended to carry text that will be added later
by software. The surface itself only.

CRITICAL — NO TEXT: Generate absolutely no letters, words, numbers, glyphs, or
text-like marks anywhere on the surface. Not placeholder text, not lorem ipsum, not
decorative lettering, not illegible squiggles standing in for writing. The text area
must be completely clean. This is the most common failure mode for this family and it
makes the asset unusable.

SAFE AREA: The central region of the surface must be flat, evenly lit, and free of
interior detail, texture variation, and decoration. Wear, grain, stains, and ornament
belong at the edges only. Contrast within the safe area must be low and even so that
rendered text of any color will remain legible against it.

COMPOSITION: The surface fills the frame, presented straight-on with no perspective
skew. Slight physical imperfection — a curled corner, a pin, a piece of tape — is
welcome at the edges and adds character.

OUTLINE: 1-pixel outline in a warm near-black around the surface's outer edge.

BACKGROUND: Transparent outside the surface itself.

SUBJECT: A blank paper poster taped to a wall, portrait-ish proportions, slightly
yellowed cream stock with a thin decorative border a few pixels in from the edge. One
corner curled. A strip of tape at the top. The entire center is clean flat paper with
no marks whatsoever.

FRAMING FOR THIS ASSET: Aspect ratio 3:2, landscape. Transparent background outside the
poster itself.
```

> Verbatim from `prompts/surface.md`. Note this one wants a **transparent** background
> outside the poster, unlike the zone tile — the table in §1 says "No" for opacity
> because the poster is composited onto a wall the site already draws.

---

## 9. Checklist

- [ ] Read §0 and tell me: pixel art, or are we changing direction?
- [ ] Generate ~4 candidates each of the three prompts above
- [ ] Keep them as PNG, full size, unedited
- [ ] Reject anything with lettering on it
- [ ] Name them `<slug>_01.png`, `<slug>_02.png`, …
- [ ] Send me all candidates for those three slugs
- [ ] Wait for the composite check before generating B1

**Send first:** `zone_front_counter`, `character_tony_neutral`, `surface_poster_blank`. Nothing else until those three sit together on a phone and look like one place.
