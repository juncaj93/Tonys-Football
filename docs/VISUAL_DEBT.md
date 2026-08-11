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
| 14 | The champion pennants, 360 | **The season year is 10.1 CSS px** — the smallest text in the product and the only thing exempt from the `type-floor` gate. It is painted on an 18 × 15 unit pennant and sized in room units so it scales with the artwork; there is no arrangement of that geometry that reaches thirteen. Raised from 7 to 9 units this slice (8.2px → 10.1px), which is as far as the fabric goes. | It is a two-digit mark rather than copy — the champion's *name* is in the panel that opens, and `hotspots.test.ts` guarantees every screen is reachable without reading it. Fixing it properly means a wider pennant, which is `art/B2_CHAMPION_BANNER.md` and a room slice. The exemption is **declared in the DOM** (`data-environmental-type`) and the driver fails if a second kind ever appears, so it cannot quietly become the way small type gets past the floor. |
| 16 | Any route, any width — the visual gate itself | **A residual React `#418` survived the fix that closed item 12, and the caret account was therefore not complete.** Two sightings on a branch that changes only PNG bytes, `art/palette.json` and the art scripts — nothing in the React tree — at `/admin/slice/<version>` @375 and `/` @360, 96ms and 164ms after navigation. **Not deterministic**: the branch has now swept clean **five times** around those two sightings — 1,584 captures, 2 sightings, roughly **1 per 792**, or a quarter-sighting per sweep. The estimate has fallen with every clean run, which is what an estimate off two events does; treat the order of magnitude rather than the figure. Item 12's rate was 1 per 209, so the camera was a real cause and cut it by more than half — the closure's *"this accounts for every recorded property"* was one claim too strong. | The evidence needed next is the element name, and it can only come from a **dev build**. The census added for exactly this — `pending`, `bodyChildren`, `headChildren` — has now been shown to be **taken too late to answer the question**, and that is the one new thing this session established.  **Quarantined 2026-08-06, on commissioner approval** (`scripts/visual-qa-quarantine.ts`). On PR #69 it failed the gate twice — `/timeline` @390 and `/` @360 during `banner-completed` — and **that branch changes no file that renders `/`**, which is the quarantine header's own test of a gate that has stopped protecting anything. The row is narrow (minified `#418` with `args[]=HTML` only) and the ceiling stays **2**, so a newly introduced deterministic mismatch — which fires once per width — still fails on its first appearance. Every sighting is still recorded, counted and printed. **A new negative result:** 180 local captures against the same production build at **8x CPU throttle**, every response asserted 200, produced **zero** sightings — so *slowness alone is not the cause*, which was the obvious hypothesis and is now eliminated. It has still never been seen outside a hosted runner. See below. |
| 19 | `/back-hall?open=none`, all widths — a shut door's own answer | **Tapping the shut stairs shows a line nobody can read, and at 390 it is not on the screen at all.** `ShutDoor` renders its in-world answer 8 room units below the door's rectangle; the stairs end at `y 542`, so the panel's top lands at **670.3px in a 664px viewport** at 390, at 644.5px at 375 with all but 19px of its 68px height below the fold, and at 618.8px at 360 with the bottom 22px clipped. Measured by tapping, on a production build — `docs/evidence/back-hall/README.md`. `18 §6.3` requires a locked door to answer *in world*; an answer off the bottom of the screen is the same as no answer, which is the "coming-soon badge" failure arrived at from the opposite direction. | **Unreachable today and one line from being reachable.** `rooms` is open, so no real manager can tap a shut stairwell — but shutting it again is a single boolean in `lib/flags.ts` and `BACK_HALL_BOUNDARY §5` photographs that state precisely because it is the one a revert produces. **No gate could have caught it:** `back-hall-shut` is captured without tapping anything, so the panel is at `opacity: 0` in every screenshot the driver has ever taken. Fixing it properly means moving the stairs' rectangle up, which is the Back Hall art slice's job (`OPEN_ITEMS` **A6**) — it is recorded as a **hard constraint** on the new geometry (`BATCH_G §3.1`: a lockable door must end above `y 465`) rather than patched in isolation, because patching it now moves a rectangle that is about to move anyway. The curtain's line is unaffected at all three widths. |
| 18 | `/rooms` and `/rooms/[userId]`, all widths — the manager figure | **The manager sprite is engineering-closed and product-unaccepted, and those are two different things.** Item 17 below closed the *engineering* question on 2026-08-10 by measurement: the canvas is `112 × 168`, one sprite unit is one room unit, and the density defect it was filed for is genuinely gone. **After that work landed, the commissioner looked at the result in production and reported that the sprites still look visually bad.** That reaction is about art direction and product quality, not about density, and **nothing in item 17 answers it.** ⚠️ **Do not read item 17's closure as evidence that the art direction was accepted — it is not, and this row exists to make that impossible to conclude by accident.** | **Waiting on evidence, and the evidence is specific.** Three things are needed before another implementation pass, and none of them is code: (1) a **live production screenshot at actual iPhone scale** — the sweep photographs a local build and no production capture of a manager in a room exists in this repository; (2) a **concrete description of what reads wrong** — proportions, palette, face, silhouette, the shading, or the figure against the painted shell — because *"looks dumb"* is a true reaction that four different implementations could each claim to address; (3) a **visual quality target** the result can be judged against, the way the approved room reference and the approved manager reference were used in 2026-08-09. Until all three exist, any pass is a guess with a large blast radius: `MANAGER_SPRITE_BOUNDARY`'s two rules are load-bearing, `docs/CHARACTER_CUSTOMISATION_BOUNDARY.md` is **CLOSED**, and the painted-layer route is 132 files that would silently delete seven of eight hair colours unless a tinted-mask pipeline is built first (`OPEN_ITEMS` **A4**). **This row is not authorization to redesign anything** — it is the record that the question is open. |

## Closed

| | What | Closed by |
|---|---|---|
| 17 | **A manager standing in their own basement read as a cheap placeholder pasted over a rich room** — *"too simplistic, too flat, too geometric, not convincingly part of the same pixel-art world."* Reported against the delivered storeroom shell, with a generic sprite supplied as the quality benchmark | **2026-08-10, and by a measurement rather than by redrawing.** `ASSET_PIPELINE`'s rule 4 is *one art pixel is one room unit*; the painted shell keeps it exactly, every collectible keeps it exactly, Tony beats it at 0.82 — and the manager was at **1.75**, the only thing in the world drawn coarser than the world and then magnified into it. *Flat* and *geometric* are true and are also what any drawing looks like in that position, so no care spent at `64 × 96` could have fixed it. The canvas is now `112 × 168`, which is `roomObject('manager').rect` exactly, with a form-shading pass, a third tone taken from the locked palette's own ramps, per-layer contact shadows, selective outlines and a shadow on the floor. **No art was requested and none is needed**; the customiser is untouched and still `CLOSED`. Ten defects came out of the render loop, four of them invisible to a suite of seventy-six tests — including one shipped inside the pass itself, where a transposed index rendered the entire figure in its own outline colour and everything stayed green. `docs/MANAGER_SPRITE_BOUNDARY.md`. ⚠️ **Closed as an engineering item only.** The commissioner subsequently reported that the result still looks visually bad, which this closure does **not** answer and must not be read as having answered — that is **open item 18** above |
| 11 | **`/admin/slice/<version>` showed the order of decisions but not when they happened.** *"When was this approved"* is a real question about an audit trail, and the answer sat in `slice_reviews.occurred_at` and never reached the screen. Order is not a time: it says one thing followed another, not whether that was a minute later or a month. | **2026-08-06.** It waited because formatting a date commits the product to a convention and no user-facing surface formatted one, so deciding it inside a screen about publication governance would have been the wrong place. `lib/design/moment.ts` is that decision in its own file, the way `lib/design/type.ts` was for size: the league zone with its offset named (`6 Aug 2026, 3:02 PM EDT`), the month as a word because `06/08` is two different days, assembled from `formatToParts` so an ICU upgrade cannot change the text, and **no relative time** — `2 hours ago` is neither deterministic nor still true next year, and the export surface is pinned so adding one has to delete a test. |
| 12 | **An intermittent React hydration mismatch**, chased across two milestones: six states, five routes, three widths, roughly **one sighting per 209 captures**, never the same place twice, no reproduction, and — after eliminating client components, Suspense, streaming, metadata hoisting and every source of render-time nondeterminism — **no cause anywhere in application code.** Quarantined under a ceiling of two so the gate could still measure the diff | this session, from **direct evidence**. A dev sweep finally named the element, and it was `<input name="note">` carrying `style={{caret-color:"transparent"}}` on a screen whose own code sets no caret colour anywhere. **The cause was the camera.** Playwright's screenshot defaults to `caret: 'hide'`, and it hides a caret by writing `caret-color: transparent !important` into the **inline style of every element** and then removing it — measured with a `MutationObserver`: `["caret-color: transparent !important;", ""]` by default, `[]` with `caret: 'initial'`. A capture landing while React hydrates hands React a `style` attribute the server never sent. This accounts for every recorded property, including the one that never fitted any theory: **144 targeted document loads could not reproduce what a sweep hit every 209 captures**, because those probes loaded the pages and did not photograph them. Fixed by `CAPTURE` in `scripts/visual-qa-capture.ts`; the regression drives a real browser and asserts both that the driver's options mutate nothing **and** that the default does. Quarantine entry removed |
| 15 | **An infinite render loop on the homepage, for the whole time a box is open.** `RoomStage` memoises its context value on `up`, so a new `Up` is a new `stage`; `CounterTray` lists `stage` in a dependency array and calls `present` in the effect's body. `afterPresent` returned a **fresh object even when the surface asked for was already up** — so new object → new context → effect runs → new object, and React reports *"Maximum update depth exceeded"*. The line directly above it anticipated an effect re-firing (*"presenting itself again is allowed, so a component whose effect re-fires does not deadlock"*); returning a new object guaranteed it re-fires forever | this session. `afterPresent` returns `current` when the surface and the blocking flag both already match. **It survived two milestones for two reasons, and the second is the more useful finding:** the production build does not print that message, and the dev build — which does, and which double-invokes effects under Strict Mode — was recorded as un-sweepable by the visual driver. **That record was wrong.** `next dev` serves scripts under exactly `/_next/static/chunks/`, the same path `checkTonySteady` intercepts, and a dev sweep runs to 190 captures rather than aborting at state two. What actually stopped the earlier attempt was a **drained wallet** — `tray-reveal` buys a box and the checkpoint already warned that capturing it consumes one. `npm run visual:qa -- --state=tray-reveal` against `next dev` on a freshly seeded database failed at all three widths before the fix and passes after |
| 9 | **A scorch-like smear over the parlor ceiling**, above the rear doorway. The despeckle that cleaned the wall and the alcove could not be used: it dashed the ceiling's one-unit diagonal grid further, because a dashed diagonal is what a lone-pixel filter cannot tell from noise. The entry concluded the surface **"needs a targeted regeneration, not a filter"** | this session, and **that conclusion was wrong — no new art was required.** The reason no filter had worked is sharper than "the grid is dashed": the scorch and the grid are *painted in the same two browns* (`#7A4A2A`, `#9C6640`), so no rule that asks what colour a pixel is can separate them. They differ in **shape** — the grid is one unit wide, the scorch is thick connected blobs — and a **morphological opening** separates exactly that: erosion deletes anything a unit thick, so a line has no interior and never enters the mask, while a blob survives and is dilated back. A **purity guard** stops a core forming where the 3×3 neighbourhood is not all ceiling, which is what keeps the doorway beam, the neon sign and the pendant safe: their brown *edges* can always see the near-black beside them. **2,259 scorch pixels cleared, 1,714 grid pixels preserved**, every non-ceiling pixel in the rectangle byte-identical, no colour introduced, dimensions and alpha unchanged, idempotent by construction. Full-room regeneration was never attempted and would have been the riskier path — it discards the board-face repaint and the alcove shading this same file already carries. `clearCeilingScorch` in `scripts/clean-parlor-surfaces.ts`, with twelve tests. **Superseded 2026-08-06 and still closed:** the scorch was quantization damage, the `zone` family palette stops making it, and the repair script is deleted. The ceiling is clean with no filter run over it at all — `docs/PALETTE_FIDELITY_BOUNDARY.md §7` |
| 10 | **The withdrawn affordance vocabulary was still in the stylesheet.** `.affordance-on-request`, `.door-edge`, `.door-wash`, `.door-shadow` and `door-breathes` — about ninety lines of SVG `stroke` and `fill` meant to be painted along a hand-traced polygon per object, **all with zero consumers**, left behind when `18 §9.4` replaced authored silhouettes with `drop-shadow()` on the overlay's own alpha. The entry named one of the five. It also asked whether the class should be *wired up* so `look around` reveals the Displays and the Toy | this session. **Deleted, and it cannot be revived**: `§9.4` derives the glow from the overlay's own alpha and **five of the eight homepage objects are baked into the shell** — the board, the sign, the receipt, the tray and the rear doorway have no overlay and therefore no alpha, so an affordance for them means an authored rectangle, which `MANDATE §6` bans as *"persistent button rectangles"* and *"visible hitboxes"*. `18 §2` agrees from the other side: a Display's affordance is *"none — the content is the affordance"*. **And the half the entry did not name:** `.room-shape:focus-visible .door-edge` was how a room object showed keyboard focus, so with the polygons gone **the parlor had no visible focus indicator at all** — WCAG 2.4.7, photographed clean by the `keyboard-focus` state for as long as it has existed. The ring is real again and `checkFocusVisible` fails on the old build at all three widths. `docs/ROOM_TRANSIENTS_BOUNDARY.md §5` |
| 4 | **The board's panel and Tony's order pad could be up at once**, which `MANDATE §6` forbids. The pad sat *behind* the panel's scrim so nothing overlapped and nothing was unreadable — which is exactly why it survived every screenshot: the driver dismissed the pad before opening the board, so every board capture was clean and a manager who tapped the sign mid-sentence was not | this session. `RoomStage` arbitrates: five transient surfaces had five private owners and nothing could yield to anything. The yield selector matched one *value* (`[data-parlor-focus='reveal']`) and now matches the attribute's **presence**, so any surface makes the ambient room stand down and one added later needs no edit. A second defect fell out: `pointer-events: none` on the pad's wrapper was overridden by `pointer-events: auto` on the box inside it, so an **invisible dismiss button was hit-testable across the bottom of the room** for the whole reveal. `checkOneTransient` measures *visible* surfaces — opacity through every ancestor — on every state, and fails on the old build at all three widths. First photographed in `docs/evidence/room-transients/`. `docs/ROOM_TRANSIENTS_BOUNDARY.md §3` |
| 3 | **The order pad's timing had never been reviewed against the reveal's** — two transient things that must never compete (`MANDATE §6`) | this session, as a **review with a result rather than a repair**: they do not compete and already did not. The pad lands at 980 + 260 = **1240ms** and the affordance reveal begins at **1600ms**, 360ms apart, never overlapping. What the review leaves behind is an assertion that reads **both numbers from the files that own them**, so moving either without the other fails the build — which is the part an inspection could not. The dismissal side is now the 160ms yield above. `docs/ROOM_TRANSIENTS_BOUNDARY.md §6` |
| 13 | **The homepage, seconds after load — Tony's bottom half clips.** Reported hosted after debt 7 was closed, with the detail that it coincides with the glow disappearing. **The glow is innocent and that is measured**: `drop-shadow(0 0 0 transparent)` and `filter: none` are pixel-identical at 390, 375 and 360, the halo never touches a pixel inside his alpha, and a frame-by-frame screencast of the real ramp fades monotonically with no transient — which removes compositing-layer teardown, filter removal, raster resampling and z-index change in one measurement. What drops him is the **entrance**: the server renders him standing, `arrival.tsx` attaches `.arriving` from a `useEffect`, and `tony-steps-up` opens on `translate3d(0, 26%, 0)` under `animation-fill-mode: both` — so the backwards fill lands during the animation's own 80ms delay and he snaps down a quarter of his height, behind the counter drawn over him. Measured at 390 under an 8× throttle: **the room paints complete at 331ms and at 642ms he drops 62.42px**, taking three seconds to climb back | this session. `ENTRANCE_STALE_AFTER_MS` — an entrance may not start on a room that has been on screen longer than 250ms, measured from `first-contentful-paint`. Pass F of `checkTonySteady` delays the client bundle 700ms and **fails on the old build at all three widths** (62.42 / 60.02 / 57.62px). `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §10` |
| 7 | **The homepage, seconds after load — Tony clipped briefly.** Observed hosted by the commissioner, and a genuinely separate defect from the hydration mismatch: `.showing-taps .tony-mark` lifted him **2px** over a 260ms eased transition, on at 1600ms and off at 4900ms. The counter's cut moved two sprite rows up his apron and he was resampled at fractional offsets on both ramps | this session. The reveal keeps its meaning as an alpha-derived warm edge and moves nothing. `checkTonySteady` samples him every animation frame across five passes at all three widths, and **fails on the old CSS with 12 failures** — `dy moved 2.00px`, timestamps straddling the reveal. `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9` |
| 8 | **The homepage read as burnt, scratchy and muddy** — the Tonight board's face a dithered amber vignette behind its own text, the alcove behind Tony a scorched brown checker at his own value | this session. The board's face is a flat cream writing surface, the wall and the alcove are despeckled, the alcove is a value step darker, and `.board-paint`'s outline went with the ground that needed it. Mechanism per surface: `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9`. **Superseded 2026-08-06 and still closed:** all three surfaces were repairs to quantization damage, and the `zone` family palette removes the cause — the board's face is the painting's own cream rather than a fill, and the alcove is the painting's own value. The repair script is deleted; `scripts/shell-surfaces.test.ts` pins the properties it used to produce |
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

---

## Why one hydration census could not answer item 16, and what it takes two of

The `HYDRATION_REPORTER` in `scripts/visual-qa.mts` was added to item 12 for a
specific reason: `#418`'s production message names no element, so the census
records *the shape of the document at the instant React gave up* — how far
loading had got, and whether any Suspense boundary was unresolved. The stated
purpose was to distinguish **a component that renders differently** from **a
boundary spliced in mid-hydration**.

It cannot do that, and this is what item 16's two sightings established.

Measured directly against an ordinary load of the same routes:

| | `document.body.children` |
|---|---|
| a normal `/` | `div, div, script × 10` |
| the sighting on `/` | `script × 10, div, div` |
| a normal `/counter` | `div, div, div, script × 7` |
| the sighting on `/admin/slice/<version>` | `script × 17, div, div, div` |

**The scripts and the divs have swapped ends**, and the same thing has happened
in `<head>`: the sighting keeps the metadata tail (`meta, title, meta, meta,
link`) and has lost the leading `meta, meta` and six of the seven preload
`link`s.

That is not a partially-parsed document — parsing is in order. It is the document
**after** React has already discarded the server's tree and re-rendered it. The
RSC payload `<script>` tags are server-only artifacts with no client counterpart,
so they stay exactly where they were; the app's `div`s are re-created and
appended *after* them. `#418`'s own text says so — *"as a result this tree will
be regenerated on the client"* — and `console.error`, which the reporter patches,
runs after that regeneration rather than before it.

So the census is a photograph of the recovery, not of the mismatch.

**The reporter now takes two.** `earliestBody` / `earliestHead` are the first
non-empty census the page manages to take, with `earliestAtMs` beside them, and
the reporter stops sampling the moment it has one — a whole-document
`MutationObserver` left running would fire on every node the parser appends, in a
harness whose other gates measure motion frame by frame. It is named *earliest*
rather than *served* deliberately: one of the two sightings fired while
`readyState` was still `loading`, so there is no moment guaranteed to be both
after the body exists and before React could have touched it. The timestamp is
what makes the reading judgeable — a sample taken after the error is not
evidence, and now says so.

Two censuses are a **diff**, and a diff says *where* the tree changed. It still
will not name an element.

**What would.** A **dev build**, whose message names the element it choked on.
That is how item 12 was closed and it is the only mechanism that has ever worked
on this defect. `next dev` serves scripts under exactly the path `checkTonySteady`
intercepts, so a dev sweep runs; the cost recorded in item 15's closure is that
`tray-reveal` buys a box, so the wallet drains and the sweep needs a freshly
seeded database. At roughly one sighting per 528 captures, a single dev sweep is
about a **three-in-five chance of catching nothing** — so this is a job for
several runs, or better, for a probe that reproduces the trigger rather than
waiting for it. The `earliest`/`recovered` diff is what such a probe would be
built to narrow: it says which part of the tree React chose to rebuild, and that
is a much smaller search than the whole document.

### 2026-08-10 — the sweep grew, the ceiling did not

Recorded because it is a measurement, not a fix, and because the next person to
see a red visual gate on an unrelated branch should find it here first.

The quarantine's ceiling of **2** was reasoned about against *"a full sweep is
261 captures"* (`scripts/visual-qa-quarantine.ts`). The sweep is now **125
states × 3 widths = 375 captures**, and five local sweeps taken on the preseason
branch across essentially one build went:

| Run | Sightings | Result | Where |
|---|---|---|---|
| 1 | **3** | failed | `/rooms` @390 · `/profile` @375 · `/slice` @360 |
| 2 | 2 | passed | `/profile` @390 · `/slice` @375 |
| 3 | 2 | passed | `/door` @360 · `/slice` @360 |
| 4 | **4** | failed | `/slice` @390 · `/counter/collection` @375 · `/slice` @375 · `/` @360 |
| 5 | 1 | passed | `/profile` @360 |

**Twelve sightings, and no place repeated across any two runs.** That is the
signature the entry above describes, and it is why none of these was treated as
a new deterministic mismatch: a structural mismatch introduced by a change fires
on one state at *every* width, so it appears three times in one column. Nothing
here ever appeared twice.

The one sighting that landed on a **newly added** state (`preseason-teams`,
run 4) was checked rather than assumed: that state alone, **18 captures across
six runs, produced zero**. A state is not guilty because the background landed
on it once.

**Two of five runs failed, on a build whose every other gate was green.** That
is the condition the quarantine header names as a gate that has stopped
protecting anything — *"a failure with nothing to do with the change under
review"* — and it is now reached by arithmetic rather than by bad luck: at a
fixed per-capture rate a 44% longer sweep expects 44% more sightings, while the
ceiling that admits them has not moved.

**Nothing was changed in response, and that is deliberate.** The ceiling is the
reason a new mismatch cannot hide, and raising it to make a branch green would
be exactly the move its own header argues against. The two numbers want
re-deriving *together*, against a fresh rate measurement, and that is a decision
for whoever closes item 16 — not a side effect of shipping a feature.

**Local rate, this build:** 12 sightings in 1,866 captures ≈ **1 per 156** —
higher than every figure previously recorded (hosted ~1 per 528–792; the first
local sighting was 1 in 279). Five sweeps is still a thin basis and the estimate
should be treated as an order of magnitude, exactly as the row above says of its
own. **The hosted runner is not obviously worse:** the same branch passed the
hosted visual gate first time on `e3a2fac`.
