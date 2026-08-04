# Durable delivery checkpoint

**Resume instruction:** `Read CLAUDE.md and AUTONOMY.md, load the latest durable checkpoint, and continue autonomous delivery.`

This file is the handover record between Claude Code sessions. **Session memory is not a record** — if it is not here, in a PR comment, or in a label, it did not happen (`AUTONOMY.md §0`).

Update it whenever a slice lands, a gate result changes, or the next task changes. Keep it short enough to be read in full at the start of a session.

---

## Execution status — who is actually doing what

**Commissioner ruling, 2026-07-30:** a workstream is only *running* if an actor is implementing it. An issue, a label, a role contract or an `IMPLEMENTATION TASK` comment is **not** execution. Nothing sits in an ambiguous "assigned" state.

| Workstream | Mode | Branch / PR | Last implementation commit | Next executable task |
|---|---|---|---|---|
| **M3 — character identity** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #48 | Nothing. The vertical slice is complete: data, compositor, service, surface, previews, demo states, gates. Wearable *sources* are a later milestone and none is approved |
| **Back Hall as a room** | `QUEUED_NOT_ACTIVE` — **built** | branch | this session | Nothing. It is a room: three objects, flag-gated doors, two demo states, its own gates. Real art is a registry row |
| **M2 — loot loop** | `QUEUED_NOT_ACTIVE` — **shipped, art included** | `main` | #55 | Nothing. The loop and its launch art are both complete |
| **Stats & Data** | `QUEUED_NOT_ACTIVE`, independently verified | `main` | #33 | Weekly reputation tags (`16 §10`), once a live season produces events |
| **Tuesday Slice** | `QUEUED_NOT_ACTIVE`, independently verified | `main` | #46 | Nothing. The review queue it was waiting on is built — see below |
| **Weekly stakes** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #51 | Nothing. The Tuesday job that calls it is built — see below |
| **Weekly token rewards** | `QUEUED_NOT_ACTIVE` — **built** | branch | this session | Nothing. `03 §4`'s two derivable sources, paid by the Tuesday job from a finalized week, with the statement on `/counter`. `docs/WEEKLY_REWARDS_BOUNDARY.md` |
| **Slice review chain** | `QUEUED_NOT_ACTIVE` — **built** | branch | this session | Nothing. Ten steps, seven demo states, 23 database tests, and the rack now serves only what was approved. `docs/SLICE_REVIEW_BOUNDARY.md` |
| **Text surfaces & typography** | `QUEUED_NOT_ACTIVE` — **built** | branch | this session | Nothing. Six sizes, one type case, two enforcement halves, the printed vocabulary, and the Slice and press desk actually using them. `docs/TEXT_SURFACE_BOUNDARY.md` |
| **Homepage cleanliness** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #52 | Nothing in scope. The ceiling is visual debt 9 and needs a targeted regeneration, not a filter; `.affordance-on-request` is visual debt 10 and needs a `RoomDisplay` decision |
| **Batch B launch art** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #55 | Nothing. 12 of 24 collectibles plus `object_box_owned` have production art, which is the launch commitment. The remaining twelve draw `placeholder_pizza_box` by design |

**No fresh specialist session is required right now.** Every SW change to date has been tightly coupled to the branch in flight, small enough that a handoff would cost more context than it saved, and visually verifiable in the same loop — which is exactly the condition the ruling names for implementing directly. When that stops being true the trigger is a durable GitHub task carrying branch, scope, authoritative Markdown, assets, prohibited regressions, required screenshots, acceptance criteria, what not to redesign, and where to stop — then one concise ask.

**Stats independence is satisfied by the acceptable alternative, not by assertion.** `lib/stats/independent-verification.test.ts` recomputes scores, margins, winners, roster attribution and the largest margin **from the raw fixture JSON**, sharing no code with the pipeline — it does not call `traverseChain`, `derivePairings`, `toCents`, `reconcileSeason` or anything in `lib/stats/`. `facts.test.ts` pins values, which is good and is not the same thing: those numbers came off the pipeline's own output, so a consistent bias would have been recorded rather than caught. The one gap is stated in that file: if both implementations are wrong the same way, neither catches it.

---

## Where the product is — 2026-08-04 (fourteenth session)

### The second cron exists, and the architecture is now complete at two

`16 §4.3` allows exactly two scheduled jobs and specifies both. Tuesday shipped
in #56; **Sunday shipped this session**, and there is no third.

It exists for one sentence. `16 §4.3`: *"this is the only way the Monday-comeback
stories required by `07 §8` can be truthful"*. A final score cannot say whether
somebody was behind on Sunday night, nothing else records it, and it is
unrecoverable afterwards.

**The producer did not ship alone.** `07 §8`'s story had no implementation —
there was no `monday-comeback` anywhere in `lib/stats` or `lib/slice` — so a
snapshot table on its own would have been a photograph nobody looks at.

### Timing, which was the one real decision

Vercel runs crons in UTC; the league's day is Eastern; the NFL season crosses the
November change. `55 4 * * 1` — Monday 04:55 UTC:

| period | local | where that sits |
|---|---|---|
| EDT (Sep – early Nov) | **Mon 00:55 ET** | after Sunday night football, before any Monday game |
| EST (Nov – Jan) | **Sun 23:55 ET** | `16 §4.3`'s stated time exactly |

The obvious `55 3 * * 1` is 11:55pm ET in EDT and **10:55pm ET in EST — inside
the Sunday night game** for half the season. So the job runs slightly late in
September rather than slightly early in December.

### What the snapshot cannot record, and why that is a hard limit

**Remaining Monday exposure is not available.** `lib/sleeper/endpoints.ts` is the
whole surface this product talks to and none of its eight endpoints carries an
NFL schedule — no kickoff times, no game assignments. The only proxy in the
payload is *"starters on zero points"*, which cannot distinguish a player who has
not played from one who played and scored nothing.

So the boundary is **a clock, not a schedule**, and the cost is stated rather than
hidden: a game with no Monday exposure is photographed at its final score and
correctly produces nothing; a game postponed past the photograph would produce a
claim that is literally true but wrong to call *Monday*.
`docs/SUNDAY_SNAPSHOT_BOUNDARY.md §3` and `lib/slice/sunday.test.ts` hold it.

### Idempotency here is stronger than everywhere else in the schema

Everywhere else it means *"a retry is harmless"*. Here:

> **A second capture of a week is a materially different and worse photograph.**

A retry an hour later includes Monday scoring. An upsert would replace the truth
with a plausible-looking falsehood, silently, and turn every comeback claim of
that week into a false statement in a published newspaper. So
`UNIQUE(season_id, week, sleeper_matchup_id)` with `ON CONFLICT DO NOTHING` plus
an append-only trigger — **the first photograph is the one that counts,
permanently, and there is no correction path.** A league that can retake it does
not have one.

### The comeback, defined so it cannot flatter an ordinary Monday

`lib/stats/comeback.ts` is two subtractions. Eight named outcomes, including
three that say nothing — `no-snapshot`, `not-final`, `unpaired` — because a caller
that cannot tell *"nobody came back"* from *"we never looked"* will publish the
second as the first.

Printing needs **two** conditions: the result flipped, **and** the deficit was at
least `STORY_GATES.minComebackDeficit` (10 points, a starter's afternoon). The
threshold lives with every other editorial gate rather than inside the
arithmetic — a threshold in the fact module would be a second, invisible policy
under the one that is written down.

It scores on the **deficit**, not the final margin, which is the one place it
disagrees with every other margin-shaped kind: a one-point win after being forty
behind is a bigger story than a one-point win after being one behind, and the
margin cannot tell them apart.

### Nothing about the paper's existing rules moved

The board still prints in full; retired managers are still filtered upstream by
`publishableWeek` before derivation sees the game; the Tuesday job still ends at
`submit: true`. A week with no snapshot produces no candidate at all, silently —
which is every historical week in the archive.

The retired-manager rule is asserted **through the real filter** rather than by
reading the code (`comeback-story.test.ts`): a week where one side has retired is
run through `publishableWeek` and produces no comeback, so a future kind wired in
below that filter fails there.

`slice-monday-comeback` is the demo state, and its fixture supplies one recovery
**and three games that also moved and did not flip**. A state showing only the
comeback would not prove the paper can tell a recovery from an ordinary Monday.

### One defect the new kind created in an old rule, found and fixed

**Novelty ordering would never have seen a comeback.** `recentLeadKinds`
re-derives the previous two issues so this one does not repeat their lead, and it
was reading no snapshots — so `monday-comeback` could be *this* week's lead and
could never be a *recent* one, and two comebacks in a row would have printed
unreordered. `factPacket` now reads three weeks' photographs and hands each
previous week **its own**: this week's would report a recovery that did not
happen, and none at all makes the kind invisible to the rule.

### One refactor came with it, and it grew a test

`lib/cron/secret.ts` — the door, shared. It was a private copy inside the Tuesday
route, and two copies of a security check is a fix applied to one door and not
the other.

`lib/cron/secret.test.ts` is new and asserts the two things nothing else in the
build could:

- **Unset `CRON_SECRET` refuses a well-formed `Bearer` request**, along with a
  wrong secret, a prefix of the right one and a wrong scheme; the refusal is a
  404; a job response is never cacheable. Both routes call the shared check as
  their **first statement, before `getDb()`**, and neither reads the secret
  itself.
- **`vercel.json` declares exactly two crons**, every declared path has a
  `route.ts` on disk — the scheduled-404 failure that kept the Sunday entry out
  until the route existed — and the Sunday hour is converted into Eastern at
  **both** UTC offsets and asserted to land after 23:00 Sunday ET and before
  06:00 Monday ET. A session that moves it has to change the assertion that says
  why it is where it is.

Testing it needed one config line: `server-only` is a module that throws unless
the bundler resolved it under React's `react-server` condition, so **any module
carrying the marker was uncollectable by Vitest** — and they are the ones worth
testing. `vitest.config.ts` aliases it to an empty stub. The marker protects the
client bundle and Next.js still enforces it at build time, which is where the
protection was always coming from.

### Visual debt 12 — two sweeps, and the instrument killed a lead before it was chased

Three 261-capture sweeps of the same build.

| | |
|---|---|
| Run 1 | **two** — `/slice?board=long-names&open=tonysLine` @390, `/?board=quiet&open=tonysLine` @375 |
| Run 2 | **one** — `/` @360 under `six-banners`, **no query string at all** |
| Run 3 | **one** — `/slice?edition=blowout` @375 under `slice-blowout` |
| Run 4 — **CI, on PR #59** | **one** — `/admin/slice` @375 under `review-published` |

Run 1 looked like a lead: **both sightings carried `open=tonysLine`**, and Tony's
Line is flag-gated and shut in v1 (`18 §3.4`), so a server/client flag
disagreement would have been a plausible structural mechanism. **Run 2 refuted
it** — neither state reproduced and the one that did carries no parameter. The
correlation was an artefact of `?open=tonysLine` travelling with all seventeen
board URLs for symmetry with the live path, so any sighting inside that block
carries it.

**Nothing was implemented on the strength of it.** That is what the in-page
reporter is for: it records the URL of the document that logged the message, so a
lead can be tested instead of believed.

What the four runs establish: **five sightings, five different states, three
widths, no state repeated and no route repeated within the branch**, at a rate of
roughly **one per 209 captures**. `pending` is **0** in every locally captured
sighting, so no Suspense boundary is outstanding; `readyState` is *complete*
twice and *loading* twice; time-since-navigation clusters at **88, 112, 114 and
124ms**. Seven distinct routes are now named across the defect's whole history.

That rate is the operationally important number: a 261-capture sweep has better
than even odds of hitting it, **so a red sweep on this error is a property of the
gate rather than a signal about the diff**. Every gate that measures the
product — type floor, one-transient, focus ring, Tony steadiness — was green in
all four runs, as were all 87 states at all three widths otherwise.

**PR #59's visual-QA run went red on exactly this twice** — `/admin/slice` under
`review-published`, then `/back-hall` under `back-hall-rooms-open` after a
docs-only push retriggered the workflows. **Six sightings, six states, five
routes, three widths, never the same place twice.**

### The gate is quarantined rather than muted, and the ceiling is the design

**Commissioner-delegated, 2026-08-04.** The choice was put up with three options
and came back as *"you decide"*.

Merging past it once fixes nothing and hands the same coin flip to the next pull
request; blocking all delivery behind a defect that has already resisted three
attempts is disproportionate. So `scripts/visual-qa-quarantine.ts` **records,
counts and prints** the exact minified `#418 … args[]=HTML` shape without failing
the run — and the run **still fails above a ceiling of two**.

> A newly introduced structural mismatch is **deterministic**: it fires on every
> capture of the state it affects, at minimum once per supported width, so it
> clears a ceiling of two on its first appearance. The background does not —
> five sweeps of one build gave 2, 1, 1, 1, 1.

`scripts/visual-qa-quarantine.test.ts` holds nine assertions and two of them are
load-bearing: the ceiling must stay **below the width count**, so no regression
can hide under it, and the table must hold **exactly one entry** — a second is
not a bigger allowance, it is evidence the gate has stopped being trusted.

The shape is deliberately narrow. `args[]=text` (a content mismatch),
`#419`–`#425`, and above all the **dev build's message — which names the element
and is the one sighting this defect has never had** — all still fail on sight.
`VISUAL_ACCEPTANCE.md §3` carries the specification.

**It is not this slice.** The failing states are board and banner states this
slice does not touch, they move between runs, and the same defect has been
recorded on unmodified `main`.

### Verified

| | |
|---|---|
| `npm run check` | **1238 passed, 78 files, none skipped** — typecheck · lint · full suite against a real Postgres · production build |
| `npm run visual:qa`, production build, fresh database | **87 states × 3 widths, three times.** Every product gate green in all three; one intermittent visual-debt-12 `#418` per run, at a different state and width each time |
| The rendered edition | leads with *"Alex gets it back on Monday"*, deck *"Alex was 35.1 behind before Monday"*, full four-game board beneath (`docs/evidence/monday-comeback/`) |

`docs/SUNDAY_SNAPSHOT_BOUNDARY.md` is the canonical account.

**`CRON_SECRET` is now the only remaining activation step**, and it activates
both jobs at once. Until it is set in Vercel production, both are scheduled and
inert — they answer 404 to everything, including Vercel's own scheduler.

### Weekly token rewards — built this session

`03 §4`'s fantasy-performance token sources, as the producer, the record, the
audit and the surface rather than a table with nothing writing it.

**The assignment's premise was wrong, and so was this file's.** Both said
`weekly_rewards` already existed and nothing wrote it. There was no such table —
the schema had `reward_tables`, which is the loot-box weight table and is both
written and read. What did exist was narrower: `token_reason` had declared
`MATCHUP_WIN` and `WEEKLY_HIGH_SCORE` since `0005`, unwired, with
`IMPLEMENTATION_HANDOFF.md` recording why — *"do not invent a weekly reward that
fires on nothing"*, because the two crons did not exist. **Both now do**, so the
precondition was met rather than the rule waived.

- **The amounts are specified, not chosen.** `03 §4` names matchup win **150**
  and weekly high score **400** in the same list that gave `seasonStartTokens`
  its 250, and requires that final numbers be configurable and simulation-
  reviewed — which is exactly what `economy_configs` already is. No commissioner
  decision was needed. Do not tune them; that is P3's job.
- **Two reasons, and the absences are decisions.** Upset, playoff advancement and
  consolation placing are **not in `03 §4` at all**; the schema would accept them
  and that is not a reason. `SEASON_AWARD` stays declared and unwired. Week type
  is **not** a multiplier — a playoff win and a consolation win each pay 150, and
  two tests pin the absence of a branch.
- **The finality gate had a defect the integration test found.** `weekFinality`
  *prefers* a week's own finalization when both records exist, and the Tuesday
  job writes that row in step 1 — so a `source === 'season_closed'` check never
  fires on a closed season, and `apply_token_delta` raises from four frames down
  instead. Every week of 2024 and 2025 is in that position. The gate now tests
  `seasons.finalized_at` directly, **the same condition the ledger enforces**.
  *No fabricated failures*, the quiet partner of no fabricated data.
- **Idempotency is two database locks and no application check.** There is no
  `SELECT ... WHERE already_rewarded` anywhere: that is a race with a
  comfortable-looking body. The key is derived from the occasion and **omits the
  amount**, so a rebalance mid-week raises rather than paying twice at two
  prices. Payment is applied first and the justification second, because the
  ledger is the idempotency authority.
- **Rewards do not wait on the commissioner.** `16 §9` requires approval of the
  *paper*; nothing makes a manager's 150 tokens wait on an editor. Asserted in
  both directions — tokens move while no version is published.
- **`/counter` gained a statement**, through the text-surface `Ledger`
  primitives. `recentTransactions` had been written and unused since the ledger
  shipped; this is its first caller, and it is what `03 §5`'s "the displayed
  balance should reconcile to the ledger" finally has something to reconcile.

38 tests in `lib/rewards/` plus four in the Tuesday job, against a real Postgres,
covering replay, ten replays, two concurrent runs, rollback on partial failure
via an injected trigger, and retry after it clears.

`docs/WEEKLY_REWARDS_BOUNDARY.md` is the canonical account.

### The text-report visual pass — the audit is closed

`docs/TEXT_REPORT_AUDIT.md` is the queue and the canonical account. The
commissioner's benchmark is *"intentionally designed physical artifacts inside
Tony's Pizza, not normal web pages with a pixel font placed on top."*

**The audit's main finding is that the primitives already exist.**
`text-surface.tsx` carries the mounted sheet, rules, headings, metadata strips,
plaques, masthead, score deck, warning glyph and ledger, and the press desk
already uses all of them — it is the worked redesign the ruling points at. A
parallel report system is not needed and would be the mistake that file's own
header warns about.

**Closed:** the score deck broke *inside* a team. `Matty B 164.74 — Nick 130.78`
wrapped between `Nick` and `130.78` at 390px — a manager on one line, their score
on the next. `ScoreDeck` now keeps each side of the separator unbreakable so the
break falls between the two teams. `checkDeckWrap` measures it from client rects
everywhere and **fails on the old build at all three widths**.

**One audit item was withdrawn on inspection** and the reasoning kept: the lede
deck looked like it competed with its headline, but its prominence is a recorded
decision and the flatness was the two-line wrap, now fixed.

**All seven entries are now closed** — six implemented, one withdrawn with its
reasoning kept. The Slice's rack stamp is a pressed `Plaque` rather than the
sheet's quietest line, the board's scores separate, and a heavier rule closes the
lead so the page reads as one story plus supporting material instead of four
equal chunks. On the desk, `Staff only` moved from red to wood (red on that
surface means *refused*, and it is now spent only there), the content hash
recedes, and the issue's **headline** is at the top so a reviewer can answer
*"what is this about"* without scrolling past the findings.

**No new primitives and no new gate**, both deliberate. Every change reuses
`Plaque`, `PrintedRule`, `MetadataStrip` or `Ledger`. The deck-wrap defect earned
a gate because it was invisible in review and depended on that week's fixture
names; these six are visible in a screenshot at any width, and gating a specific
margin or tone would be brittle. `docs/TEXT_REPORT_AUDIT.md §5`.

### Visual debt 9 — closed, and the recorded conclusion was wrong

The ceiling had no mechanism for two milestones on a recorded conclusion that it
*"needs a targeted regeneration, not a filter"*. **It did not, and no new art was
required.**

The reason no filter had worked is sharper than the old note said. It is not just
that the grid is dashed: **the scorch and the grid are painted in the same two
browns**, so no rule that asks what colour a pixel is can separate them. They
differ in *shape* — the grid is one unit wide, the scorch is thick blobs — and a
**morphological opening** separates precisely that. Erosion deletes anything a
unit thick, so a line has no interior and never enters the mask at all; the grid
is not preserved by a rule that mentions it, which is a stronger guarantee than
any coordinate list and needs no maintenance when the art changes.

A **purity guard** stops a core forming anywhere the 3×3 neighbourhood is not all
ceiling. That is what keeps the doorway beam, the neon sign and the pendant safe:
their brown *edges* can always see the near-black beside them, so they can never
seed a blob. Scorch lying *against* the beam is still cleared — the dilation
reaches it — while the beam itself is never written.

**2,259 cleared · 1,714 grid preserved · every non-ceiling pixel in the rectangle
byte-identical · no colour introduced · dimensions and alpha unchanged ·
idempotent.** Twelve tests, eight of them synthetic, and the mechanism's one real
limit is stated rather than implied: a brown region three or more units thick in
both directions has an interior that cannot see structure, and this treats that
interior as a blotch. Nothing structural on this ceiling is a solid brown slab.

Full-room regeneration was never attempted and would have been the riskier path —
it discards the board-face repaint and the alcove shading the same file carries.

### A dev sweep is possible, and it found a real defect

`docs/VISUAL_DEBT.md` 12 has said for two milestones that the next `#418` sighting
must be caught on a **dev** build, because that is the only configuration where
React names the element — and that the driver *"cannot currently sweep a dev
build at all"*, because `next dev` serves different chunk URLs.

**Both halves of that were measured this session and are wrong.** `next dev`
serves scripts under exactly `/_next/static/chunks/`, the same path
`checkTonySteady` intercepts, and a dev sweep reaches **190 captures**. What
stopped the earlier attempt was a **drained wallet**: `tray-reveal` buys a box,
and this file already warned that capturing it consumes one. Reset the database
and it runs.

**No `#418` in 190 dev captures** — consistent with the ~1-per-209 rate, so that
is a coin flip rather than evidence of absence. But the sweep found something
else, deterministically: **"Maximum update depth exceeded" on the homepage, at
all three widths, for the whole time a box is open.** `afterPresent` returned a
fresh `Up` even when the surface asked for was already up, and `CounterTray`'s
effect depends on the context value memoised from it. Fixed and tested; visual
debt 15.

**A speculative `--dev` timeout multiplier was written and reverted.** It was
justified by a diagnosis — dev compile time — that turned out to be wrong once
the database was reset. Shipping code whose comment tells a false story is worse
than not shipping it.


### Visual debt 12 — closed, and the cause was the camera

Two milestones of investigation, six states, five routes, three widths, roughly
one sighting per 209 captures, no reproduction, and no cause anywhere in
application code. A dev sweep finally named the element:

```
<input type="text" maxLength={160} name="note" required={true} ...
-  style={{caret-color:"transparent"}}
```

`/admin/slice/<version>` at 375, `readyState=complete`, 0 pending Suspense
boundaries. **Nothing on that screen sets a caret colour.**

**Playwright does.** Its screenshot defaults to `caret: 'hide'`, and it hides a
caret by writing `caret-color: transparent !important` into the **inline style of
every element** and then taking it away. Measured with a `MutationObserver` on
one input:

```
default (caret: 'hide')  -> ["caret-color: transparent !important;", ""]
caret: 'initial'         -> []
```

A capture landing while React hydrates hands React a `style` attribute the server
never sent. **The instrument was the defect.**

That accounts for every recorded property, including the one that fitted no
theory: **144 targeted document loads could not reproduce what a sweep hit every
209 captures.** Those probes loaded the pages; they did not photograph them. It
also explains why static analysis kept coming back clean, and why two routes with
no client components at all could produce a mismatch — the DOM was being edited
from outside React entirely.

The fix is one option, in `scripts/visual-qa-capture.ts` so a test can reach it.
The regression drives a real browser and asserts both halves: the driver's
options mutate nothing, **and** the default does — so it fails on the pre-fix
behaviour rather than restating the code.


### Next executable task, in order

The art queue that used to sit here is closed (`#55`) and this replaces it.

1. **Visual debt 12 — the intermittent `#418`.** Instrumented, quarantined under
   a ceiling, six states and five routes named, two classes of cause eliminated,
   no reproduction. Do not ship a speculative repair; chase the next sighting on
   a **dev** build, which is the only configuration that names the element.
   **First obstacle, measured this session:** the driver cannot currently sweep a
   dev build at all — `checkTonySteady`'s Pass F delays the client bundle by
   intercepting `**/_next/static/chunks/**`, and `next dev` serves different
   chunk URLs, so the sampler finds nothing and the run aborts at state two. 89
   captures completed before it stopped, with no sighting. Teaching the driver to
   skip its production-only passes under a `--dev` flag is step one, and it is
   cheap. Deleting the quarantine entry is the definition of done.
2. Deferred with reasons and not queued: debts 1, 2, 11 and 14.

---

## Where the product is — 2026-08-04 (thirteenth session)

### Visual debts 3, 4 and 10 were one defect, and it was a missing owner

Filed as three cosmetic items on three surfaces, a milestone apart, by three
different pieces of work. **The room had no owner for its transient state** — five
surfaces, five private owners, nothing arbitrating:

| surface | owner | its state |
|---|---|---|
| the Tonight board, the sign, the receipt | `RoomDisplay` | `useState` `open` |
| the champion panel | `BannerRail` | `useState` `openSlot` |
| Tony's order pad | `TonyToy` | `useState` `dismissed` |
| the shut door's line | `ShutDoor` | `useState` `saying` |
| the reveal plate | `CounterTray` | `useState` `phase` |

**The repository had already reached half of this conclusion and written it
down.** `counter-tray.tsx` set `data-parlor-focus` on `document.body` directly,
with the comment that *"the fix is not to teach each one about the others but to
give the room a single focus they defer to"* and that a provider *"would be a
larger change than the defect"*. That provider is `components/scene/room-stage.tsx`
now, and the attribute has one writer instead of a component reaching outside its
own subtree.

### `RoomStage` and `RoomPanel` — the contract

`RoomStage` owns **which one surface is up** and nothing else: no data, no
routing, no permissions, no ownership, no statistics, no navigation. The rule is
two exported pure functions (`afterPresent`, `afterDismiss`) so the test drives
the transitions rather than asserting on source text. It **renders no DOM** —
asserted — because the parlor's hydration mismatch is still open and a wrapper in
the middle of the object map is a hazard for no benefit.

**Blocking** is the one nuance worth remembering: a panel can be replaced by
opening another, and the collectible reveal cannot. `CounterTray` presents
`'reveal'` as blocking, so a manager who taps the receipt mid-reveal gets nothing
rather than a panel drawn over the biggest moment in the product.

`RoomPanel` replaces two hand-built dialogs written a milestone apart that
disagreed on the scrim (0.60 / 0.55), the padding (`px-4` / `p-6`), the width
(312px / 300px) and the close control. None of those was a decision. Slots are
`title · children · actions · material`; it imports nothing from `lib/` and is
asserted not to.

### The pad yields rather than unmounting, and that was deliberate twice over

Its state survives, so it is back on the counter when the panel goes — and **the
DOM structure does not change**, which with visual debt 12 open is worth more
than the tidier conditional render. The selector went from
`body[data-parlor-focus='reveal']` to `body[data-parlor-focus]`: the value was
pinned because the box opening was the only claimant, and a panel claims it too.

One defect fell out: `pointer-events: none` on the wrapper was overridden by
`pointer-events: auto` on the box inside it, so **an invisible dismiss button was
hit-testable across the bottom of the room for the whole reveal** — the plate is
`z-26` inside the room and the pad is `z-40` fixed, so they are not in the same
stacking context and the pad wins.

### Debt 10 is deleted rather than wired up, and the parlor had no focus ring

About ninety lines went — `.affordance-on-request`, `.door-edge`, `.door-wash`,
`.door-shadow`, `door-breathes` — **all with zero consumers**, the corpse of the
SVG-polygon mechanism `18 §9.4` withdrew. The entry named one of the five.

It asked whether to wire it up instead. **It cannot be**: `§9.4` derives the glow
from the overlay's own alpha, and **five of the eight homepage objects are baked
into the shell**. The board, the sign, the receipt, the tray and the rear doorway
have no overlay and no alpha, so an affordance for them is an authored rectangle —
what `§9.4` withdrew and what `MANDATE §6` bans twice. `18 §2` agrees: a
Display's affordance is *"none — the content is the affordance"*.

**And the half the entry did not name.** `.room-shape:focus-visible .door-edge`
was how a room object showed keyboard focus. With the polygons gone the selector
matched nothing, every room object carries `outline-none`, and nothing else in
the stylesheet styled focus — so **the parlor had no visible focus indicator at
all**. There is a `keyboard-focus` screenshot state; it photographed that and
passed, because a screenshot only fails when somebody looks at it. WCAG 2.4.7.

### Debt 3 was a review, and the review's result is that they never competed

The pad lands at 980 + 260 = **1240ms**; the affordance reveal begins at
**1600ms**. 360ms apart, never overlapping. What the review leaves behind is an
assertion that reads **both numbers from the files that own them**, so moving
either without the other fails the build — the part an inspection could not.

### Verified

| | |
|---|---|
| `npm run check` | **1187 passed, 74 files** |
| `npm run visual:qa`, production build, fresh database | **86 states × 3 widths, passed**, zero hydration sightings in `report.json` |
| `checkOneTransient` against the pre-pass build | **fails 3/3 widths** — *"shows 2 transient surfaces at once (panel + tony-line)"* |
| `checkFocusVisible` against the pre-pass build | **fails 3/3 widths** — *"has no visible ring (outline: none 0px)"* |
| the unit assertions against the pre-pass build | debt 4's three fail, debt 10's dead-CSS and focus-ring fail, debt 3's two pass — correctly, since debt 3 asked for a review |

`docs/ROOM_TRANSIENTS_BOUNDARY.md` is the canonical account.
`docs/evidence/room-transients/` holds the first photograph ever taken of visual
debt 4.

**Visual debt 12 produced no new evidence.** `RoomStage` renders no DOM and the
panels are conditionally rendered exactly as before, so the pass changed nothing
about the room's first-render structure. The PR #57 instrumentation is preserved
intact and no speculative fix was shipped.

---

## Where the product is — 2026-08-03 (twelfth session)

### The local gates were runnable all along, and `db:up` was hiding it

**Every checkpoint in this repository has recorded the same limitation** — *"no
`DATABASE_URL` in this environment"*, 412 tests skipped, `visual:qa` not run — and it
was **not true**. `scripts/dev-db.sh` has had a native-binaries fallback since it was
written, for exactly the machine that has PostgreSQL installed and no Docker daemon.

What hid it: **`npm run db:up` called `docker compose` directly**, bypassing the script
entirely. A session checks for a database, runs the obvious command, gets
`failed to connect to the docker API`, and reasonably concludes there is no database —
while `npm run db:fresh` two lines below would have worked. `db:up` now routes through
`scripts/dev-db.sh up` like `reset`, `fresh` and `status` already did.

**The visual gate needs one more environment variable here, and it already exists.**
This sandbox ships Chromium build 1194 while Playwright asks for 1234, so
`npm run visual:qa` dies at launch with *"Executable doesn't exist"*. The driver has
honoured **`PLAYWRIGHT_CHROMIUM`** since it was written:

```
PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

No repository change is needed and none was made — this is a note so the next session
does not conclude the gate is unrunnable for the same shape of reason `db:up` caused.

`db:down` is deliberately left on `docker compose down -v`: `dev-db.sh` has no `down`
command, and inventing one means deciding whether the binaries path should delete the
data directory to match `-v`. That is a separate decision, and mis-wiring it to the
script's help text would be worse than leaving it honest.

**What the working database then proved, in one session:**

| | |
|---|---|
| `npm run test` | **1153 passed, 0 skipped** across 71 files — the first fully green run on record, including the six `tuesday.test.ts` tests |
| The Tuesday route's inertness | **empirically verified**, not read off the source: with `CRON_SECRET` unset it answers **404** to an unauthenticated request *and* to a guessed bearer |

### Visual debt 13 — Tony's clip is the entrance, and the glow is innocent

**Closed, with pictures.** The commissioner reported *"Tony's bottom half clips at the
exact moment his glow disappears"* after debt 7 was fixed, and
`TEXT_SURFACE_BOUNDARY.md §10` scoped ten candidate mechanisms around the glow-off
transition. **None of them is it**, and that was settled by measurement before anything
was changed:

| | |
|---|---|
| `drop-shadow(0 0 0 transparent)` vs `filter: none`, static, at device resolution | **0 pixels differ**, at 390, 375 and 360 |
| The glow at full strength vs none | 44 493 px differ, **every one of them outside his alpha**; the interior is untouched and the halo stops exactly at the counter's cut |
| The real ramp, screencast frame by frame on the page's own clock | fades **monotonically** 4 745 → 0 px across 260ms; no spike, no transient, no movement |

Compositing-layer teardown, filter removal, raster resampling and z-index change are
eliminated by the first row alone.

**What actually drops him is the rule at the top of `arrival.tsx`.** The server renders
the finished state — Tony is at the counter *in the HTML* — and the entrance is
attached afterwards, by a class, from a `useEffect`. So the entrance is on the
**hydration** clock while the picture it animates away from is already on the glass.
`tony-steps-up` opens on `translate3d(0, 26%, 0)` under `animation-fill-mode: both`, so
the backwards fill lands during the animation's own 80ms delay:

```
t+331ms   the room paints complete — Tony standing, his line up, the board readable
t+642ms   .arriving lands and he drops 62.42px, behind the counter drawn over him
t+3522ms  he finishes climbing back
```

At 390 under an 8× throttle. `docs/evidence/entrance-drop/` holds the two frames 31ms
apart. On this machine hydration follows paint by 118–178ms and nobody sees it; **a
phone on a real network is the throttled case**, which is why it was reported from a
phone and never by the gate.

**The fix is `ENTRANCE_STALE_AFTER_MS = 250`** — an entrance may not start on a room
that has already been on screen, measured from `first-contentful-paint` rather than
from navigation, because the second includes the network and would call a
just-painted room stale. Someone in that case gets what `prefers-reduced-motion` gets:
the reveal without the entrance, one branch for both. `arrived` is still set, so the
greeting still types.

### The same gate had two defects, and one of them had just failed a run

**It was judging the wrong window.** `checkTonySteady` cleared the entrance by waiting
for `performance.now() >= 1300`. The entrance is on the hydration clock and that wait
is on the navigation clock; measured, hydration lands at 118–178ms and the entrance's
last movement at 1114–1157ms, so the margin was ~150ms — and on a loaded machine it
ran out. A local production sweep failed with `dy moved 0.74px (-134.04 at t=1323ms,
-134.78 at t=1457ms)`: the tail of `tony-steps-up` easing out, reported as a defect.
The sampler now records `arriving` per frame and the passes exclude those frames by the
class that causes them, exactly as they already did for `speaking`; the reveal windows
are anchored to the frame the reveal was first seen lit in rather than to `1600`.

**And it could not see the defect at all.** Every pass measured a fast arrival, the one
case where the drop is invisible. **Pass F** delays `/_next/static/chunks/` by 700ms so
the room paints before the script arrives, then asserts Tony never leaves the position
the server painted him in.

CPU throttling was the first instrument and is the wrong one — it slows paint and
hydration *together*, so the gap between them, which is the entire defect, stays small.
It passed at two widths and failed at the third on the same build. Delaying the bundle
models a real phone and is deterministic:

| build | pass F |
|---|---|
| before | **fails at all three widths** — 62.42px @390, 60.02px @375, 57.62px @360 |
| after | passes at all three |

`docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §10` is the canonical account. What is **not**
claimed: that this is the whole of what the commissioner saw. The report tied the
timing to the glow and the glow measures clean. What is claimed is that this is a real
defect of exactly the reported shape, on exactly the reported surface, and the only
movement in the room that puts his bottom half behind the counter.

### Visual debt 12 reproduced, and two whole classes of cause are eliminated

PR #57's sweep failed on **`/counter/collection`** at 390, and a local sweep of the
identical CI configuration — production build, fresh database, 85 states × 3 widths —
failed on **`/admin/slice`** at 360. Those are the fourth and fifth routes.

**Both render no client components at all.** `panel.tsx`, `room-behind.tsx`,
`shell.tsx`, `placeholder.tsx`, `text-surface.tsx` and `review.tsx` are every component
on those pages and not one is `'use client'`. So no application component can be
changing shape between the server's HTML and the client's first render, because there
is no application component with a first render.

The production HTML rules out the other obvious candidate. Both Suspense boundaries are
already resolved (`<!--$--><!--/$-->`); there is no `$RC`, no `<!--$?-->` and no
`div hidden id="S:"`, so nothing is spliced in asynchronously — and the metadata is
emitted directly in `<head>`, so there is no body-to-head hoisting script racing
hydration.

It is still not reproducible on demand: 36 throttled document loads of
`/counter/collection` and 108 of the parlor are clean. It appears roughly **once per
255-capture sweep**.

**What changed is the instrument.** The driver now installs `HYDRATION_REPORTER` into
every document, which reads `location.pathname` **synchronously inside the document
that logged the message** — `window` belongs to one document, so attribution can no
longer be wrong under load, which the Node-side `page.url()` read demonstrably could
be — and records `document.readyState`, time since navigation and the number of
still-pending Suspense boundaries beside it. Every sighting lands in `report.json`
whether or not it failed a gate. **The Node-side listeners are untouched and remain the
gate**, so nothing is narrowed: they catch browser-emitted console errors that never
pass through the page's own `console.error`.

**Still no speculative fix.** The evidence now says the cause is not in application
component code, and guessing at framework internals is the same mistake one level down.

### Visual debt 12 — the earlier attempt in this session, superseded above

The parlor's intermittent React `#418`. A probe drove a **dev build** — where React
prints the full hydration diff and names the element, rather than the production
bundle's bare `#418` — through **24 passes** at all three widths, each in a fresh
context (no cookies, no `sessionStorage`) so both the sign-in redirect and the arrival
sequence ran as they do for a real manager, each under **8× CPU throttling** to widen
the race, and each followed by a same-session reload to hit the branch where
`sessionStorage` says the entrance already played. **All 24 clean.** The two CI sweeps
on PRs #55 and #56 were also clean.

Static analysis alongside it ruled out the obvious causes: **no render-time
nondeterminism** anywhere in the parlor's client components — every `window`,
`matchMedia`, `sessionStorage` and `performance` access is inside an effect or a
handler, and both `useId` call sites are React's hydration-safe ID; **no invalid
nesting**; and `SpokenLine`'s shape is invariant and pinned by `spoken-line.test.tsx`,
so debt 6's repair holds.

**No fix was shipped, deliberately.** Without a reproduction the exact structural
mismatch is unidentified, and a speculative repair to the room's most-seen screen is
the false confidence this repository has shipped three times.

**Superseded later the same session.** The recorded next step — *"chase it on a dev
build, the only configuration that will name the element"* — turned out to be the wrong
next step, because a dev build never produced one to chase. What produced a
reproduction was running the **whole CI configuration locally**, which is what the
`db:up` repair above made possible for the first time. See the section two above.

---

## Where the product is — 2026-08-03 (eleventh session)

### Batch B launch art is closed. Nothing further is required on it.

**PR #55 merged as `aaff231`.** The art milestone is complete and should not be
reopened for polish:

| | |
|---|---|
| Collectibles with production art | **12 of 24** — the number `ASSET_PIPELINE.md §5` commits to at launch |
| `object_box_owned` | **complete**, the approved **44 × 29 occupied** variant on a 44 × 30 canvas |
| McDonald's cookie bag | slug **`collectible_cookie_tote`** preserved — it is the identity in `box_openings.collectible_slug` and the seeded reward table; only `alt` changed |
| Bapple Tree | **six cans**, counted on the source — four in the canopy, two flanking the trunk |
| The remaining twelve | draw `placeholder_pizza_box` **by design**, not by omission |

**The pizza box's height is settled.** Two candidates existed: a flat one occupying
44 × 15 and a squarer one occupying 44 × 29. The commissioner approved **the 44 × 29
variant as final**, superseding an earlier acceptance of the flat one — it reads
clearly at actual iPhone size, sits naturally on the tray, does not float, and fills
the interaction area better. The flat candidate is retained as
`art/incoming/_source_object_box_owned_flat_rejected.png`; the `_` prefix is how
`process-art.ts` skips a file, so the surviving candidate is unambiguous rather than
winning on alphabetical order. **Do not reopen this.**

**The angled Tony's pizza box is retained as a future purchase-menu reference only.**
It has **no runtime consumer**: `/counter` renders no box artwork at all — a text panel
headed *"Standard pizza box"* above a `BuyBox` control, with no image slot on the route.
Giving it one is a new registry slot *plus* a code change, which is a product slice
rather than an art swap, and it is not started.

**Two non-blocking polish notes**, recorded rather than actioned: the **singing fish**
has a weaker silhouette at 23px, and the **barrel sauna** can read slightly
pumpkin-like at 23px (its chimney also quantised 14px cool against warm wood). Neither
blocks launch. Both are future visual-polish items.

### The Tuesday job, rebuilt on the art merge

`16 §4.3`'s second cron. The work was completed in an earlier session and stranded on a
branch under the Actions-conservation rule; it was separated out of the art PR and
rebuilt here on `aaff231`, **byte-identical** across the move (`lib/slice/tuesday.ts`,
its test, the route, `vercel.json`, `docs/DEPLOYMENT.md` all hash-verified). The
original is preserved untouched at `claude/tuesday-job-fouqq1`.

Everything it calls already existed, idempotent and tested. What did not exist was the
**sequence**, which has failure modes its parts do not — so it is a module rather than
logic inside a route handler where it could not be tested without HTTP.

- **It never publishes.** The last thing it does is `submit: true`. There is no
  parameter on the route that can change that, which is the point of there being no
  parameter on the route at all.
- **The door is a shared secret and unset means shut** — 404 rather than 401, like
  `requireAdmin()`, so it does not confirm it exists.
- **A step that throws no longer costs the paper.** Each step is attempted, a throw is
  recorded against the step that threw, the chain finishes, and the route answers 500 so
  the platform retries — safe because every operation underneath is idempotent.

**`CRON_SECRET` must be set in Vercel production** before the job can run. It is the one
thing here a session cannot do (`AUTONOMY.md §6`), and until it is set the job is
scheduled and inert — the safe half of the two possible wrong states.

---

## Where the product is — 2026-08-03 (tenth session)

### Commissioner art review — six narrow brand/logo exceptions ruled

Two batches of generated collectible art were reviewed against `art/ART_SPEC.md` and
the batch handoff briefs. The mechanical findings held up across both batches and are
recorded for future generation rounds rather than re-discovered each time:

- **No generation arrived pre-cropped.** `scripts/process-art.ts` does not auto-trim
  or auto-anchor — it resizes the whole source frame directly onto the declared
  canvas (`fit: 'fill'`). Every candidate in both batches had the object floating
  clear of the bottom row (3–30% gap) and several were non-square canvases forced
  into a square target, which `fit: 'fill'` would visibly distort. This is a
  generation-prompt problem, not a pipeline defect — corrected mechanically per
  candidate, not by changing `process-art.ts`.
- Content defects held up too: accidental jersey-sleeve numerals, an arcade cabinet
  with six separate baked-in text instances and no alpha channel at all, disconnected
  spark pixels and a faint cast shadow on the burn barrel.

**The commissioner then reviewed the rejections and overruled six of them**, narrowly
and explicitly — this is a private, non-commercial, small-friend-group project, and
real-brand resemblance on six specific assets is a deliberate creative choice, not an
oversight. `docs/art/BRAND_EXCEPTIONS.md` is the canonical record:

1. `collectible_arcade_token` — Tony's wordmark + chef-mascot accent approved
2. `collectible_neon_tony_sign` — Tony's wordmark and lettering approved
3. `collectible_reddiwip` — Reddi-wip-inspired trade dress approved
4. `collectible_bapple_tree` — the fruit concept is replaced by Busch Light Apple-style
   cans hanging as fruit
5. `object_box_owned` — Tony's branding on the pizza box approved; the open item is
   the camera angle, not the branding (below)
6. `collectible_portable_sauna` — a barrel sauna replaces the fabric-tent concept

**Every other asset stays under the unmodified rule.** `ART_SPEC.md §10` points to the
new doc; nothing else about the rights section changed.

### The box-family investigation — one asset, not four, and the canvas was wrong

Reading `components/scene/counter-tray.tsx` and `app/page.tsx` directly (not assuming
from the registry) settled what the pizza-box art family actually needs:

- **Only `object_box_owned` is ever resolved or rendered.** `object_box_standard`,
  `object_box_rare`, and `object_box_legendary` are unused registry rows for a
  box-rarity feature that was never built — every box the product grants is
  `kind: 'standard'` (`lib/counter/boxes.ts`); rarity belongs to the *contents*,
  revealed only after opening, never to the box.
- **"Opening" is a CSS animation on the one static sprite**, not a second art asset.
  There is no "lid lifted" art state — the box sprite is replaced by CSS burst/rise
  effects and the collectible's own separate 46×46 art.
- **The registry canvas was wrong.** `object_box_owned` said 96×96; the box actually
  renders at `TRAY_BOX` (`lib/parlor/objects.ts`) — 44×30, not square. Corrected in
  `art/assets.inventory.json`.
- **The camera angle is the room's own tray recess**, not a product-photography
  three-quarter angle. A fresh crop of the approved `zone_parlor_shell.png` around
  the tray shows it seen almost straight-on, at standing eye level — the first
  generated candidate's steep hero-shot angle overshoots what "matching the room's
  perspective" (`zone_tile.md §3`'s FAMILY block) actually means for an environmental
  object.

`art/prompts/zone_tile.md §6` is corrected to match all four findings.

### Twelve collectibles and the tray box are shipped; the framing problem is fixed at the pipeline

**`12 of 24` collectibles now have real art** — the number `ASSET_PIPELINE.md §5`
commits to at launch — and all twelve pass `npm run art:validate` with zero findings:
the arcade token, framed jersey, Bapple Tree, whipped-cream can, arcade cabinet, burn
barrel, barrel sauna, diner mug, singing fish, neon sign, checkered tablecloth and
McDonald's cookie bag.

**`object_box_owned` is shipped too**, at the corrected 44 × 30 canvas, verified
directly rather than by the collectible validator (which only covers the 24 catalog
slugs): no partial alpha, no off-palette pixel, no pure black or white, resting on its
bottom row, horizontally centred to the pixel. Composited into the real shell at
`TRAY_BOX` it sits inside the tray recess rather than floating.

**It fills 44 × 29 of its 30-unit slot**, and getting there took a third candidate. The
second was drawn at a 2.88:1 aspect — a genuinely thin pizza box — which letterboxed to
44 × 15 and sat entirely *inside* the tray recess. That was acceptable but not what the
geometry describes: `objects.ts` says the 30-unit height *"puts its lid at y 276, above
the tray's back edge — which is what a box on a tray looks like from this angle."* The
squarer candidate at 1.52:1 does exactly that, and is markedly more legible at real size
— which matters, because this is the object a manager taps at the most exciting moment
in the product. Composited into the real shell it rises above the rim as specified and
rests on its bottom row.

The flat candidate is **kept, not deleted** (`AUTONOMY.md §5`), renamed to
`_source_object_box_owned_flat_rejected.png` — the `_` prefix is how `process-art.ts`
skips a file, so the surviving candidate is unambiguous rather than winning on
alphabetical order.

**The style failure is worth carrying forward.** The box's first attempt came back as
smooth vector art because the reference attached to the prompt was an upscaled, soft
crop — the word "pixel art" in the prompt did not survive it. Replacing that reference
with *shipped* assets at 10× nearest-neighbour, plus the room's own tray with the slot
outlined, fixed it in one pass. **Reference images beat adjectives.**

**The recurring defect was framing, and it is now mechanical.** Across three rounds of
candidates, **not one** arrived usable: every one was either non-square against a
square target (which `process-art.ts`'s `fit: 'fill'` visibly squashes) or left the
object floating 3–30% above the bottom edge, failing the anchor rule. Asking a
generator for a pixel-exact bottom-anchored square frame is asking it for the one thing
it is worst at, so `scripts/prepare-incoming.ts` now does it — crop, background key,
debris removal, aspect, centring, bottom anchor — as a committed step *before*
`art:process` rather than a hidden stage inside it. Commissioner, 2026-08-03: *"Framing
defects should generally be handled mechanically."*

Two of its steps are worth knowing about:

- **`keepLargestComponent`** drops detached debris — it removed 112px of floating
  sparks from the burn barrel, which at 46px would have dragged the alpha-derived
  affordance glow out past the silhouette.
- **`dropCoolBase`** removes a cool ground slab from under a warm object, and the
  separator is **measured, not guessed**: every slab pixel sampled is cool
  (blue − red between **+9 and +30**) while every object pixel including the pot's own
  near-black outline is warm or neutral (**+1** or negative). The palette makes that
  durable rather than lucky — `palette.json` has no cool ink and its shadow rule is
  *"one step darker within the same ramp"*, so a correctly-drawn warm object cannot
  produce a cool pixel. It cleared 5,309px from the Bapple Tree and 4,195px from the
  sauna.

`lib/assets/art-slots.test.ts` no longer asserts "all 24 are placeholder"; it asserts
**15 placeholder / 9 generated**, hard-coded rather than derived, because a derived
count would pass whatever the registry happened to say — which is the drift it exists
to catch.

### Next executable task, in order

1. **The revised box candidate** — same approved Tony's branding, corrected camera
   angle and 44×30 canvas. The revision package handed to the art-generation session
   has the exact crop references. **The angled box has no runtime consumer**: `/counter`
   renders no box artwork at all (a text panel above a `BuyBox` control), so a
   purchase/menu view is a new registry slot *plus* a code change, not an art swap.
2. **The remaining genuine regenerations**: framed jersey (remove accidental
   numerals), arcade cabinet (remove all text, fix missing alpha channel).
3. **Mechanical-only fixes** on the candidates that only need cropping: mug, singing
   fish, burn barrel (plus removing its floating sparks and faint cast shadow), and
   all six brand-approved items once their content is otherwise acceptable.
4. Once 12 collectibles clear `npm run art:validate`, register them and update
   `lib/assets/art-slots.test.ts`'s placeholder-count assertion deliberately.

---

## Where the product is — 2026-08-01 (eighth session)

### The text-surface refresh — a cause, not a screen

**`main` is `c3dc077`** (PR #53 merged). Branch:
`claude/text-surface-tuesday-slice-fouqq1`, which was already sitting on that
commit with nothing on it.

The direction named the commissioner's **review-refused screen** as a worked
redesign — same route, same structure, same purpose, substantially better
hierarchy — and asked for that quality level in the running product. Underneath
the screen was a cause:

| | Before | After |
|---|---|---|
| Distinct font sizes | **16** (8px → 26px) | **6** — `13 · 15 · 17 · 19 · 22 · 26` |
| Typography call sites | ~200 arbitrary `text-[Npx]` | **0** outside the type case |
| Call sites at 8–9px | **7** | 0 |
| Arbitrary line heights | 11 distinct | 0 outside the type case |
| A typography module | none | `lib/design/type.ts` |

Restyling one screen would have been the **fourth** "raise the small type" pass
in this repository, and each of the previous three left instances behind:
`LEGENDARY` on cream was repaired and came back on a surface no screenshot could
reach; the Back Hall's 9px reveal line was repaired in #48 while five more 9px
sites survived it. Fixing instances is how a class of defect becomes permanent,
because instances are found by looking and looking does not scale.

### The sizes are measured, not chosen

The two faces are not interchangeable at a given size, and the numbers decided
the scale rather than taste:

- **Silkscreen's capitals at 15px are exactly as tall as VT323's at 17px.** That
  is why the display roles sit lower on the number line than the body roles and
  still mean the same thing to a reader.
- **Silkscreen is half again as wide per character** — 10.31px against 6.00px at
  the same nominal size. A sentence in the display face runs out of a 360px phone
  in about twenty-six characters, which is exactly how the press desk ended up
  with a 12px metadata line: the size was chosen to make the *string* fit rather
  than the words legible.
- `TONY’S TUESDAY SLICE` is **361px at 26px and 306px at 22px**, against a 290px
  column at 360. The nameplate has therefore *always* wrapped, wherever the
  browser chose. It is two deliberate lines now.

Nothing is fluid and nothing is fractional. Both faces are pixel faces, and a
size landing between two device pixels resamples the glyph grid — the same defect
`tony-talks` was found rendering at half a pixel.

### Enforcement is two halves, and neither is sufficient

- **Static** — `lib/design/typography.test.ts` fails `npm run check` on a size,
  a fractional or fluid size, an arbitrary line height, or an inline
  `fontSize`/`lineHeight` anywhere outside `lib/design/type.ts`. It skips lines
  that are entirely prose, because this repository documents the sizes it moved
  away from inside the comment explaining why.
- **Runtime** — `checkTypeFloor` measures the **computed** size of every visible
  text-bearing element on every state at every width. That is the half a static
  scan cannot reach: a size inherited and re-set smaller by a stylesheet, a size
  that exists only in one state, a size the browser supplied.

**One declared exemption**, and the first run is what proved it had to be
declared rather than inferred: every one of the 612 failures on that run was the
same thing — the two-digit season year painted on a champion's pennant, 8.2px at
360. It is capped by an 18 × 15 unit piece of fabric and cannot reach thirteen at
any width. It now carries `data-environmental-type` in the markup, the driver
**fails if a second kind ever appears**, and the year was raised from 7 to 9 room
units (8.2px → 10.1px), which is as far as the pennant goes. Recorded as visual
debt 14 rather than called fine.

### What the screens actually gained

`components/scene/text-surface.tsx` is the printed vocabulary — mounted sheet,
masthead, printed rules, plaques, a drawn warning glyph, a bordered ledger. Two
surfaces, deliberately not one card component: the Slice is a newspaper and the
desk is a proof sheet on a clipboard, and what they share is typography and
spacing rhythm rather than a container.

The review screen answers its six questions by **geometry**: a stamp for the
state, a warning block with a drawn glyph for *can this be printed*, and the
validator's findings as a **ledger** — keys left, offending values right-aligned,
a rule between findings. They were a bulleted list of run-together clauses in
three mixed sizes, where the value was the least distinguishable thing on the row.

Two more came from looking at the screenshots rather than from the brief: `STAFF
ONLY` in red led the row on a refused draft, so the loudest thing on the screen
was a permanent fact about the door; and a secondary story's headline and its own
score line were both 17px display, which is not a hierarchy.

### The one behavioural defect, and the boundary that holds the rest

**A drawn game printed *"A over B"***. `leftWon` is false on a tie and the
board's separator was the literal word `over`, so a result neither side won was
stated as a win on the surface the league reads as true. `RenderedScore` has
carried `tie` since it was written and nothing read it.

Everything else is presentation, and `components/slice/presentation.test.tsx`
holds it rather than asserting it in prose: the display components may not import
`lib/stats`, `lib/slice/select`, `lib/slice/packet`, `lib/slice/validate`,
`lib/slice/edition` or the database, and may not do arithmetic on a fact.
**`Edition` is untouched**, so no content hash moved and no stored draft needs
migrating — the masthead's championship flag reads `character`, which the
renderer already derived.

### Visual debt 12 reproduced, on the branch point rather than on this branch

The before/after capture was for the pull request, and it answered an open
question for free. A full 85-state sweep of **`main` at `c3dc077`, unmodified**,
produced exactly one failure: the intermittent React **#418** structure mismatch,
at 375, filed under **`demo-collection-empty`**.

CI had filed the same error under `slice-blowout` on PR #53's run, and the note
recorded then said the state name was weaker evidence than it looked because the
driver attributes an error to whichever state was current when it *arrived*. Two
sightings on two unrelated routes is that prediction coming true — it is one
intermittent defect, not two — and it is **not introduced by this branch**, which
is the other thing a before capture is for.

### Exact repository state

| | |
|---|---|
| `main` | **`c3dc077`** — PR #53 merged |
| Branch | `claude/text-surface-tuesday-slice-fouqq1` |
| `npm run check` | green — **1146 tests across 70 files** (was 1120 / 68) |
| `npm run visual:qa` | green — **85 states × 3 widths**, production build, fresh database. See below |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Known and accepted |

### The visual gate, said precisely

The final sweep was run **twice**, and both results are on the record because
reporting only the second one would be the false green this repository has
shipped three times.

| | |
|---|---|
| Run 1 | **one failure** — the React #418 structure mismatch, at 360, filed under `tray-owned-box` |
| Harness change | console errors now carry `page.url()` read **at the moment the error arrives** |
| Run 2 | **green** — 85 states × 3 widths, 0 failures, same production build |

The re-run was not "until green". Run 1's single failure is the intermittent in
visual debt 12, the same sweep on **unmodified `main`** produced the identical
error at a different width and a different state name, and the change between
the runs was to the **driver's attribution** rather than to anything it measures.
What is still true after run 2 is that a known intermittent exists and this
branch did not introduce it.

### The next executable task, in order

1. **The Tuesday job** (`16 §4.3`'s second cron) — unchanged by this slice and
   still first. `vercel.json` with the two allowed jobs, a secret-protected route,
   and a decision about what the job does when a week refuses to draft.
2. **Tony's clip at the glow-off transition** — visual debt 13, and the timing is
   the finding rather than a detail. It is *not* debt 7, which is closed and has a
   frame-sampling gate on it. `docs/TEXT_SURFACE_BOUNDARY.md §10` scopes it.
3. **Visual debt 9** (the parlor ceiling) and **10** (`.affordance-on-request`).
4. **Batch B**, whenever the PNGs arrive. One command.

### What this session did not start, and why

**The Tonight board's type in room units.** The board's hero and detail are still
fixed px, sized from the vocabulary and verified to fit `TONIGHT_FIELD` at all
three widths. They arguably belong in room units like the pennant's year — the
field is painted and scales, the type does not — but that is a Tonight-board
change on the homepage rather than a Slice change, and absorbing it here would be
taking scope from a later slice instead of proposing it.

---

## Where the product is — 2026-08-01 (seventh session)

### The Slice review chain — what the Tuesday job was actually waiting on

**`main` is `27cdbc7`** (PR #52 merged). Branch:
`claude/resume-autonomous-product-direction-6og8ui`, cut fresh from it.

The checkpoint's queue put the Tuesday cron first. It was **not buildable**, and
the reason had nothing to do with the operations it calls:

- `16 §4.3`'s chain ends **`draft Slice → notify commissioner`**
- `16 §9` requires commissioner approval before the first season publishes
- there was **no review queue, no approval state and no publication record**
  anywhere in the repository — `lib/slice/edition.ts` said so in its own header

So scheduling it would have published an issue nobody approved, or dropped the
draft on the floor. A **governance** gap rather than a functional one, which is
why it outranked every other candidate: it is the only thing blocking the
highest-value item already in the queue.

```
generateDraft ──► submitForReview ──► approve ──► publish ──► the rack
     │                                   │
     └── the validator refused it        └── reject, with a reason
         → visible, unapprovable             → terminal; revision is a new version
```

`/admin/slice` is the desk. `/admin/slice/<version>` is one draft and the
decision about it: the paper **as it will print**, rendered by the same
`<Newspaper>` a manager reads, above the candidates and their significance
scores, what was moved down the order, what was left out and why, the numbers and
names the issue is allowed to use, and the validator's verdict (`08 §22`).

**The rack changed for managers, and that is the point.** `rackIssue` prefers the
most recently **published** issue and falls back to the historical rendering only
while nothing has ever been published. Once the chain has approved anything, an
unapproved rendering cannot reach a reader — which is `16 §9`'s gate made real on
the reader's side rather than asserted on the writer's.

### What is in the database rather than in a service

Twenty-three tests against a real Postgres, each asking the database for the
wrong thing:

- **A version's content is immutable.** An approval that could be applied to
  different prose than the one that was read is not an approval
- **Regeneration is idempotent by natural key** — `UNIQUE(issue_id,
  content_hash)`. A retried Tuesday appends nothing
- **A version the validator refused can never be approved or published**
- **Publication requires a recorded approval naming a person.** The trigger reads
  `slice_reviews`, not the status column, so a service that skipped the review row
  could not publish
- **One published version per issue**, and the issue's pointer must agree with it
- **The manual hold blocks publication at the database**, for every caller
  (`16 §9` makes it permanent)
- **Review history and holds are append-only**

### Three defects the tests found

1. **Ten simultaneous publishes produced five publication rows.** The
   already-published check is a *read*, and under READ COMMITTED four
   transactions had read `approved` before the first committed; the status update
   then re-read a row that was already `published`, found `NEW.status =
   OLD.status`, and returned without complaint. Fixed with a natural key —
   `UNIQUE(version_id, action)` — not a better check.
2. **The content digest did not survive a round trip.** `content` is `jsonb`,
   which is a parsed structure rather than a byte store, so Postgres re-emits keys
   in its own order. The digest is what an approval *names*; one that only matches
   before a round trip cannot be verified. `editionHash` is canonical now.
3. **The record printed itself out of order.** `occurred_at` comes from the
   injected clock, so two decisions inside one transaction share an instant, and
   the screen printed *"put up for review"* above *"drafted"*. `slice_reviews.seq`
   is an identity column and the history orders by it.

### Three defects found by looking

1. **The hold ate the entire first screen** — a text field and a red STOP THE
   PRESS as the first thing on the desk, so *"what is waiting on you"* started
   below the fold and **three desk states photographed byte-identically**. The
   hold's state is a banner at the top when it is on; its switch is at the foot.
2. **`Tony&rsquo;s press`, printed as text** — an entity inside a JSX expression
   is a string, not markup, on the one screen whose job is to be believed.
3. **"put up for review it"** — verbs with ` it` appended, correct for five of six
   actions. `components/slice/review.test.tsx` fails on the old behaviour.

Plus *"left out, and why"* printing one sentence twice (a suppression's detail
names what **beat** the story, not which story lost), and *"AS IT WILL PRINT"* as
cream type on the counter's checker at 360.

### The demo states, and the one that could not be driven

Seven: `review-empty` · `review-waiting` · `review-held` on the desk, and
`review-draft` · `review-refused` · `review-approved` · `review-published` on the
draft's own screen.

**Four are on the draft rather than the queue because the queue could not tell
them apart.** An issue belongs to the **league**, not to a seat, so the desk's
sections accumulate as each state is applied and by the last one every desk looks
the same — four states photographed identically before this was found.

**`review-empty` is a preview parameter** (`?desk=empty`), for the same reason
plus one: the driver loops widths on the outside, so an empty desk cannot survive
its own run.

**`review-refused` doctors one sentence and nothing else.** The renderer and the
validator agree on every week of both finalized seasons, so asking the pipeline
for a refused draft is asking it for a defect. The demo puts a score nobody
posted into the deck and runs the **real** validator over it; the applier
**refuses** if the doctored issue passes.

Every press-desk seat carries the commissioner's keys, set behind both demo
guards. `requireAdmin()` answers `notFound()`, so a seat without them renders a
**404** that photographs cleanly and passes every pixel gate — which is what
`checkReviewDesk` and `lib/slice/review-coverage.test.ts` exist for.

### What is deliberately not built

`08 §22` lists fourteen things. Three are absent by decision, recorded in
`docs/SLICE_REVIEW_BOUNDARY.md §7`:

- **no prose editing** — a free-text box would let a sentence no validator passed
  reach the surface the league reads as true. Approve, reject, regenerate is a
  *stronger* guarantee than the one `08` asked for
- **no candidate override** — `MANDATE §9` makes Stats the sole authority on what
  a result meant. The screen shows the scores and the suppression reasons, which
  is what makes the selection arguable
- **regeneration cannot change the facts** — locked by construction rather than by
  a rule, because the renderer is deterministic

### Exact repository state

| | |
|---|---|
| `main` | **`27cdbc7`** — PR #52 merged |
| Branch | `claude/resume-autonomous-product-direction-6og8ui` |
| `npm run check` | green — **1120 tests across 68 files** (was 1060 / 64) |
| `npm run visual:qa` | green — **85 states × 3 widths** (was 77), production build, fresh database |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Known and accepted |

### The next executable task, in order

1. **The Tuesday job** (`16 §4.3`'s second cron) — now unblocked, and the
   remaining work is **operational** rather than structural: `vercel.json` with
   the two allowed jobs, a secret-protected route, and a decision about what the
   job does when a week refuses to draft. Everything it calls —
   `finalizeWeek`, `authorStakesForWeek`, `settleSeason`,
   `generateDraft(..., { submit: true })` — exists, is idempotent and is tested.
2. **The casino foundation** — one game, server-authoritative. It brings
   `/underground`, which makes `back-hall-both-open` photographable and turns
   `openTo('curtain')` from a throw into one line. **Note the contradiction:**
   `CLAUDE.md` puts the casino at P10 and explicitly *"not in v1"*, while the
   checkpoint's older queue lists it third. Resolve before starting it.
3. **Visual debt 9** (the parlor ceiling — a targeted regeneration, not a filter)
   and **10** (`.affordance-on-request` — a `RoomDisplay` decision).
4. **Batch B**, whenever the PNGs arrive. One command.

### What this session did not start, and why

**The Tuesday cron itself.** The slice stops at the boundary on purpose: a cron
with a schedule is an operational commitment that runs on a timer against
production data, and the desk's *"print a draft"* button already calls the same
operation, so the whole chain is walkable today without one. Starting it here
would have meant shipping a scheduler in the same change as the approval gate it
publishes through — and the gate is the thing that needed reviewing.

---

## Where the product is — 2026-08-01 (sixth session)

### The homepage-polish slice — Tony holds still, and the board is a board

**PR #51 is merged**, both required gates green on real runners, `main` at
`f79290a`. The homepage slice was built on top of it.

**Tony's clip was a CSS rule and there were two of them.** `.showing-taps
.tony-mark` lifted him 2px over a 260ms eased transition, on at 1600ms and off at
4900ms — which is *"a few seconds after the homepage has been sitting there"*,
exactly. The counter's cut moved about two sprite rows up his apron and he was
resampled at fractional offsets on both ramps. It is not the hydration mismatch
and the repair for that is untouched. The reveal keeps its meaning as an
alpha-derived warm edge and moves nothing.

**The regression is `checkTonySteady`**, and it is the useful kind: it samples
Tony **every animation frame** across five passes at all three widths, asserts it
covered both sides of 1600ms and 4900ms rather than passing on an empty set, and
**fails on the old CSS with 12 failures**. On its first green run it then found a
defect no screenshot could have: `tony-talks` was on `steps(2, end)`, and a CSS
timing function applies between each *pair of keyframes* rather than across the
animation — so it rendered `0, -0.5, -1, -0.5`. **Half a pixel, on every sentence
Tony has ever spoken.** `step-end` gives the two positions it always meant.

**The art is three measured corrections** in `scripts/clean-parlor-surfaces.ts`,
in the same shape as `shift-tonight-board.ts`. The Tonight board's face is a flat
cream writing surface; the back wall and the alcove are despeckled; the alcove
behind Tony is one value step darker. All post-quantization, because both defects
are made by the downscale and the palette snap rather than present in the
painting — `SHELL_AUDIT` recorded the alcove itself and accepted it. **No new art
files.** Mechanism per surface: `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §9`.

Two things were deliberately **not** done and are recorded rather than omitted:
the ceiling (visual debt 9 — the despeckle dashed its diagonal grid lines, so it
needs a targeted regeneration) and `.affordance-on-request` (visual debt 10 —
dead CSS, and wiring it collides with the glow gate).

### The Tuesday production job stays deferred, and here is the check

The standing condition is that it activates only if *"the current canonical
review and publication rules make its safe production activation fully
defined."* They do not, and the gap is specific rather than a matter of taste:

- `16 §4.3`'s Tuesday chain ends **`draft Slice → notify commissioner`**, and
  `16 §9` requires commissioner approval before the first season publishes.
- There is **no review queue and no approval state anywhere in the repository**.
  `lib/slice/edition.ts` says so in its own header: the rack works *"without a
  review queue"* because *"the approval gate belongs"* elsewhere, and elsewhere
  has not been built.
- There is **no `vercel.json` and no cron route**. The two allowed jobs are
  specified and unscheduled.

So activating it would either publish a Slice nobody approved or schedule a job
whose last step has nowhere to go. Everything the job would *call* exists and is
idempotent — authoring, settlement, week finalization, the Slice draft — which is
why this is a scheduling and approval gap rather than a functional one. It is
still a gap, and the job stays off until the queue exists.

---

**PR #50 is merged and its integration is verified**, not assumed:

| | |
|---|---|
| `Typecheck · Lint · Test · Build` | ✅ success, completed **08:13:16Z** |
| `Screenshots · gates` | ✅ success, completed **08:29:46Z** |
| Merged | **08:33:59Z** — after both, by `juncaj93`, into `main` at **`fbc6ee9`** |
| Post-merge `main` push run | ✅ success, **08:34:01Z** (run `30692013019`) |
| Deployment | Vercel deploys on push to `main` and the push run is green. **The hosted result has not been loaded by anybody** — the sandbox proxy denies CONNECT to `*.vercel.app`. Stated plainly rather than implied |

Everything the resume instruction asked to preserve is intact and now has a test
behind it where it did not: the invariant `SpokenLine` skeleton
(`spoken-line.test.tsx`), no retyping on return, seeded server-side content draws,
`Math.random` as a lint error, the Back Hall as a room, `roulette` unopenable by
any route, `openTo()` throwing rather than linking to a missing page, and the
repository-wide NUL-byte check. The hydration investigation was not reopened.

---

### The weekly-stakes slice — one system, three families

`16 §9`, verbatim: *"Weekly stakes (one table, type discriminator)"*. Built as one
object rather than three features, because that is what they are: **a claim made
in advance from verified facts, checked later against finalized ones.** What
differs is who makes the claim and what is riding on it.

```
lib/stats → lib/stakes/facts.ts → author.ts → [the board] → resolve.ts → service.ts → apply_token_delta
                (the boundary)                                (pure)      (one txn)
```

| | |
|---|---|
| `model.ts` | The shapes. Knows no football at all |
| `facts.ts` | **The Stats boundary.** Every fact a stake knows comes through here, and it computes nothing of its own |
| `author.ts` | Deterministic authoring. Nothing draws, samples or picks |
| `resolve.ts` | Pure resolution. The return value **is** the audit trail |
| `service.ts` | Reads, picks, and one-transaction settlement |
| `copy.ts` · `render.ts` | Curated prose through **the Slice's own validator** |
| `boards.ts` | Seventeen named states, `?board=<key>`, writing nothing |
| `chalkboard.ts` | What the sign and the paper read |

**Tony's Line** is the market `16 §9` describes: the line is the **lower median
team-week score to date**, the manager takes over or under on their own team,
the stake is fixed and the payout is fixed at 2× — enforced by
`weekly_stakes_line_pays_double` in the database, so no service can change the
multiplier. It needs no projection of any kind, which is what killed the
prop-bet system it replaces.

**Bounties** are one stored number chosen at authoring and frozen there: *beat the
best single week anybody has posted this season*. Machine-checkable by a
comparison, rolling four weeks, auto-settling to whoever cleared it first.

**The chalkboard** is three prediction shapes tried in a fixed priority order —
the record standing, the leader holding, the bottom club losing — with a
no-repeat rule that **reorders and never silences**. The Slice made the opposite
mistake once and printed *"a quiet week"* above a fifty-one-point win.

### The contradiction the tests found, and what it cost to fix properly

Two standing rules were both in force and could not both be satisfied:

1. **A stake settles only from finalized results.** Anything else moves tokens on
   a number that can still change — and `16 §12` records four rosters whose 2024
   standings and weekly points disagree because stat corrections kept landing
   after the season closed.
2. **`apply_token_delta` refuses a finalized season.** `03 §6` closes the books.

With season-level finality as the only kind, **a stake was settleable exactly when
it was unpayable.** Every payout raised. Nothing about it was visible from
reading either rule; it took a database test asking for the whole loop.

Neither rule was relaxed. They are about different things — a **week** is final on
Tuesday, a **season** closes in January — and `16 §4.3` already allows exactly the
job that draws that line. So `week_finalizations` exists, `weekFinality()` is the
one predicate both the Slice and stakes will ask, and a stored resolution records
**which source it trusted**. The Tuesday job itself is still unbuilt; the record
it writes is not.

A second correction came from the same test run: `buildBasis` was refusing open
seasons, which made a season-median market unbuildable in the only season it will
ever run in. **Authoring reads what is known now and freezes it; settlement waits
for the books.** The freeze is `weekly_stakes_terms_immutable`, not a refusal to
author.

### What is in the database rather than in a service

Every one of these is asserted by asking the database for the wrong thing:

- **A stake resolves once, ever** — `stake_resolutions.stake_id UNIQUE`, inserted
  **before** any token moves. `0004`'s natural-key argument, not `0005`'s
  caller-supplied key. Ten parallel settlements produce one payout
- **A pick is immutable and settles once** — from null, by trigger. A manager who
  could switch sides after kickoff is not making a prediction
- **A published offer's terms cannot move** — so a stat correction in March cannot
  settle a different bet from the one taken in October
- **Only the outcomes a kind can have** — a prediction cannot resolve `unclaimed`,
  a market cannot resolve `hit`. A trigger, because the discriminator is on
  another row
- **A market pays exactly double**, a prediction carries no money, and only a
  bounty rolls — three CHECKs
- **Nothing has its own balance-writing path.** Two new `token_reason` values and
  derived idempotency keys; `apply_token_delta` is untouched

### Three defects found by looking, not by testing

1. **`undefined off your tab either way`** — on the market's own price line, the
   number a manager is being asked to commit. `economyFor` cast stored jsonb to
   `EconomyValues` with no evidence, and the first value ever *added* to the
   economy left every environment seeded before that change serving a row without
   it. Nothing threw. It now refuses a partial config as loudly as a missing one
2. **The waiting sentence printed twice** in one small panel, four lines apart —
   a component repeating itself rather than a shop saying one thing. It is a
   question about *the week*, so it is said once, at the foot
3. **The prediction and the bounty shared an eyebrow** — both read `ON THE BOARD ·
   WEEK 4`, a label that identifies the panel rather than the item in it.
   Unmissable on the Slice's band with all three up, and invisible on the sign
   where only two ever appear

### Seventeen states, reachable by name, writing nothing

`lib/slice/editions.ts`'s design, deliberately: a board is a **rendering**, and a
rendering demo has no state to isolate. `?board=<key>` resolves on the server
behind the demo system's own two guards, runs `buildBasis → authorX →
resolveStake → renderStake` — the same four functions production runs — and
**writes no row of any kind**, asserted by reading the module for a write.

Twelve come from real weeks of the finalized seasons, chosen by reading what the
pipeline actually produces rather than by guessing. Two are frozen fixtures for
states history does not contain. Two are deliberately empty. One is the quiet
slate, which is what a real manager meets today.

**Writing the catalog test found two lying states:** `chalkboard-missed` pointed
at a week where the record *stood*, and `line-won` / `line-lost` were swapped
because the first team in stored order came in under a line the state assumed it
had cleared.

**Idempotency, duplicate settlement and overdraft are not in the catalog**, and
that is deliberate: a screenshot cannot show a database guarantee. They are
thirty tests against a real Postgres. Pretending a picture of a settled board
proved one would be the false green this repository has shipped three times.

### The sign is a chalkboard now

`18 §3.4` gives it two things — the weekly prediction, and Tony's Line once its
flag is open — and the slate is 37 room units, which `objects.ts` measured and
ruled trigger-only. So the slate carries the board's **state**, drawn as marks
rather than text:

| | |
|---|---|
| **quiet** | two faint erased strokes. Residue |
| **written** | four chalk lines of uneven length under a heavier rule |
| **settled** | the same writing, struck through |

Uneven lengths on purpose: four equal bars read as a loading skeleton, which is
the exact thing `VISUAL_ACCEPTANCE §4` rules out. It **brightens; it never
glows** — `18 §3`, only Doors glow. A manager cannot read the prediction from
across the room and was never meant to; what they can tell is whether there is
anything to read.

**The bounty is not on the sign.** `16 §38` puts all three on the paper, and a
third item on a 37-unit sign would absorb another surface's scope into a homepage
`18 §3` fixes at eight objects. So the Slice gained a band under the sheet —
outside the `Edition` pipeline, because a stake is a claim about something that
has not happened and `Edition`'s whole guarantee is that everything in it is
finalized.

### Tony's Line ships shut, and that is the honest state

`tonysLine` is a fourth feature flag, `false` on this deploy. `18 §3.4` puts it
behind one verbatim; `16 §9` puts it in v1 scope. Both hold — a deploy-time flag
opens for everyone at once, which is how `18 §6` says a shut destination opens.

It is also the only honest state today: the line is a season median and the 2026
season has no games. Authoring one now would be the *"weekly reward that fires on
nothing"* the checkpoint already warns against, with tokens attached. **The live
board today is the quiet slate**, which is why that state got the design
attention.

### Exact repository state

| | |
|---|---|
| `main` | **`fbc6ee9`** — PR #50 merged, both gates green before the merge |
| Branch | `claude/weekly-stakes-slice-7l8d1i` |
| `npm run check` | green — **1060 tests across 64 files** (was 950 / 61) |
| `npm run visual:qa` | green — **77 states × 3 widths** (was 59), production build, fresh database |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Known and accepted |

### Commissioner direction, 2026-08-01 — homepage visual cleanliness

**Recorded, not started.** It arrived explicitly non-interrupting: no in-flight
pull request or gate was to be stopped for it, and none was. It lands on the
**next coherent homepage/parlor visual-polish slice**, or on any slice that
already touches Tony, the Tonight board, the homepage shell, room rendering or
visual QA.

`docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md` carries the whole of it. Two things in it
are worth surfacing here because they change what the next session does first:

**1. Tony still clips briefly, seconds after the homepage settles.** Observed
hosted. It is a **separate defect from the hydration mismatch PR #50 repaired**,
and the direction says so explicitly — do not assume the invariant `SpokenLine`
skeleton resolved it. `#418` is a server/client tree disagreement at hydration;
this appears seconds after mount, long after hydration has settled. Treating the
second as the first's residue is how a real cause goes unlooked-for.

It is also **transient**, which makes one post-navigation screenshot worthless as
evidence — the same shape as the nine reveal states that photographed a calm room
and passed. The regression must be **timed or frame-sequenced** across the settled
homepage, several seconds idle, active idle frames, Tony speaking, Tony after
speaking and a return visit, at all three widths, and it must **fail on the old
behaviour**.

**2. The homepage reads as burnt, scratchy and muddy where it should read as
clean pixel art.** The Tonight board's face, the wall behind Tony, some
surrounding surfaces, and parts of Tony where texture or scaling smears him. The
board becomes a calm near-white or cream writing surface; the wall stops competing
with his silhouette; **Tony is not redesigned** — face, hairline, mustache,
cigarette, jersey, apron, branding, proportions and palette are all preserved, and
only rendering-or-texture dirt is cleaned.

**No new art is required from the commissioner**, and the direction is specific
about mechanism: fix CSS where rendering is the cause, regenerate a *targeted*
surface where the artwork is, fix the pipeline where the pipeline introduces the
noise, and use a deterministic replacement for a simple surface like the board
face. *"Do not cover a source-art defect with a fragile CSS patch."* **Which
mechanism was chosen for each surface is part of the deliverable.**

Recorded as visual debt **7** and **8**. Debt 7 is not minor — it is on the first
screen every manager sees — and it is on that list only because the direction that
recorded it was non-interrupting.

### One harness correction, worth carrying forward

The first full sweep aborted at **180 of 231 captures** on a demo-seat sign-in.
Nothing was wrong with the door: thirty-four sign-ins had succeeded, there were
**zero failed auth attempts** in the table (and the limiter counts failures over
twenty-four hours, so it was not the lockout), PIN verification measures **under a
millisecond** (so it was not argon2 under load), and the same seat signed in
correctly by hand against the same running server.

`enterPin` slept a fixed 2500ms and then asserted the URL had changed. The
assertion is *"the door opened"*; the evidence was *"time passed"*. It now waits
for the navigation with a fifteen-second budget, so a loaded machine costs time
instead of a false failure and a genuinely broken door still fails. It was the
last place in the driver asserting a clock rather than the thing it cared about —
the same correction the reveal states and the back-hall doors already carry.

### The next executable task, in order

0. **The homepage visual-cleanliness slice** — commissioner direction above, and it
   goes first among visual work. Tony's delayed clip is a correctness defect on the
   most-seen surface; the rest is one coherent slice rather than four small fixes.

1. **The Tuesday job** — `16 §4.3`'s second cron. It writes `week_finalizations`
   and calls `authorStakesForWeek` and `settleSeason`, both of which exist and are
   idempotent. This is what turns the slice from built into running, and it is
   now a small piece of work rather than a large one
2. **The commissioner review queue** for live Slice publication. `16 §9` makes
   approval mandatory in season one and the manual hold switch permanent
3. **The casino foundation** — one game, server-authoritative. It brings
   `/underground`, which makes `back-hall-both-open` photographable and turns
   `openTo('curtain')` from a throw into one line
4. **Batch B**, whenever the PNGs arrive. One command

### What this session did not start, and why

**The Tuesday job.** The slice deliberately stops at the boundary: every operation
the job needs exists, is idempotent and is tested, but a cron with a schedule is
an operational commitment — it runs on a timer against production data — and it
belongs with the commissioner review queue it will publish through. Starting it
here would have meant shipping a scheduler nobody had reviewed alongside a
settlement layer nobody had walked.

---

## Where the product is — 2026-07-31 (fifth session)

**Nothing has been pushed to GitHub as a pull request, and that is deliberate.**

### The standing constraint this session ran under

**COMMISSIONER, 2026-07-31: the account is near its monthly GitHub Actions allowance.**
`visual-qa.yml` runs on `pull_request`; `ci.yml` runs on pull requests and pushes to `main`;
pushing to a branch with **no open PR triggers neither**. That is the whole shape of the
conservation: work goes to a durable non-PR branch and the gates run **locally**.

Prohibited until the reset is confirmed: opening or reopening a PR · pushing to a branch that
has one · pushing to `main` · merging · manual dispatch · re-running a failed or cancelled run
· using CI as a debugging loop · several small PRs · deploying to verify routine work.

**The reset is not inferred from the calendar.** It takes an explicit commissioner statement,
or billing/usage evidence this session can actually read. Neither exists, so the work stays on
the branch. **No gate was weakened** — `npm run check` and `npm run visual:qa` both ran, in
full, locally, on a production build and a fresh database. Only their GitHub execution is
deferred.

At the time of writing there are **no open pull requests** on the repository, `main` is
`2073c7d`, and the working branch `claude/resume-product-direction-5d76fh` has no PR attached.

### Visual debt 6 is closed, and the recorded diagnosis was wrong

The parlor's intermittent React #418. Two theories were on the table and **neither survived
reading the error's own arguments**, which is the part worth carrying forward.

`#418` is emitted with the mismatch's *kind* as its first argument, and React writes exactly
one of two words there — `"text"` when a sentence differed between the server's HTML and the
client's tree, `"HTML"` when the **structure** did:

```js
// react-dom-client.production.js
Error(formatProdErrorMessage(418, isText ? "text" : "HTML", ""));
```

The failing run reported **`args[]=HTML`**. So a content line that changed between two renders
— the diagnosis this session was handed — could not have produced it. That is not a small
correction: it turns an unbounded search into one question, *what changes the shape of this
tree*, and the room had exactly one answer.

**`SpokenLine`.** It rendered a single `<span>` at rest and **two siblings with a nested
caret** while typing. And `TonyToy` passed `retypeOnChange` unconditionally, so on every parlor
load after the first, `arrived` was false, the typing delay was `startsAt = 0`, and the swap
fired as close to hydration as a timer can get. `receipt` runs eighth — seven parlor loads had
already primed exactly that state before the driver got there.

Three repairs, and only the first is the defect:

| | Repair |
|---|---|
| 1 | **The structure is invariant.** Both states render the same elements; the caret is hidden by a class rather than removed, and `typed` now only changes characters in a span that already exists. `spoken-line.test.tsx` compares element skeletons, so tidying the resting branch back into one span fails the build |
| 2 | **The greeting no longer retypes on a return visit** — which is what `spoken-line.tsx` said it did all along: *"coming back from the display case to watch a sentence reassemble itself would be an animation between you and information you have already read."* The greeting is not new; a poked line is, and `asked` is now the thing that says so |
| 3 | **`Math.random` is a lint error.** Never the cause here, and still a real breach: *"randomness only via `lib/counter/rng.ts`"* has been standing since M2 with only the clock half enforced, and `selectContent` defaulted its draw to `Math.random` **inside a server render** for four milestones |

### The content draw is seeded, and that is a product rule rather than a fix

`lib/content/draw.ts`. A content draw is a **property of a request** — this manager, this
surface, this Eastern day — not an event. Seeding it there means two renders of one request
choose the same sentence *before* anything is written to `content_usage_log`, which puts that
table back to being cooldowns and history rather than the only thing keeping Tony from changing
his mind mid-page.

`selectContent`'s `random` is **required** now. A new surface has to say what its draw is
derived from; it cannot inherit the hazard by leaving the field out. Three callers were wired:
the greeting and the stats aside seed on manager · surface · day, and the box offer adds the
shelf count. **One deliberately does not**: `anotherLineFor` is a poke, it must differ from
the last one, and it runs in a server action rather than a render — so it uses `rollBelow`,
the project's one injected RNG, which keeps it replayable and keeps the rule true everywhere.

The generator is pinned to specific values, not merely to self-consistency: a test that only
checks a seeded draw agrees with itself keeps passing through a change of hash, and every
manager's greeting would move silently on the day it shipped.

### What was measured, and what was not

**Not reproduced locally, and the attempts are worth recording so nobody repeats them:** a full
58-state sweep, ten timed reloads with a byte-for-byte diff of two server renders, fifteen
reloads at **10x CPU throttling**, and eight against a development build. Zero console errors,
**zero divergence between two server renders of the same request**, and one confirmation worth
keeping — a single request to `/` executes the page **once**, so the flight payload and the
HTML have never come from different renders.

The fix is therefore justified by the error's own argument and by the code, not by a
reproduction. Said plainly rather than implied.

**Walked in a real browser**, on the production build: first arrival types · return visit does
**not** · poking Tony does · zero console errors.

### Exact repository state

| | |
|---|---|
| `main` | **`2073c7d`** — unchanged; nothing was merged or pushed to it |
| Branch | `claude/resume-product-direction-5d76fh` — **no open PR**, and none to be opened until the allowance reset is confirmed |
| Open PRs | **none** |
| `npm run check` | green — **947 tests across 60 files** (was 907 / 56) |
| `npm run visual:qa` | green — **59 states × 3 widths**, production build, fresh database |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`, and it denies the Actions artifact host too — the failing run's screenshots could not be downloaded |

### The Back Hall is a room

Visual debt 5, closed. It was three stacked `PixelPanel`s with headings — *"a menu card"* almost
verbatim as `18 §5` forbids one — and the reason that mattered is not how it looked: the room's
grammar is **objects you can guess the destination of before tapping**, and a panel titled with its
own destination has already given up on it. Stairs going down do not need a heading saying they are
stairs.

It is built the way the parlor is. One portrait scene filling the viewport, three transparent hit
regions in room units, `Page oneScreen`, nothing scrolling, and the way out is a door in the wall.
`zone_back_hall_shell` is registered at `960x1707` — `320 × 569` at the pipeline's 3× scale, the same
as the parlor's — so the two rooms share one coordinate system and walking through the rear doorway
does not change the size of the world.

**The scene is drawn rather than signed.** The old reasoning — *"building against placeholders means
building it twice"* — is what kept this route a card grid for a milestone, and the commissioner's
ruling ended it. M3 had already shown the replacement: flat rectangles in palette colours at the
right size. `components/scene/back-hall.tsx` draws **from the same rectangles the hit regions use**,
so what a manager sees and what a tap lands on cannot drift. When the art lands, that file is deleted
and the overlays become `AssetView`s; nothing else moves.

**Nobody earns a hallway.** Open or shut is a **deploy-time flag** (`lib/flags.ts`) — a per-manager
unlock is progression, which `16` removes from this product, and `18 §6` says a door opens *"for
everyone at once, as an announced event"*. `roulette` is a reserved key that no path can turn on,
including the preview override, because it is a decision with a key attached rather than a feature
waiting for a switch.

#### Two findings, both from looking

1. **`back-hall-both-open` is a demo the boundary document asked for and the product cannot honestly
   produce.** `/underground` is *deliberately* not a route — the reveal is that you find out what is
   behind the curtain by being let in — so "the Underground is open" is not a state this product can
   be in. Rendering it means a `<Link>` to a page that does not exist, which is the defect the console
   gate caught here once before. The driver hung on `networkidle` against the 404, which is the most
   useful possible outcome. `openTo()` now **throws** rather than rendering a door onto nothing, and
   the state becomes photographable in the same change that gives the casino its route.
2. **The chain was part of the room instead of part of the door**, so the open stairwell was
   photographed chained. Nothing failed; the picture contradicted the page. Found on the state nobody
   will see for a year, which is exactly why that state is photographed — and now gated, so the two
   cannot disagree again.

#### What the gates check

`backhall.test.ts` (21) — three objects, all Doors · none overlapping · 44 CSS px on the narrowest
phone · the Underground's line verbatim from `18 §5` · **no digit and no "soon" on a shut door**
(`18 §6` bans countdowns) · nothing naming the casino · `roulette` unopenable by any route.
`driver-coverage.test.ts` (7) — every declared state has a case, an expectation and a gate.
`checkBackHall` in the driver — the hall's own object map, **which doors are open read from the DOM
rather than assumed from the URL**, the chain agreeing with the door, and the word for what is behind
the curtain never reaching the page.

That last one exists for the reason the nine `reveal-*` states did: `?open=` is resolved by the
**server**, so a server without `DEMO_FIXTURES=1` answers every state with the ordinary shut hall,
and a driver that only navigated would file it under a name claiming otherwise and pass.

### The next executable task, in order

1. **The casino foundation** — one game, server-authoritative. It brings `/underground` with it,
   which is what makes `back-hall-both-open` photographable and turns `openTo('curtain')` from a
   throw into one line.
2. **Tony's Line, bounties, the chalkboard prediction** — all read the fact packet that exists.
3. **The commissioner review queue** for live Slice publication.
4. **Batch B**, whenever the PNGs arrive. One command.

**When the allowance reset is confirmed**, the branch becomes **one** coherent PR — not several
narrow ones — carrying everything accumulated under the freeze.

---

## Where the product is — 2026-07-31 (fourth session)

**PR #47 and #48 are merged.** `main` is **`b0ce940`** — both gates green on real runners, and the
merge deployed. The integrated head was re-verified locally after the merge: 907 tests, 56 files.

**Not verified in a browser.** The sandbox proxy denies CONNECT to `*.vercel.app`. Local evidence is
a production build on a fresh database and 58 visual states × 3 widths; hosted evidence is a green
GitHub-side deploy and nothing more.

### The wearables contradiction is settled

**Commissioner ruling: collectibles and wearables are separate systems.** The 24 `collectible_*`
items are the pizza-box economy; the 12 `wear_*` assets belong to the modular character system. A box
awards `collectible_*` only. **Crossover is not approved** — its absence is a product decision, not
an omission somebody should close.

`art/assets.inventory.json` claimed the opposite for a week while every test passed, which is the
shape of defect the guard is written against rather than the sentence.
`lib/character/separation.test.ts` asserts it from the catalog, **the reward table itself**, both
registry families, and the inventory comment. Nothing about the shipped economy changed.

### M3's surface — built, walked, and fixed

`/profile/character`, under your keys rather than off the parlor: `18 §3` fixes the homepage at eight
objects, and the surface a character belongs to is a basement, which `16` defers to v1.1.

**The placeholder had to be drawn.** All twenty character slugs are placeholders and the universal
stand-in is a taped-up sign; six of those composite to six identical signs — no silhouette, no
visible layer order, and *nothing changes when you change your hair*. So the figure is flat
rectangles in palette colours, the precedent the pizza box and the collectible already set. Every
slug still resolves `placeholder` and `CharacterView` draws the PNG **per layer** the moment one
exists.

Because the stand-in is **data**, the clipping rules are arithmetic over the artwork the renderer
actually uses — exact rather than sampled, and a test cannot pass against geometry the screen does
not use.

**Six defects, and the pattern is the point.** Three were found by *looking*, and each rule written
from one immediately found a second instance the eye had missed:

| Found by | Defect |
|---|---|
| looking | The ponytail hung beside the head, meeting the cap at a single corner — satisfying every bounding-box, clipping and contact-row rule. The rule (*a layer is one connected piece; corner contact is detached*) then found the same defect in `avatar_hair_05` |
| looking | The pizza peel covered the ponytail completely. The rule (*a hand item never draws over a hairstyle*) then found a second instance, one column wide, in long hair |
| looking | The hoodie was two columns wider than the shirt and covered its own sleeves and hands — a head on a slab with **no arms** |
| walking | **Every section heading was `ink-900` on the dark room and invisible** — "Build", "Colouring", all four slot names. The inverse of the cream-on-cream defect that shipped on three routes. Fixed by making it one panel, which is also what stopped it reading as a website component |
| walking | The empty wardrobe — **what every manager meets today** — said *"Nothing for this yet."* four times across a third of the screen. The same defect already recorded against `/counter` |
| a test | The demo idempotency assertion collapsed eight wearables into one, because it keyed on `source_opening_id` and an **awarded** collectible has none. The assertion was wrong, not the product; both kinds are now checked by the key that actually guards them |

**Decisions worth knowing about:** one Save is one transaction and the equipment it sends is complete
rather than a patch, so a slot left out is emptied · preview is local because `composeCharacter` is
pure and nothing is public until you save, the opposite call to the Showcase picker for the opposite
reason · `drizzle/0009` touches `collectibles`, which `M3_CHARACTER_BOUNDARY §9` forbids, recorded as
a deviation with its reasoning — a partial unique index scoped to `wear_%`, zero existing rows
affected, giving a wearable grant a **natural key** so a future award system can hand one over
idempotently without rewriting M3.

**Nothing awards a wearable, and nothing here invented a source.** `16` approves none, so the empty
wardrobe is the honest state and it is the state that got the most design attention.

`equipped-wearable` — declared and refused since M2 — applies. `BLOCKED_ON_M3` is empty, and
asserted empty so parking a state there stays a deliberate edit.

### The Back Hall's 9px line is fixed; its structure is not

Visual debt 4 is closed. *"Don't worry about it."* — the whole reveal of the Underground — was set at
**9px in `amber-mid/70` on cream**, around 1.6:1, and is now set like speech at 17px `ink-900`.

**The panel structure was deliberately left alone.** It is three stacked cards, which is the menu
card `18 §5` forbids, and it is being replaced by a room — polishing it further would be polishing
something about to be discarded.

### Exact repository state

| | |
|---|---|
| `main` | **`b0ce940`** — PR #48 merged |
| Branch | `claude/tonys-pizza-tech-lead-s11qsw`, restarted from `main` after the merge |
| `npm run check` | green — **907 tests across 56 files** (was 867 / 53) |
| `npm run visual:qa` | green — **58 states × 3 widths**, production build, fresh database (was 49) |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Known and accepted |

### A hydration race the gate caught on a PR with no code in it

**PR #49 is checkpoint-only and its screenshot gate failed** on React #418 — a hydration mismatch —
at 390 during the `receipt` state. The identical tree passed on #48's run and on a full local sweep,
so it is a **race**, and re-running until green is the wrong response.

Two facts settle attribution: `receipt` runs at **position 8**, before every state M3 added, and every
`window` / `sessionStorage` / `matchMedia` call in the parlor's client components is already inside
`useEffect`. Nothing in #48 is upstream of it.

**This is the second instance of the same shape.** #46 found one against `demo-collection-empty` — a
page with nothing to do with the counter — because signing in redirects through the parlor and the
stats aside drew a fresh line on every render. That fix was per-cause; the symptom has returned from
somewhere else, which suggests the parlor has a class of non-determinism rather than one instance of
it.

Recorded as **visual debt 6** with what is known and what would find it: a run against the
non-minified React build, because minified `#418` names only *"HTML"*. **It is not to be dismissed as
flaky** — the gate is working, and the mismatch is on the first screen a real manager sees.

### The next executable task, in order

1. **The parlor's hydration race** — visual debt 6. Small, and it is a correctness defect on the
   product's most-seen surface. Do it before the Back Hall, because the Back Hall adds a route rather
   than removing a source of doubt from the one that already exists.
2. **The Back Hall as a room** — visual debt 5, and now unblocked. The commissioner's ruling is
   explicit: *"Do not block all Back Hall development on final art… use deliberate in-world
   placeholder architecture."* **M3 has just shown what that looks like** — a drawn stand-in at the
   right size, as geometry data, rather than a sign — so the old "building it against placeholders
   means building it twice" reasoning no longer holds. `docs/BACK_HALL_BOUNDARY.md` carries the route
   contracts, the flag-based state boundary (nobody *earns* a hallway), the five asset slots and the
   five demo states, all as flag combinations needing no database writes.
3. **The casino foundation** — one game, server-authoritative, after the Back Hall.
4. **Tony's Line, bounties, the chalkboard prediction** — all read the fact packet that exists.
5. **The commissioner review queue** for live Slice publication.
6. **Batch B**, whenever the PNGs arrive. One command.

### What this session did not start, and why

**The Back Hall room itself.** It is the next slice and it is scoped, not begun. Building it needs
the scene architecture, the flag boundary, five demo states, driver states and at least two
walk-and-fix rounds — the same shape as M3's surface, which took most of this session. Starting it
with a fraction of that would have produced exactly what the boundary document warns against: a card
grid with better paint. The typography defect inside it was small, real and independent, so that was
taken and the structure was not.

---

## Where the product is — 2026-07-31 (third session)

**PR #44, #45 and #46 are merged.** `main` is **`4ec55d8`** — both gates green on real runners, and
the merge deployed.

**Not verified in a browser.** The sandbox proxy denies CONNECT to `*.vercel.app`. Local evidence is
a production build on a fresh database and 49 visual states × 3 widths; hosted evidence is a green
GitHub-side deploy and nothing more.

**Batch B PNGs are deferred commissioner content** (ruling, 2026-07-31). They are not a blocker, not
to be requested again, and the repository does not idle waiting for them. The ingestion path stays
ready: `art/incoming/<slug>_01.png` → `npm run art:batch` → `--register`.

### ✅ Settled — collectibles and wearables are separate systems

**Commissioner ruling, 2026-07-31.** The contradiction reported below is resolved in favour of the
implemented product. `art/assets.inventory.json` claimed the twelve wearables were *inside* the
24-item catalog; **that claim was wrong** and the comment is corrected.

| | Family | Slugs | How you get one |
|---|---|---|---|
| Pizza-box collectibles | `collectible` | 24 × `collectible_*` | the loot box |
| Character equipment | `avatar` | 12 × `wear_*` | the character system (M3) |

Preserved unchanged: the 24-item catalog, reward-table behaviour, the rarity structure, M2's
persistence and idempotency, and the Batch B art contracts. **Crossover is not approved** — a box
awarding a wearable or a mixed reward needs a later explicit ruling, so the gap is a product decision
rather than an unimplemented feature.

`lib/character/separation.test.ts` guards it from every direction it could be undone from: the
catalog, the **reward table** itself, both registry families, and the inventory comment that was
wrong for a week while every test passed.

### The Slice, walked at real size

Five things, all found by looking rather than by testing:

- **A quiet week looked like a championship** — *"Not a lot to report"* at the same 26px a title
  gets. `EditionCharacter` already knows which is which, so headline size now comes from it:
  **26 / 22 / 19**. Strong news versus weak news as *type* rather than as intention.
- The dateline opened with *"Tuesday edition"* and wrapped mid-phrase at 360. The masthead above
  already says Tuesday.
- *"Last one Tony printed"* sat above the masthead, on the room — a caveat in front of the nameplate.
  It is a stamp on the sheet now.
- The colophon was four lines under a two-sentence lead. One.
- The championship — the biggest story the paper can print — was two sentences. Three now.

**Commissioner ruling applied:** above **`MATERIAL` (750)** the repeat penalty, the novelty discount
and the `same-kind` rule all stop applying. A record, a title or an `obliterated` margin is the news.
`same-game` stays above that line — one result is one story whatever it was worth, which is arithmetic
rather than a variety heuristic.

### Stats verification — three more, and one is the strongest yet

- **The regular season recomputed from fourteen weeks of raw points**, compared against the
  `wins`/`losses` Sleeper published **separately**. 2025 agrees exactly; **2024 disagrees for exactly
  four rosters — 5, 6, 9 and 10.** That is `16 §12` *measured* rather than quoted, and pinned so a
  fifth is a build failure.
- The table at **every** regular week, because a standings move is a claim about two adjacent weeks.
- Every winning run, counted **forward** from week one against a helper that counts **backward**.

### A hydration defect the harness found, and the product rule behind it

The visual sweep reported a React hydration error against `demo-collection-empty` — a page with
nothing to do with the counter. Signing in redirects through the parlor; the stats aside drew a fresh
line on **every render**, the server rendered one and something rendered again.

The aside now has the greeting's per-day cache. *"Stable dialogue during a page lifecycle"* is a
product requirement, not a rendering detail. **It reproduced only in a full sweep and passed in
isolation** — exactly the shape a per-state re-run dismisses as flaky.

### M3 — the character foundation, built

`drizzle/0008_character_identity.sql` plus `lib/character/`. Nothing touches `users`, `collectibles`,
`loot_boxes`, `season_memberships` or the ledger; Tony's homepage rendering is untouched.

| | |
|---|---|
| `layers.ts` | Two base layers (`body`, `hair`), four worn slots (`body`, `face`, `head`, `hand`) — **five slots** with hair, as the ruling index says. Six draw positions, fixed order, `32 × 48` |
| `catalog.ts` | The **canonical slugs**, `avatar_*` and `wear_*`. Order is the meaning of the stored integer: never reorder, only append |
| `composite.ts` | Pure. Configuration + equipment → ordered layers. Invalid composites to the default rather than throwing, and never persists the fallback |
| `service.ts` | Server-authoritative save / equip / unequip. Slot is **derived from the item**, never passed in |

Three guarantees are in the database, not in the service: **one item per slot** · **one place per
item** · **only what you own** (a trigger — an FK can say *"this is a collectible"* and cannot say
*"this is **your** collectible"*, exactly as the Showcase found).

**The first draft of this was wrong and a test caught it.** It invented `character_hair_short` at
`64 × 64` with `back` and `bottoms` slots — none of which exist. All twenty slugs, their slots and
their canvas were already canon in the registry. `character.test.ts` now fails the build in both
directions, and `docs/M3_CHARACTER_BOUNDARY.md` is corrected: it proposed the invented layer set, and
the registry's is authoritative.

**Still M3's, not started:** the manager-facing customiser flow, the `CharacterView` component, and
`?character=` preview fixtures. The data and the logic are done and tested; the surface is the next
slice.

### Exact repository state

| | |
|---|---|
| `main` | **`4ec55d8`** — PR #46 merged |
| Branch | `claude/tonys-pizza-autonomous-jizv8b`, restarted from `main` after the merge |
| `npm run check` | green — **867 tests across 53 files** |
| `npm run visual:qa` | green — **49 states × 3 widths**, production build, fresh database |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Known and accepted |

### The next executable task, in order

1. **M3's surface** — the customiser flow, a `CharacterView`, and `?character=` preview fixtures with
   the same three guards the Slice editions have (throw on a declared-and-unimplemented state, a
   marker the driver checks, a driver-coverage test).
2. **Back Hall environmental implementation.** The stacked-card treatment is **not** final and the
   9px amber-on-cream Underground line is a defect (`docs/VISUAL_DEBT.md` 4 and 5). Placeholders are
   fine; the structure has to be a room.
3. **Tony's Line, bounties, the chalkboard prediction** — all read the fact packet that exists.
4. **The commissioner review queue** for live Slice publication.
5. **The first casino foundation** — one game, server-authoritative, after M3 and the Back Hall.
6. **Batch B**, whenever the PNGs arrive. One command.

---

## Where the product is — 2026-07-31 (second session)

**PR #43 and #44 are merged.** `main` is **`cc9ac2f`** — CI green on a real runner, and the merge
deployed. `main` was `6740408` at the start of this session.

**Not verified in a browser.** The sandbox proxy denies CONNECT to `*.vercel.app`, so the hosted
result of this deploy has not been loaded by anybody. The local evidence is a full production build,
a fresh database and 49 visual states × 3 widths; the hosted evidence is a green GitHub-side deploy
and nothing more. Say that plainly rather than implying a smoke test happened.

### The Slice is a newspaper

The first implementation printed. It also printed the same three sentences every week, reported
**two of five games**, and read as a list of templated facts — which is what the commissioner
asked to fix, and what looking at nineteen consecutive issues in one column makes undeniable.

What an issue is now: a **masthead and dateline** · a **lead** with a headline, a score deck and a
short body · up to **two secondary stories** · **the board**, every publishable game of the week ·
**Tony's column**, curated and factless · a colophon. One sheet of paper, sections divided by
printed rules rather than by cards.

**A newspaper needs more than two shapes of story**, so the fact layer gained them. `lib/stats/`:

| new | what it owns |
|---|---|
| `week.ts` | the complete week — every paired game, resolved to the people who held those seats |
| `standings.ts` | the table *as it stood after week k*, recomputed from the games; `season_memberships` only holds the final one |
| `stories.ts` | twelve typed, evidenced, gated story kinds: blowout · nail-biter · tie · record margin · record score · high score · low score · upset · streak · standings move · championship · elimination |

Every kind above the floor needs a reason that is not *"biggest one this week"* — the same
two-independent-reasons discipline `significance.ts` already applied to margins. An upset needs a
**defensible baseline**, and the only one this product has is wins already on the board; there is no
projection and `16 §9` bans implying one.

`lib/slice/select.ts` is the desk: rank by significance, then **same-game**, **same-kind**,
**manager-repeat** and **novelty** across the previous two issues, every drop recorded with a
reason. Two floors mean a weak week publishes *fewer* stories — `LEAD_FLOOR` produces a **quiet
edition** that prints the board and says it was quiet, rather than promoting an ordinary result.

### Four defects the walk found, and one lesson worth keeping

1. **A retired manager could consume a story slot.** The publication boundary was applied to the
   finished story list. 2024 week seven was decided by 2.82 points between two current managers and
   the paper led with a streak, because the week's *overall* closest game involved somebody retired,
   the nail-biter candidate was built for that game, and it was then dropped with **nothing taking
   its place**. The boundary is now applied before derivation (`publishableWeek`). Pinned.
2. **Novelty silenced a real story.** The first cut subtracted the recency discount before the
   floors, and 2024 week ten printed *"A quiet week at the shop"* above a board showing a
   fifty-one-point win. **Novelty reorders; it never silences.** A front page that contradicts its
   own scoreboard is worse than a repeated headline.
3. **A hard-coded count in curated prose.** The quiet body said *"Five results"*; four is common,
   because retired managers' games are not on the board. Numbers come from the packet or they do not
   appear — a test now fails any curated string containing a digit.
4. **The record nobody can print.** The largest team-week on record is **188.02** and the widest
   margin **140.72**, and both belong to retired managers, so neither can ever be published. The
   comparison population still includes them, deliberately: a record measured only against
   publishable games would announce a record that is not one. `record-score` is therefore a fixture,
   and that is the layer being right rather than a gap.

### Fifteen editions, reachable by name

`lib/slice/editions.ts` — `/slice?edition=<key>`, resolved on the server behind the demo guard.
Eight are **real weeks of finalized seasons**; five are **frozen fixtures** for states history does
not contain; two are the empty rack. All go through the identical production pipeline, and
**nothing is written to the database** — a Slice demo has no state to isolate.

`npm run demo -- editions` lists them. Three things throw rather than rendering something plausible:
a key declared and not implemented, a fixture the validator refuses, and a driver state with no arm.
`lib/slice/driver-coverage.test.ts` fails the build for an edition the driver would never photograph
— the quiet failure that leaves no trace at all.

### Independent Stats verification, widened

`lib/stats/independent-verification.test.ts` is **6 tests → 19**, still recomputing from
`fixtures/sleeper/**` with `JSON.parse` and arithmetic in the file, calling nothing in `lib/stats`.
Added: ties · weekly high and low · closest and widest per week · the finalized population size ·
percentile placement · score-magnitude and margin-plausibility invariants · participants resolving
inside the right season · finalized-season immutability · canonical name versus Sleeper handle ·
retired managers absent from every published surface **and still present in the fact layer**.

### Exact repository state

| | |
|---|---|
| `main` | **`cc9ac2f`** — PR #44 merged, CI green on a real runner |
| Branch | `claude/tonys-pizza-autonomous-jizv8b`, restarted from `main` after the merge |
| `npm run check` | green — **831 tests across 52 files** |
| `npm run visual:qa` | green — **49 states × 3 widths**, production build, `DEMO_FIXTURES=1` on server *and* driver |

### Tony may mention a result, and may not change one

`lib/parlor/aside.ts` + `content/counter-stats.md` (approved 2026-07-31, eight lines, surface
`parlor_stats_aside`). The greeting stays the default — `17 §3`'s criterion is *one verified thing
about you* — and this is the exception, with a **fortnight** cooldown against the greeting's three
days.

Four rules, each enforced rather than intended:

1. **Only finalized facts.** The input is a `FactPacket`, which refuses an open season outright and
   has already applied the publication boundary. There is no path from an unfinalized week here.
2. **No calculation in dialogue code.** Every number is read off a published fact and written with
   the packet's *own* formatters.
3. **Nothing may change.** The rendered sentence goes through **the Slice's validator**, against the
   fact's own declared allowed sets. A name or number the fact did not supply is refused and Tony
   says nothing about football. One validator, not two — a second would drift, and it would drift on
   the quieter surface.
4. **Never during a moment.** Skipped whenever a moment tag is held, so it cannot collide with the
   welcome box, the waiting box or a reveal.

**One extension the validator needed.** `validateProse` now takes the *templates* a line was rendered
from and treats their capitalised words as house copy. A template contains `{winner}`, never
`Brandon` — a proper noun can only enter through substitution — so this is the same rule
`houseWords()` applies to the Slice's own tables, extended to a surface whose curated strings live in
Markdown. Without it, *"He is not going to pretend that was a game"* was refused because `He` is a
word the Slice's headlines never use.

The champion is a **fallback, not a competitor**: a banner is always true and never news, so it only
speaks when the week itself had nothing loud in it.

### The deploy's seed is idempotent, and now provably so

`scripts/seed-idempotency.test.ts` runs the **real** `scripts/seed.ts` twice in a subprocess and
asserts the second run changes nothing: identical counts across every seeded table, an identical
content fingerprint, and no manager holding two welcome boxes.

`vercel-build` is `migrate → seed → build`, so this runs against a live database on every merge to
`main`. A non-idempotent seed would not error and would not fail a gate — it would show up weeks
later as Tony repeating himself twice as often as his cooldown allows, or as free loot proportional
to how often anybody merged.

### Batch B is one command away

`npm run art:batch` matches filenames, refuses a missing or duplicated asset **by name**, processes,
validates all ten mechanical rules, checks the registry row, captures Reveal / Collection / Showcase,
and prints a per-asset status table. `--register` flips `art_status` to `final` — kept a separate,
deliberate act because `art/ASSET_PIPELINE.md` makes registration a reviewed edit.

`lib/assets/batches.ts` is the manifest and `lib/assets/batches.test.ts` fails the build if it and the
handoff document ever disagree about which sprites a batch contains — a mismatch that would otherwise
surface as a filename error on the one day it is most expensive.

**Batch B2 is specified** — `docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md`, paste-ready, four sprites
chosen to *expand* coverage rather than repeat it: the only wide silhouette, light escaping through a
hole rather than off a face, a soft-sided bag with a fabric handle loop, and a draped repeating
pattern that has to survive the 23 px Showcase draw. It needs nothing from the commissioner until
Batch B is in hand.

### The next executable task, in order

1. **Integrate the Batch B collectible art** the moment the eight PNGs arrive. One command now:
   `art/incoming/<slug>_01.png` → `npm run art:batch` → look at the screenshots →
   `npm run art:batch -- B2 --register`. **No feature code changes.** Still the only thing between
   M2 and closure.
2. **Tony's Line, bounties and the chalkboard prediction** (`16 §9`). All three read the fact packet
   that now exists; all three need a live season to settle against, so they are authored now and
   settle in September. One table with a type discriminator.
3. **The commissioner review queue** for the Slice. `16 §9` makes approval mandatory in season one
   and the manual hold switch permanent. Not built — the historical issue on the rack does not need
   it, a live one does.
4. **Batch B2** when Batch B is in hand. Specified, paste-ready, needs nothing from anybody until
   then.
5. **Visual debt 3** — the order pad's arrival and dismissal timing against the reveal's.

### Two boundaries prepared, neither started

- **`docs/M3_CHARACTER_BOUNDARY.md`** — the decisions M3 would otherwise make under pressure, made
  now. **Tony stays baked and the compositor is for managers only**, so every M3 defect lands on a
  surface that does not exist yet. Seven layers in a fixed order, with the order in the registry
  rather than in a switch; a hand item as a `top`-slot overlay rather than a split arm; ownership by
  trigger because an FK cannot say *your* collectible; wearables in their own registry family because
  `CATALOG_SIZE = 24` must never be satisfied by adding to it. The clipping tests are arithmetic over
  the alpha channel, **not screenshots** — geometry read off a screenshot is wrong, and the eye kept
  confidently reporting it had measured something it had not.
- **`docs/BACK_HALL_BOUNDARY.md`** — route contracts, the flag-based state boundary (nobody *earns* a
  hallway; progression is not in this product), navigation flow, the five asset slots, demo
  requirements. It corrects an assumption made before reading the page: the Underground is
  deliberately not a route and is handled correctly, with the reasoning already in the file.

**Two real findings, recorded as visual debt rather than fixed** — fixing them would have interrupted
Batch B. *"Don't worry about it."*, the entire reveal of the Underground, is set at **9px** in amber
on cream; and the Back Hall is three stacked panels with headings, which is the menu card `18 §5`
forbids (blocked on art — building the scene against placeholders means building it twice).

### What this session did not start, and why

- **M3 character identity (#24).** Unchanged: do not destabilise M2 before the representative art
  batch has proven the asset system.
- **Safari and hosted-only hardening beyond the seed.** The sandbox proxy denies CONNECT to
  `*.vercel.app`, so viewport-height, back-forward cache and safe-area behaviour cannot be observed
  here — only asserted statically. The seed's idempotency was the one item in that list that is
  fully checkable locally, so it was the one taken.

---

## Where the product is — 2026-07-31

**PR #40, #41 and #42 are merged.** `main` is `ebc0a64`. Three milestones landed this session.

### The Slice publishes, deterministically, with no API key

`16 §9`'s pipeline exists end to end and is visible at `/slice`:

```
lib/stats → lib/slice/packet.ts → lib/slice/render.ts → lib/slice/validate.ts → the rack
```

- **`packet.ts`** is the boundary. Everything upstream is Stats; everything downstream reads only the packet, which **declares its allowed numbers and names as data**. That is what makes *"every number and proper noun must match an allowed value"* a set-membership test rather than an aspiration. The publication boundary (`activeManagerIds`) is applied here, once.
- **`render.ts`** assembles from curated templates keyed on the classifier's `intensity`. It cannot reach for a louder word than the policy earned, and `houseWords()` exports the curated vocabulary so the validator can tell house copy from a name.
- **`validate.ts`** checks the *output* and knows nothing about which renderer made it — so the LLM renderer, when it arrives, is checked by the same rules without a rewrite. Refuses unknown numbers, unknown names, kicker references, win-probability language, unreleased features, and **quotation marks of any kind**.
- **`edition.ts`** puts the last real issue on the rack. An issue the validator refuses is not published.

Verified over **all 36 weeks of both finalized seasons** with zero violations, and independently against raw fixture JSON: `Matty B 184.12, Ryan 109.98, margin 74.14` recomputed by hand with no call into `lib/stats`, `lib/sleeper` or the packet's own helpers.

### Exact repository state — 2026-07-31

| | |
|---|---|
| `main` | **`ebc0a64`** — PR #40, #41 and #42 all merged, all green on real runners |
| Branch | `claude/resume-tonys-delivery-tech-lead-evndmy`, rebuilt on `main`. Nothing outstanding. |
| Open PRs | **none** |
| `npm run check` | green, **755 tests across 48 files** |
| `npm run visual:qa` | green, **34 states × 3 widths**, fresh database, `DEMO_FIXTURES=1` on **both** the server and the driver |

### The next executable task, in order

1. **Integrate the Batch B collectible art** the moment the eight PNGs arrive. The package is `docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md`; the loop is `art/incoming/<slug>_NN.png` → `npm run art:process` → `npm run art:validate` → a registry row → `npm run visual:qa`. **No feature code changes.** This is the only thing standing between M2 and closure.
2. **Tony's Line, bounties and the chalkboard prediction** (`16 §9`). All three read from the fact packet that now exists; all three need a live season to settle against, so they are authored now and settle in September. One table with a type discriminator.
3. **The commissioner review queue** for the Slice. `16 §9` makes approval mandatory in season one and the manual hold switch permanent. Not built — the historical issue on the rack does not need it, a live one does.
4. **Visual debt 3** — the order pad's arrival and dismissal timing against the reveal's. Now unblocked, and the last item on the open list that is not waiting on art.

### What is deliberately not started

**M3 character identity (#24).** The commissioner's instruction is not to destabilise M2 before the representative art batch has proven the asset system, and M3 is where wearable equipping lands — the one part of `03`'s twelve wearables and five slots that M2 explicitly does not own.

### Two defects this slice caught, both by looking rather than by testing

1. **A units bug the tests could not see.** `points()` divided by 100 a second time — `MatchupFact` is already in points — and the page printed a real matchup as *"1.84 to 1.10"*. Every structural test passed, because the allowed-number list and the prose came from the same broken helper and the validator confirmed the symmetry. **Symmetry is not verification.** Pinned now by a range assertion and by recomputation from source.
2. **A visual state with no `case` photographed the parlor and passed.** `slice` was in `StateName` and `ALL_STATES`; its arm never landed. Same false-green shape as the nine reveal states in #40. `reach()` now throws on an unhandled state.

---

## Read this first

`docs/PRODUCT_DELIVERY_MANDATE.md` is a **standing commissioner ruling** and sits above every other document. It defines what "complete" means (§5), the permanent visual standard (§6), the mandatory screenshot loop (§7), demoability as a product requirement (§8), specialist ownership (§9), and the deterministic typed-fact layer that must precede any narrative copy (§10).

---

## Where the product is — 2026-07-30 (second session)

**Nine pull requests landed this session.** In order: **#31** the demo-state catalog and its two isolation guards · **#32** the appliers, the CLI, the one-command database and four demo-backed visual states · **#33** Stats Intelligence — persisted weekly matchups, typed facts, the calibrated significance policy, the board socket · **#34** seatless managers through their own door · **#35** the Collection and Showcase shelf. **#36** the art-slot contract and the photographable reveal · **#37** the retired-manager boundary and the independent Stats verification · **#38** the reveal plate saying what was earned and offering another · **#40** Tony owning both ends of the pizza-box loop.

**#40 also caught a false green in the harness.** The nine `reveal-*` states are resolved by the **server** through `previewReveal(…, process.env)`, and the workflow set `DEMO_FIXTURES=1` only on the driver step. Every one of them had been photographing an ordinary parlor page, filing it as `390-reveal-legendary.png`, and passing — with the `rarity-contrast` gate measuring nothing on the surface it was written for. The wiring is fixed *and* a `reveal` gate now fails a reveal state that contains no reveal, because a wiring fix protects one cause and a gate protects the symptom.

### The M2 loop, walked and scored

The bar is the commissioner's emotional sequence, not the subsystem list. Walked on a production build in #38; screenshots of every beat are in `visual-qa/loop/`.

| Beat | State |
|---|---|
| enter Tony's Pizza | ✅ warm, in-world, legible immediately |
| immediately understand | ✅ Tony opens with a line built from your real record |
| receive a welcome box | ✅ #40 — Tony hands it over: *"First one's on the house. Box is right there."* |
| become excited to open it | ✅ #40 — his line names the box; the glow is no longer the only signal |
| enjoy opening it | ✅ anticipation, rise, rarity flash, plate |
| receive a collectible | ⚠️ correct and **placeholder art** — all 24 items draw the same tagged parcel |
| understand what they earned | ✅ #38 — first / *n* of 24 / the whole shelf |
| want to open another | ✅ #40 — Tony offers, in his own voice, with the price in the sentence |
| continue into Collection or Showcase | ✅ |

**Both of Tony's beats closed in #40**, from the two dialogue groups approved on 2026-07-30. Each is curated content on its own surface, chosen server-side and governed by `assertOnlyApprovedGroups`:

- **`content/counter-greetings.md` A24–A31** — five `first_welcome_box` variants and three `box_waiting`, selected by *moment tags* (`lib/parlor/moment.ts`). A moment tag outranks every standing line without a priority field, because the homepage computes audience over `leagueTags` — which holds no moment tags, so a welcome line's audience is zero and the existing smallest-audience rule picks it.
- **`content/box-offer.md` O1–O7** — the post-reveal offer, on surface `counter_box_offer` (`lib/counter/offer.ts`). Four gates before a line is even considered: an open season, a seat, a stored economy, and a balance that covers the price. Any one false and there is **no offer and no link** — not a greyed-out one.

**The one beat still open is art**, not behaviour.

### Corrections applied after the first report

Four commissioner rulings arrived after the six PRs merged, and one **reverses a decision shipped that day**:

- **Retired managers are never product participants.** #34 put Armen, Berardo and Shant on the door; the ruling is that they appear in **no** structured surface, with no label and no alumni page. Corrected in #37. The reasoning that lost is kept in `lib/league/membership.ts`: permanent identity is separate from a seasonal roster, but that separation is a *storage* property — it keeps a row joinable and confers nothing visible.
- **Membership derives from an active seat**, through one canonical boundary, never scattered exclusions.
- **A workstream is only running if an actor is implementing it** — see the table at the top of this file.
- **Readability wins over styling, always** — `VISUAL_ACCEPTANCE.md §7`–`§8`, with `docs/VISUAL_DEBT.md` for what is not worth stopping for.

### M2 closure — the determination, made from the specification

**Question the commissioner posed:** can M2 be accepted as a production-ready vertical slice with the rest of the catalog tracked as content completion, or does the canonical specification require all 24 finished sprites before the milestone closes?

**Determination: eight is enough to close M2. Twenty-four was never the gate.**

The specification does not merely tolerate partial collectible art — it **plans for it**, in three independent places written before this question came up:

| Where | What it says |
|---|---|
| `art/ASSET_PIPELINE.md §5` | Batch B3 is *"Collectibles (**12 priority of 24**)"* |
| `art/assets.inventory.json`, `_collectibles_B3` | *"12 receive finished art at launch … the rest ship as `placeholder_pizza_box` and **upgrade on any Tuesday**"* |
| `art/prompts/collectible.md` | The same 12-of-24 split, with the placeholder named as thematically correct rather than unfinished |

Three things follow, and none of them is convenience:

1. **An unfilled slot is not a broken slot.** The fallback is `placeholder_pizza_box` — *an item still in its box* — which is in-world by design (`ASSET_PIPELINE §2`). A manager who pulls one sees something Tony would plausibly hand over, not a missing-image box.
2. **The remaining sixteen carry no engineering risk.** A swap is a registry row and a PNG; `lib/assets/art-slots.test.ts` fails the build if a slot ever drifts from `TRAY_REVEAL`, and `npm run art:validate` measures each delivered sprite against it. There is no code change waiting on art.
3. **What M2 has to prove is the *system*.** Eight items covering every rarity, both silhouette extremes, the detail-budget ceiling, an emissive material, a frame that must not read as a UI plate, and the tiny-object anchor case is a proof of the system. Sixteen more of the same is content.

**What this does not license.** The 12-of-24 figure is a **launch** commitment, not an M2 one — the season starts around 10 September. Four more finished sprites beyond this batch are owed before then. That is tracked here as content completion against a date, not as milestone debt.

**M2 therefore closes when the eight-item batch is integrated, validated and polished** — not when the catalog is full.

### The one thing that needs the commissioner

**Collectible art — the eight-item batch.** Every one of the twenty-four items draws the same stand-in, and generating sprites needs an image generator the league does not pay for.

**[`docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md`](art/BATCH_B_COLLECTIBLES_HANDOFF.md) is the package**, written to be pasted into an image-generation session without reinterpretation: the shared style preamble, the shared production constraints, a measured per-item brief for all eight, the output naming, and the validation procedure. Every dimension in it was measured off the running product.

Delivering is `art/incoming/<slug>_NN.png` → `npm run art:process` → `npm run art:validate` → a registry row. No feature code changes. Until then the stand-in is deliberate, not broken.

Everything else below is engineering and does not wait on anybody.

---

## Where the product is — 2026-07-30

**M2 — the complete pizza-box loot loop. ✅ Shipped to `main` 2026-07-30 (`238dfca`, PR #23). Production deployed.**

**Active: M2 completion and polish (commissioner roadmap), with Stats Intelligence running in parallel.**

| Landed since | PR |
|---|---|
| Demo-state catalog and the two isolation guards | #31 |
| Demo appliers, the CLI, the one-command database, four demo-backed visual states | #32 |
| Stats Intelligence — `fantasy_matchups`, the typed fact layer, the calibrated significance policy, the board socket | #33 |

The commissioner's M2 definition is the *whole* dopamine loop, twelve items: acquire → box on the counter → select → anticipation and animation → rarity-legible reveal → transactional idempotent write → server-side persistence → appears in the collection → equip/showcase → the parlor reflects it → duplicate/retry/refresh correct → passes iPhone visual QA. **M2 is not complete after acquisition, storage, a route, or a static reveal.**

Milestones after M2, in order and one at a time: **M3** modular character identity · **M4** Back Hall / Rooms / basement · **M5** one polished server-authoritative casino game.

**M1 (parlor homepage) is a preserved visual baseline.** No later milestone may reintroduce Tony clipping, tiny type, contaminated colour, blurred pixel art, generic web boxes, debug hit regions, legacy homepage art, or visibly unfinished states. A visible regression is a failed gate even when CI is green.

### Branches

| Branch | Role |
|---|---|
| `main` | production. Merging it deploys — `vercel-build` runs migrate → seed → build. There is no quiet merge to `main`. |
| `integration/m2-loot-box` | ✅ merged and finished. Do not add to it. |

**Slices are branching straight off `main` again**, one PR each, merged as soon as both gates are green. That is deliberate and it worked: five PRs landed in one session without a three-way merge. The integration-branch model in `TECH_LEAD_OPERATING_MODEL.md §3` exists to stop an *incomplete visual milestone* reaching production — each of these was individually coherent, so it did not apply. Group onto an integration branch again the moment a slice is only meaningful alongside its siblings.

### Slices

| # | Slice | State |
|---|---|---|
| 1 | Box on the tray · open in place · reveal · persistence | ✅ merged (PR #19) |
| 2 | Acquisition — ledger, trigger balance, opening grant, purchase | ✅ merged (PR #20) |
| 3 | `/counter/collection` — the shelf, set progress, duplicates | ✅ merged (PR #21) |
| 4 | Showcase, and the parlor reflecting the result | ✅ merged (PR #22) |
| — | Delivery mandate persisted + the board fix | ✅ merged (PR #25) |
| — | Countdown de-duplicated; visual-QA database trap documented | ✅ merged (`c91548c`) |

All twelve items of the commissioner's M2 definition are covered by slices 1–4. Wearable *equipping* is explicitly **M3's**, not M2's — twelve wearables and five slots need a character to be equipped onto (ruling index, 2026-07-30).

### The hosted review — 2026-07-30

The commissioner tested production on an iPhone and sent screenshots. **Those screenshots are the source of truth for the hosted experience**, and production is *"the first functioning proof of concept"*, not an accepted visual milestone.

Repaired and deployed in **#28** (`9fd4f6f`): Tony cut through the hands · the board five units off-centre and unreadable on its own dither · a sixth of the screen black above the room · the reveal and Tony's line stacked · the collectible drawn as the box it came out of · the champion's name invisible since V1 · `LEGENDARY` invisible on cream.

**Still open from that review, and not to be read as finished:**

| | Work |
|---|---|
| 1 | **Tony's dialogue still reads as web UI.** Only the *collision* is fixed. It needs to belong to Tony, use the parlor's language, and stop being a dark rectangle across the bottom. |
| 2 | **The reveal is composed but not celebratory.** Anticipation, movement, rarity treatment and "PUT IT ON THE SHELF" are all still the functional version. |
| 3 | ✅ **Demo fixtures — done.** The catalog and isolation landed in **#31**; the appliers, the CLI and the visual-QA wiring in **#32**. Twenty of twenty-one states apply, idempotently, by name. `equipped-wearable` stays named and blocked on M3. |
| 4 | **Art batches A–C are specified, not generated.** `docs/art/ART_PRODUCTION_BACKLOG.md`. |
| 5 | **The menus are still harsh.** The commissioner's standard is Stardew Valley: pixel-art *and* easy to read. Contrast is fixed; density, framing and rhythm are not. |

### Two lessons from #28, both about measurement

- **Geometry read off a screenshot is wrong.** `TONIGHT_CREAM` was wrong on three sides and `TONY`'s cut row was in the worst available place. One art pixel is one room unit — scan the PNG for the feature and record the runs with their provenance. The eye cannot do this job and kept confidently reporting that it had.
- **Reaching for scale to fix a position problem makes it worse.** Enlarging Tony moved the cut to a clean row by making him the largest thing in the room. Three units of `y` did the same job invisibly. `tony-scale.test.ts` now guards the size so the easy fix fails a test.

### Exact next task

**The commissioner's roadmap re-orders the queue.** M2 is to be *completed and visually polished* before the Slice foundation; Stats runs in parallel rather than strictly first.

Item 3 is done. What the demo fixtures immediately exposed, and what is next:

| | Work |
|---|---|
| **D** | ✅ **Collection and Showcase — done** (#35). The shelf is boards with objects standing on them and gaps where nothing is; set progress *is* the filter; the league wall is a ledger on paper rather than ten black cards. The Counter needed only its back-link corrected. |
| **C** | ⚠️ **Art slots — the contract is done, the art is a commissioner input** (#36). `lib/assets/art-slots.test.ts` now asserts canvas, anchor, rarity and name for all 24, and it caught a real defect on its first run: every collectible was registered at `32x32` while the slot it draws into is **46**, a 1.4375× resample that would have blurred every sprite — discoverable only *after* they were drawn. Corrected to `46x46`. **Generating the sprites needs an image generator, and the league does not pay for API use, so batches A–C are blocked on the commissioner supplying files.** |
| **B** | **The reveal.** Anticipation, rarity treatment and the continuation action. Partly delivered in #30 (order pad, overshoot-and-settle, rarity flash, plate delay). What remains is closed-box appearance, shudder timing, lid behaviour, duplicate messaging and the transition out. See the note below about photographing a *specific* rarity — that is the blocker on reviewing it properly. |
| **E** | ✅ **Seatless managers — done** (#34). The door opens for the whole permanent record; the receipt and the counter say the true thing; the full M2 loop walked end to end as Berardo. |

**A known gap in the demo system, recorded rather than papered over:** the *reveal* cannot yet be demoed at a chosen rarity. The roll is injected through `lib/counter/rng.ts`, which is process-global, and the CLI runs in a different process from the server — so a pre-applied `pull-legendary` leaves the box already opened and the tray empty. Photographing a rarity-specific reveal needs an isolated component state, which `MANDATE §8` explicitly permits, and belongs with **B**.

**#26 — the Stats Intelligence deterministic fact layer** is still specified, scoped by a `TECH LEAD RULING` onto `ImportedWeek`, and still gates every piece of narrative copy.

Open a branch off `main` (M2's integration branch is closed; a new milestone gets a new one). The first consumer is already waiting: `boardFace()` takes an optional `matchup` and renders **nothing** when it is absent, because `MANDATE §9` forbids the interface deriving a fantasy fact for itself. Filling that socket is the acceptance test for the layer.

**One outstanding verification, human-only:** the live `*.vercel.app` URL was never loaded — the sandbox proxy denies CONNECT to it. `main` CI and the Vercel deployment both reported success GitHub-side, but *nobody has looked at production in a browser since M2 landed*. See the `RELEASE REVIEW` on PR #23.

### The queue after M2 ships

| | Work | Issue |
|---|---|---|
| 1 | ✅ **Stats Intelligence — the deterministic fact layer** (#33). Weekly matchups persisted, typed facts with evidence and suppression, significance calibrated against the real 162 games, the board socket filled | **#26** |
| 2 | **M3 — modular character identity.** Constrained and dependable: canonical base bodies, fixed layer set, saved configuration, reliable layering. Wearable equip slots land here, with something to attach to | **#24** |
| 3 | ✅ **The demo system** (`MANDATE §8`) — landed in #31 and #32 | — |
| 4 | **The deterministic Slice**, consuming typed facts only |  |
| 5 | M4 Back Hall / Rooms · M5 one polished casino game |  |

Stats (#26) is sequenced **before** the Slice deliberately: `MANDATE §10` requires the fact layer to exist before any narrative copy, and `boardFace()`'s null `detail` is already the socket it fills.

---

## Gate results last recorded

| Gate | Result | Where |
|---|---|---|
| `npm run check` | green — **755 tests, 48 files** | local, throwaway Postgres |
| `npm run visual:qa` | green — **34 states × 3 widths**, production build, on a freshly reset database **and a server carrying `DEMO_FIXTURES=1`** — without which the nine reveal states photograph nothing and pass | local |
| `ci.yml` + `visual-qa.yml` | green on real runners for every M2 slice | PRs #19 #20 #21 #22 |
| PR #23 (integration → `main`) | green on final head `c91548c`; **merged** as `238dfca` | PR #23 |
| Live production URL | ❌ **never loaded.** Proxy denies CONNECT to `*.vercel.app` | — |
| The whole loop, walked on a production build | tab → buy → open in place → reveal → shelf → showcase → receipt. Ledger `SEASON_START 250, BOX_PURCHASE -50` | local |
| Reduced motion | verified in-browser: reveal at 106 ms, `opacity: 1`, `transform: none`, no console errors | local |

**Preview and production URLs cannot be reached from the sandbox** — the proxy denies CONNECT to `*.vercel.app`. Verify GitHub-side and say so explicitly. Never claim a URL was smoke-tested when it was not.

---

## Authoritative Markdown, in reading order

1. `CLAUDE.md` — identity, scope, invariants, current status
2. `AUTONOMY.md` — lifecycle, labels, precedence (`§1`), escalation (`§6`)
3. `VISUAL_ACCEPTANCE.md` — the gates CI is not, and the fixed room geometry
4. `docs/TECH_LEAD_OPERATING_MODEL.md §8` — **the ruling index. Read before any design decision.**
5. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — architecture and scope
6. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — ordering only
7. `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` — the room. `§4` is the counter and the tray.
8. `docs/IMPLEMENTATION_HANDOFF.md` — "Where M2 slice 1 landed" and "What slice 2 owns"
9. `art/ASSET_PIPELINE.md` — art is placeholder-first, swapped by registry row

Precedence when they conflict: commissioner ruling → Technical Lead ruling → approved visual references → `PROJECT_SPEC` → architecture/art specs → handoffs → code → superseded plans. **Correct the loser durably; do not stop to ask for a reconciliation.**

---

## Standing constraints that bite

- **No paid API use** (commissioner, 2026-07-30). The orchestrator is manual-dispatch only and `ANTHROPIC_API_KEY` is unset. Do not recreate a paid cron, add an automatic paid trigger, request reversal, or treat a present secret as authorization to spend. No product scope depends on it — `16 §9` requires the Slice to publish with the key unset.
- **`npm run test` truncates league tables.** Never point `DATABASE_URL` at preview or production. This rule exists because it was broken once and a preview dataset was destroyed. After running tests, re-seed before visual QA.
- **All token movement through `apply_token_delta`** with an idempotency key, balance trigger-maintained, `CHECK (balance >= 0)`. No feature gets its own balance-writing path.
- **`box_openings.box_id UNIQUE` is the idempotency mechanism for opening** — the operation has a natural key. Do not add a client-supplied key there; that invariant is about `apply_token_delta`, where a delta is an event with no natural key.
- **`season_memberships.token_balance` has exactly one write path.** A direct `UPDATE` raises; only the ledger trigger may change it. Move tokens with `apply_token_delta` — the Postgres function, not a TypeScript helper.
- **Never disable a control on a client-read balance.** `CHECK (token_balance >= 0)` is the authority; a client check is a race and a second copy of the rule.
- **Body copy in a cream `PixelPanel` is `text-ink-700`.** `text-paper-*` on a paper panel is invisible, and it shipped on three routes.
- **A Tailwind class naming an undefined `--color-*` token silently inherits.** `lib/design/colour-tokens.test.ts` fails the build for it now.
- **Reward weights and prices are simulation-gated to P3.** Nothing locks before the multi-season simulation. Do not tune to taste.
- **Every asset by slug through the registry.** Swapping art is a registry row, never a code change.
- **The injected clock and the injected RNG.** `new Date()` / `Date.now()` **and `Math.random()`** are lint errors — the randomness half went unenforced for four milestones and `selectContent` defaulted to `Math.random` inside a server render the whole time. Two sanctioned sources: `rollBelow` (`lib/counter/rng.ts`) for an event worth recording, `seededDraw` (`lib/content/draw.ts`) for anything chosen during a render.
- **Never delete an approved slug, record or asset to satisfy an older count.** Recalculate the count.
- **Body copy is 16–18px, adjusted upward wherever legibility needs it** (`MANDATE §6`, superseding the bare 17px floor). Size the container to the type, never the type to the container.
- **`npm run visual:qa` needs a freshly created database and is not re-runnable** — for the *manager-backed* states. The four demo-backed states are repeatable; the rest are not, because `tray-reveal` consumes a box. It opens the welcome box, and a box opens once ever; re-seeding does not restore it. A second run against the same database fails *geometrically* — an object reported "outside of the viewport" — which reads like a layout regression and is not one. Run `npm run db:reset` first. **A green result on a used database means nothing.** CI is immune; it gets a new database every run.
- **The driver does not start a server.** It expects one already on `:3111`. A *stale* `next-server` left from an earlier session will happily serve old code and hand you a confident, wrong green — check `ps -eo pid,args | grep -F next-server` before trusting a local run. (`ss -ltnp` returns nothing useful in this sandbox; an `EADDRINUSE` is the reliable signal.)
- **`PlaceholderSign` is for surfaces.** Small objects use `AssetView … compact`, or a 44-unit slot becomes a 133px slab.
- **The Showcase is one column with no score.** `16 §5.3` and `18 §4`: no levels, prestige or clout, ever. Ownership is trigger-enforced — an FK cannot say "*your* collectible".
- **Duplicates are counted, never converted.** `03 §12` defers salvage until after simulation. A salvage rate is a P3 decision.
- **`users.showcase_collectible_id`'s FK lives in SQL, not `schema.ts`** — declaring the reverse of `collectibles.user_id` makes both table types mutually recursive and TypeScript gives up (TS7022).
- **That FK makes `TRUNCATE collectibles CASCADE` reach `users`** and therefore `loot_boxes` and `sessions`. Do not build test state by truncating a middle table; build it directly. For a local reset, truncate and **re-seed**.
- **A skip list is a place for defects to live.** `colour-fidelity` and `legacy` run on every visual state now. Do not exempt a page from them.
- **SW never decides what a result means.** No blowout classification, no winner inferred from UI values, no loaded language without a Stats classification. `boardFace()`'s null `detail` is the pattern: leave the socket empty rather than infer.
- **Typography is 16–18 CSS px, adjusted upward for optical size** — this supersedes the old bare "17px floor".
- **The board's face is a hero plus at most one short fact.** Sentences go in the panel. Tests cap the hero at 10 characters and the detail at 20 with no full stop.
- **`TONIGHT_FIELD` is inset 6 units inside `TONIGHT_CREAM`.** Text must never touch the painted frame.
- **Demoability is a requirement, not a convenience** (`MANDATE §8`). Preview-only, fixed seeds, never production league data, never a real award.

---

## Local environment recipe

**One command.** `scripts/dev-db.sh` replaces the recipe that used to live here — twice a session lost local Postgres and spent real time retyping it, and a recipe in Markdown is not a workflow: it drifts and it is only ever as good as whoever last remembered to update it.

```bash
npm ci
npm run db:reset      # start Postgres · drop · create · migrate · seed
npm run db:fresh      # the above, then apply every demo state
npm run db:status     # is it up, and what is in it
```

It uses `docker compose` where Docker exists and falls back to the Postgres 16 binaries otherwise — including the part that catches everybody, which is that `initdb` refuses to run as root and has to be driven through the `postgres` user. `reset` refuses outright if `DATABASE_URL` looks hosted; it drops a database, and the rule it protects was broken once already.

Environment defaults are baked in (`DATABASE_URL`, `SESSION_SECRET`, `SLEEPER_LEAGUE_ID`), so nothing has to be exported by hand.

### Demo states

```bash
npm run demo -- list                          # the 21 states and how each is reached
DEMO_FIXTURES=1 npm run demo -- apply broke   # prints a door URL and a PIN
DEMO_FIXTURES=1 npm run demo -- reset         # retire the live generation
```

Two guards, both required (`lib/demo/guard.ts`): production is refused outright, and everywhere else needs `DEMO_FIXTURES=1`. Every write lands on a reserved `demo:`-prefixed seat that no real manager's Sleeper id can match.

**A retire never deletes.** `token_transactions` refuses `DELETE` for everyone, demos included — a demo able to erase its own ledger would be no evidence that a manager's cannot. `npm run db:reset` is the clean slate.

Visual QA needs a **production build** on port 3111:

```bash
npm run build
# DEMO_FIXTURES on the SERVER, not just on the driver — see the note below.
setsid env DEMO_FIXTURES=1 nohup npx next start -p 3111 > /tmp/next.log 2>&1 < /dev/null & disown
export PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
DEMO_FIXTURES=1 npm run visual:qa              # all required states
DEMO_FIXTURES=1 npm run visual:qa -- --state=tray-reveal   # required; buys its own box per width
```

**`DEMO_FIXTURES=1` belongs on both processes, and forgetting the server is silent.** `?preview_reveal=` is resolved inside the render by `previewReveal(…, process.env)`, so a server without it answers every preview request with an ordinary parlor page — and the driver photographs a calm room, files it as `390-reveal-legendary.png`, and passes. That is exactly what CI was doing until #40. The `reveal` gate now fails on it, so the mistake announces itself; the line above is still the fix.

Gotchas that have cost time:
- Sign in as **Alex by name** via `/door`, never by UUID — reseeding regenerates every id. Script PIN is `461902`.
- **Never `pkill -f next-server`, and do not trust `pgrep -f next-server` either** — both match this shell's own command line, so `pkill` kills the session (exit 144) and `pgrep` reports a server that is not running. Use `ps -eo pid,args | grep -F next-server | grep -v grep`, and confirm with `ss -ltnp | grep 3111`.
- A stale `next start` serves old CSS. Confirm the served hash matches `.next/static/css/` on disk.
- Never run `playwright install` here; use the `PLAYWRIGHT_CHROMIUM` path above.
- `visual-qa-*/` and `visual-qa/` are gitignored. Screenshots belong to a workflow run, not to git history.
- `capturing tray-reveal consumes the box.` Restore with:
  ```bash
  npm run db:reset         # drop · create · migrate · seed, in one command
  ```
  Then re-add the three preview seasons for `six-banners` (the SQL block is in `.github/workflows/visual-qa.yml`).

---

## Unresolved / carried forward

- **Reward weights provisional** until the P3 simulation. `PROVISIONAL_RARITY_MASS` in `lib/counter/rewards.ts`.
- **Collectible art is placeholder for all 24.** The box draws a flat carton and the collectible a tagged parcel — different silhouettes since #36, but one silhouette for every item. Specified behaviour; the plate carries identity and the item now stands centred on it. Real art is a registry row. **This is the last thing between M2 and the commissioner's "complete".**
- **Group B content still needs commissioner approval**; seed Group A only.
- **No token sink other than boxes, and no weekly income.** Matchup wins and weekly high scores need a played season and the two cron jobs (`16 §4.3`) that would award them. The reason codes exist; nothing is wired to them. Do not invent a reward that fires on nothing.
- **Salvage for duplicates** is unbuilt and P3-gated.
- **12 of 24 collectibles get finished art at launch**; the rest stay placeholder. Each is a registry row, never a code change.
- **One greeting pair still shared** (SuggMyNick / cheeseking). Two lines of markdown, no code. Asserted in `lib/content/greeting.test.ts`.
