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
| **M2 — loot loop** | `QUEUED_NOT_ACTIVE` | `main` | #40 | Batch B PNGs, whenever they arrive. One command. Nothing else is open |
| **Stats & Data** | `QUEUED_NOT_ACTIVE`, independently verified | `main` | #33 | Weekly reputation tags (`16 §10`), once a live season produces events |
| **Tuesday Slice** | `QUEUED_NOT_ACTIVE`, independently verified | `main` | #46 | Nothing. The review queue it was waiting on is built — see below |
| **Weekly stakes** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #51 | The Tuesday job (`16 §4.3`), now unblocked. Authoring, settlement, week finalization and the Slice draft all exist and are idempotent; what is missing is the schedule that calls them |
| **Slice review chain** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #53 | Nothing. Ten steps, seven demo states, 23 database tests, and the rack now serves only what was approved. `docs/SLICE_REVIEW_BOUNDARY.md` |
| **Homepage cleanliness** | `QUEUED_NOT_ACTIVE` — **shipped** | `main` | #52 | Nothing in scope. The ceiling is visual debt 9 and needs a targeted regeneration, not a filter; `.affordance-on-request` is visual debt 10 and needs a `RoomDisplay` decision |
| **Text surfaces & typography** | `QUEUED_NOT_ACTIVE` — **recorded, not started** | — | — | Define the type roles and text-surface primitives, then apply them to the Slice and the review screens. `docs/TEXT_SURFACE_BOUNDARY.md`. Non-interrupting by the commissioner's own words |
| **Art batches A–C** | `QUEUED_NOT_ACTIVE` — **deferred commissioner content** | — | — | Not to be requested again. The slot is enforced and the repository does not idle on it |

**No fresh specialist session is required right now.** Every SW change to date has been tightly coupled to the branch in flight, small enough that a handoff would cost more context than it saved, and visually verifiable in the same loop — which is exactly the condition the ruling names for implementing directly. When that stops being true the trigger is a durable GitHub task carrying branch, scope, authoritative Markdown, assets, prohibited regressions, required screenshots, acceptance criteria, what not to redesign, and where to stop — then one concise ask.

**Stats independence is satisfied by the acceptable alternative, not by assertion.** `lib/stats/independent-verification.test.ts` recomputes scores, margins, winners, roster attribution and the largest margin **from the raw fixture JSON**, sharing no code with the pipeline — it does not call `traverseChain`, `derivePairings`, `toCents`, `reconcileSeason` or anything in `lib/stats/`. `facts.test.ts` pins values, which is good and is not the same thing: those numbers came off the pipeline's own output, so a consistent bias would have been recorded rather than caught. The one gap is stated in that file: if both implementations are wrong the same way, neither catches it.

---

## Where the product is — 2026-08-01 (seventh session)

### The Slice review chain — what the Tuesday job was actually waiting on

**PR #53 is merged.** `main` is **`c3dc077`**, both required gates green on real
runners before the merge, and the merge deploys. Branch
`claude/resume-autonomous-product-direction-6og8ui`, restarted from `main`
afterwards.

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
| `main` | **`c3dc077`** — PR #53 merged |
| Branch | `claude/resume-autonomous-product-direction-6og8ui`, restarted from `main` after the merge |
| `Typecheck · Lint · Test · Build` | ✅ success on a real runner, **18:50:22Z**, before the merge |
| `Screenshots · gates` | ✅ success on a real runner, **19:00:38Z**, before the merge |
| `npm run check` | green — **1120 tests across 68 files** (was 1060 / 64) |
| `npm run visual:qa` | green — **85 states × 3 widths** (was 77), production build, fresh database |
| Post-merge `main` push run | ✅ success, **19:05:47Z** |
| Hosted | **not loaded by anybody.** The proxy denies CONNECT to `*.vercel.app`. Vercel deploys on push to `main` and the push run is green — that is GitHub-side evidence and nothing more. Said plainly rather than implied |

### One red gate, and what was actually done about it

The **first** visual-QA run on this PR failed with a single console error:
`React #418` at 375 attributed to `slice-blowout` — a *structure* mismatch.

It was not re-run. What was done instead:

- **Reproduction attempted, and failed.** 108 local loads: 48 at normal speed and
  60 at **8× CPU throttling against CI's own database state**, with the
  press-desk demos already applied so the published issues were there. Zero
  console errors.
- **The tree was checked rather than assumed.** For a `?edition=` state the page
  takes the preview and the stamp is null in both the old and the new code, so
  this branch changes **no element** of `slice-blowout`. The only difference was
  server work.
- **A real defect was found in that work and fixed:** `rackIssue` was being
  computed on preview requests that discard it, and with nothing published its
  fallback walks back through the season building a fact packet per week.
  Fifteen preview states each paid for a full historical walk they never looked
  at. **This is not claimed to have fixed the #418.**
- **The attribution itself is weaker than it looks.** The driver records the
  state that was current when an error *arrived*, which its own comment says —
  so a mismatch from the previous navigation lands under the next state's name.

Recorded as visual debt **12** with all of that, and the next instance should be
attributed by **origin**, which means settling hydration before flipping
`capturing`.

One harness lesson, worth carrying: a sweep failed at `tony-steady` with *"the
sampler returned nothing"* because `npm run test` was run against the same local
database **while the sweep was in flight**, and it truncates league tables.
`AUTONOMY.md §5` says exactly this. The gate was right; the operator was not.

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

### Commissioner direction, 2026-08-01 — text surfaces and typography

**Recorded, not started.** It arrived explicitly non-interrupting, after #53 had
merged and deployed, so nothing was stopped for it and nothing needed to be.
`docs/TEXT_SURFACE_BOUNDARY.md` carries the whole of it. Three things in it change
what the next session does:

**The reference is a redrawing of this product's own `review-refused` screen** —
same route, same copy, same structure — presented at the target standard. That
makes it a worked example of the gap rather than a mood board, and `§1` of the
boundary lists the eleven specific differences against what shipped: corner
brackets on the paper, a warning glyph, the validation findings as a **bordered
two-column ledger with the numerals right-aligned in their own column**, a dark
plaque for *"as it will print"*, a heavier headline, and a darker outer frame so
the sheet reads as mounted.

**The cause is measured, not asserted.** Sixteen distinct font sizes from **8px to
26px** across roughly two hundred call sites; **thirty files** below 16px; **seven
call sites at 8–9px**, each named in `§2`; and **no typography module exists** —
`lib/design/` holds a colour-token test and a source-byte test and nothing that
defines a type scale. Sixteen sizes is the symptom. Nothing in the repository says
what a *heading* is, so every surface invents one. The slice is satisfied by
fixing that, not by re-styling screens one at a time.

**Presentation must stay separable from behaviour**, as a hard requirement: a
visual primitive receives typed display data and actions from existing services
and never computes a fantasy fact. `MANDATE §9` at the component boundary.

**No new art is required**, and Batch B is still not to be requested.

Order of application is `§9`: the Slice and the commissioner review surfaces
first, then the Tonight board and the prediction sign, then Tony's dialogue, then
receipts, then weekly stakes, then Counter and Collection labels, then room
signage.

### Handoff

**A fresh Tech Lead chat is required to continue**, and only because this one is
near its context limit — nothing is in flight, nothing is half-finished, and no
human-only blocker exists.

State at handoff: `main` is **`c3dc077`**, both required gates green on real
runners before the merge and the post-merge push run green after it. The branch
`claude/resume-autonomous-product-direction-6og8ui` is **restarted from `main`**
and carries checkpoint commits only — no unmerged work. There are **no open pull
requests**.

**Two candidates, and the choice is genuinely open.** The Tuesday job is the
functional queue's item 1 and is fully unblocked; the text-surface refresh is a
fresh level-1 commissioner direction whose first target is the surface that
shipped this session. Neither blocks the other. The direction is non-interrupting
by its own words, which means it does not *have* to go first — but it is the
newer ruling, its reference is a redrawing of a screen that is now in production,
and `§9` names the Slice and the review screens as its highest-value target.

**The exact next executable task**, if the Tuesday job is chosen —

1. `vercel.json` with exactly the two jobs `16 §4.3` allows, and no others
2. a route handler behind a shared secret (`CRON_SECRET`), refusing without it
3. the job body, in order: `finalizeWeek` → `authorStakesForWeek` →
   `settleSeason` → `generateDraft(season, week, { submit: true })`, each already
   idempotent and tested
4. a decision, and a test, for **what the job does when a week refuses to draft**
   — `generateDraft` returns `refused` and writes nothing, and `08 §27` says hold
   publication and show admin status, so the desk needs to be able to say a week
   was attempted and had nothing in it
5. the same treatment the rest of this repository gets: database tests for the
   retry, and a demo state if the desk gains a surface

Read `docs/SLICE_REVIEW_BOUNDARY.md` first — `§10` states exactly what is
unblocked and what still gates a schedule.

**If the text-surface refresh is chosen instead**, the first move is not a screen.
It is `lib/design/` gaining a **type-role module** — the fifteen roles in
`TEXT_SURFACE_BOUNDARY §3`, each with its font, size, line height, tracking,
colour and spacing — plus a test that fails when a component sets an arbitrary
`text-[Npx]` outside it, in the same spirit as `colour-tokens.test.ts`. Then the
primitives in `§8`, then the Slice and the review screens, then the evidence in
`§10`. Doing it in the other order produces re-styled screens and the same
sixteen sizes.

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
