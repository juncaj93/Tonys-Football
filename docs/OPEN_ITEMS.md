# Open items — the canonical ledger

**This is the current list of everything open.** `docs/CHECKPOINT.md` is the
narrative record of how the product got here and stays that; this file is the
answer to *"what is actually left."* When they disagree, this file is newer.

**Reconciled against `main` on 2026-08-09**, by reading the code and the database
rather than the status paragraphs. Where a document said something was open and
it had shipped, the document is corrected rather than the work redone; those
corrections are in **H**.

> ## V1 engineering: FUNCTIONALLY READY
>
> Every v1 system is built, tested against a real Postgres, and photographed.
> What remains is five human actions, and `docs/ACTIVATION.md` is the packet for
> them — written for a phone, ordered, reversible, and the only document Alex
> needs. **None of them moved on 2026-08-09** and none of them may be closed by
> a session.
>
> **Deferred world-building scope was reopened by the commissioner on
> 2026-08-09.** Manager rooms are built and the door is open; every other
> deferred area was reconciled and classified in **G0**, and the Underground has
> a decision waiting in **G1**. That reopening is specific: it does not reopen
> Category C polish, and it does not reopen anything G0 marks LATER or DO NOT
> BUILD.

Every item is in exactly one category:

| | |
|---|---|
| **A** | V1 launch blocker — Tony's cannot correctly operate for the league without it |
| **B** | V1 scope, incomplete, doable without Alex |
| **C** | High-value pre-launch polish |
| **D** | Engineering complete; a human-only action remains |
| **E** | Real technical debt, worth doing when it fits |
| **F** | Monitored / quarantined — evidence does not justify work now |
| **G** | Explicitly deferred (V1.1 / V2 / later) |
| **H** | Closed or stale documentation — corrected, not rebuilt |

---

## A — V1 launch blockers

### A1 · The live season could not get into the database — **fixed this session**

`16 §4.3` specifies the Tuesday chain as **sync → finalize → …** and the sync had
never been built. Nothing in the deployed application wrote `fantasy_matchups`
during a live season: the deploy seed reads July fixtures, and the Sunday cron
writes only its snapshot.

The first live Tuesday would have declined week 1 for want of a game and gone on
declining it until January — **with no error anywhere**, because *"holds no
publishable game"* is the truth in July and looks identical in October.

Two more defects came out with it, both of which would have produced wrong data
rather than no data:

- **every deploy re-imported July over the live season** and reset the standings
  to 0–0, reproduced in four commands;
- **a drafted-but-unplayed week is ten rows at zero points**, which would have
  been stored as five ties and *finalized* — and `week_finalizations` is
  append-only, so the real week could never have been recorded.

`docs/IN_SEASON_SYNC_BOUNDARY.md`. Closed.

### A2 · Every character save returned a server-side exception — **CLOSED, production verified**

`app/actions/character.ts` exported `const CUSTOMISER_SLOTS` — a frozen array
with **no consumer anywhere** — from a `'use server'` file. Next.js compiles such
a module with an injected `ensureServerEntryExports`, which throws
`A "use server" file can only export async functions, found object.` carrying
`__NEXT_ERROR_CODE = "E352"`. The module is evaluated when an **action is
invoked**, not when the page renders, so the route loaded perfectly and **every
Save failed from #48 (2026-07-31) onward** — with `next build`, `npm run test`
and `npm run visual:qa` all green, because none of the three invokes an action.

The digest Alex saw was `1891557172@E352`. **It is not an active defect.**

Fixed, rebuilt and merged in #78 (`ecbaf2f`). Two guards stop the class
recurring: a test that parses every `'use server'` file with the TypeScript AST
and refuses a non-async runtime export (it fails on the pre-fix file), and a
visual state that **presses the Save button** rather than photographing the form.

**Evidence, in order:**

| | |
|---|---|
| The original failure | **reproduced locally** against a production build, through the product, before anything changed — same error, same `@E352` |
| Root cause | non-function export from a `'use server'` module |
| The fix and the rebuilt feature | **1,485 tests**, **103 visual states × 3 widths**, both hosted gates green |
| Deployed | merged to `main`; post-merge `main` CI green |
| **It works in production** | **observed.** Alex loaded the live site on iPhone, opened the character editor, changed a trait, and Save completed. The exception did not recur. |

That last row is the exact user path that originally failed, on the real
deployment. `docs/CHARACTER_CUSTOMISATION_BOUNDARY.md` is the canonical account.

### A3 · The basement's shells are briefed and do not exist — **art dependency**

Not a launch blocker for football and not a defect. It is the one place in the
product where **engineering is finished and the next step is a file**.

`/rooms` is now shell-first: `zone_room_shell_storeroom`, `_rec_room` and
`_cold_store` are registered, resolved per theme, and every one of them is
`art_status: placeholder`, so all three render the drawn stand-in. The stand-in
follows the approved reference's composition and is deliberately flat — it exists
so the geometry, the hit regions, the gates and the eight visual states are real
before any art arrives, and `MANDATE`'s slot rules forbid mistaking it for the
answer.

**`docs/art/BATCH_E_BASEMENT_HANDOFF.md` is the packet**, written to be pasted
into a generation session as-is. Three shells, the storeroom first, each
independently useful because no theme is gated on another.

Two things make this safe to leave open: the room is fully usable today, and the
day a shell lands it is **a file plus a registry row** — `art:process` already
handles shells, and the visual gate reports which half rendered rather than
demanding the stand-in.

### A4 · The manager sprite cannot reach the approved reference by swapping art

**A commissioner decision, and stated as one.** Colour in the character system is
a *runtime parameter* — 4 skin × 8 hair × 8 top ramps, resolved at render and
never stored — and a layer that resolves to a PNG **bypasses it entirely**. So
the existing per-layer art-swap contract, which works everywhere else in this
product, would silently delete seven of eight hair colours the first time a hair
PNG landed.

Keeping the traits *and* using PNGs is **132 files** before a single wearable,
multiplying four ways with every colour added later.

`docs/ROOMS_BOUNDARY.md §14` sets out the two real routes — raise the drawn
fidelity in place (costs no art, ceilinged by hand-authoring) or add a
**tinted-mask pipeline** (reaches the bar, costs a new rendering path and ~29
authored masks). **Nothing was done**: the customiser is `CLOSED — production
verified` and the direction says not to reopen it.

**Nothing else is in category A.** Every other v1 system is built, tested and
reachable; what remains below is polish, activation, or deferred scope.

---

## B — V1 scope, incomplete, autonomously actionable

*(empty)*

Every remaining v1 system named in `CLAUDE.md`'s "In v1" list is built: the
six-zone shop, Tonight, the Slice with Tony's Line, bounties and the chalkboard,
the token ledger and weekly rewards, one loot box and a 24-item catalog,
wearables and championship rings, the Showcase, the Timeline, the content engine,
historical seasons, and persistent login.

---

## C — High-value pre-launch polish

### C1 · Three reachable routes had never been photographed — **fixed**

`/profile`, `/rooms` and `/admin` were in `ALL_STATES` nowhere. Every other v1
surface was: the parlor, the rack, the Timeline, the counter, the collection, the
showcase, the back hall, the character screen, the press desk and — since #75 —
the front door.

This exact shape has produced a real defect on **first capture**, twice: the
Timeline's sign read `CHAMPIONS $ HISTORY` (#69) and the door's PIN label broke
`IT` onto its own line at 360 (#75). A route the gate has never seen has an
unverified type floor, colour fidelity, tap targets and reduced-motion promise.

Closed with the guard that stops it recurring: `scripts/route-coverage.test.ts`
enumerates `app/**/page.tsx` and fails for any route no state reaches, with one
declared exemption carrying its reason. It **fails on the pre-fix driver naming
all three**.

**Re-reconciled 2026-08-09**, after `profile-devices` was added: 16 routes on
disk, 15 reached by a state, 1 exempt (`/dev/assets`, reason current), 0 missing.
The enumerator reads the filesystem, so a new route cannot escape it.

### C2 · The key ring meant three different things — **fixed**

**The entry that was here was wrong, and the correction is the finding.** It said
*"the destructive control is never photographed"*. It was being photographed —
**accidentally, and differently at every width**. The three widths share a
database and each signs in again, so `profile` captured **1 device at 390, 2 at
375 and 3 at 360**, with the red *"change the locks everywhere"* control absent
from the first and present in the others. Three files with one name meant three
screens, and a `--state=profile` run made a fourth.

That is the defect class the door states' own comment names, and it is worse than
an unphotographed state: the screen *looked* covered.

Two states now build their own precondition, the way `ensureClaimedManager` does
on the door:

- **`profile`** — exactly one device. Reached by using the product's own *"change
  the locks everywhere"* and signing back in, so the precondition is also
  evidence that revocation works, at every width, on every sweep.
- **`profile-devices`** — exactly two, and **visibly different**: the second is a
  real sign-in through the real front door from a context carrying an iPhone
  Safari User-Agent, so the rows read `iPhone · Safari` and `Unknown device ·
  Chrome`. Three identical labels could not answer *"is that my phone?"*, which
  is the only question the label exists for.

No database hook, no auth bypass, no production data, no test-only route.
`checkDevices` pins the count per state, requires two devices to carry two
distinct names, requires the control to appear exactly when it is real, and
measures its contrast against its own red ground.

The first deliberate capture exposed **no defect**. 100 states × 3 widths.

---

---

## D — Engineering complete; Alex has to act

### D1 · `CRON_SECRET` is unset, and it is the only activation step left

Both scheduled jobs are built, tested, scheduled in `vercel.json` and **inert**.
With the secret unset they answer `404` to everything including Vercel's own
scheduler, which is deliberate: a job that runs unprotected is a job whose
missing secret nobody notices.

**`docs/ACTIVATION.md §1` is the packet for Alex** — phone-first, ordered,
reversible. `docs/DEPLOYMENT.md §2` is the engineering-facing version of the same
steps.

**Timing: safe now, and needed before Sunday 13 September.** The Sunday job fires
Monday 14 September 00:55 ET and is the only thing that can make a week-1
Monday-comeback story truthful — a missed snapshot cannot be retaken. The Tuesday
job fires 15 September 05:00 ET and *is* recoverable, by re-running with `?week=`.

Before kickoff a successful run legitimately reports that it did nothing. The
packet separates *"the door opened"* from *"there was football to process"*, so a
pre-season no-op is not misread as a failure.

**This session did not set it and must not.** It is the commissioner's step
(`AUTONOMY.md §4`), and no value for it exists anywhere in this repository.

### D2 · `COMMISSIONER_SLEEPER_USER_ID` — confirm it is set in production

With it unset, `requireAdmin()` answers `notFound()` for everyone and **nobody
can approve a Slice**, so the review chain that `16 §9` makes mandatory has no
one able to work it. The seed prints `Admin  COMMISSIONER_SLEEPER_USER_ID is
unset — nobody is an admin.` when it is missing, so the answer is visible in any
deploy log.

`docs/ACTIVATION.md §2`. Recorded here because nothing in any session has
observed production, and *"probably set"* is not a launch check.

**Timing: before Tuesday 15 September**, when the first draft lands on the desk.
Verifiable from a phone in three taps — the profile screen shows a
*Commissioner's office* button when it is set.

### D3 · One greeting pair still shares a line, and the line is the commissioner's to write

SuggMyNick and cheeseking both made the 2025 playoffs without a title and A21 is
the only Group A line keyed to it, so both hear the same sentence. Two lines of
markdown and no code, and `lib/content/greeting.test.ts` already asserts the
collision so adding a line shows up as a change. The material exists and is
verified — cheeseking went 1–13 in 2024 and 9–5 with a third-place finish in
2025; SuggMyNick had the second-best record in 2025 at 10–4.

**`docs/ACTIVATION.md §4` is the fill-in.** It names the pair, the line they
share, the tag that already separates them (`third_place_2025` — Cheese finished
third in 2025, Nick fourth), the verified facts, and the four rules a line must
satisfy. One sentence, not a creative brief.

**Timing: before the league is given the URL.** No schedule dependency.

**Not written here on purpose.** `CLAUDE.md` limits generative AI to the Slice
and requires ordinary Tony dialogue to be *curated content*; Group A was approved
as a set and Group B is explicitly waiting on approval. A session adding a line
in Tony's voice would be authoring unapproved content on the one surface the
league reads as him. `IMPLEMENTATION_HANDOFF.md` files it under *"Open, and for
the commissioner"*, and that is where it belongs.

### D4 · Production demo-seat verification — still UNVERIFIED

**Timing: before the league is given the URL.** `docs/ACTIVATION.md §3` is the
procedure — Neon's own browser SQL editor, so no connection string is exposed.
**The recorded query is current, not stale**: `users.sleeper_user_id` and
`users.is_admin` both exist in the shipped schema, checked against a migrated
database on 2026-08-09.

The read-only query is in `docs/PUBLIC_MODE.md` and has never been run. This is a
**commissioner risk acceptance, not a finding that the count is zero.** Do not
record it as passed. If a `demo:` seat with `is_admin = true` is ever found in
production it is an authentication incident, not a cleanup task.

### D5 · The production smoke test — **one path observed, the checklist still open**

**Corrected 2026-08-09.** This entry read *"Nobody has looked at production in a
browser"* and said the claim had been carried since #23 and was *"still true"*.
It is no longer true, and the correction has to be exact in both directions.

**What has been observed:** Alex loaded the live site on iPhone and completed the
character-customisation path — page load, editor, change a trait, Save — and it
worked (**A2**). That is the first thing in this repository confirmed by loading
production rather than inferred from a green gate.

**What that does not do:** it does not complete this item. `docs/ACTIVATION.md §5`
is an eleven-step checklist and character customisation is not one of its steps;
a manager reaches the editor beneath *"Your keys"* rather than as a listed stop.
One path working is one path working.

**It also proves nothing about anything else.** Not cron execution, not real 2026
Sleeper ingestion, not the commissioner variable, not the absence of demo seats
in production. Each of those is its own D item with its own evidence, and none of
them moved.

`*.vercel.app` remains unreachable through the agent proxy, so no session can
observe production directly; every remaining production claim in this repository
still rests on GitHub's gate results and Vercel's own status.

**Timing: before the league is given the URL.** `docs/ACTIVATION.md §5` is a
5–10 minute phone checklist of the highest-value paths, not a manual QA campaign.

**This is the one that matters most for the Tuesday sync fix.** The code is
implemented and the regressions are tested; production ingestion from Sleeper
remains **unobserved** until a real post-week run happens.

---

## E — Technical debt worth doing when it fits

### E1 · `fantasy_lineups`, `fantasy_player_scores`, `weekly_analytics` are specified and unbuilt

`16 §5` lists them beside `fantasy_matchups`. Nothing reads them and no v1
surface needs them, so this is a note rather than a task — recorded so a future
session does not read the absence as an oversight and start writing migrations.

### E2 · The harness probed the server with an unbounded `fetch` — **fixed and confirmed closed on `main`**

`assertServerIsOurBuild` waited on the platform default, so a server that
accepted the connection and then wedged would have hung the preflight rather than
refused it — and **no answer is the one outcome `scripts/harness.ts` exists to
make impossible**. Its two `psql` probes had carried `timeout: 15_000` since they
were written; the asymmetry was the defect rather than the number.

### E3 · A late stat correction can move a game a reward was already paid on

Found while tracing the sync, and recorded as a **known behaviour rather than a
defect**, because every part of it is already deliberate. The sync re-reads weeks
1..N every Tuesday, which is how NFL stat corrections reach games that were
already stored — that is what `reconcile.ts` exists for. A correction that
flipped a winner after `awardWeek` had paid would leave the 150 tokens with the
manager who won on the day.

Nothing double-pays (`weekly_rewards_once_per_manager_per_reason`) and nothing is
rewritten behind anybody's back: a moved fact makes `generateDraft` produce a
**new version** rather than editing a published one, which is exactly what
`docs/SLICE_REVIEW_BOUNDARY.md` specifies. Clawing a reward back would be a new
product rule about a league that has already read the result, and it is not one
this session should invent.

### E4 · `derivePairings` does not filter an unplayed game

The guard added this session sits at the **write** boundary (`persistWeeks`),
which is the right place: it protects the seed, the historical import and the
weekly sync with one rule. `derivePairings` and the Sunday job's `pairMatchups`
still pair a 0–0 fixture as a game. Harmless today — the snapshot only feeds
comeback detection, which needs a result to flip — but it is one rule living in
one of three places that could each see the payload.

---

## F — Monitored, not worked

### F1 · Visual debt 16 — a residual React `#418`

Quarantined on commissioner approval 2026-08-06 with a ceiling of **2**, narrow
to minified `#418` with `args[]=HTML`. Every sighting is still recorded, counted
and printed, and a dev build's message still fails on sight.

**Restart condition is unchanged:** the next evidence that would move it is the
**element name**, and only a dev build produces one. Do not restart the hunt
merely because the defect still exists. `docs/VISUAL_DEBT.md` item 16.

### F2 · Visual debt 1, 2 and 14

The collection's empty-state scroll rhythm; the reveal plate's caption
outweighing a placeholder collectible; the champion pennant's 10.1px season year.
All three wait on something real — a `18 §4` ruling, final art, and a wider
pennant respectively — and none has new evidence.

---

## G — Deferred, do not execute

`league_events` (commissioner ruling, 2026-08-06 — deferred, with the revisit
condition written down) · the casino (P10) · ~~manager basements (P6, v1.1)~~
**built and open, 2026-08-09 — see G0 below** · silent auction · seasonal events
(P8) · draft night · Season Story · vending machine (P7) · the championship ring
ceremony · roulette, never · Underground content · real-money anything ·
achievements, levels, clout, prestige.

### G0 · Reopened world-building scope, 2026-08-09 — reconciled and classified

The commissioner reopened selected deferred world features for discovery and
implementation. **Rooms was built and the door is open**; everything else was
reconciled against what is actually in the repository and classified. The
reasoning is here so nothing below is re-derived, and so nothing above is read as
a blanket re-opening.

| Area | | Why |
|---|---|---|
| **Rooms / basements** | **NOW — built; art now the constraint** | Fully specified by `04 §10`, `06 §6.2`, `14 §5` and `16`'s P6 row, and shipped. The commissioner's art direction of 2026-08-09 then made the room **shell-first**: see **A3** |
| **Underground / casino** | **LATER — and it wants a decision, not a session** | See G1. Two commissioner-level sources disagree about what the games are, and no wager can settle before September |
| **Silent auction** | **LATER** | `16` puts it in a **November** window, and it is a *spend-down* mechanism: it exists to give end-of-season tokens somewhere to go. There are no season tokens yet. Its inventory authority is also genuinely undecided — an auction of collectibles competes with the box for the same 24-item catalog the P3 simulation was just balanced around |
| **Seasonal events** | **DO NOT BUILD** *(as an engine)* | The mission's own test — *"if a simple seasonal visual state can be expressed through existing architecture without a new abstraction, that is different"* — is already met. `16 §7.2`'s dressing resolver is built and the offseason dressing ships today. A generalized event engine is the speculative framework both the mission and `16 §4.1`'s deferral refuse |
| **Season Story** | **LATER** | P7 thread detection over a season's results. There is no 2026 season. It is also the surface most likely to want the deferred `league_events` spine, so building it first would decide that question by accident |
| **Vending machine** | **LATER — gated on an economy simulation** | It does have a distinct purpose (a **deterministic** purchase against the box's random one, which is the anti-frustration valve), so it is not the duplicate surface the mission warns about. But `16 §8`'s seventh range derives vending prices from box EV, and `docs/ECONOMY_SIMULATION.md §115` records that the simulation deliberately does not check them because the feature does not exist. Building it without extending the simulation would put a second token sink beside a box whose price was fixed at 200 four days ago |
| **Championship ring ceremony** | **LATER — and it has a date** | `16` scopes it as *"Closing Night at Tony's — v1.1 — rings + wheel + portrait + season name, **one ceremony**"*. Three of those four do not exist, and it happens in **January**. The entitlement existing is not a reason to move it ahead of anything — the mission says so explicitly |
| **Basement spotlight** (`08 §17`) | **LATER — newly unblocked** | It links a Slice story directly to a manager's room, and until 2026-08-09 there was no room to link to. It is now possible. It is a *Slice* change — a new candidate, a fact packet and a validator pass — not a room change, and it needs a season to have anything to spotlight |

### G1 · The Underground — the decision that is actually wanted

**Nothing was built and nothing should be until this is answered.** The
reconciliation:

- **`/underground` is deliberately not a route** (`18 §5`, `BACK_HALL_BOUNDARY
  §0`). It is an inert curtained plate in the Back Hall answering *"Don't worry
  about it."* — fixed copy, and the joke and the reveal. It shipped as a `<Link>`
  once, prefetched on hover, 404 on every visit, caught only by the console gate.
- **The approved games are blackjack and slots** (`03 §14`, `16 §3`, `CLAUDE.md`),
  Phase 10, explicitly not in v1. Roulette is never built and its reserved flag
  key is the entire required scaffolding.
- **The reopening brief asks for the opposite**: *"avoid building slots,
  roulette, blackjack clone, poker"* and *"prefer a small number of meaningful
  league-native games."*

That is a **material contradiction between two commissioner-level sources**, and
`CLAUDE.md` requires it be reported rather than silently resolved.

Underneath it there is also a hard fact: **there is nothing to wager on.** The
three approved wagering families (`16 §9`) — Tony's Line, bounties, the
chalkboard prediction — are **all built and all live in the Slice**, which is
where `16 §9` puts them. Building a second wagering surface in the Underground
would duplicate the one that exists. And Tony's Line already refuses to author
itself twice over: `MIN_BASIS_TEAM_WEEKS = 12` returns `thin-basis` structurally,
and the `tonysLine` flag is shut. Neither should be relaxed — the 2026 season has
no games at all.

**So the Underground has no honest content until football exists**, whatever the
games turn out to be. What would be needed to open it:

1. a ruling on whether the Phase 10 games stand (blackjack + slots) or are
   replaced by league-native ones — and if replaced, **what they are**, because
   `16 §9` already owns every league-native wager this product has;
2. a season, or at least twelve team-weeks, for anything settled from football;
3. an economy simulation for whatever wagering is added, on the same footing as
   the box's price (`16 §8`).

**Building it early costs the reveal.** An Underground that opens onto an empty
room spends `18 §5`'s joke for nothing, and `18 §6` says a locked door opens for
everyone at once as an announced event — so it can only be spent once.

Twelve of twenty-four collectibles stay `placeholder_pizza_box` **by design** —
that is the number `art/ASSET_PIPELINE.md §5` commits to at launch, not a gap.

Group B greeting lines await commissioner approval; seed Group A only.

---

## H — Closed, or stale documentation now corrected

| Claimed open by | Actually |
|---|---|
| `CHECKPOINT.md` "Unresolved / carried forward" — *"no weekly income… do not invent a reward that fires on nothing"* | **Shipped.** `lib/rewards/` pays matchup wins and weekly high scores from a finalized week (2026-08-04). The list itself is stale, and `CHECKPOINT.md` already flags three of its entries |
| Same list — *"salvage is unbuilt and P3-gated"* | **Shipped** in #66. The P3 simulation ran; the box costs 200 |
| Same list — *"reward weights provisional"* | Still true, and correct: `provisional` is cleared by the simulation, which has run for price and not for the rarity table. Left alone deliberately |
| `IMPLEMENTATION_HANDOFF.md` | Carries its own banner saying it is a historical record. Confirmed still accurate |
| `docs/PHONE_ONLY_HANDOFF.md` | History. Not the current queue |
| Actions conservation (2026-08-05) | **Lifted** 2026-08-07 by public mode. The half that was never about minutes still governs |
| Harness integrity · Tonight board · front door · rings · audit timestamps · reduced motion · public-mode hardening · Timeline · weekly rewards · Sunday snapshot and Monday comeback · the Tuesday job · homepage fidelity | **All shipped** — #68 through #75. Verified against `main` rather than against the paragraphs claiming them |

---

## Operational readiness, as a table

Not *"does the code exist"* — the question the mission asked is whether Tony's
can run hands-off for a season.

| System | Built | Scheduled | Authenticated | Prod-enabled | Idempotent | Retry-safe | Audited | Tested | Needs Alex |
|---|---|---|---|---|---|---|---|---|---|
| Historical import | ✅ | deploy | n/a | ✅ | ✅ | ✅ | `sync_runs` | ✅ | — |
| **In-season sync** | ✅ *(this session)* | Tue cron | shared secret | ⛔ **D1** | ✅ | ✅ | `sync_runs` | ✅ | D1 |
| Sunday snapshot | ✅ | `55 4 * * 1` | shared secret | ⛔ **D1** | ✅ first-write-wins | ✅ | append-only | ✅ | D1 |
| Week finalization | ✅ | Tue cron | — | ⛔ **D1** | `UNIQUE(season, week)` | ✅ | append-only | ✅ | D1 |
| Stake settlement | ✅ | Tue cron | — | ⛔ **D1** | `stake_id UNIQUE` | ✅ | append-only | ✅ | D1 |
| Weekly token rewards | ✅ | Tue cron | — | ⛔ **D1** | idempotency key | ✅ | ledger | ✅ | D1 |
| Seasonal box grants | ✅ | Tue cron | — | ⛔ **D1** | `grant_key UNIQUE` | ✅ | append-only | ✅ | D1 |
| Slice draft → desk | ✅ | Tue cron | — | ⛔ **D1** | content hash | ✅ | review log | ✅ | D1 |
| Slice **publication** | ✅ | never | admin | ⚠️ **D2** | — | — | named approver | ✅ | D2 — by design |
| Championship rings | ✅ | deploy | n/a | ✅ | ✅ | ✅ | append-only | ✅ | — |
| Loot boxes / economy | ✅ | on demand | session | ✅ | four DB locks | ✅ | ledger | ✅ | — |
| Season transition | ⚠️ | — | — | — | — | — | — | — | see below |

**Season transition is the one row that is not simply green or blocked.** Closing
2026's books in January is `scripts/seed.ts`'s `FINALIZED_SEASONS`, a deliberate
human-named list, and rolling to 2027 means a new `SLEEPER_LEAGUE_ID`. Both are
correct as designed — Sleeper's `complete` status is explicitly not a
finalization signal — and both are code changes rather than operations. Nothing
to do before January; recorded so it is not discovered then.

---

## V1 readiness

**`V1 FUNCTIONALLY READY — ACTIVATION ITEMS REMAIN`.**

Every system the league needs for a season is built, tested against a real
Postgres and reachable. What stands between here and a working season is five
human actions, none of which is engineering and none of which a session may take.

**`docs/ACTIVATION.md` is the packet.** It is written for a phone, in the order
to do them, with the real deadline for each and a reversal path for the only one
that changes production behaviour.

### What has actually been observed, and what has not

The distinction matters more than usual here, because the season's most important
mechanism has never run for real.

| Claim | Evidence |
|---|---|
| The in-season sync is implemented | **source code** |
| It is idempotent, bounded, refuses stale and unplayed data, and resolves its week after syncing | **local Postgres**, and each guard fails on the pre-fix build |
| It compiles, lints and passes the suite | **hosted CI** |
| Every reachable screen renders correctly at three phone widths | **hosted visual QA** |
| It is deployed to production | **inferred** from a normal merge to `main`; not observed |
| It successfully reads a real played week from Sleeper and stores it | **never observed.** It cannot be until a real post-week Tuesday run happens, with `CRON_SECRET` set |

**One thing in this repository has been confirmed by loading the production
site**, and exactly one: the character-customisation flow, on Alex's iPhone
(**A2**). Everything else above — including every row of the table — is still
source, local Postgres, hosted CI, hosted visual QA, or inference from a merge.

That single observation is **not** the smoke test. D5 carries what it does and
does not settle.

### What is left, after the 2026-08-09 reopening

Remaining items are **D** (human), **F** (monitored, restart conditions unmet)
and **G** (deferred, now with G0's classification attached). Category C is empty
of anything with clear value.

The reopened scope produced exactly one buildable slice — **Rooms** — and it is
built. Everything else in G0 is LATER or DO NOT BUILD **for a stated reason**,
and every one of those reasons is either *there is no season yet* or *a
commissioner decision is missing*. Neither is fixed by a session.

Do not resume feature or polish work to fill capacity, and do not read G0's
LATER as an invitation. Launch readiness is not a cleanup budget.
