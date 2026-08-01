# The text-surface boundary

**Status:** active. Written with the slice that built it, 2026-08-01.

This is the canonical account of how text is set in Tony's Pizza Fantasy: the
typography-role system, the shared printed surfaces, what the commissioner's
review screens and the Tuesday Slice are allowed to decide for themselves, and
what was deliberately left alone.

It sits under `docs/PRODUCT_DELIVERY_MANDATE.md` and `VISUAL_ACCEPTANCE.md` in
the hierarchy of `AUTONOMY.md §1`. Where it and an older document disagree about
a font size, this one wins and the loser gets corrected.

---

## 1. Why this slice existed

The commissioner's direction named the Tuesday Slice's commissioner-review screen
as a worked redesign — same route, same structure, same purpose, substantially
better hierarchy and readability — and asked for that quality level in the actual
product rather than in a mood board.

Underneath the screen was a cause rather than a defect. An audit found:

| | Before | After |
|---|---|---|
| Distinct font sizes | **16** (8px → 26px) | **6** (13 · 15 · 17 · 19 · 22 · 26) |
| Typography call sites | ~200 arbitrary `text-[Npx]` | **0** outside the type case |
| Call sites at 8–9px | **7** | 0 |
| Files with text under 16px | 30 | the roles that use 13px, and only those |
| Arbitrary line heights | 11 distinct | 0 outside the type case |
| A typography module | none | `lib/design/type.ts` |

None of those sizes was chosen. Each was a reasonable local decision — this
label is a bit long, that panel is a bit tight, shave a pixel — and two hundred
of them accumulated into a product where the same kind of thing was set at four
different sizes on four screens.

That is why the slice fixes the **cause**. Restyling the review screen without it
would have been the fourth "raise the small type" pass in this repository, and
the previous three each left instances behind: `LEGENDARY` on cream was repaired
and came back on a surface no screenshot could reach; the Back Hall's 9px reveal
line was repaired in #48 while five more 9px sites survived it.

---

## 2. The type case — `lib/design/type.ts`

A component names the **job the words are doing**. The role decides face, size,
leading, tracking, casing and numerics.

```tsx
<p className={`mt-2 ${TYPE.body} text-ink-700`}>…</p>
```

### The six sizes, and why the two faces do not share them

Measured in the browser at the shipped weights rather than estimated:

| px | Silkscreen cap | Silkscreen advance | VT323 cap | VT323 advance |
|---|---|---|---|---|
| 13 | 8 | 8.94 | 7 | 5.20 |
| 15 | 10 | 10.31 | 8 | 6.00 |
| 17 | 11 | 11.69 | 10 | 6.80 |
| 19 | 12 | 13.06 | 11 | 7.60 |
| 22 | 14 | 15.13 | 13 | 8.80 |
| 26 | 16 | 17.88 | 15 | 10.40 |

Two consequences, and both shape the roles:

- **Silkscreen reads a size larger.** Its capitals at 15px are exactly as tall as
  VT323's at 17px, so a 15px section heading and a 17px paragraph are the same
  apparent size. That is why the display roles sit lower on the number line than
  the body roles and still mean the same thing to a reader.
- **Silkscreen is half again as wide per character.** A display role is only ever
  short: a badge, a key, a heading. A sentence in the display face runs out of a
  360px phone in about twenty-six characters — which is exactly how the press
  desk ended up with a 12px metadata line. The size was chosen to make the
  *string* fit rather than to make the words legible, which is
  `VISUAL_ACCEPTANCE §4`'s named mistake in its purest form.

### Nothing is fluid and nothing is fractional

No `clamp()`, no `rem` scaling, no viewport units. Both faces are pixel faces: a
size landing between two device pixels resamples the glyph grid and the type goes
soft — the same defect the art pipeline spends its whole existence avoiding, and
the same one `tony-talks` was found rendering at half a pixel. Sizes are whole
pixels chosen per role.

### What a role does not decide

**Colour.** The room has two grounds — cream paper and dark enamel — and the same
role is `ink-700` on one and `paper-mid` on the other. Baking colour into a role
would be wrong on half the surfaces, or would need a variant per ground, which is
the same accumulation problem on a second axis. `INK` names the default
relationship per ground so a surface picks from a short list; *"text the same
colour as the surface under it"* stays a reviewer gate.

**Layout.** Margins, widths and gaps belong to the surface.

---

## 3. Enforcement, in two halves

Neither half is sufficient and the pair is what makes the rule hold.

### The static half — `lib/design/typography.test.ts`

Fails `npm run check` on an arbitrary pixel font size, a fluid or fractional
size, an arbitrary line height, or an inline `fontSize`/`lineHeight` anywhere in
`app/`, `components/`, `lib/` or `scripts/` outside the type case. It also
asserts the vocabulary itself: six sizes, every one used, none below the floor,
every role naming a face and a leading, no role carrying a colour or a margin,
every display role uppercase and no body role.

It skips lines that are **entirely prose**, because this repository documents the
sizes it moved away from inside the comment explaining why, and flagging those
would push the next person to delete the history rather than the size.

It deliberately does **not** police `h-[3px]`, `min-h-[48px]` or `w-[44px]`.
Those are geometry, and a rule broad enough to catch them gets switched off
within a milestone.

**One documented exception**, and it has to be about the drawing rather than
about convenience: `components/scene/banner-rail.tsx` sets a season year in
container-query units derived from `ROOM.height`, because that text is painted on
a pennant and must scale with the artwork rather than with the browser. A fixed
px size there is the wrong answer, not a shortcut.

The taped-up `PlaceholderSign` was on that list for about an hour and came off
it: its type is fixed px like everything else's, so what it wanted was migrating,
not excepting.

### The runtime half — `checkTypeFloor` in `scripts/visual-qa.mts`

Measures the **computed** font size of every text-bearing, visible, non-zero-area
element, on every state, at all three widths, and fails below `TYPE_FLOOR_PX`.

It exists because a static scan cannot see three real things: a size inherited
from an ancestor and re-set smaller by a stylesheet rule; a size that only exists
in one state the source never reveals as rendered; and a size that arrives from
the browser — a form control Safari restyles, a `1rem` floor resolving other than
assumed.

---

## 4. The printed surfaces — `components/scene/text-surface.tsx`

`components/scene/panel.tsx` holds the house **materials**: a panel, a plate, a
sign. This file holds the things made of **paper**, and they decide how words sit
on a surface rather than what the surface is made of.

| Primitive | What it is |
|---|---|
| `MountedSheet` | A sheet of paper on the wall: dark frame, shadow gap, four corner brackets, cream field |
| `PressMasthead` | Heavy rule, nameplate, hairline, dateline, flag, heavy rule |
| `SLICE_MASTHEAD` | The nameplate's printed lines, as one constant |
| `PrintedRule` | `hair` · `rule` · `heavy` — the page's only separator |
| `SectionHeading` | A label under a rule |
| `MetadataStrip` | A dateline, a draft identifier, a colophon |
| `Plaque` | A dark plaque naming what is under it |
| `ScoreDeck` | The score line under a headline, ruled above and below |
| `WarningGlyph` | A drawn `!` — three rectangles on whole pixels in a bordered square |
| `WarningBlock` | Glyph, title, what happens next |
| `Ledger` · `LedgerRow` | Keys left, values right-aligned and unwrapped, a rule between findings |

### Why not one card component

Because the two surfaces are different objects in the world. The Slice is a
newspaper — one sheet, printed rules, nothing boxed off from anything else. The
press desk is a proof sheet on a clipboard — bordered ledgers, stamps, a plaque.
Folding both into a generic card produces the *"functional web application
wearing pixel art"* the polish standard names.

What they share is typography and spacing rhythm, and that is exactly what the
primitives carry.

### The material rule

**The frame may be rich; the reading field must be calm.** All of the material in
`MountedSheet` is in the mount — the dark ground, the brackets, the stepped
`pixel-edge` drop. The paper itself is flat cream with nothing under the copy.

That is the same ruling the homepage-cleanliness slice applied to the Tonight
board, and it matters more here: the Tonight board is glanced at and this surface
is read. Aging on a newspaper belongs at the corners and the edges, never under a
paragraph or a score.

---

## 5. The commissioner review screen

The refresh answers the screen's six questions by **geometry** rather than by
paragraph. Nothing about the chain changed — see `§7`.

| Question | Before | Now |
|---|---|---|
| What state is this in? | a cream `SignPlate` at 11px | `StatusStamp` at stamp size, three inks for three meanings |
| Can it be approved or printed? | the fourth sentence of a paragraph, above a disabled button with no stated reason | a `WarningBlock` with a drawn glyph: *"Approving is not available"* |
| Why was it refused? | a 13px red caps line above 17px prose | `WarningBlock` title and body, both at reading size |
| What must happen next? | the same paragraph | the same block, under the same glyph |
| What exact values failed? | a bulleted list running kind, value and reason together in three mixed sizes | a **bordered ledger**: keys down the left, offending values right-aligned down the right, a rule between findings, the reason underneath |
| What would it look like printed? | a cream plate directly above cream paper | a dark `Plaque` above the mounted sheet |

Two further corrections came from looking rather than from the brief:

- **The draft's identity ran together.** `Draft 1 · set by the template press ·
  8f3c2b…` was one 12px string, and at 360 it wrapped mid-hash. The digest is what
  an approval is *against*, so it takes its own line in the `machine` role, which
  breaks anywhere by design.
- **Four hand-assembled label/input pairs had drifted** — two labels at 12px, one
  at 17px, one at 18px, three different top margins. `DeskField` is one field, so
  a commissioner cannot tell which form they are in from the size of the label.

---

## 6. The printed Slice

- **The nameplate is two deliberate lines.** `TONY’S TUESDAY SLICE` at 26px
  Silkscreen is 361px — wider than the text column of every supported width, and
  wider than it at 22px too (306px against a 290px column at 360). So it has
  *always* wrapped, wherever the browser chose. Choosing the break is what makes
  it a nameplate instead of a wrapped string; shrinking the letterforms until the
  browser stops is the mistake, not the fix.
- **The masthead carries a flag** on a title or record week — `MASTHEAD_FLAG`, a
  presentation map over `Edition['character']`, which the *renderer* derived. The
  championship issue and a Tuesday in October used to print an identical
  nameplate, differing only in the size of the headline beneath.
- **The board is a ledger.** Scores were set two pixels smaller than the names
  beside them, so the column a reader is actually scanning was the quietest thing
  in the row.
- **A drawn game no longer says one side won.** `leftWon` is false on a tie and
  the board printed *"A over B"* for a game neither side won. `RenderedScore` has
  carried `tie` since it was written. `components/slice/newspaper.test.tsx` fails
  on the old behaviour.
- **The winner's score is the display face's real 700.** VT323 ships at 400 only,
  so bolding a *name* has the browser synthesise the weight and smear the glyphs —
  blurry type on a pixel face. Which side won is carried by the word between the
  names; the weight is reinforcement.
- **The empty rack wears the same masthead** as the printed issue. Dropping it
  made the shelf read as a different surface from the one that carries the paper.

---

## 7. What did not change, and how that is held

This was a presentation refresh. Every one of these is asserted rather than
claimed — `components/slice/presentation.test.tsx` is the file.

- Routes, fact packets, validation, approval and refusal behaviour, draft
  identity, publication state, review history, database contracts,
  server-authoritative rules, generated content, auditability, deterministic
  fixtures and accessibility semantics.
- **`Edition` is untouched**, so no content hash moved and no stored draft needs
  migrating. The masthead flag is derived from a field that already existed.
- **No presentation component computes a fantasy fact.** Scores arrive as strings
  already validated against the packet; significance arrives unrounded and
  unranked; publishability arrives as a boolean the database decided. The tests
  assert that the Slice's presentation modules import nothing from `lib/stats`,
  `lib/slice/select`, `lib/slice/packet` or `lib/slice/validate`, and that they
  contain no arithmetic on a fact.

---

## 8. Deliberately not done

- **The Tonight board's type is still fixed px**, sized from the vocabulary
  (`headlineQuiet` hero, `bodyCompact` detail) and verified to fit
  `TONIGHT_FIELD` at all three widths. It arguably belongs in room units like the
  banner rail's year — the field is painted and scales, the type does not — but
  that is a Tonight-board change on the homepage, not a Slice change, and it is
  recorded as visual debt rather than absorbed here.
- **No new art was requested or required.** Frames, brackets, plaques, ledgers,
  dividers and the warning glyph are component work in CSS on whole pixels.
  Batch B remains deferred and non-blocking.
- **`ShowInteractables` is still dead code.** Its 9px type was migrated with
  everything else; deleting the component is a different decision, and the
  `legacy` gate already fails if it ever renders.

---

## 9. Tony's clipping — still open, and the detail that matters

Not touched by this slice, and kept here so the detail is not lost:

> **Tony's bottom half clips specifically at the moment his glow disappears.**

That timing is the finding. It is **not** generic idle clipping, and it is not
the 2px `showing-taps` lift that `checkTonySteady` already closed (visual debt 7)
— that one moved him on a 260ms ramp at 1600ms and 4900ms and is gone. What is
described here is coincident with the **glow-off transition** itself.

When the homepage is next touched, investigate that transition specifically:
class removal · opacity transition · mask · clipping boundary · ancestor overflow
· pseudo-element bounds · compositing-layer teardown · z-index change · the
`drop-shadow` filter being removed · any transient transform or raster
resampling. The existing hydration and whole-pixel fixes are to be preserved.

Recorded in `docs/VISUAL_DEBT.md` so it survives this session.
