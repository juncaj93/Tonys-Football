# `manager_build_tshirt` — art-generation brief

**One asset. The prototype build.** Commissioner authorisation, 2026-08-11: this
is the only manager artwork approved, and the remaining sixteen pieces are not
commissioned until this one has been looked at in the real basement on a real
phone.

- **Production slug:** `avatar_body_starter_04` — the T-shirt, top index **2**.
  The file may be called anything; the slug is passed on the command line.
- **Paint over:** `art/jigs/manager_paintover_672x1008.png`
- **Read alongside:** `art/jigs/manager_registration_jig@6x.png` (the same plate,
  labelled, with the palette)
- **Deliver:** one PNG, **672 × 1008**, transparent background.
- **Then run:** `npm run art:mask -- <file.png> avatar_body_starter_04`

---

## Part 1 — the brief to paste into an image-generation session

Everything between the rules below is the prompt. The two jig images go in with
it.

---

> **What this is.** A single character sprite for a late-1990s / early-2000s
> pixel-art game set in a neighbourhood pizza parlour. It is one manager — an
> ordinary adult — standing in a basement rec room, seen straight on. This is
> production game art, not a concept illustration.
>
> **Paint only the figure from the neck down.** The head, face and neck already
> exist and are drawn on the plate for you. Anything you paint above the pink
> "head clearance" line will be thrown away by the pipeline.
>
> **Canvas: 672 × 1008, transparent background.** Every 6 × 6 block of your image
> is one game pixel — paint in crisp 6 × 6 blocks, no anti-aliasing, no soft
> edges, no gradients, no blur, no drop shadow, no glow, no background of any
> kind.
>
> ### Registration — the four things that must be exact
>
> 1. **Nothing above the pink head-clearance line.** The head plate owns it.
> 2. **The collar must close over the neck** across the marked neck columns at the
>    pink "collar closes" line, so there is no gap between the shirt and the head.
> 3. **The soles sit ON the bottom row of the canvas.** The figure stands on the
>    floor; nothing is cropped and nothing floats.
> 4. **Do not touch the left or right edge** of the canvas.
>
> Every other guide line on the plate is **blue and advisory** — the shoulders,
> the arms, the wrists, the hands, the knees, the ankles. Those are where a
> previous version put them and they were the problem. **Move them. Pose the
> figure.**
>
> ### Quality target
>
> The benchmark is **Tony**, the pizzeria owner from the same game (reference
> image supplied). Study and match:
>
> - believable anatomy — a chest, a waist, real shoulder mass;
> - arms constructed as arms, with a visible upper arm, elbow and forearm;
> - readable hands with implied fingers or a thumb, not mittens;
> - dimensional clothing — a shirt that sits *on* a body, with fabric folds,
>   gathers at the waist, a sleeve that turns;
> - trousers with a hip, a seam, a knee break and a fall;
> - shoes with a sole, a toe and a heel, seen straight on;
> - selective dark outlining — a hard dark outline around the whole figure,
>   softer internal edges;
> - warm highlights on the surfaces facing up and to the left;
> - **asymmetry** — this is the single biggest difference. One hand in a pocket,
>   one arm relaxed and the other not, a weight shift onto one leg, a slight
>   twist. Nothing mirrored.
> - personality and stance, without caricature or an exaggerated action pose. This
>   person is standing in their own basement.
>
> **Do not copy Tony's identity** — not his apron, his moustache, his hair, his
> jersey or his face. He is the *quality bar* and the *world*, not the character.
> This is a different, ordinary person.
>
> ### The light
>
> **One light source, from the upper left.** Every surface facing up and left
> catches the light tone; every surface facing down and right takes the shade
> tone. One direction, consistently, across the whole figure.
>
> ### The palette — fourteen colours, and nothing else
>
> Use these exact hex values and no others. They are shown as swatches on the
> labelled plate. This is a role palette: it renders as a red-shirted manager
> with mid-tone skin, denim trousers and brown leather boots, and the game
> recolours the shirt and the skin at runtime from what you paint.
>
> | Where | Light | Base | Shade |
> |---|---|---|---|
> | Outline (whole figure) | — | `#1A1214` | — |
> | **Shirt** | `#E4534A` | `#C42B2B` | `#8C1F22` |
> | **Bare skin** — forearms, hands | `#F2C9A0` | `#D9A173` | `#9C6640` |
> | **Trousers** | `#2C5A8C` | `#14233D` | — |
> | **Boots** | `#C99A63` | `#7A4A2A` | `#4A2E1C` |
> | **Soles** | `#4A3B3F` | `#2E2226` | — |
>
> Three tones per material is the whole range available. Model the form with
> those three and the outline; do not invent a fourth.
>
> **The shirt must be a plain crew-neck T-shirt with short sleeves**, so the
> forearms are bare skin. No logo, no print, no team mark, no text, no numbers.

---

## Part 2 — how the returned file becomes production art

**An image generator cannot emit an exact machine-readable encoding, and this
pipeline does not pretend otherwise.** The middle step is deterministic, not
generative:

```
painted PNG, 672 x 1008, fourteen colours
   ↓  block mode   the most common colour in each 6 x 6 block
   ↓  snap         nearest of the fourteen keys, plain Euclidean sRGB
role mask, 112 x 168, exactly fourteen colours
   ↓  validate     registration · outline · coverage · head clearance
lib/character/art/masks/avatar_body_starter_04.ts
```

Run it:

```bash
npm run art:mask -- art/incoming/manager_build_tshirt.png avatar_body_starter_04
```

**Read the snap distance in the report.** It is the honest measure of whether the
art was painted to the palette or merely near it:

| Mean snap distance | What it means |
|---|---|
| **0** | painted in the exact fourteen colours — the mask *is* the art |
| **under ~5** | close; the conversion is a faithful reading |
| **over ~12** | painted in some other palette. The tool warns, and the mask is its **guess** about what was meant. Repaint rather than ship it |

**Nothing is written if validation fails.** `ART_SPEC §9`'s standing rule is that
a layer which misses its anchor is regenerated and the renderer is never adjusted
to compensate — so a "mostly fine" mask is refused with the specific rows and
columns that are wrong. The common failures and their fixes:

| Refusal | Fix |
|---|---|
| *leave rows 0–52 clear* | the figure reaches into the head plate — paint below the pink line |
| *the lowest painted row is N* | the soles are not on the bottom row |
| *the neck is open at row 63* | the collar does not close over the neck |
| *pixels sit on the figure's edge without an outline* | the silhouette is not fully enclosed in `#1A1214` |
| *is there a background?* | something is painted behind the figure |
| *not a whole multiple* | deliver at exactly 672 × 1008 |

Then register it — import the generated module in
`lib/character/art/masks/index.ts` and add it to `BUILD_MASKS`. That one line is
the switch: until it is there, every manager keeps rendering the drawn sprite.

## Part 3 — what happens next, and who decides

Once it is registered, the acceptance sequence is the commissioner's and it is
fixed: render it in several skin and shirt colours, place it in the real
storeroom, photograph it at **390 / 375 / 360**, look at it on an iPhone, and
compare it against Tony, the supplied manager-quality references, and the old
production sprite.

**The remaining sixteen assets are not commissioned until that comparison is
approved.** `docs/MANAGER_BUILD_PROTOTYPE.md` carries the full sequence.
