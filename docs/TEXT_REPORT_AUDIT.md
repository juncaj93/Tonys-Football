# Text-heavy reports — the audit, and what is still open

**Commissioner ruling, 2026-08-04.** Tony's text-heavy reports should read as *intentionally designed physical artifacts inside Tony's Pizza, not normal web pages with a pixel font placed on top.* A supplied reference screenshot is the **quality and hierarchy benchmark** — not approved art, not a layout specification, and not a source to copy text from.

This file records what the audit found, what has been fixed, and what is still open. It is the queue for the rest of the pass.

---

## 1. The surfaces, and how far each already is

| Surface | State |
|---|---|
| **The press desk** (`/admin/slice/[versionId]`) | **Closest to the benchmark.** Status plaque, `STAFF ONLY` plaque, metadata strip, warning glyph and block, findings ledger. This is the worked redesign the ruling refers to |
| **The desk queue** (`/admin/slice`) | Uses the same vocabulary — queue rows, sections, stamps |
| **The Slice** (`/slice`) | Mounted sheet, masthead, printed rules, restrained palette. **Hierarchy is the weak part** — see §3 |
| **`/counter` statement** | New, on a `PixelPanel` using `Ledger`. Small, and correct for its size |

The primitives already exist and are shared: `components/scene/text-surface.tsx` carries the mounted sheet, printed rules, section headings, metadata strips, plaques, the press masthead, the score deck, the warning glyph and block, and the ledger. **There is no need for a parallel report system**, and building one would be the mistake `text-surface.tsx`'s own header warns about — folding two genuinely different objects, a newspaper and a proof sheet on a clipboard, into a generic card.

## 2. Fixed in this pass

### The score deck broke inside a team

The deck arrives as one string — `Matty B 164.74 — Nick 130.78` — and set as ordinary text it wrapped wherever the line ran out. On 2025 week 7 at 390px that landed between `Nick` and `130.78`: a manager on one line, their score on the next. Both lines are grammatical and neither is complete.

`ScoreDeck` now splits on its own separator and keeps each side unbreakable, so the break falls **between the two teams** and the dash trails the first the way a continued line does. The string is not modified and nothing is reformatted — `MANDATE §9` still applies: the component may choose where a line breaks and may not touch what it says. A deck with no separator (`monday-comeback` is a sentence about a deficit) falls through and wraps as prose.

`checkDeckWrap` measures it from client rects at every state and width, because it is invisible in a screenshot review unless the reviewer knows what the deck said, and it depends on the names in that week's fixture — so it appears and disappears as the demo editions change. **It fails on the old build at all three widths.**

## 3. Open — the Slice's hierarchy

Ranked by how much each costs a reader.

1. ~~**The lede headline does not dominate its deck.**~~ **Withdrawn on inspection, and worth recording why rather than deleting.** The first read of the screenshot was that the deck competed with the headline. It does not: `headlineLoud` is 26px against the deck's 19px, which is a clear step, and the deck is **deliberately** loud — `ScoreDeck` has its own rules above and below because it is *"the one line a reader scans for and prose either side of it would swallow it"*. That is a recorded decision, and the secondary stories' quiet decks are quiet because they are secondary, not because the lede's is wrong.

   What actually made the lede look flat was the deck **occupying two lines**, which §2 has now fixed. Re-photograph before re-opening this: an audit item that re-litigates a decision somebody already made and wrote down is worse than no audit item.
2. **No status treatment on the Slice itself.** `PressMasthead` accepts a `stamp`, and `/slice` passes one only in the offseason. Draft, published, historical and preseason editions are told apart by their *content*, not by anything designed. The ruling asks for states that "feel intentionally different".
3. **The board's scores run together.** `131.84-123.38` has no space around the separator, so two four-figure scores read as one nine-character number at a glance.
4. **One rhythm for the whole page.** Every block is full-measure and stacked, so a long issue has no anchoring — the benchmark's "enough visual drama that reading the report feels rewarding" is the quality most clearly missing.

## 4. Open — the press desk

1. **Two plaques compete at the top.** `WAITING ON YOU` (cream) and `STAFF ONLY` (red) stack, and the red one is louder while being the less important of the two. Status should dominate; `STAFF ONLY` is a context label.
2. **The metadata block is three lines at one weight** — season/week, draft/press, and a raw content hash all at `metadata`/`machine`. The hash is the least important and gets equal billing, and `DRAFT 1 · SET BY THE TEMPLATE PRESS` wraps awkwardly at 390.
3. **No headline.** The screen goes from metadata straight to the verdict, so *"what is this issue about"* is only answerable by scrolling to the preview.

## 5. Rules this pass must keep

- **Nothing behavioural moves.** Slice facts, story selection, validation, the Tuesday job, review and approval, reward calculations, active-manager filtering, deterministic output and publication rules are all out of scope. `components/slice/presentation.test.tsx` enforces the display/logic boundary and must keep passing untouched.
- **No new font sizes.** `lib/design/type.ts` is six sizes and `lib/design/typography.test.ts` plus `checkTypeFloor` enforce it in two halves. A report role is a new *name* for an existing size, never a new size.
- **Do not weaken existing gates**, and preserve the debt-12 quarantine instrumentation.
- **Ornate framing is for reading surfaces only** — reports a manager stops and consumes. Not labels, not menus, not every small string.
- **Readable at 390, 375 and 360**, at true device scale. The audience includes people around 60; small type is never the way to fit more content.
