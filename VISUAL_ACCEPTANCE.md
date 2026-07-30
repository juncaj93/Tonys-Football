# VISUAL_ACCEPTANCE.md — what "finished" looks like

**Enforced by** `npm run visual:qa` (arithmetic) and `agents/visual-qa.md` (judgement).
**Standing:** a milestone is not done until every gate here passes. Green CI is necessary and never sufficient.

---

## 0. Why this file is specific

Every visual regression this project shipped was invisible to the test suite:

| Defect | What CI said |
|---|---|
| Legacy giant wall-logo homepage live in production | green |
| Floor hardcoded to `#3b2050` — the quantizer bug's own output | green |
| Full-width bottom sheet covering a quarter of the room | green, twice |
| `<Link href="/underground">` to a route that does not exist | green — a console 404 was the only trace |
| `AmbientLife` glowing on a wooden pillar | would have been green; the effects are opacity-only |

So the gates below are written as things a machine can check, and the rest is written as things a reviewer must look at.

---

## 1. Required states

Captured at every width, every run:

`idle` · `tony-dialogue` · `tonight-board` · `banner-completed` · `banner-current-tbd` · `rack` · `prediction` · `receipt` · `counter` · `back-hall` · `keyboard-focus` · `six-banners`

Loading, empty and error states are reviewed when the surface that owns them changes.

## 2. Required widths

**390 · 375 · 360** CSS px, at `deviceScaleFactor: 3`.

375 is iPhone SE and 12 mini; 360 is the narrowest supported. **Measuring only the widest is how the banner row was first recorded as passing AA when it did not** — a 20-unit partition is 24.38px at 390 and 22.50px at 360.

---

## 3. Machine gates — `npm run visual:qa` fails the build

| Gate | Rule | Why |
|---|---|---|
| `tap-target` | Every visible target ≥ **24 × 24** CSS px | WCAG 2.5.8 AA. The room's own 44px convention is stricter and unreachable on the banner row; AA is the floor that cannot be crossed. |
| `overlap` | No two **co-reachable** targets overlap by > 0.5px | Judged on `idle` only. A panel's Close button over a Door behind a scrim is z-order working, not a defect — the first run of this gate reported eleven such and none were real. |
| `colour-fidelity` | No `#3B2050` in page chrome; no `filter` (except `drop-shadow`), no `mix-blend-mode`, and `image-rendering: pixelated` on every `<img>` | Recolouring an approved asset is how pixel art silently stops matching its source file. |
| `legacy` | No reference to `zone_front_counter`, `zone_counter_front`, `/collection`, `ShowInteractables` | Withdrawn things come back through merges. |
| `object-map` | Exactly **3 Doors** and **1 Toy** on the homepage | The room's grammar. A ninth object, or a Door quietly demoted, is a product regression no unit test sees. |
| `overflow` | Zero horizontal document overflow | |
| `console` | No console errors or failed requests | This is the gate that caught the `/underground` 404. |

---

## 4. Reviewer gates — judgement, and a rejection creates a repair task

Reject, with a concrete repair task, for any of:

- **Tony or clothing clipping**, or wrong rear/foreground layering around him. Compare against the approved B0 composite: he is cut at logical **y 292** and his visible band is **112 units**.
- **Text uncomfortable to read on an iPhone.** Body copy floor is **17px**. Size the container to the type, never the type to the container — that mistake was made once, at 15px, to shrink a box.
- **Contaminated room colour**, blurry pixel art, or a soft edge where the palette has a hard one.
- **Visible hit regions**, focus boxes larger than the object, or a rectangle drawn around an inert object.
- **Generic HTML cards or buttons dominating the room.** Transient panels may be rectangular pixel-art surfaces; inert room objects may not be boxed at all.
- **A bottom sheet.** A panel is *set down in the room*, sized to its contents. A sheet spanning the viewport is the gesture language of an app with a themed background, and it turns the parlor into that background.
- **Legacy artwork** mixed with the approved shell.
- **A surface that looks unloaded rather than deliberately quiet.** The prediction sign is the canonical case: trigger-only and correctly silent, but baked dark and rendering nothing it read as a failed component until it got chalk residue on it. Everything empty in this room must be *visibly* empty on purpose.
- **Broken spacing, awkward composition**, or anything that technically works and visibly feels unfinished.

---

## 5. Fixed geometry the reviewer checks against

| Feature | Extent |
|---|---|
| Rail rod | `x 54–184` · centre `119.0` |
| Board, as shipped | `x 54–185` · 132 × 101 · centre `119.5` |
| Banner slots | `56 · 78 · 100 · 122 · 144 · 166` · width 18 · gap **4** · pitch 22 |
| Banner hit row | `y 58–87`, ends extended by `gap / 2` |
| Tonight text field | `60, 93, 111, 74` |
| Prediction slate | `154, 184, 37, 59` |
| Newspaper rack | `(10, 224)` at 38 × 38 |
| Layer cut | logical **y 292** |
| Tony | `(64, 180)` at 72 × 197 |

**Gap 4 is load-bearing.** Narrowing it to 3 drops the pitch to 21 → **23.6px at 360**, below AA. If the rod is ever re-measured under 128 units, the answer is five slots at gap 4, never six at gap 3.

---

## 6. Canonical behaviour that must survive every change

3 Doors · 4 Displays · 1 Toy · no `/collection` · `/counter`, `/back-hall`, `/timeline` exist · banners fill from the left, oldest first · completed seasons plus the current one · no future placeholders · current unresolved season reveals `TBD` · six most recent on overflow · 2024 → Alex · 2025 → Matty B · receipt and prediction sign trigger-only · banners are individually selectable real DOM buttons · locked destinations answer in-world and **never link to an unbuilt route**.
