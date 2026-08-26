# The Fraud Check — the canonical account

`lib/league/all-play.ts` is the ten-team all-play calculation and the one place
Tony's sticker is decided. `lib/league/fraud-check.ts` is the two data paths
into it. This document is why each number is the number it is.

**This changes no v1 readiness state and closes no activation item.** No
migration, no schema change, no route, no component, no art, no economy value.

---

## 1. It reuses the neutral measurement rather than replacing it

`lib/stats/luck.ts` is the approved derivation and is **untouched**. Its
`07 §7.5` / **R2** boundary holds exactly as written: no `fraud` field, no luck
score, no ranking by desert, no claim that anybody deserved a different record.

`lib/league/` is the editorial side of that boundary. The numbers it stamps are
the neutral layer's numbers unchanged, and `all-play.test.ts` runs the same
ten-team season through **both code paths** — one fed by the database, one pure
over raw games — and insists the two records, the subtraction and the points-for
agree. The day the formulas diverge, that goes red rather than the board quietly
carrying two different truths.

## 2. Nine comparisons a week, checked

A ten-team week is nine comparisons per manager, every week. **Nothing anywhere
asserted it.** A week missing a game is a week where some managers were measured
against seven opponents and the absent manager against none — and the resulting
table looks entirely normal.

So a week that does not field the whole league is dropped **whole**, and named,
for the same reason `luck.ts` drops a disputed week whole: an all-play tally
depends on every score in its week. Same for a week where one manager holds two
seats, and for a week holding a roster that resolves to nobody — `16 §5.1` makes
that fatal rather than cosmetic, because roster 4 is a different manager in each
of three seasons.

`AllPlayTable.integrity` is the report. On the recorded 2024 and 2025 seasons it
comes back with no faults: fourteen counted weeks, 126 comparisons for all ten
managers, both seasons.

## 3. FRAUD ALERT fires only when justified

The stamp was originally decided inline on `games >= 5 && scheduleDelta >= 2`.
**A gap is large whenever the scores were poor**, so that rule stamped managers
whose real record nobody would call strong — and on the real 2024 season it
stamped an **11-3 manager whose all-play record is 76-50**, the second-best
scoring season in the league that year. A winning record against the whole
league is not a fraud.

Four conditions now, as fixed documented numbers in `FRAUD_THRESHOLDS`:

| condition | threshold | what it guards |
|---|---|---|
| `sample` | ≥ 5 games | a short season can clear any gap |
| `real-record` | ≥ .600 | *fraud* is a joke about a good record |
| `all-play-record` | < .500 | a **losing** record against the field |
| `schedule-gap` | ≥ 2.00 wins | the gap has to be worth a sign |

Read together: **a winning record on the schedule, a losing record against the
whole league, by at least two wins, over at least five games.** No condition is
implied by the others — a .600 record against a .499 all-play rate over fourteen
games is a gap of 1.41, and the sign stays down.

Every stamp reports all four conditions, met or not, so a screen can say why the
sign is *absent* as easily as why it is there and a reader can check the
arithmetic.

## 4. The .500 threshold is calibrated, not chosen

The first draft used **.450**, and the recorded seasons said it was wrong. The
one manager the joke is actually about — 2024, 9-5 with exactly one manager in
the league winning more games, and **seventh of ten on the scores** — posts an
all-play rate of **.452**. Refused by two thousandths. A threshold that turns on
noise is what the 2026-08-10 **R1** ruling exists to prevent: a significance
threshold is deterministic, documented, and *calibrated against the actual
verified league distribution*.

**.500 is not a loosening and not a choice.** In an all-play the field averages
exactly .500 by construction, because every comparison is somebody's win and
somebody's loss. `all-play.test.ts` asserts that identity holds on both real
seasons.

## 5. Loosening does not work, and the sweep is why

The stamp fires **once** across the two recorded seasons, which reads as a rule
that is too strict. It is not. Measured over the real seasons, relaxing one knob
at a time with the other two held:

| relaxation | stamps across 2024 + 2025 |
|---|---|
| record threshold .600 → .550 | 1 |
| record threshold .600 → .500 | 1 |
| record threshold .600 → **.450** | **1** |
| gap threshold 2.00 → 1.50 | 1 |
| gap threshold 2.00 → 1.00 | 1 |
| gap threshold 2.00 → **0.50** | **1** |
| all-play threshold .500 → .550 | 1 |
| all-play threshold .500 → .600 | 1 |
| all-play threshold .500 → **.650** | **2** — and the second is the 11-3 manager at 76-50 |

**The population is empty, not filtered.** In 2025, of the five managers with a
.600-or-better record, **zero** had a losing all-play record:

```
2025  RonJonathan  11-3  real .786  allplay .730
2025  SuggMyNick   10-4  real .714  allplay .587
2025  BigJuncer     9-5  real .643  allplay .667
2025  cheeseking    9-5  real .643  allplay .603
2025  Tupaz11       9-5  real .643  allplay .571
```

There is no fraud in 2025 to find. Loosening would not *discover* one — it would
manufacture one by relabelling a manager who actually scored well, which is the
`docs/DATA_AUDIT.md §9` / **R2** line: the all-play number may contrast with a
record and may not become a factual claim about it.

**The rule is not too strict. The league was fair.** One genuine fraud in two
seasons is the truth about this league, and a sign that fires on a good scorer is
worth less than no sign at all.

## 6. So the answer to rarity is the scope, not the threshold

A whole season is where a soft schedule washes out. **Mid-season is where it is
visible**, and where the question is actually interesting: a 5-1 manager with
poor scores is an ordinary week-six state that regresses by week fourteen.

So `fraudCheck` prefers a **season-to-date** board when the live season has
enough of itself, and falls back to the latest completed season otherwise. The
measurement is exactly as true either way. What changes is that a season-to-date
claim must **say** it is season-to-date.

### What makes it truthful rather than merely early

Only weeks carrying **their own finalization** are counted, through
`lib/stats/finality.ts` — the predicate weekly rewards and stake settlement have
used since they were built. A week still open to correction is not in the
measurement, so nothing on this board can move under a reader.

This is not the conservatism the old code described (*"off the public board
until it has a finalized score population"*). That rule waited for the
**season**, which `finality.ts` itself records as the mistake that made a stake
settleable exactly when it was unpayable. A week is final on Tuesday; a season
closes in January.

The live board needs five finalized weeks before it appears — the same five
games the stamp already required, so this adds no second opinion about what a
sample is. Below that the historical board stands, which is the right thing to
show in September.

### A finished season is the historical board's, not this one's

Both paths would be correct on a closed season, and the historical one
reconciles against `lib/stats/luck.ts` on every run. Two paths answering for one
season is how two answers start.

## 7. The scope travels on the fact

*Nine wins and a losing all-play record* is the same sentence in week six and in
January, produced by the same correct arithmetic over the same correct rows —
and only one of them is a season. `16 §12`'s rule as
`docs/HISTORICAL_ANALYSIS_BOUNDARY.md` applies it: the scope travels on the
fact, and a renderer **prints the label** rather than deciding how far a claim
reaches.

`AllPlayReach` carries the kind, the season, the week reached and the approved
wording. It reaches the **last week counted**, never the last week seen — a week
dropped for a short field or a dispute is not in the measurement and a label
saying otherwise would overstate it.

It reuses `describeScope` from `lib/stats/scope.ts` for the wording, so there is
one place a scope is worded. It deliberately does **not** reuse the
`HistoricalScope` *type*, whose `finalizedOnly` field is documented as
structural — a historical population is finalized **seasons** only. This
population is the finalized **weeks** of a possibly-open season. Borrowing the
type would have quietly redefined another module's invariant to mean something
it does not.

## 8. The phrase this layer will not print

`expectedWins` and `expectedLosses` are the conventional field names. **The
words must never reach reader-facing prose**: `lib/slice/validate.ts` bans
`expected wins` because it implies a projection model this product does not
have, and there is nothing predictive here — it is a rate already observed, over
scores already posted, scaled onto games already played.

Every string the library can produce is run through the product's own
`scanEditorialCopy`, so the ban is enforced by the same scanner the paper uses
rather than by anyone remembering.

## 9. What was deliberately not built

- **No second, softer tier.** A label below FRAUD ALERT for *the schedule has
  been kind* would give the board more to say most seasons. It introduces new
  editorial vocabulary, which is a commissioner decision and has not been made.
- **No page change.** `app/fraud-check/page.tsx` still explains the sign with one
  hardcoded sentence about the two-win gap. It is true and now incomplete — the
  page has `stamp.conditions` available to state the whole rule. Left alone
  because this is a backend slice and the visual surfaces are claimed elsewhere.
- **No `league_events`.** Still deferred, and nothing here needed it. Every
  derivation is a pure function over `fantasy_matchups`, `week_finalizations`
  and the season's seat map.
- **No new table, column, migration or trigger.**
- **No luck ranking, no "true record", no fraud detector.** The board shows two
  records and a subtraction. **R2** stands unweakened: verified Sleeper results
  are authoritative, all-play is a labelled secondary measurement, and the stamp
  is Tony's sticker rather than a league determination — `FRAUD_CAVEAT` travels
  on every one of them.

## 10. Where the evidence lives

`lib/league/all-play.test.ts` carries the calibration suite. It reads the
recorded matchups off disk — no database and no network, since
`fixtures/sleeper/` is the archive the deploy seed itself reads — and pins the
ten-team shape on real data, the .500 identity, exactly one stamp across two
seasons, the 11-3 manager refused, and 2025 entirely unstamped.

Moving a threshold now has to face what it does to two real seasons.
