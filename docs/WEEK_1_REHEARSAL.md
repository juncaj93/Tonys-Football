# The Week 1 lifecycle rehearsal — the canonical account

**This is the boundary document for `lib/rehearsal/`.** It records what the
rehearsal harness is, what the Week 1 rehearsal exercised, the one real defect it
found, and — separately and explicitly — what remains a human action rather than
an engineering one.

`docs/evidence/week-1-rehearsal/report.md` is the **generated** evidence: what
actually landed in the database on a real run. `npm run rehearse -- week-1`
rewrites it. This document is the reasoning; that one is the receipt.

---

## 1. Why a rehearsal, when every step already has tests

Every step of the Sunday-to-Tuesday chain is tested against a real Postgres, and
those tests are good. None of them answers the question the commissioner actually
has:

> If this were the first real week of the 2026 season, would Tony's get from
> Sunday through Tuesday without corrupting data, skipping a manager,
> double-paying a reward, publishing something untrue, or leaving the app in a
> state that contradicts itself?

That question is about the **seams**, and the seams are where this product's
expensive defects have all lived. The in-season sync was missing while every step
downstream of it was correct and tested (`docs/IN_SEASON_SYNC_BOUNDARY.md`). The
week was resolved before the sync rather than after it, so week 1 would have
closed every Tuesday until January. A scheduled-but-unplayed week would have been
stored as five ties and finalized into an append-only table. Each of those was a
*sequence* defect sitting between two correct components.

So this is a driver over the whole chain, not another unit test.

**And it found one more.** See §6.

---

## 2. The harness

`lib/rehearsal/` — the harness plus one module per scenario, and nothing in
`app/` imports any of them, so none of it is in a bundle. The same standing
`lib/db/test-helpers.ts` and `lib/sleeper/test-source.ts` already hold.

**Scenarios that exist:** `week-1.ts` (this document) and `week-16.ts` (the
playoffs — `docs/PLAYOFF_REHEARSAL.md`). Week 8 is the midseason fixture named
in §8 and lives elsewhere. Check this list before writing a third season.

### `script.ts` — a season somebody wrote down

`SeasonScript` is weeks of `ScriptedGame`, and a scripted game carries **two**
score lines:

```ts
{ matchupId: 1, rosters: [1, 2], preMonday: [118.40, 131.05], final: [145.62, 131.05] }
```

Two, because `16 §4.3` sanctions exactly two reads of Sleeper — the Sunday
photograph before Monday night, and the Tuesday close after the week is over —
and the difference between them is the only thing that makes a Monday comeback
sayable at all (`07 §8`).

`scriptedSeason()` turns a script into a `SleeperSource`. It is a **recording
everywhere it can be**: league, users, rosters and both brackets come from the
real fixtures, so managers, Sleeper ids, roster ids and the name mapping behave
exactly as in production. Only the two payloads a played week actually changes
are synthesised — the week's matchups, and the standings those matchups imply.
The standings are computed from the same script rather than stated, because
`reconcileSeason` compares the two and a hand-written record that disagreed with
its own weeks would mark every game `disputed` — a fixture defect that reads as a
product one.

Three phases: `pre-monday`, `final`, and `scheduled`. The third is the state
nothing else can stage — from the moment a league drafts, Sleeper answers a
future week with ordinary rows at `0` on both sides, and nothing in the payload
says *"not yet"*.

Four faults, each a state the live API can genuinely produce: `unreachable`,
`malformed-matchups`, `unknown-owner`, and a stale `capturedAt`.

**It generalises `lib/sleeper/test-source.ts` rather than replacing it.** That
file's scores come out of a formula, so every game is a comfortable win by the
lower roster id and no week has a close game, a blowout, a tie or a notable score
in it. A rehearsal has to *name* the outcomes, because the outcomes are what the
assertions are about. `seasonInProgress` stays where it is and keeps its callers.

### One deploy-reproduction, not two

`seed()` calls the **Week 8 rehearsal's own** `importHistory`
(`lib/sleeper/midseason-season.ts`) rather than keeping a thinner copy. That is
the reconciliation the ownership ruling asks for, at the one place a second
harness genuinely existed — and it made this rehearsal stronger, because
`importHistory` is what a *deploy* leaves behind: the content every spoken
surface draws from, the reward table a box cannot open without, the season's
tabs, the opening box, the welcome box, the rings and the significance policy.
The first version of `seed()` did the chain, the names and the economy, and a
rehearsal starting from less than a deploy leaves behind is rehearsing a state
production never has.

It gained one additive parameter to make that possible: an optional `source` and
`leagueId`, so a caller that needs the *league itself* to be wrong can supply one.
Its existing callers pass neither and are unchanged.

### `harness.ts` — four verbs and an observation

```ts
const run = createRehearsal({ db, script, finalizeYears: [2024, 2025] });

await run.seed();                                   // the deploy, reproduced
await run.sunday({ played: 1, at: SUNDAY });        // 16 §4.3's first cron
await run.tuesday({ played: 1, at: TUESDAY });      // 16 §4.3's second cron
const state = await run.observe();                  // the whole database, once
```

Plus `approve()` and `publish()`, which are the **human** halves and sit beside
the crons deliberately: the cron cannot perform either, and the rehearsal has to
prove that as well as use it.

Four verbs is the interface on purpose. A later rehearsal that needs to express
*"the playoffs"* should do it by writing a different season, not by adding a
fifth verb — the lifecycle is one shape and the scenarios are data. That is what
makes this usable by the playoff and championship rehearsals without a second
harness.

`observe()` returns `LifecycleState` — seats and balances, stored games,
snapshots, closures, rewards, the ledger, stakes, resolutions, Slice versions and
boxes — in **one** read, so an assertion and the commissioner's report are
looking at exactly the same picture. A report generated from a second query could
disagree with the test that passed, and the disagreement would be invisible.

`abortingCommits(db)` is the ninth failure injection: a proxy whose transactions
do all of their work and are then denied their commit. It is the only failure in
the set that is a property of the machine rather than of the world, and it is the
exact failure a single-transaction claim exists to survive.

### `week-1.ts` — the scenario

Ten managers, five games, every score distinct to the cent. Each game earns its
place:

| Game | Managers | What it is for |
|---|---|---|
| 1 | Alex v Nathan | **The Monday comeback** — 12.65 down on Sunday, wins by 14.57. The only game whose result flips between the two readings |
| 2 | Joe v Zack | **The close game** — 0.44 apart. A rounding defect anywhere in the cents pipeline changes the winner |
| 3 | Nick v Ryan | **The blowout and the notable score** — 64.86 apart, and Ryan's 152.88 is the one high score the week may pay |
| 4 | Brandon v Cheese | An ordinary win, and a lead held through Monday |
| 5 | Matt Lee v Matty B | **The near-comeback** — closes from 15.14 back to 5.76 and still loses, so it is a story that must *not* be told |

Week 2 exists so the transition can be rehearsed, and carries **a tie** — the tie
rules were stated in `lib/rewards/derive.ts` and had never run end to end. Week 3
is the *schedule*: five games at 0–0, which is the input to the eighth injection.

**These numbers are test data and are never presented as league fact.** They live
inside the rehearsal, against a throwaway database, and no production surface can
reach them.

### The two rehearsals, side by side

They answer different questions and both are worth having:

| | Week 1 (`lib/rehearsal/`) | Week 8 (`lib/sleeper/midseason-*`) |
|---|---|---|
| Question | Does one week work as **one system**, from Sunday to Wednesday | What did **seven Tuesdays leave behind** |
| Sunday leg | Yes — the pre-Monday photograph and the comeback it makes sayable | Not exercised |
| Scoreboard | Two score lines per game, so the week has a before and an after | One written scoreboard, forty games, chosen for accumulated state |
| Failure injection | Nine, at the boundaries that own them | Its own set, around accumulation |
| Shape | A generalized harness; the scenario is data | One scenario, deeply modelled |

The generalized harness is the one a playoff or championship rehearsal should
reach for; the midseason fixture is the one to copy when a scenario needs a
league that has *been somewhere*.

### It drives production code, not a copy of it

`runTuesday` is what `app/api/cron/tuesday/route.ts` calls. `runSundayJob` is
what `app/api/cron/sunday/route.ts` calls — **after this slice**; see §6.

---

## 3. What the Week 1 rehearsal covers

Forty-two assertions in `lib/rehearsal/week-1.test.ts`, in ten groups.

**Before the week.** An open 2026 season, ten seats mapped to the right names, no
week-1 game, no closure, no reward, no snapshot, no issue, and **no fabricated
0–0 record**.

**Sunday.** Five games photographed at their *Sunday* scores; the week resolved
from Sleeper's own `state` rather than from the database; a July read declining
because the recorded fixture genuinely says `week: 0`; no other week touched; and
a second run — a *later* run, after Monday, with different scores — writing
nothing and keeping the first photograph. **Exactly two Sleeper requests**, which
is the shape of `16 §4.3`'s carve-out made observable: one `state`, one
`matchups`, one insert, and nothing that could grow into the poller the same
sentence bans without that number moving.

**Tuesday.** Sync, close, settle, pay, grant, author, draft. A job run with **no
Sleeper at all** says so in words distinct from an upstream that refused — a
report that conflated them would make a broken deploy look like a quiet week. The week resolved
**after** the sync, proven on the second Tuesday where a pre-sync resolution
answers 1 and the right answer is 2. All five games stored with the right
pairings, scores and winners; the close game correct to the cent; the week closed
exactly once however many times the job runs.

**The two readings together.** Exactly one Monday comeback, and it is game 1.
Game 5 — which narrowed but did not flip — is not a comeback.

**Rewards.** Five wins at 150 and one high score at 400, to the named people. No
losing seat paid. The ledger reconciles to the trigger-maintained balances,
exactly, per manager. A replay pays nothing. Week 2's tie pays no win to either
side and still pays its high score.

**Wagers.** The no-op path, recorded explicitly — see §4.

**The Slice.** The draft lands on the desk as `needs_review` and stops. It drafts
with `ANTHROPIC_API_KEY` unset. It prints only finalized games. Publishing an
unapproved version is refused by the database; with a named person's approval it
publishes.

**The transition.** Week 1 final, week 2 the week the board is about, week 1
immutable once closed, and no leakage between them.

**Nine failure injections** — §5.

**And the whole week, once**, Sunday to Wednesday, ending in one coherent state.

---

## 4. Wagers: the no-op, and why it is the right answer

**Nothing is settleable in week 1, and three separate rules say so.** The
rehearsal does not change any of them, and does not turn anything on to have
something to settle:

- **Tony's Line is flag-gated shut** (`18 §3.4`, `lib/flags.ts`). The line is a
  season median and a season median needs a season.
- **A bounty** is authored against a basis of *earlier* weeks, and week 1 has
  none. `MIN_BASIS_TEAM_WEEKS` is twelve team-weeks; week 1 supplies zero.
- **The chalkboard** is the same: a prediction about week 1 has no prior week to
  be a claim against.

So the assertion is that no stake resolution exists and no token moved for a
`STAKE_PAYOUT` reason after week 1 — and the report shows exactly that. The
positive case is reached one week later: the generated report's *"transition into
week 2"* run settles the chalkboard prediction authored for week 2, and the
rehearsal asserts the settlement is idempotent through the same replay checks
everything else gets.

---

## 5. The failure rehearsals, and what each proves

Each is a state the world can produce, injected at the boundary that owns it. A
failure rehearsal that stubs the thing it is testing proves the stub.

| # | Injection | Result |
|---|---|---|
| 1 | **Sleeper unreachable** on Tuesday morning | The sync declines in a sentence, the chain finishes, nothing is invented and nothing is closed on nothing. The retry closes and pays normally |
| 2 | **Malformed matchup payload** — a non-object row, a row with no `roster_id`, a row with no points | The decoder drops what it cannot read; nothing pairs, so nothing is stored and nothing is closed over a partial week. A clean payload afterwards closes it properly |
| 3 | **The Tuesday route invoked twice** | Every observable — closures, rewards, ledger, versions, stakes, resolutions, boxes — is byte-identical |
| 4 | **Process dies after the sync, before the rewards** | Five games stored, no closure, no payment. The retry finishes the job and pays once |
| 5 | **Process dies after the rewards, before the draft** | The retry reports six awards already paid, pays nothing, and creates the draft |
| 6 | **Stale re-import** — July's fixtures over a live October season, which is what every deploy does | `recordsChanged: 0`. Games and standings are untouched |
| 7 | **A roster owned by an account this league has never seen** | The seat is not created, the game *is* stored, and `publishableWeek` suppresses it — so **neither side** is paid. The high score moves to the best score that can be attributed to a person |
| 8 | **A week scheduled but never played** — ten rows at zero | Refused. No game stored, no closure, no reward. This is the unrecoverable one: five fabricated ties finalized into an append-only table could never have been corrected |
| 9 | **The reward transaction cannot commit** | Not one row and not one token. The whole week or none of it. The retry pays it exactly once |

Injection 7 deserves a note. The fault has to be present **at the seed**, not
merely at the sync: `persistChain` leaves an existing membership alone, so a seat
created correctly and *then* made unresolvable keeps its manager, and injecting
it later would rehearse the repair rather than the failure. Roster 6 is chosen
because it is the week's high score — the most expensive seat to lose.

Losing roster 5's win alongside it is the stated cost of that suppression, and it
is the right cost: paying a game whose opponent the product cannot name is worse
than paying nothing.

---

## 6. The defect it found

### The Slice could never have drafted during the season it is about

> **Found twice, on the same day, by two rehearsals that could not see each
> other.** The Week 8 rehearsal (#86, merged first) reached this from the other
> end and **deliberately declined to fix it**, pinning the behaviour with a test
> written to go red on repair, because its scope excluded the Slice's editorial
> architecture. This session's scope names the Tuesday Slice handoff explicitly,
> so the repair ships here — and #86's test is **inverted rather than deleted**,
> keeping its reasoning and its attribution. `docs/WEEK8_REHEARSAL.md §5.1`
> carries the finding and the correction notice.
>
> The disagreement was about *authority*, not substance: both sessions read it as
> a wiring gap. **The commissioner ruled on 2026-08-10 to keep the fix**; §6.1 is
> that ruling and §6.2 is what it does not license.

`lib/slice/packet.ts` built its week with `finalized: season.finalized` — the
**season's** own finality, which is `seasons.finalized_at`, which is shut in
January. `16 §4.3`'s Tuesday chain ends by drafting the week that just closed. So
for every week of the 2026 season the packet would have refused `not-final`, the
Tuesday job would have recorded *"That week is still open"* in its `skipped`
list, and **the press desk would have been empty every Tuesday until the season
was over.**

It is the same shape as every other defect this pipeline has had:
`not-final` is the truth in July and looks identical in October. `npm run check`
was green, `npm run visual:qa` was green, and the existing integration test for
the Tuesday job asserted the wrong behaviour in passing — *"on an open season the
Slice will not even draft"* — as though it were a property rather than a
symptom.

**The rule was already written down and already had a home.**
`lib/stats/finality.ts` says a week is final when **its own** finalization exists,
and prefers that over the season's because it is the narrower and earlier claim.
Its own header names the Slice as one of its two consumers. Rewards
(`lib/rewards/service.ts`) and stake settlement (`lib/stakes/service.ts`) have
called it since they were built. The Slice was the one caller still asking the
wider question.

**The fix is to call the predicate rather than restate it:**

```ts
const isFinal = (weekNumber: number): boolean =>
  weekFinality({
    seasonFinalizedAt: season.finalizedAt,
    weekFinalizedAt: season.weekFinalizedAt.get(weekNumber) ?? null,
    hasGames: season.rows.some((row) => row.week === weekNumber),
  }).final;
```

`seasonWeeks` gained `finalizedAt` and `weekFinalizedAt` to supply it — additively,
so no existing caller changed.

**Nothing is loosened.** A week with no `week_finalizations` row is still
refused, so an in-progress week still cannot be printed, which is what *"a number
that can still move must not be printed"* actually requires. `slice.test.ts`
holds the negative half and now says why; `lib/rehearsal/week-1.test.ts` holds
the positive half. **Both were run against the pre-fix code and the positive one
fails there** — `expected [] to have a length of 1`.

### 6.1 The commissioner ruling — **KEEP THE FIX**

> **RULING, 2026-08-10: keep the shipped `weekFinality` fix. Do not revert it.**
>
> The Slice is *intended* to draft during the active season once the relevant week
> has legitimately closed. It must **not** wait for `seasons.finalized_at`, which
> is season-level finality and does not happen until the books close in January.
>
> The canonical lifecycle is: **week closes deterministically → that week's facts
> become eligible → the Tuesday job may create a draft → the draft appears on the
> review desk → a human reviews → a human approves and publishes.** The cron may
> *prepare* editorial content and may never publish it.

**This section previously argued the case and offered a reversal path. It is now
a decision rather than an argument**, and the reversal path is deliberately gone:
reverting would reintroduce a defect the commissioner has ruled against.

The reasoning that supported it is retained, because it is why the boundary sits
where it does:

1. **The rule was already written down, and already named this caller.**
   `lib/stats/finality.ts` says a week is final when its own finalization exists,
   and its header states *"the Slice will print a live week from the same
   record."* Rewards and stake settlement have called it since they were built.
   The Slice was the last caller asking the wider question.
2. **Nothing reaches the league without a person.** `16 §9`'s approval gate is
   untouched: the draft lands as `needs_review` and stops, exactly as it did
   before. What changed is whether there is anything on the desk to approve.

### 6.2 What the ruling explicitly does **not** license

Recorded because *"the Slice may print a live week"* is one sentence away from
several things that remain forbidden:

- **Provisional scores are still not publication facts.** An unclosed week is
  still refused — `weekFinality` returns `not-final` and the packet prints
  nothing.
- **The Sunday snapshot is not a finalized read.** It is the pre-Monday
  photograph and nothing else.
- **A scheduled-but-unplayed week is still not five ties.** The 0–0 guard at the
  write boundary is load-bearing and unweakened.
- **Season-level records may not pretend the season is complete.** Week finality
  is eligibility for *that week's* newspaper, not for a season summary.
- **The cron may not approve and may not publish.** Both remain human-only.
- **AI is still not a source of fantasy facts.**

The ruling moved exactly one boundary: which finalization record makes an
ordinary weekly fact packet eligible. Nothing else.

### One structural change came with it

`app/api/cron/sunday/route.ts` held its own logic — which season, which week,
what an unreadable upstream costs — and constructed its own live Sleeper, so none
of it could be exercised by any test without reaching the network. Three real
decisions with no cover on them, in a file whose stated job was *"the door and
the clock"*.

`runSundayJob` in `lib/slice/sunday.ts` is that logic, with the source injected
at the seam the Tuesday route already had. The route is now the door, the clock
and the response mapping, and the rehearsal drives the same function production
does. Behaviour is unchanged, including the status codes: `nothing-to-do` is a
200 because a non-2xx would have the platform retry an empty job every few
minutes until September, and `upstream-failed` is the 500 because a retry might
genuinely fix it and retrying is safe.

`resetDatabase` moved from `lib/db/test-helpers.ts` to `lib/db/reset.ts` and is
re-exported, because the former imports `vitest` and was therefore unloadable
from a plain `tsx` script — which would have forced `scripts/rehearse.ts` to keep
a second copy of the table list. Two lists of every table is exactly the drift
that list's own header warns about.

---

## 7. What the rehearsal deliberately does not do

- **It does not open a shut flag.** Tony's Line stays shut, the Underground stays
  shut. A rehearsal that turned a feature on to have something to exercise would
  be rehearsing a product that does not exist.
- **It does not finalize a season.** Closing the books is a person's decision in
  January (`scripts/seed.ts`'s `FINALIZED_SEASONS`), and `createRehearsal`
  refuses to rehearse a season that is already closed — a closed season refuses
  every write, so it would only exercise the refusals.
- **It does not publish from a cron.** It publishes through `approveVersion` and
  `publishVersion` with a named actor, which is the only path there is.
- **It adds no visual state.** The work is backend-only and reveals no
  user-visible state that was unreachable before: the rack serves published
  issues exactly as it did, and publication still requires a person. The Slice
  fix changes *when* a draft can exist, not what any screen looks like.
- **It does not assert in the report generator.** `scripts/rehearse.ts` prints
  what happened and checks nothing; `lib/rehearsal/week-1.test.ts` is the gate.
  Two things that both check would be two places to disagree.

---

## 8. Reusing it — the playoffs, the championship, and anything after

**Midseason is already done and is not this harness's.** `lib/sleeper/midseason-2026.ts`
is the Week 8 rehearsal's written scoreboard and `lib/slice/midseason-week8.test.ts`
is the rehearsal itself; §2's table says which of the two to reach for. Do not
write a `week-8.ts` here — it exists, somewhere else, and the second one would be
the duplication both sessions have now spent effort removing.

For a **new** scenario, write a `SeasonScript` and call the same four verbs:

- ~~**The playoffs**~~ **— done, and it needed two additions to `script.ts`.**
  `lib/rehearsal/week-16.ts` is the scenario. The prediction above was right
  about `weekType` and the unpaired rosters, and wrong about the brackets: the
  recorded ones are a **preseason draw with no result**, so a scenario that
  served them could never move `made_playoffs` or `final_rank`. `ScriptedBrackets`
  is a bracket that advances, and `ScriptedWeek.postseason` keeps a playoff week
  out of the official record `reconcileSeason` compares against. Both are
  scenario data; no fifth verb was added. `docs/PLAYOFF_REHEARSAL.md §8`.
- **A scenario that needs a league which has *been somewhere*** — accumulated
  records, live streaks, an order statistic with a real sample behind it — should
  copy the midseason fixture's approach rather than this one's. A written
  scoreboard of forty games is the right tool for that and a two-line-per-game
  script is not.
- **Failure and recovery** scenarios should extend `ScriptedFault` rather than
  stubbing an internal function.
- **The seed is `importHistory`**, shared with the midseason rehearsal. A
  scenario needing a different starting state should add a parameter to it rather
  than a third reproduction of a deploy.

If a scenario needs a fifth verb on `Rehearsal`, that is a signal the lifecycle
has genuinely changed shape — check whether it has before adding one.

---

## 9. Remaining human activation risk — **separate from engineering**

Nothing in this slice moved any of `docs/ACTIVATION.md`'s five human actions, and
the rehearsal cannot close any of them. Stated plainly, because a green rehearsal
is easy to read as *"we are live"* and it is not:

- **`CRON_SECRET` is unset in production, so both jobs are scheduled and inert.**
  The rehearsal proves the jobs are correct; it says nothing about whether they
  can run. The door answers **404** with the secret unset, deliberately, so the
  failure mode of forgetting is *silence* — no Sunday photograph, no Tuesday
  close, no draft, and nothing anywhere that looks like an error. **This is the
  single highest-value remaining action** and it activates both jobs at once.
- **No cron has ever executed in production.** `docs/OPEN_ITEMS.md` is explicit
  that production observation and engineering readiness are different claims, and
  this rehearsal is entirely the second kind.
- **Live Sleeper has never been read by the deployed application.** Every read in
  this rehearsal is a recording or a script. The transport, the decoder and the
  staleness guard are tested; the actual 2026 league's live payloads are not, and
  cannot be until there is a played week.
- **The commissioner variable, the demo-seat query, Tony's line of dialogue and
  the production smoke test** are unchanged and remain Alex's.

The rehearsal's honest claim is this: **the engineering is ready for the first
week of the season, and the first week of the season cannot happen until a person
sets `CRON_SECRET`.**
