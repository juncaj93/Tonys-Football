# Text surfaces and typography — the standing visual boundary

**Status:** active standing direction. Issued by the commissioner **2026-08-01**,
explicitly **non-interrupting**: no in-flight implementation, pull request, CI run
or deployment was to be stopped for it, and none was.

**Precedence:** a *latest explicit commissioner ruling* — level 1 in
`AUTONOMY.md §1`. It supplements `VISUAL_ACCEPTANCE.md` (which remains the
enforcing document) and `docs/PRODUCT_DELIVERY_MANDATE.md §6`. Where an older
document disagrees, this file wins and the older one gets corrected.

**When it applies:** the next coherent visual-polish or feature slice that
touches a text-bearing surface — the Slice, the commissioner review screens, the
Tonight board, chalkboards, receipts, signs, labels, dialogue, status panels,
instructions, warnings, score displays. It is **not** a mandate to stop delivery
and redesign every surface at once.

---

## 1. What the reference actually shows

The commissioner supplied one screenshot. It is worth being precise about what it
is, because that changes how much weight it carries: **it is a redrawing of this
product's own `review-refused` screen** — same route, same copy, same structure,
same content — presented at the target standard. It is not a different product to
imitate.

So it is not a mood board. It is a **worked example of the gap**, on a screen
that shipped hours before it arrived. Read against what is in the repository
today, it asks for eleven specific things:

| | The reference does | Today |
|---|---|---|
| 1 | **Corner brackets** on the paper sheet — four pixel ornaments framing the writing field | `PixelPanel` is a flat bevel with no corners |
| 2 | A **warning glyph** beside the blocking headline | text alone |
| 3 | Validation findings as a **bordered two-column ledger** — red square bullet, red label left, dark value right, dashed rule between rows | an inline run: label, then value, then an optional reason underneath |
| 4 | **Numerals right-aligned in their own column**, so `213.77` and `96.10` line up | numbers sit inline after the label and do not align |
| 5 | *"As it will print"* as a **dark plaque** with its own frame | a cream `SignPlate` |
| 6 | A **glyph in the masthead** and a double rule under it | a single rule, no mark |
| 7 | The headline **much larger and heavier**, filling the column | 26px at the top tier |
| 8 | The metadata line **legible** — uppercase mono, generously tracked, but not small | 12px, correct in kind and near the floor |
| 9 | Red used **only** for the blocking state and the findings that caused it | broadly right already; must not spread |
| 10 | A **darker outer frame** around the cream sheet, so the paper reads as mounted | the panel sits directly on the room |
| 11 | The writing field **calmer than everything around it** | true on the desk, not yet true everywhere |

Do **not** copy its wording, its product structure, or any composition that would
conflict with Tony's approved environment (`18_PARLOR_NAVIGATION_MAP.md` still
governs the room). Copy the **principles**: calm paper, strong dark text, red
reserved, clear divisions, deliberate spacing, distinct type roles, large
readable pixel type, restrained texture, strong alignment.

---

## 2. The measured problem

Numbers rather than adjectives, taken from the repository on the day this was
recorded:

- **Sixteen distinct font sizes** are in use across `app/` and `components/`,
  from **8px to 26px**, as Tailwind arbitrary values at roughly **two hundred
  call sites**.
- **Thirty files** set type below 16px.
- **Seven call sites set 8px or 9px**, and they are the ones to look at first:
  `app/counter/showcase/page.tsx:87` · `components/scene/arrival.tsx:187` ·
  `components/scene/counter-tray.tsx:390` and `:462` ·
  `components/scene/fixtures.tsx:88` and `:110` ·
  `components/counter/showcase-picker.tsx:115`.
- **There is no typography module.** `lib/design/` contains a colour-token test
  and a source-byte test and nothing that defines a type scale, so every size is
  a decision made once and copied.

That last point is the actual defect. Sixteen sizes is a symptom; the cause is
that nothing in the repository says what a *heading* is, so each surface invents
one. This direction is satisfied by fixing the cause.

---

## 3. The type roles

Define these as **shared tokens or primitives**, not as remembered values. Each
role gets an intentional font, size, weight, line height, letter spacing, colour,
background relationship, maximum measure, and spacing above and below.

| Role | Used for |
|---|---|
| `display` | mastheads and the one thing a screen is about |
| `heading` | a section within a surface |
| `subheading` | a division inside a section |
| `metadata` | dateline, draft number, digest, provenance |
| `body` | anything read rather than glanced at |
| `numeric` | scores, prices, balances, weeks, countdowns |
| `status` | a state badge — approved, refused, on the rack |
| `warning` | a blocking or destructive state |
| `success` | a confirmation |
| `inactive` | a shut door, an unowned spot, an empty slot |
| `action` | a button or a stamp |
| `environmental` | a sign painted in the room |
| `dialogue` | Tony, in his own voice |
| `validation` | a finding, with its label and its value |
| `ledger` | a row in a table, a board, or a receipt |

**Do not let one-off values spread.** A new surface picks a role; it does not
pick a pixel size. When no role fits, add one deliberately — that is a decision
with a name, which is the whole point.

### Which face carries what

Decorative pixel type (**Silkscreen**, `font-display`) for mastheads, headlines,
short labels, environmental signs and status badges.

The clearest approved reading face (**VT323**, `font-mono`) for instructions,
summaries, validation detail, long names, scores and body copy.

Pixel-art themed, never at the cost of making somebody work to read it.

### Forbidden outright

9px informational copy · condensed body text · decorative faces for long
paragraphs · cream-on-tan and other low-contrast pairings · wide tracking on body
copy · forced uppercase for long explanatory text · text over detailed noisy
artwork · outlines or shadows that muddy letterforms · fractional font scaling ·
blurred browser scaling.

**Sub-16px is permitted only for a `status`, `metadata`, `environmental` or
`action` label** — never for copy carrying information a manager has to read.
`PRODUCT_DELIVERY_MANDATE.md §6`'s 16–18px floor governs everything else, adjusted
*upward* when the pixel font needs the optical size.

---

## 4. Surface families

Important text sits on a surface **designed to carry text**. The environmental
frame may stay textured; the writing field must be calmer than its frame.

**Approved writing fields:** clean warm paper · flat cream paint · a restrained
chalkboard field · clear receipt stock · a simple sign face · a solid dialogue
panel · a controlled ledger ground.

**Never a writing field:** brick · dark wood grain · scratches · soot · heavy
dithering · illustrated clutter · inconsistent lighting · high-frequency pixel
noise.

### Per material

**The Tonight board** — clean warm near-white or cream field, strong dark text,
restrained texture, clear title-and-status hierarchy, no burnt or scratched
centre. (The face was made flat cream in #52; this holds it there.)

**Chalkboards** — a dark calm field, light high-contrast lettering, texture kept
away from the letterforms, no tiny faint chalk copy, and the written state
visually distinct from the erased one.

**Receipts** — narrow but readable, numerals aligned, line spacing stable, no text
touching a perforated or damaged edge, totals and record summaries visibly
prioritised.

**Signs and plaques** — short copy only, large enough to read without zooming, a
decorative physical frame but a simple face. **No paragraphs on environmental
signs.**

**Dialogue** — a clean pixel frame, readable body copy, a stable text area, **no
animated structural change** (that rule is already enforced by
`components/scene/spoken-line.test.tsx` and is the repair for the #418 hydration
defect), and no competing texture behind the words.

**The newspaper** may look **aged** but must never look **dirty**. Age it at the
edges, corners, folds and frame details. Keep the central reading area clean.

---

## 5. Numbers

Scores, records, prices, token balances, weeks and countdowns are the values a
manager checks rather than reads, so they get their own rules: aligned numerals ·
consistent decimal formatting · tabular figures wherever the face supports them ·
space around the number · a visible relationship between label and value · stable
width where a value updates.

Never: `undefined` (this shipped once, on the market's own price line) · clipped
decimals · a number that wraps away from its label · an oversized number
overpowering its surface · a tiny secondary number carrying essential meaning.

---

## 6. Mobile

Inspect every text-heavy state at **390 · 375 · 360**, at actual display size —
not enlarged.

The content cases that must be exercised: the longest current manager name · the
longest approved headline · the longest validation reason · the largest plausible
score · several validation findings at once · playoff and championship labels ·
loading · empty · error · inactive · approved · rejected.

No essential text may require zoom. No horizontal scrolling. No line so long or so
cramped that reading it is work.

---

## 7. Pixel-art cleanliness

The standing clean-pixel-art direction (`docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md`)
applies to every refreshed surface: intentional pixel clusters · whole-pixel
placement · nearest-neighbour scaling · a controlled palette · restrained
dithering · clear silhouettes · clean internal fields · texture concentrated at
frames and environmental edges.

Not: painterly noise · a painted-then-quantized look · burnt mottling · random
scratch overlays · muddy colour mixing · blurred type · faux-pixel faces at
fractional sizes.

---

## 8. Presentation stays separable from behaviour

This is the part that outlives any particular look, and it is a **hard**
requirement rather than a style note.

Preserve, unchanged: facts · validation · routes · state · actions · approval
behaviour · settlement logic · database contracts · accessibility semantics ·
server-authoritative rules.

Treat the current *presentation* as replaceable, and keep the behaviour behind
stable contracts, so a future redesign can change how a feature looks without
rebuilding how it works.

**Visual primitives receive typed display data and actions from existing
services. They never compute a fantasy fact.** That is `MANDATE §9` restated at
the component boundary: `components/slice/review.tsx` may decide that a
significance score is set in `metadata`; it may not decide what the score is, or
round it, or rank it.

Likely primitives — names may follow repository convention:
`PaperPanel` · `PixelHeadline` · `MetadataRow` · `StatusStamp` · `ValidationList`
· `ScoreDeck` · `EnvironmentalSign` · `ReceiptRow` · `ChalkboardCopy` ·
`PixelDivider`.

**Consistency must come from shared contracts, not from copied CSS.**

---

## 9. The order to do it in

1. **The Tuesday Slice and the commissioner review surfaces** — the reference is
   literally a redrawing of one of these, and `docs/SLICE_REVIEW_BOUNDARY.md`
   describes what they must keep doing
2. **The homepage Tonight board and the prediction sign**
3. **Tony's dialogue**
4. **Receipts and record detail**
5. **Weekly stakes**
6. **Counter and Collection labels**
7. **The Back Hall, and future room signage**

Within a slice: inventory the surfaces it touches, fix the worst readability and
consistency failures, define the shared primitives it needs, and apply them.
**No isolated cosmetic micro-PRs.** Functionality is preserved throughout.

---

## 10. Acceptance

A refreshed text surface is complete only when **all** hold:

1. comfortably readable at actual iPhone size
2. headline, metadata, body, status and action roles visually distinct
3. the writing field calmer than its environmental frame
4. texture does not interfere with letterforms
5. important numbers aligned and unambiguous
6. long names and long copy do not break the layout
7. it reads as part of Tony's Pizza rather than as generic web UI
8. the underlying feature behaviour is unchanged
9. business logic remains separate from presentation
10. a future redesign could replace the surface without rewriting its core

### Evidence

Before **and** after · actual-size phone views · 390, 375 and 360 · shortest and
longest content · normal and error states · active and inactive states · at least
one data-heavy state. **Judged at normal display size**, not only enlarged.

---

## 11. No new art is required

This direction is satisfied with CSS and component refactoring, shared design
tokens, deterministic source-art cleanup (the mechanism
`scripts/clean-parlor-surfaces.ts` already establishes), simple generated paper,
board and sign fields, targeted edits to existing textures, and replacing a noisy
interior field while preserving its environmental frame.

**Do not request art to obtain a clean paper or board surface.** Escalate only
for a specific complex illustrated asset that genuinely cannot be improved inside
the repository — and Batch B remains deferred commissioner content that is not to
be requested again.

---

## 12. Where non-compliance is recorded

`docs/VISUAL_DEBT.md`. An item that fails this boundary and is too small to stop
for goes there with its width, its measurement and why it waited — the same shape
every other entry has. Items **2**, **9**, **10**, **11** and **12** on that list
are already text- or surface-related and should be re-read against this file when
their slice comes up.
