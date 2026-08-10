# The midseason rehearsal — week 8 of 2026

**Status:** run. Two defects found and fixed, three contradictions reported and
deliberately not fixed, everything else measured and green.

This is the canonical account of what the lifecycle does after seven finalized
weeks already exist. Where it disagrees with an older document about midseason
behaviour, this one wins.

Four artefacts carry it:

| | |
|---|---|
| `lib/sleeper/midseason-2026.ts` | The scoreboard — forty games, eighty scores, frozen |
| `lib/sleeper/midseason-season.ts` | Standing the season up: a deploy's seed, then seven Tuesdays |
| `lib/slice/midseason-week8.test.ts` | The gate — 45 tests against a real Postgres |
| `scripts/week8-rehearsal.ts` | The instrument — plays the same eight weeks and prints everything below |

---

## 1. Why week 8, and what week 1 cannot show

`lib/slice/tuesday.test.ts` already proves the Tuesday job from a standing
start. Every one of its assertions is about **week one**, and week one is the
easiest week of the season: the database is empty, so there is nothing for a new
week to be wrong *relative to*.

Seven of the defects this rehearsal was written to hunt are invisible there, and
they are invisible for the same structural reason — after one week, the wrong
answer and the right answer are the same value:

| Condition | Why week 1 cannot see it |
|---|---|
| A record that resets, or double-counts a prior week | After one week every wrong answer is also 1–0 |
| A points-for tiebreak | Nobody can be level on wins *and* separated by a season's points |
| A win streak read across a season boundary | The longest possible streak is 1 |
| An order statistic drawn from the wrong sample | There is no earlier sample to draw from wrongly |
| A bounty rolled forward and settled by a later week | Nothing has rolled |
| A milestone grant that fires twice | `MIDSEASON_WEEK` is 7 |
| A board that names the wrong week | `WEEK ONE` is correct in week one |

The last one is the defect this rehearsal was worth running for. It is in §4.

### Why week 8 specifically

The 2026 fixture league has `playoff_week_start: 15`, so weeks 1–14 are regular
season and week 8 is squarely inside it. Ten teams play a complete round robin
in **nine** weeks, so weeks 1–8 contain forty distinct pairings and **not one
rematch** — "repeat opponents where the schedule permits" is satisfied by the
schedule permitting none. And `MIDSEASON_WEEK` is 7, so the second seasonal box
falls due on exactly the Tuesday before the rehearsal week. No nearby week is
more representative.

---

## 2. The starting state

Seven weeks are **played**, not inserted — `importHistory` (every step
`scripts/seed.ts` takes that leaves a row behind) and then seven `runTuesday`
calls, one per week, with the week resolved by the job rather than passed to it.
A hand-inserted history would have proved nothing: the midseason failure modes
are all about what seven Tuesdays *left behind*, and inserted rows were never
left behind by anything.

### Standings through week 7 — derived by the product, matching the fixture to the cent

| # | Manager | W–L | Points for | Streak |
|---|---|---|---|---|
| 1 | Matty B | 6–1 | 900.20 | won 1 |
| 2 | Matt Lee | 6–1 | 899.60 | won 2 |
| 3 | Brandon | 5–2 | 899.68 | won 3 |
| 4 | Nathan | 5–2 | 887.78 | **won 4** |
| 5 | Nick | 3–4 | 805.70 | — |
| 6 | Cheese | 3–4 | 783.18 | won 2 |
| 7 | **Alex** | **2–5** | **984.65** | — |
| 8 | Joe | 2–5 | 761.26 | lost 4 |
| 9 | Zack | 2–5 | 738.80 | lost 4 |
| 10 | Ryan | 1–6 | 692.43 | — |

Every condition below is **authored into the fixture** rather than hoped for,
and asserted, so a later edit to the scoreboard cannot quietly remove the case:

- **Alex is the misleading record.** 2–5, dead last but three, and the league's
  highest scorer by 84.45 — five of his seven losses are by under three points.
  Any surface reading *record* as *quality* says something false about him.
- **Matty B and Matt Lee are level on wins**, separated by **0.60 of a point**.
  This is the only way `standingsThrough`'s points-for tiebreak is ever executed
  against real accumulated totals.
- **Nathan is on a live four-game win streak**; Zack and Joe are on live
  four-game losing streaks. Matty B's streak is **1**, not 5 — he lost week 6,
  and a naive count gets that wrong.
- Ryan won the 2025 title and is 1–6 in 2026, so a streak reader that walked off
  the end of this season into last season's games would report him hot. It does
  not.

### Accumulated economy entering week 8

Seven Tuesdays paid **42 rewards** — five matchup wins and one weekly high score
a week, every week, once each. Both seasonal boxes are on the books (10
`SEASON_OPENING` + 10 `MIDSEASON`, from fourteen `grantSeasonalBoxes` calls), and
each manager's three boxes are opened before the rehearsal week.

| Manager | Tokens | Collectibles |
|---|---|---|
| Matty B | 1550 | 3 |
| Alex | 1450 | 3 |
| Brandon | 1400 | 3 |
| Nathan | 1400 | 3 |
| Matt Lee | 1150 | 3 |
| Nick | 1100 | 3 |
| Joe | 950 | 3 |
| Cheese | 700 | 3 |
| Zack | 550 | 3 |
| Ryan | 400 | 3 |

Every balance reconciles to the sum of its own ledger rows (`03 §5`), which after
seven weeks is an opening grant plus up to fourteen rewards — an arithmetic week
one cannot distinguish from a recomputation.

Row counts entering week 8: `fantasy_matchups` 197 (162 archived + 35),
`week_finalizations` 7, `weekly_rewards` 42, `token_transactions` 53,
`weekly_stakes` 9, `loot_boxes` 33, `box_openings` 30, `collectibles` 32,
`slice_issue_versions` **0**.

### The board entering week 8

Nine stakes across seven authoring passes. **Tony's Line is absent** and that is
correct — `18 §3.4` puts it behind a shut flag and the job reads the same flag
every surface reads.

One bounty is live: authored in **week 5**, target **149.24** (Alex's week-4
score, the best single team-week of weeks 1–4), still unclaimed after three
weeks. A rolling bounty is a purely midseason object — authored in one week,
surviving the Tuesdays after it, settled by a week nobody had played when it was
written.

---

## 3. Week 8 through the lifecycle

### Sunday

`runSunday` photographs the week once: five paired games stored,
and a second capture **refused** — *"a snapshot is taken once and never
retaken"*. Weeks 1–7 were played with no Sunday job and therefore have no
photograph and never will, which is stated rather than assumed: the append-only
rule cannot repair a snapshot that was never taken.

### Tuesday

One call, week **not** passed — resolved after the sync, from what the sync just
wrote.

| Step | Result |
|---|---|
| sync | `SUCCEEDED`, 15 records changed, no refusal |
| week resolved | **8** |
| finalize | closed, 5 games |
| settle | 2 stakes settled |
| rewards | 6 paid, **1150 tokens**, 0 already paid |
| grants | 0 granted, **20 already held** |
| author | 2 offers written for week 9 |
| draft | **refused — `not-final`** (see §5) |
| failed | none |

**The bounty was claimed.** Matty B's 158.90 beat the 149.24 frozen in week 5,
three weeks after the number was written, and paid 100 tokens through
`STAKE_PAYOUT`. His balance moves 1550 → 2200: 150 for the win, 400 for the
weekly high score, 100 for the bounty.

Week 8's authored conditions all behaved:

| Condition | Game | Outcome |
|---|---|---|
| Close loss | Alex 139.15 – Cheese 139.57 | Alex paid nothing; Cheese paid exactly one matchup win |
| Blowout | Matty B 158.90 – Ryan 94.27 | 64.63 margin; the season's highest single score |
| High scorer | Matty B | Win **and** high score to the same manager, 550 tokens |
| Standings implication | Matt Lee (6–1) – Brandon (5–2) | Eleven combined wins, the heaviest game on the card |
| Historical comparison | 149.24 → 158.90 | The bounty target frozen at authoring, beaten at settlement |

### Standings after week 8

| # | Manager | W–L | Points for |
|---|---|---|---|
| 1 | Matty B | 7–1 | 1059.10 |
| 2 | Matt Lee | 7–1 | 1032.04 |
| 3 | Nathan | 6–2 | 1014.48 |
| 4 | Brandon | 5–3 | 1028.39 |
| 5 | Cheese | 4–4 | 922.75 |
| 6 | Nick | 3–5 | 923.72 |
| 7 | Joe | 3–5 | 874.11 |
| 8 | Alex | 2–6 | **1123.80** |
| 9 | Zack | 2–6 | 842.99 |
| 10 | Ryan | 1–7 | 786.70 |

Week 8 is **added** to the prior seven, not substituted for them: 40 stored
games, 8 closures, 48 rewards with exactly six in each week, and every manager's
wins + losses + ties equal to 8.

---

## 4. Defects found, and fixed

Both are on the homepage, both are midseason-only, and both were invisible in
every prior test because week one renders them correct.

### 4.1 The board said `WEEK ONE` in week eight

`boardFace` has taken a `week` since it was written and `board-face.test.ts`
asserts it renders `WEEK 5` when given one. **`app/page.tsx` never gave it one.**
The signature defaulted a missing week to `WEEK ONE`, so from the opening Sunday
to January the largest object in the room would have said week one, every week.

A default that is correct in exactly one week is not a default; it is a bug with
a grace period.

**Fixed in three places, and the type is the load-bearing one.**

- `lib/stats/week.ts` gains `currentWeekOf` — highest **closed** week plus one,
  clamped at 18. It counts forward from finality rather than from stored games,
  because a board names the week being *played*. Nothing infers an NFL schedule,
  because the product does not have one: `lib/sleeper/endpoints.ts` is the whole
  surface it talks to and none of its eight endpoints carries one. Sleeper's
  `state.week` is the same value with a network call and the Tuesday-rollover
  ambiguity `lib/sleeper/weekly.ts` already rejected it for.
- `BoardFaceInput` is now **two shapes**: before kickoff the countdown is the
  whole face and there is no week to name; after it, `week` is required. A caller
  that does not know the week no longer compiles.
- `app/page.tsx` branches on the clock and supplies it.

### 4.2 The board printed last season's game under this season's week

`featuredMatchup` returns the strongest publishable fact from the most recent
**archived** season, and its own header says so: *"Offseason behaviour, and it is
the behaviour that matters today."* It was right while the product only ever ran
in the offseason.

The rehearsal photographed what it becomes at week 8. The face read:

```
WEEK 8
Brandon v Matt Lee
```

Brandon beat Matt Lee by 75.56 in **week 16 of 2025**. Nothing about that fact is
untrue — it is evidenced, it is classified under a stored policy, and the panel
behind the board states it correctly, *with the season on it*. The **face** has
no room for a season, so two bare names under a week hero are a claim about that
week. True fact, false claim, which is the distinction `lib/stats/board.ts`
already exists to police.

**Fixed** by making `matchupLine` take the season the board is announcing and
return null for a fact from any other one. Null is a designed outcome here, not a
degradation — `boardFace` renders an empty detail rather than prose, which is its
own documented rule (*"shows nothing rather than inventing a detail"*), and the
panel behind the board still carries the whole fact.

**Consequence, stated plainly:** the board's detail slot is now **empty for the
whole live season**, because nothing produces a current-season matchup fact. That
is honest and it is a visible gap — see §5.3.

---

## 5. Contradictions reported, and deliberately not fixed

Each of these is a commissioner-level decision or outside this rehearsal's scope.
None is fixed here. The first is pinned by a test that will go **red** the day it
is addressed, which is the point: it should be a decision, not a slip.

### 5.1 The Slice cannot draft any week of a live season

**The largest finding, and it is a governance question as much as a technical
one.**

`factPacket` gates on `seasons.finalized_at` — the season's books, closed in
January — rather than on `week_finalizations`, the per-week finality
`lib/stats/finality.ts` introduced for exactly this. That module's own header
says:

> Weekly stakes is its first consumer and **will not be its last: the Slice will
> print a live week from the same record.**

That wiring was never done. Measured at week 8, with all eight weeks closed and
the season open:

- `factPacket` refuses **`not-final`** for weeks 1, 7 and 8 alike, with an empty
  scoreboard.
- `generateDraft` refuses `not-final`.
- `slice_issue_versions` is **0** after eight Tuesdays.

So `16 §4.3`'s chain — which ends *"draft Slice → notify commissioner"* — produces
nothing from September to January, and the review desk `16 §9` makes mandatory
stays empty for the entire season it governs. `rackIssue` falls back to the
historical rendering stamped *"Last one Tony printed"*, all year.

This is only visible with a season in motion. It is **not** a missing feature —
every fact the paper needs is stored and final — it is one gate reading the wrong
column.

**Why it is not fixed here.** Changing which weeks the Slice may print changes
what the league reads as true, and it turns the approval desk live in September.
That is `16 §9`'s territory and `docs/SLICE_REVIEW_BOUNDARY.md`'s, and this
rehearsal's scope explicitly excludes the Slice's editorial architecture.
`lib/slice/midseason-week8.test.ts` pins the current behaviour with the
contradiction written into the test, so it cannot be mistaken for working.

### 5.2 The receipt's stated reason expires at kickoff

`receiptFor` reads the most recent **archived** season, and its header explains
why:

> during the preseason the current season is a row of zeroes, and "0–0, 0.00
> points" on a receipt reads as a result rather than as an absence.

That reason is preseason-scoped and nothing re-evaluates it. At week 8 the
current season is 7–1, not a row of zeroes, and every manager's receipt still
shows **2025**. The rehearsal asserts the part that is unambiguously right — **no
receipt anywhere claims 2026** — and records the rest as a product question.

One related fact worth stating rather than discovering later: **Zack has no
receipt at all**, and that is correct. He holds roster 4 in 2026; roster ids are
seasonal (`16 §5.1`) and that seat belonged to two other people in 2024 and 2025.
`receiptFor` returns null, which is a real state rather than a gap.

### 5.3 There is no "highest-stakes matchup" selector

The mission asked whether the homepage's matchup selection uses combined record,
breaks ties on points for, and is deterministic. **No surface selects a matchup
by importance at all.** The only selector is `featuredMatchup`, which picks the
largest *margin* from the last archived season — a different question, honestly
answered.

The condition exists in the fixture and is derivable: entering week 8, Matt Lee
(6–1) v Brandon (5–2) has eleven combined wins against 8, 7, 5 and 4 for the
other four games, so the deterministic answer is unambiguous. Nothing consumes
it. Building the selector would be a new product feature and is out of scope; it
is recorded here because §4.2 leaves the board's detail slot empty in-season and
this is the obvious thing that would fill it.

---

## 6. What is not built, recorded rather than assumed

The rehearsal brief named two systems that turned out not to exist. Both were
checked against the repository rather than against the specification.

**Counter box rotation is not built.** `app/counter/page.tsx` says so directly —
*"no rotation yet — that is league-wide, deterministic, generated by the Tuesday
job"* — and `lib/db/schema.ts` records that the rarity-tiered box slots are
unused registry rows for a feature that does not exist. There is nothing to test
for determinism, replay or cycle correctness. The Tuesday job generates no
rotation and the rehearsal asserts nothing about one.

**Transactions are decoded and never persisted.** `lib/sleeper/codec.ts` decodes
waivers, free agents, trades and FAAB, and `lib/sleeper/chain.test.ts` asserts 41
trades in 2025 with 23 moving budget — but there is **no transactions table** in
the schema, and `lib/sleeper/weekly.ts` sets `includeTransactions: false` on
every in-season sync precisely to save the request budget. No trade is stored, so
no trade is authoritative, and there are no deterministic consequences to test.
**No trade-revenge behaviour was invented for this rehearsal.**

---

## 7. Historical integrity

### Replay

The same week-8 Tuesday, run a second and a third time, changes **nothing** —
`fantasy_matchups`, `week_finalizations`, `weekly_rewards`, `token_transactions`,
`weekly_stakes`, `loot_boxes` and `collectibles` all identical. The second run
reports `finalized: false` and pays nothing; a run pointed at week 3 (the
commissioner's catch-up path) writes nothing either.

Nothing in the job checks whether it has run. Every guarantee is a database
constraint: `UNIQUE(season_id, week)` on the closure, `idempotency_key UNIQUE` on
the ledger, `weekly_rewards_once_per_manager_per_reason`, `stake_id UNIQUE` on a
resolution, `grant_key UNIQUE` on a box, `UNIQUE(issue_id, content_hash)` on a
draft.

### Restart

A **second pool** — its own connections, no shared in-process state — reads weeks
1 to 8 identically. Nothing in this product caches derived state across requests,
and this is the assertion that says so rather than the comment.

### Season contamination

Every one of these was measured across all eight Tuesdays:

| Claim | How it is checked |
|---|---|
| 2024 and 2025 are untouched | Byte-identical fingerprint of every archived game and record, before and after |
| Permanent identity survives seasonal writes | Roster 4 resolves to three different people across three seasons; none of the earlier two moves |
| Retired managers stay out | `activeLeagueManagers` is exactly the ten approved names; no standings row and no Tonight line names Armen, Shant or Berardo |
| Championship rings are intact | Every `championship:` grant identical before and after |
| A live season does not join its own comparison population | `finalizedMarginsCents` holds exactly the archived seasons' games and does not contain week 8's 64.63 margin |

The last one is the subtle one. A live season quietly entering the population its
own blowouts are ranked against would make week 8 grade itself.

### The sample a midseason claim may use

Week 8's basis is built from **weeks 1–7 and nothing later**: 70 team-weeks, a
lower median of 118.90, and a best single score of **149.24 by Alex** — Matty B's
158.90 is week 8's and does not appear. Week 9's basis is exactly ten team-weeks
larger and the season high moves to 158.90 only once week 8 is behind it.

The week-5 bounty still reads 149.24 after the season high has moved, because
`weekly_stakes_terms_immutable` refuses to let a published term change.

---

## 8. Corruption probes

Eight were asked for. Six are testable against this architecture, one is
structurally impossible to construct, and one has no feature to probe.

| # | Probe | Result |
|---|---|---|
| 1 | Missing week finalization | `awardWeek` refuses **`not-finalized`** and writes nothing. The row cannot be deleted to construct this — `week_finalizations` refuses DELETE by trigger — so the state is made the way production would make it: asking for the reward before the week is closed |
| 2 | Duplicated week-7 input | Every roster row sent twice. `persistWeeks` keys on `(week, matchup_id)`, so the duplicate resolves to the row it already holds. Week 7 still has **exactly five games** |
| 3 | Stale week-6 payload during week 8 | Reported as **`NEEDS_REVIEW`** with a warning naming the staleness — not skipped in silence. No game and no record moved |
| 4 | Week 9 drafted but unplayed | Ten rows at 0.00 fetched and **dropped**. Zero week-9 games stored, week 9 never closed, and the week that closes is still 8. This is the one that cannot be undone if it is got wrong: storing it would finalize five ties on a week nobody played, and `week_finalizations` is append-only |
| 5 | Malformed week-8 pairing | Three rosters sharing one `matchup_id`. There is no honest way to pick two, so the whole pairing is dropped — **and so is the game whose partner it stole**, because that roster is now unpaired. Nothing is invented: every stored game is a real one |
| 6 | Repeated Tuesday | §7 |
| 7 | Reward already granted before retry | Paid once. The idempotency key names the **occasion** and omits the amount, so a mid-week rebalance raises rather than paying twice at two prices |
| 8 | Rotation already generated | **No feature.** §6 |

In every case the system refuses or flags rather than manufacturing history. No
probe produced a silent partial write.

---

## 9. Performance

Measured on the full week-8 dataset — 197 stored games, 42 rewards, 53 ledger
rows, 9 stakes, 33 boxes — against local Postgres.

Two runs, because one run's spread is not a trend.

| Week | Run A | Run B |
|---|---|---|
| 1 | 137 ms | 99 ms |
| 2 | 98 ms | 99 ms |
| 3 | 132 ms | 121 ms |
| 4 | 115 ms | 109 ms |
| 5 | 109 ms | 116 ms |
| 6 | 108 ms | 113 ms |
| 7 | 117 ms | 111 ms |
| **8** | **120 ms** | **114 ms** |
| week-8 replay | 92 ms | 104 ms |

**Flat.** Every Tuesday of the season costs between 98 and 137 ms, and week 8 is
not the slowest in either run — the variation is noise around ~110 ms and does
not correlate with week number. The replay costs about the same, because every
write resolves to a conflict rather than doing less work. History import is
~350–480 ms.

Nothing is close to a runtime limit. `vercel.json` sets `maxDuration = 60` on
both cron routes, and the shape that would threaten it is already understood and
already bounded: `docs/IN_SEASON_SYNC_BOUNDARY.md` measures a full 18-week live
traverse at **45 seconds**, which is a *request-budget* cost, not a
data-volume one. The rehearsal syncs weeks 1..N each Tuesday, so its request
count grows linearly while its database cost does not — and that growth is the
one already accounted for.

**No retries, sleeps or timeout changes were used or added.** Nothing needed
them.

---

## 10. Surfaces after week 8

Checked with the clock pinned to the week-8 Tuesday, because otherwise every
surface renders its offseason branch and asserts nothing.

| Surface | State |
|---|---|
| Tonight board face | `WEEK 9`, detail empty — §4 |
| Tonight board panel | Four lines; the heaviest-game line names **2025** explicitly, which is why it is honest where the face was not |
| Receipt | 2025 for nine managers, null for Zack — §5.2 |
| Standings / history | Derived from stored games, matching the fixture to the cent |
| Counter — tokens, collection | Reconciles to the ledger; a box opened twice returns the same item |
| Slice / rack | Nothing published all season — §5.1 |
| Rooms, championship rail | Untouched by eight Tuesdays; every `championship:` grant identical |

No new visual states were added. The homepage's photographed states are all
preseason (`daysUntilKickoff` is non-null in the sweep's database), so §4's fix
changes no existing screenshot; it changes what the room will say from kickoff
onwards.

---

## 11. What this rehearsal must not become

`lib/slice/midseason-week8.test.ts` owns **one scenario**. It is not a general
lifecycle harness and must not grow into one — every number in it is a
consequence of the frozen scoreboard in `lib/sleeper/midseason-2026.ts`, stated
so a reader can check it against the table in that file's header.

If a reusable week-1 harness lands, this file rebases onto it and keeps its
scoreboard and its assertions. The scoreboard is the deliverable; the plumbing
around it is not.
