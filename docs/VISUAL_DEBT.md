# Visual debt

**Standing commissioner ruling, 2026-07-30.** Minor, cosmetic, non-blocking polish issues are recorded here rather than lost. A defect too small to interrupt the current implementation is not too small to fix.

**This list should shrink over time, not grow forever.** An item that has sat here through three milestones is either not real or is not minor — decide which and either fix it or delete it with a reason.

Blocking defects do not belong here. They go to `VISUAL_ACCEPTANCE.md`'s gates, fail the build, and get fixed before the slice merges.

---

## How an item gets here

Visual QA finds something that is genuinely worth improving and genuinely not worth stopping for. Record it with:

- **where** — the route or component, and the width it shows at
- **what** — one sentence, specific enough to act on without re-finding it
- **why it waited** — so the next reader can judge whether that reason still holds
- **the screenshot**, when the run that found it is still in an artifact

---

## Open

| | Where | What | Why it waited |
|---|---|---|---|
| 1 | `/counter/collection`, empty state | Roughly two screens of scroll for a manager who owns nothing. Now photographed (`demo-collection-empty`) and the pacing is defensible — the earlier note's "eight screens" was an estimate, not a measurement. Left open only as a question of *rhythm*, not of legibility. | The information is right and now readable; changing the length touches `18 §4`'s ruling that the whole catalog is shown. |
| 2 | Reveal plate, all widths | The collectible is 46 units against a plate that is now six or seven rows tall. It is on the plate's axis and standing on it, so it no longer reads as accidental — but the *caption still outweighs the thing it captions*. | Waiting on real collectible art. All 24 items are `art_status: placeholder`, so tuning focal weight now means tuning to a tagged parcel that is about to be replaced by 24 different silhouettes. |
| 3 | Tony's dialogue | The order pad landed in #30 and reads as Tony's. The *timing* of its arrival and dismissal has never been reviewed against the reveal's timing — two transient things that must never compete (`MANDATE §6`). | Needs the reveal states, which only became photographable in #36. Now unblocked. |
| 9 | The parlor ceiling | **A scorch-like smear and dashed grid lines** in the upper right, above the rear doorway. Named by the *clean pixel art* direction and deliberately **not** fixed by the homepage-cleanliness slice: the despeckle that cleaned the wall and the alcove dashed the ceiling's one-unit diagonal grid further, because a dashed diagonal is what a lone-pixel filter cannot tell from noise. The rectangle is recorded in `scripts/clean-parlor-surfaces.ts` as `EXCLUDED_CEILING` with the evidence. | It needs a **different mechanism** — a targeted regeneration of that surface, not a filter — and that is a bigger piece of work than the slice it was found in. It is also above eye level and behind nothing a manager reads. |
| 10 | The room, every Display and the Toy | **`.affordance-on-request` is dead CSS.** `globals.css` draws Displays and the Toy the same outline the Doors wear, hidden until asked for — and **no component renders the class**, so `look around` reveals nothing but Tony's own edge. Found while removing the transform lift, which turned out to be `showing-taps`'s only rendered effect in the entire app. | Wiring it is a behavioural change to every Display and the Toy, and it collides with `checkOnlyTheTrayGlows`, which asserts nothing but the tray glows in the idle room and samples at 2500ms — inside the reveal window. Both need deciding together, which is a `RoomDisplay` pass rather than a line of JSX. |
| 11 | `/admin/slice/<version>`, the record | **The audit history shows the order of decisions but not when they happened.** *"When was this approved"* is a real question about an audit trail, and the answer is in `slice_reviews.occurred_at` but not on the screen. | Formatting a timestamp here means committing to a convention — the league's day is Eastern (`lib/parlor/season.ts`) and no user-facing surface formats a date yet — and inventing one inside a slice about publication governance would be the wrong place to decide it. The sequence and the actor, which are what a reviewer reads first, are both shown. |
| 4 | The prediction panel, all widths | The board's panel and Tony's order pad can be open at once. The pad sits **behind** the panel's scrim so nothing overlaps and nothing is unreadable — but two transient surfaces are up together, which `MANDATE §6` says must never happen. The driver dismisses the pad before opening the board, so every board screenshot is clean; a manager who taps the sign while Tony is mid-sentence is not. | Small, and the fix is a decision rather than a repaint: either the pad closes when a Display opens, or the room only ever offers one transient at a time. Both touch every Display, not just this one, so it belongs with a pass over `RoomDisplay` rather than inside the stakes slice. |

## Closed

| | What | Closed by |
|---|---|---|
| 7 | **The homepage, seconds after load — Tony clipped briefly.** Observed hosted by the commissioner, and a genuinely separate defect from the hydration mismatch: `.showing-taps .tony-mark` lifted him **2px** over a 260ms eased transition, on at 1600ms and off at 4900ms. The counter's cut moved two sprite rows up his apron and he was resampled at fractional offsets on both ramps | this session. The reveal keeps its meaning as an alpha-derived warm edge and moves nothing. `checkTonySteady` samples him every animation frame across five passes at all three widths, and **fails on the old CSS with 12 failures** — `dy moved 2.00px`, timestamps straddling the reveal. `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9` |
| 8 | **The homepage read as burnt, scratchy and muddy** — the Tonight board's face a dithered amber vignette behind its own text, the alcove behind Tony a scorched brown checker at his own value | this session. The board's face is a flat cream writing surface, the wall and the alcove are despeckled, the alcove is a value step darker, and `.board-paint`'s outline went with the ground that needed it. Mechanism per surface: `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9`. **The ceiling is item 9 and is open** |
| — | **Half a pixel on every sentence Tony has ever spoken.** `tony-talks` ran on `steps(2, end)`, and a CSS timing function applies between each *pair of keyframes* rather than across the animation — so it stepped twice in each half of `0 → -1px → 0` and rendered `0, -0.5, -1, -0.5` | this session, `step-end`. Found by the frame sampler on its first green run, at all three widths. No screenshot could have seen it |
| 5 | **The Back Hall was a menu card** — three stacked `PixelPanel`s with headings, which `18 §5` forbids almost verbatim | this session. It is a room now: one portrait scene, three hit regions in room units, no scroll. `docs/BACK_HALL_BOUNDARY.md §8` |
| 6 | **The parlor's intermittent React #418 hydration mismatch** — `SpokenLine` changed its element structure on a timer, and `TonyToy` set that timer to zero on every load after the first | this session. See below |
| — | `LEGENDARY` unreadable on cream — 2.24:1, on the plate at the centre of the milestone's biggest moment | #36, and now a build-failing gate |
| — | Common's rarity word at 3.42:1 on both grounds | #36 |
| — | Unowned collection spots reading as cards that failed to load | #35 |
| — | The Showcase wall as ten near-black rectangles | #35 |
| — | Set progress eating a third of the screen above the shelf | #35 |
| — | `ReturnPlate` labelled "back to the counter" while on `/counter` | #35 |
| — | The reveal ended at a label — no meaning, no set progress, no way to want another | #38 |
| — | The loop ended in a silent room: bare tray, no price on anything, nothing to do next | #38 |
| — | The collectible stood on the right-hand quarter of its own nameplate — the tray's centre is 43 units right of the room's, and only a screenshot showed it | #40, and now pinned in `objects.test.ts` |
| — | The offer was `ANOTHER — 50` beside a link: a price next to a button, which is a store | #40 — Tony says it |
| — | The tier rail stacked a 10px word and a 13px count two pixels apart in a 52px cell — four readable controls reading as one dense block | #42 — 56px, `gap-1`, count at 14px; no type shrank |
| — | Tony repeating "first one's free" to a manager who had just opened it — the per-day greeting cache outliving the moment that selected the line | #41 — the repeat re-checks its tags |
| — | Twenty-four unowned shelf names at 14px / 55% cream written straight onto the parlor art — legible over the booths, close to invisible over the counter's checker. The first screen of the shelf for anybody who owns nothing | #40 — 15px at 80% with a hard one-pixel outline, no card |
| — | `/counter` as three identical stacked cream cards — one of them repeating the sentence three lines above it | #40 — one panel for the one thing you can act on; the rest is printed on the counter |
| — | Nine `reveal-*` states photographed a calm room and the run reported **passed**; the rarity-contrast gate was measuring nothing | #40 — the server was missing `DEMO_FIXTURES`, and `checkRevealPresent` now fails an empty reveal |
| — | *"Don't worry about it."* — the whole reveal of the Underground — at **9px** in `amber-mid/70` on cream, around 1.6:1, alongside 15px destination copy and a second 9px status line | #48 — the line is set like speech at 17px `ink-900`, the status labels at 12px `ink-500`, and the body copy at 17px. The panel *structure* was left alone on purpose: it is being replaced by a room, and polishing it further would be polishing something about to be discarded |


---

## How visual debt 6 was actually found

Worth keeping, because the recorded note pointed at the wrong thing and the
method that corrected it costs nothing.

The note said *"needs a run with the non-minified React build, because minified
`#418` names only 'HTML'."* **That was backwards.** `HTML` is not a placeholder
for a missing message — it is the error's **first argument**, and React puts one
of exactly two words there:

```js
// react-dom-client.production.js
function throwOnHydrationMismatch(fiber) {
  Error(formatProdErrorMessage(418, isText ? "text" : "HTML", ""));
}
```

`"text"` means a sentence differed between the server's HTML and the client's
tree. `"HTML"` means the **structure** did. The failing run said `HTML`, so the
leading theory — nondeterministic content selection changing Tony's line between
two renders — could not have produced it, whatever else was wrong with that code.

That narrowed the search to one question: *what in this room changes the shape of
the tree?* One thing did. `SpokenLine` rendered a single `<span>` at rest and two
siblings with a nested caret while typing, and `TonyToy` passed `retypeOnChange`
unconditionally — so on every parlor load after the first, `arrived` was false,
the delay was **zero**, and the swap happened as close to hydration as a timer
can get. `receipt` runs eighth; seven loads before it had already primed that.

Three things came out of it, and only the first is the bug:

1. the structure is now invariant — same elements typing or resting, caret hidden
   by class rather than removed
2. the greeting no longer retypes on a return visit, which is what
   `spoken-line.tsx` said it did all along
3. `Math.random` is a lint error now. It was never the cause here, and it was
   still a real breach of a standing constraint, sitting inside a server render

**The lesson is the cheap one:** read the error's own arguments before believing
a plausible cause. Ten minutes in `node_modules` beat an afternoon of
reproduction attempts — the mismatch never reproduced locally across a full
sweep, ten timed reloads, fifteen at 10x CPU throttling, and eight against a
development build.
