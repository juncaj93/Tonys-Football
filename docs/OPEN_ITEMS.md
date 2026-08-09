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
> **Autonomous product development is stopped.** Every v1 system is built,
> tested against a real Postgres, and photographed. What remains is five human
> actions, and `docs/ACTIVATION.md` is the packet for them — written for a phone,
> ordered, reversible, and the only document Alex needs.
>
> Do not resume Category C polish because capacity exists. Deferred scope stays
> deferred.

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
condition written down) · the casino (P10) · manager basements (P6, v1.1) ·
silent auction · seasonal events (P8) · draft night · Season Story · vending
machine (P7) · the championship ring ceremony · roulette, never · Rooms and
Underground content · real-money anything · achievements, levels, clout,
prestige.

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

### Autonomous development is stopped here

The last justified verification slice is complete. Remaining items are D (human),
F (monitored, restart conditions unmet) and G (deferred). Category C is empty of
anything with clear value.

Do not resume feature or polish work to fill capacity. Launch readiness is not a
cleanup budget.
