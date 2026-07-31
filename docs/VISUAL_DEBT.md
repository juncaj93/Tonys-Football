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
| 6 | The parlor, `@390`, **intermittently** | **React #418 — a hydration mismatch, and it is real rather than flaky.** It failed the console gate on PR #49, which contains **no code at all**, and the identical tree passed on #48's run and on a full local sweep. So it is a **race**, not a deterministic defect, and re-running until green is the wrong response. What is known: it is attributed to the `receipt` state, which runs at position 8 — **before every state M3 added**, so nothing in #48 can be upstream of it. Every `window`/`sessionStorage`/`matchMedia` call in the parlor's client components is already inside `useEffect`, so the obvious cause is ruled out. This is the **second** instance of the same shape: #46 found one against `demo-collection-empty`, a page with nothing to do with the counter, because signing in redirects through the parlor and the stats aside drew a fresh line on every render. That fix was per-cause; this is the symptom returning from somewhere else. Not reproducible locally after a deliberate hunt (see below), and a guessed fix for a race is worse than a recorded one. **Do not dismiss as flaky**: the gate is working, and the mismatch is somewhere a real manager's first screen renders. |

### What has already been ruled out for debt 6

Recorded so the next session starts from evidence instead of repeating the hunt. **None of this reproduced it**, which is the finding.

| Tried | Result |
|---|---|
| Six parlor round-trips (`/counter` → `/`) in **dev mode**, where React is unminified and reports the diffing element | no hydration message of any kind |
| The driver's **exact first eight states** in order, from a fresh sign-in, in dev mode — `tony-dialogue` · `idle` · `tonight-board` · `banner-completed` · `banner-current-tbd` · `rack` · `prediction` · `receipt` | clean |
| The same eight states, **three times, on a production build against a freshly reset and seeded database** — the faithful environment, since that is what CI runs | clean all three rounds |
| Source audit of every `window` / `sessionStorage` / `matchMedia` / `performance.now` call in the parlor's client components (`arrival` · `spoken-line` · `room-object` · `counter-tray` · `tony-toy` · `banner-rail`) | all inside `useEffect`, so none runs during the hydrating render. The obvious cause is not the cause |
| Whether the per-day greeting or the stats-aside cache could diverge | both are **database-backed and server-side**; a server component cannot re-render on the client, so neither can produce a hydration mismatch directly |

**The repro harness**, worth rebuilding rather than guessing at: one Playwright context, sign in as Alex at `/door` by name, then walk the eight states above through the driver's own helpers, collecting `console` and `pageerror` events matching `/hydrat|did not match|#418|server rendered/i`. Attribute each to the state in flight.

**The most promising untried lead:** the content Tony says differs run to run — a greeting is drawn at random from the eligible set on the first visit of a day, and CI gets a fresh database every run while local runs often do not. That makes *which line is drawn* the most obvious thing that varies between a red run and a green one, and it is worth pinning the drawn line and replaying it rather than hunting the race again.
| 1 | `/counter/collection`, empty state | Roughly two screens of scroll for a manager who owns nothing. Now photographed (`demo-collection-empty`) and the pacing is defensible — the earlier note's "eight screens" was an estimate, not a measurement. Left open only as a question of *rhythm*, not of legibility. | The information is right and now readable; changing the length touches `18 §4`'s ruling that the whole catalog is shown. |
| 2 | Reveal plate, all widths | The collectible is 46 units against a plate that is now six or seven rows tall. It is on the plate's axis and standing on it, so it no longer reads as accidental — but the *caption still outweighs the thing it captions*. | Waiting on real collectible art. All 24 items are `art_status: placeholder`, so tuning focal weight now means tuning to a tagged parcel that is about to be replaced by 24 different silhouettes. |
| 3 | Tony's dialogue | The order pad landed in #30 and reads as Tony's. The *timing* of its arrival and dismissal has never been reviewed against the reveal's timing — two transient things that must never compete (`MANDATE §6`). | Needs the reveal states, which only became photographable in #36. Now unblocked. |
| 5 | `/back-hall`, all widths | The Back Hall is three stacked `PixelPanel`s with headings — *"a menu card"* almost exactly as `18 §5` forbids. The spec's shape is one compact pixel-art scene with two environmental choices. | ~~Blocked on art.~~ **Unblocked by commissioner ruling, 2026-07-31**: *"Do not block all Back Hall development on final art… use deliberate in-world placeholder architecture."* The character system has since shown what that looks like — a drawn stand-in at the right size rather than a sign — so the "it would be built twice" reasoning no longer holds. **This is the next executable slice**, and the typography fix below deliberately did not touch the structure. `docs/BACK_HALL_BOUNDARY.md §7.1`. |

## Closed

| | What | Closed by |
|---|---|---|
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
