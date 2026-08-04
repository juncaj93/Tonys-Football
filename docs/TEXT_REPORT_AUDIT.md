# Text-heavy reports — the audit, and how it closed

**Commissioner ruling, 2026-08-04.** Tony's text-heavy reports should read as *intentionally designed physical artifacts inside Tony's Pizza, not normal web pages with a pixel font placed on top.* A supplied reference screenshot is the **quality and hierarchy benchmark** — not approved art, not a layout specification, and not a source to copy text from.

This file records what the audit found and how each item closed. **The queue is empty** — seven entries, six implemented and one withdrawn with its reasoning kept.

---

## 1. The surfaces, and how far each already is

| Surface | State |
|---|---|
| **The press desk** (`/admin/slice/[versionId]`) | **Closest to the benchmark.** Status plaque, `STAFF ONLY` plaque, metadata strip, warning glyph and block, findings ledger. This is the worked redesign the ruling refers to |
| **The desk queue** (`/admin/slice`) | Uses the same vocabulary — queue rows, sections, stamps |
| **The Slice** (`/slice`) | Mounted sheet, masthead, printed rules, restrained palette. Hierarchy was the weak part and is addressed — §3 |
| **`/counter` statement** | New, on a `PixelPanel` using `Ledger`. Small, and correct for its size |

The primitives already exist and are shared: `components/scene/text-surface.tsx` carries the mounted sheet, printed rules, section headings, metadata strips, plaques, the press masthead, the score deck, the warning glyph and block, and the ledger. **There is no need for a parallel report system**, and building one would be the mistake `text-surface.tsx`'s own header warns about — folding two genuinely different objects, a newspaper and a proof sheet on a clipboard, into a generic card.

## 2. Fixed in this pass

### The score deck broke inside a team

The deck arrives as one string — `Matty B 164.74 — Nick 130.78` — and set as ordinary text it wrapped wherever the line ran out. On 2025 week 7 at 390px that landed between `Nick` and `130.78`: a manager on one line, their score on the next. Both lines are grammatical and neither is complete.

`ScoreDeck` now splits on its own separator and keeps each side unbreakable, so the break falls **between the two teams** and the dash trails the first the way a continued line does. The string is not modified and nothing is reformatted — `MANDATE §9` still applies: the component may choose where a line breaks and may not touch what it says. A deck with no separator (`monday-comeback` is a sentence about a deficit) falls through and wraps as prose.

`checkDeckWrap` measures it from client rects at every state and width, because it is invisible in a screenshot review unless the reviewer knows what the deck said, and it depends on the names in that week's fixture — so it appears and disappears as the demo editions change. **It fails on the old build at all three widths.**

## 3. Closed — the Slice's hierarchy

Ranked by how much each costs a reader.

1. ~~**The lede headline does not dominate its deck.**~~ **Withdrawn on inspection, and worth recording why rather than deleting.** The first read of the screenshot was that the deck competed with the headline. It does not: `headlineLoud` is 26px against the deck's 19px, which is a clear step, and the deck is **deliberately** loud — `ScoreDeck` has its own rules above and below because it is *"the one line a reader scans for and prose either side of it would swallow it"*. That is a recorded decision, and the secondary stories' quiet decks are quiet because they are secondary, not because the lede's is wrong.

   What actually made the lede look flat was the deck **occupying two lines**, which §2 has now fixed. Re-photograph before re-opening this: an audit item that re-litigates a decision somebody already made and wrote down is worse than no audit item.
2. **The rack stamp is a stamp now.** ✅ It was a centred line of small caps in the sheet's quietest ink, sitting under its loudest rule — so the one fact that changes what the whole page *is* (*"this is last season's paper"*) was the least visible thing on it.

   It reuses `Plaque`, the primitive the desk already presses onto a proof sheet, tilted one degree because a stamp pressed by hand is never square. `max-w-full`, because the one stamp string that exists fits at 360 and that is not the same as fitting — a longer one would have pushed the plaque past the sheet's edge and produced a horizontal scrollbar on a page of prose.

   **The reader-facing states are only these**, and the original entry overstated the problem: an issue on the rack, a historical fallback, an empty rack in preseason and one in the offseason. Draft, waiting, approved and refused are *desk* states — a manager never sees them — and treating them as Slice states would have meant inventing surfaces nobody reaches.
3. **The board's scores separate.** ✅ `131.84–123.38` set tight read as one nine-figure number, which is the opposite of what a results board is for. The separator gets 3px a side — margin rather than space characters, because the value is `whitespace-nowrap` and two spaces of a wide pixel face would have pushed the names at 360 for five times the cost.
4. **The lead is closed by a heavier rule.** ✅ Every section used the same rule, so a reader met four equal chunks and had to work out from the words which one was the story. `PrintedRule`'s contract already reserved `heavy` for *"closes a masthead or opens a colophon"*; this is the third thing on the sheet that closes. It falls on whichever section comes first, so an issue with no secondary story still gets it.

## 4. Closed — the press desk

1. **`Staff only` is wood, not red.** ✅ An earlier pass had moved it *after* the status stamp, which fixed the reading order and left the loudness backwards — a red plaque beside a cream one is still what the eye lands on first, so on an approved draft the loudest object on screen was a permanent fact about the door. Red on this surface means **refused**, and it is now spent only there.
2. **The digest recedes.** ✅ It sat at the same weight as the draft line above it, so a sixteen-character hash nobody reads unless comparing two of them had equal billing with the sentence saying which draft this is. Quiet ink, same role — still selectable, still complete. `set by the` was also dropped from the draft line, which is a wrap fix: at 390 it orphaned `PRESS` on a second line.
3. **The issue's headline is at the top.** ✅ The screen went from identity straight to the verdict, so *"what is this issue about"* — the question a reviewer is here to answer — could only be answered by scrolling past the findings to the preview. It is the same string the paper prints, read off the edition already on `detail`; nothing is derived, and `headlineQuiet` keeps the status stamp the first thing read.

## 5. What remains

**Nothing from this audit.** All six open items are closed; the seventh was withdrawn in §3.1 with its reasoning.

Two things are deliberately *not* queued, and both are absences rather than omissions:

- **No new report primitives were built.** The audit's finding was that they already exist, and every change above reuses one — `Plaque`, `PrintedRule`, `MetadataStrip`, `Ledger`. A parallel system would have been the mistake `text-surface.tsx`'s header warns about.
- **No gate was added for the six.** The deck-wrap defect earned one because it was *invisible* in review and depended on that week's fixture names. These six are visible in a screenshot at any width, and gating implementation trivia — a specific margin, a specific tone — would produce brittle tests that fail on the next legitimate change. The evidence is the screenshot loop at 390, 375 and 360, which is what `MANDATE §6` asks for.

## 6. Rules this pass must keep

- **Nothing behavioural moves.** Slice facts, story selection, validation, the Tuesday job, review and approval, reward calculations, active-manager filtering, deterministic output and publication rules are all out of scope. `components/slice/presentation.test.tsx` enforces the display/logic boundary and must keep passing untouched.
- **No new font sizes.** `lib/design/type.ts` is six sizes and `lib/design/typography.test.ts` plus `checkTypeFloor` enforce it in two halves. A report role is a new *name* for an existing size, never a new size.
- **Do not weaken existing gates**, and preserve the debt-12 quarantine instrumentation.
- **Ornate framing is for reading surfaces only** — reports a manager stops and consumes. Not labels, not menus, not every small string.
- **Readable at 390, 375 and 360**, at true device scale. The audience includes people around 60; small type is never the way to fit more content.
