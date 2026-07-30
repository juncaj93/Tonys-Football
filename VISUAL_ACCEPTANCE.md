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

`idle` · `tony-dialogue` · `tonight-board` · `banner-completed` · `banner-current-tbd` · `rack` · `prediction` · `receipt` · `counter` · `back-hall` · `keyboard-focus` · `six-banners` · `tray-owned-box` · `tray-reveal` · `collection` · `collection-filtered` · `showcase` · `showcase-chosen`

Loading, empty and error states are reviewed when the surface that owns them changes.

**`tray-reveal` became required once boxes were purchasable.** It could not be before: a box opens exactly once by design, so capturing the reveal *consumed* the state — 390 got a screenshot and the two narrower widths photographed an empty tray. A gate that passes on a fresh database and fails on the second run is worse than no gate.

Purchase fixed it properly rather than by contrivance. Each width now **buys its own box** out of the season's opening balance before opening it, so the state is repeatable *and* the capture exercises the ledger, the balance check and the tray transition in one pass.

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
| `object-map` | The rendered set of `data-room-object` / `data-room-kind` markers **equals `ROOM_OBJECTS` exactly** — same ids, same kinds, no extras, no duplicates. Summarised as **3 Doors · 4 Displays · 1 Toy** | The room's grammar. A ninth object, a Door quietly demoted, a vanished Display, or a renamed id is a product regression no unit test sees. Judged on `idle` and `tray-owned-box`. |
| `glow` | Nothing in the room carries a `drop-shadow` filter except the tray's own box states and a rarity treatment | `18` allows one persistent affordance — a Door with something to say. A glow arriving on a Display, or a second Door lighting up, teaches the room's grammar wrong. |
| `overflow` | Zero horizontal document overflow | |
| `console` | No console errors or failed requests | This is the gate that caught the `/underground` 404. |

### Why `object-map` counts markers and not anchors

It used to count `<a href>` matching `slice|counter|back-hall`. That was wrong in **both** directions, and the first direction is the instructive one.

The tray is a Door, and when a box is owned it *opens at the tray, in place* (`18 §4.1`) rather than navigating — so it renders as a button. An anchor count reads that as a missing Door, and the obvious way to make the gate green again would have been to route to `/counter` first: **the exact defect the ruling forbids.** A gate that pressures you toward a known defect is worse than no gate.

It also missed real regressions: nothing checked the four Displays, and a Door becoming a Display went unnoticed so long as some anchor still pointed at the route.

One object may legitimately be several targets. The banner rail is a single Display divided into one button per occupied slot; those buttons additionally carry `data-room-partition`, which is how the gate tells six partitions from five duplicates. **`banners` is the only partitioned object**; any other repeated id is a defect, because a duplicate doubles a tap target where nobody can see it.

---

## 4. Reviewer gates — judgement, and a rejection creates a repair task

Reject, with a concrete repair task, for any of:

- **Tony or clothing clipping**, or wrong rear/foreground layering around him. Compare against the approved B0 composite: he is cut at logical **y 292** and his visible band is **112 units**.
- **Text uncomfortable to read on an iPhone.** Body and dialogue copy sit at **16–18 CSS px, adjusted upward when the pixel font needs the optical size** (`PRODUCT_DELIVERY_MANDATE.md §6`, which supersedes the earlier bare "17px floor"). Size the container to the type, never the type to the container — that mistake was made once at 15px to shrink a box, and again at 8px and 9px on the Tonight board.
- **Text crowding a painted frame.** The board's words go in `TONIGHT_FIELD`, inset six units inside the cream. A sign painter leaves a margin; the frame is part of the drawing.
- **A surface narrating instead of stating.** The board's face is a hero plus at most one short fact — `WEEK 5`, then who is playing. Sentences belong in the panel behind it. Two sentences at decorative size on the largest object in an idle room is the defect this rule exists for.
- **Contaminated room colour**, blurry pixel art, or a soft edge where the palette has a hard one.
- **Visible hit regions**, focus boxes larger than the object, or a rectangle drawn around an inert object.
- **Generic HTML cards or buttons dominating the room.** Transient panels may be rectangular pixel-art surfaces; inert room objects may not be boxed at all.
- **A bottom sheet.** A panel is *set down in the room*, sized to its contents. A sheet spanning the viewport is the gesture language of an app with a themed background, and it turns the parlor into that background.
- **Legacy artwork** mixed with the approved shell.
- **A surface that looks unloaded rather than deliberately quiet.** The prediction sign is the canonical case: trigger-only and correctly silent, but baked dark and rendering nothing it read as a failed component until it got chalk residue on it. Everything empty in this room must be *visibly* empty on purpose.
- **A placeholder drawn at the wrong scale.** `PlaceholderSign` is the taped-up wall sign and does not shrink — its `min-h-24` wins, its label wraps, and a 44 × 30 slot becomes a 54 × 133 white slab with a developer's slug printed down it. Small objects use `PlaceholderObject` (`AssetView … compact`). This shipped once, on the first placeholder ever drawn at object scale.
- **An object floating with nothing under it.** The room has no floating things, so a floating thing reads as a layout bug rather than as a prize. The revealed collectible rests on the tray; motion may lift it, geometry may not.
- **Rarity, or any other state, painted as a neon frame.** Rarity is the **word first**, then frame geometry, then colour — and colour is an accent *inside* a house-material surface, never the surface's own border. An epic pull inside a bright magenta double frame is a UI component sitting on a hand-drawn counter.
- **Text the same colour as the surface under it.** Body copy inside a cream `PixelPanel` is `text-ink-700`; `text-paper-*` is for copy on the dark room. Cream-on-cream shipped on `/counter`, `/back-hall` and `/timeline` — three routes rendering headings above **invisible** paragraphs, all of them green in CI. A related trap: a class naming a `--color-*` token that does not exist generates no rule at all and silently inherits. `lib/design/colour-tokens.test.ts` now fails the build for the second case; the first is still a thing a reviewer has to look for.
- **The same thing rendered twice in one panel.** The Showcase showed a manager's item as a summary *and* as the only entry in its picker, with nothing to distinguish the two — which reads as a duplicate render, not as a control under a heading. If a surface repeats something on purpose, label why.
- **Broken spacing, awkward composition**, or anything that technically works and visibly feels unfinished.

---

## 5. Fixed geometry the reviewer checks against

| Feature | Extent |
|---|---|
| Rail rod | `x 54–184` · centre `119.0` |
| Board, as shipped | `x 54–185` · 132 × 101 · centre `119.5` |
| Banner slots | `56 · 78 · 100 · 122 · 144 · 166` · width 18 · gap **4** · pitch 22 |
| Banner hit row | `y 58–87`, ends extended by `gap / 2` |
| Tonight board cream field, as drawn | `TONIGHT_CREAM` `60, 93, 111, 79` |
| Tonight **text** field | `TONIGHT_FIELD` `66, 99, 99, 67` — the cream **inset 6 units on every side**, so no line touches the painted frame |
| Prediction slate | `154, 184, 37, 59` |
| Newspaper rack | `(10, 224)` at 38 × 38 |
| Tray surface, as drawn | `156, 284, 94, 25` — hit region is the same tray padded to `156, 275, 94, 44` |
| Owned box on the tray | `TRAY_BOX` `181, 276, 44, 30` — centred on the tray's `x 203`, base on its lowest drawn row |
| Revealed collectible | `TRAY_REVEAL` `180, 262, 46, 46` — **on the tray, where the box was.** It does not float; the rise is the animation's job |
| Reveal plate | `TRAY_PLATE_ANCHOR` `x 126`, `y 316`, width `168` — **no height.** Sized to its contents, past the counter's front edge at `313` |
| Layer cut | logical **y 292** |
| Tony | `(64, 180)` at 72 × 197 |

**Gap 4 is load-bearing.** Narrowing it to 3 drops the pitch to 21 → **23.6px at 360**, below AA. If the rod is ever re-measured under 128 units, the answer is five slots at gap 4, never six at gap 3.

---

## 6. Canonical behaviour that must survive every change

3 Doors · 4 Displays · 1 Toy · no `/collection` · `/counter`, `/back-hall`, `/timeline` exist · banners fill from the left, oldest first · completed seasons plus the current one · no future placeholders · current unresolved season reveals `TBD` · six most recent on overflow · 2024 → Alex · 2025 → Matty B · receipt and prediction sign trigger-only · banners are individually selectable real DOM buttons · locked destinations answer in-world and **never link to an unbuilt route**.

**The tray.** An owned box **opens at the tray, in place** — never after a navigation. The box is a *state of the tray*, not a ninth object, and the tray Door glows only while it holds one. The tray's destination is therefore conditional, so `/counter` must stay reachable from the room in every state: with an empty tray by tapping it, and with a box on it from the reveal plate. A route reachable only sometimes is the same class of defect as a link to a route that does not exist.
