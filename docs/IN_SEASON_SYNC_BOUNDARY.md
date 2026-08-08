# The in-season sync — the boundary

**Canonical account of how a played week becomes a stored week.**
Authority: `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §4.3` (the two crons and
their chains) and `§12` (tiered import, never fabricated).

---

## 0. What was wrong

Two defects, opposite in shape, coupled in effect. Neither produced an error
message and neither was visible against the recorded fixtures, which is why both
survived eight sessions of green gates.

### The season could not get in

`16 §4.3` specifies the Tuesday job as:

> **sync → finalize → rewards → settle stakes → … → draft Slice → notify
> commissioner**

Everything from `finalize` rightwards was built, idempotent, and tested (#56,
#59, #66, #72). **`sync` was never built.** `runTuesday` began at `finalizeWeek`.

Nothing else in the deployed application writes `fantasy_matchups`:

| Writer | Reads from | Writes |
|---|---|---|
| `npm run db:seed`, on every deploy | recorded fixtures, captured 2026-07-28 | the three seasons as they were in July |
| `/api/cron/sunday` | Sleeper, live | `week_snapshots` only — the pre-Monday photograph, deliberately a different table |
| `npm run sleeper:import -- --live` | Sleeper, live | everything — but it is a developer command nobody runs on a schedule |

The 2026 recording has **no matchups directory at all**, which is the correct
photograph of a season that had not started.

So on Tuesday 15 September 2026 the cron would have fired, found zero publishable
games in week 1, declined, and gone on declining every Tuesday until January. No
rewards, no settlements, no Slice, no Timeline movement — with the whole
downstream chain working perfectly on no input.

**The failure had no error in it.** *"Week 1 holds no publishable game"* is the
truth in July and is indistinguishable from it in October.

### And a deploy would have taken it back out

`vercel-build` is `db:migrate && db:seed && next build`, so **every merge to
`main` re-imports the July fixtures**. `persistChain` updated an open season's
official record from whatever it was handed, because an open season's record *is*
supposed to move week to week.

Reproduced in four commands before the fix:

```
psql -c "update season_memberships … set wins=5, losses=1 …"   -- a live 5-1
npm run db:seed
psql -c "select wins, losses …"                                --  0 | 0
```

It reported `History  3 seasons · 1 records changed · status SUCCEEDED`.

---

## 1. The sync

`lib/sleeper/weekly.ts`. One season, no transactions, weeks 1..N.

### Why it is not the thing `16 §4.3` bans

The same section says **"no live in-game score sync, ever. It is the fastest
route to becoming a worse Sleeper."** That bans a poller keeping the room's
scores warm while games are in progress. This runs **once a week, after the week
is over**, and imports a finished result — and it is the step the same paragraph
asks for by name. The Sunday cron is the same argument from the other side.

### The request budget is the design constraint

`16 §4.3` warns the Tuesday job must be *"chunked and resumable against Hobby's
function duration ceiling"*, and a measurement says it is right to: a full
18-week live traverse of one season took **45 seconds** from this environment.

Three bounds, and each is load-bearing rather than an optimisation:

| Bound | Why |
|---|---|
| **One season** (`importSeason`, not `traverseChain`) | A finalized season refuses every write and reports a conflict per roster. Walking back to 2024 every Tuesday costs two thirds of the requests to be told no. |
| **No transactions** (`includeTransactions: false`) | They were half of every week's budget and **nothing persists or reads them** — there is no `fantasy_transactions` table and no consumer of `ImportedWeek.transactions` outside the chain, where only its warnings are kept. |
| **Weeks 1..through** | A week is fetched only once there is reason to think it was played. |

`maxDuration = 60` is declared on both cron routes. The Next.js default is 10s,
which would have timed out mid-season with no signal beyond a truncated response.

### The range must start at week 1

Not an accident of the API. `reconcileSeason` compares the season's **official
standings** against the **sum of the weekly snapshot**; hand it weeks 6..9 and
every roster disagrees with its own record, and `isPairingDisputed` would mark
real games `disputed`. Weeks 1..N mid-season is apples to apples — the standings
reflect N weeks and so does the snapshot.

The cost of re-reading earlier weeks is not waste: it is how NFL stat corrections
reach games that were already stored, which is the whole reason `reconcile.ts`
exists.

### How far to read, and why it advances one week at a time

`weekToReadThrough(stored) = stored + 1`, clamped to 18.

- **A standing start asks for week 1.** Correct from the preseason, which is
  where the league is today.
- **An unplayed week comes back empty and moves nothing**, so the bound does not
  advance and next Tuesday asks the same question. Five harmless no-op runs
  between now and the opener.
- **A missed Tuesday leaves the league one week behind rather than skipping a
  week's rewards.** `?week=` on the route is the catch-up path.

**Asking Sleeper which week it is was considered and rejected.** `state.week`
rolls over on Tuesday morning, which is exactly when the job runs, so it names
the just-finished week or the next one depending on the minute.

---

## 2. The week is resolved after the sync, and that is a correction

The route used to compute `suggestedDraftWeek(db, season)` — `max(stored week)` —
and hand it to the job.

After a sync exists that is the **wrong** answer, and wrong in a way that would
not have shown up until the second Tuesday of the season: before the sync,
`max(stored week)` is *last* week. Week 1 would have closed every Tuesday until
January and no other week ever.

`runTuesday` resolves it itself, after step 1. `week` on the input is now the
override rather than the instruction.

`suggestedDraftWeek` still exists and is still right for what it does — it is the
press desk's form default — and now shares its query with the sync
(`latestStoredWeek`). The two differ only in what they say about a season with
nothing stored: the desk offers week 1, the sync needs to know it holds **zero**
so it can go and fetch the first one.

---

## 3. A stale capture never overwrites a fresh one

`seasons.snapshot_captured_at` already meant *when we last looked*. It is now
also the guard's clock.

> A chain captured **before** the season's stored capture does not rewrite that
> season's standings or its games.

| Case | Stored | Incoming | Result |
|---|---|---|---|
| fresh database | null | anything | writes — a first import can never be stale |
| deploy, no live sync yet | 28 Jul | 28 Jul | **equal, so it writes** — a re-seed stays a no-op rather than becoming a refusal |
| deploy, after a live sync | 13 Oct | 28 Jul | **refused**, and reported |
| an ordinary Tuesday | 6 Oct | 13 Oct | writes |
| a finalized season | — | — | already refused, unchanged |

Two details are the difference between a guard and the appearance of one:

- **Older, not merely different.** Equality has to pass, or every deploy would
  start reporting `NEEDS_REVIEW` about a fixture that changed nothing.
- **The clock only moves forward.** Letting a stale read stamp its own older time
  would make the *next* stale read look fresh, and the deploy seed would win on
  the second attempt. Asserted with two consecutive deploys, because one would
  have passed either way.

It is reported as a conflict — `status: NEEDS_REVIEW` — never skipped in silence.
Every other refusal in this importer says why, and a guard nobody can see firing
is a guard nobody can trust.

---

## 4. A week nobody has played is not a result

**The most dangerous case, and the only unrecoverable one.**

Sleeper publishes the whole season's schedule the moment a league drafts. A week
that has not happened comes back as ordinary matchup rows with `points: 0` on
both sides, and **nothing in the payload says "not yet"** — no kickoff time, no
status field. `lib/sleeper/endpoints.ts` is the entire surface this product talks
to and none of its eight endpoints carries an NFL schedule. This is the same hard
limit `docs/SUNDAY_SNAPSHOT_BOUNDARY.md §3` records from the other direction.

Between the draft and the opener the sync asks for week 1 every Tuesday. Without
a guard, the first of those would have stored five 0.00–0.00 ties, `finalizeWeek`
would have closed the week on them, and **`week_finalizations` is append-only** —
so week 1's real result could never be recorded, and the paper would have printed
a week that did not happen.

`isUnplayed` in `persist.ts` drops a pairing where both sides scored exactly
zero. It sits at the **write boundary**, so it protects the seed, the historical
import and the weekly sync with one rule rather than three.

**What it costs, stated rather than implied.** A genuine 0.00–0.00 game would be
dropped and there is no way to tell the two apart from this payload. In this
league that needs twenty starters — defenses included, no kickers — to score
nothing between them. `weekly.test.ts` asserts it has **never happened across the
162 recorded games of 2024 and 2025**, so the rule is measured against the
league's own history rather than assumed. If it ever does happen, the week is
recoverable by hand and the alternative is not.

---

## 5. What a failure does

| Failure | Behaviour |
|---|---|
| Sleeper unreachable | `refusal: 'unreachable'`, one sentence in `skipped`, **the rest of Tuesday still runs** against what is stored. The route's 500 makes the platform retry, which is safe because every step is idempotent |
| `SLEEPER_LEAGUE_ID` stale | `refusal: 'wrong-season'` and **nothing imported** — otherwise last year's games would land under this year's roster ids, which is one manager's week attributed to another |
| Season finalized | `refusal: 'season-closed'`, before any request is made |
| No source supplied | Recorded in `skipped`. A Tuesday that quietly stopped syncing would look exactly like a quiet week |

---

## 6. What this does not do

- **It never finalizes a season.** `finalizeYears` is empty and stays empty.
  Closing the books is a person's decision (`scripts/seed.ts`'s
  `FINALIZED_SEASONS`); a cron doing it on Sleeper's `complete` status would
  freeze a record while stat corrections were still landing, which is exactly how
  2024's standings and its weekly points came to disagree.
- **It does not publish.** Unchanged: `runTuesday` still ends at `submit: true`
  and `16 §9` still requires a person.
- **It adds no third cron.** `16 §4.3` allows exactly two and there are exactly
  two.
- **It does not touch the deploy seed.** The seed still reads recorded fixtures,
  which is right (`16 §12`): offline, repeatable, identical in every environment,
  and a Sleeper outage cannot take a deploy down. What changed is that the seed
  can no longer *overwrite* something fresher.

---

## 7. Verification

Thirty-two tests against a real Postgres, across `lib/sleeper/weekly.test.ts` and
the new block in `lib/slice/tuesday.test.ts`.

**Both halves fail on the pre-fix build**, checked by reverting each mechanism in
turn rather than by inspection:

| Reverted | Result |
|---|---|
| the staleness guard | 3 of 6 stale-capture assertions fail |
| the sync step | 6 of 7 Tuesday sync assertions fail |

`lib/sleeper/test-source.ts` is a Sleeper part way through 2026. It is written
rather than recorded because there is no recording of a season **in motion** and
there cannot be one yet — the 2026 fixture is a preseason photograph and 2024 and
2025 are finished seasons whose books are shut. Identity comes from the real
fixtures; only the two payloads a played week actually changes are synthesised,
and the standings are **computed from the same games** so `reconcileSeason`
cannot report a fixture defect as a product one.
