# The playoff rehearsal — week 16, and what it found

**Status:** built and green. `lib/rehearsal/` is shared infrastructure; the
week-16 scenario is one consumer of it.
**Authority:** `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §4.3` (the Tuesday
chain) · `§9` (the Slice and its approval gate) · `03 §4` (token sources) ·
`lib/sleeper/weeks.ts` (week classification) · `lib/sleeper/placements.ts` (the
bracket-relative placement trap)

This is the canonical account of the late-season rehearsal: what the league's
postseason actually is, what was exercised, what broke, and what was left alone
on purpose.

---

## 1 · The playoff configuration, as the repository holds it

**Nothing below is a constant somebody typed.** `lib/rehearsal/season.ts`'s
`rehearsalShape()` reads it out of the recorded 2026 league payload, and the
first test in `lib/rehearsal/playoffs.test.ts` asserts the whole object — so a
league that moves its playoff week produces a rehearsal of *its* postseason.

| | | Source |
|---|---|---|
| Teams | 10 | `total_rosters` |
| Playoff field | 6 | `settings.playoff_teams` |
| Playoff week start | **15** | `settings.playoff_week_start` |
| Regular season | weeks 1–14 | derived |
| Rounds | 3 | `ceil(log2(6))`, confirmed against both recorded brackets |
| **Week 16** | **the semifinal** — round 2 of 3 | derived |
| Championship week | 17 | derived |
| Byes | the top two seeds | recorded draw, 2024 · 2025 · 2026 |
| Consolation | 4 teams, 2 rounds, weeks 15–16 | `losers_bracket` |
| Final-rank source | `season_memberships.final_rank`, written at import from **both** brackets | `lib/sleeper/placements.ts` |
| Playoff participation | `season_memberships.made_playoffs`, true only once a bracket game has been **decided** | same |
| Weekly rewards in the playoffs | identical to the regular season — 150 a win, 400 the high score | `03 §4`, `lib/rewards/derive.ts` |
| Ring grant | `final_rank = 1` **and** `seasons.finalized_at` set | `lib/counter/rings.ts` |
| Season close | a human-named list in `scripts/seed.ts`, in January | `FINALIZED_SEASONS` |

### The thing about week 16 that decides everything else

**Six of the ten final placements are settled in week 16, and the four that
decide a championship are not.**

Sleeper's six-team draw puts a `p=5` game in round 2 — the two first-round
losers play for fifth — and the consolation bracket's round 2 carries `p=1` and
`p=3`, which offset to the league's 7th and 9th. So the Tuesday of week 16
legitimately writes `final_rank` 5, 6, 7, 8, 9 and 10, and legitimately writes
nothing for the four teams still alive.

A rehearsal that treated the postseason as "one bracket that resolves at the
end" would have tested none of this. It is why the harness models the brackets
as a state machine rather than a fixture.

---

## 2 · The infrastructure, and why it is shared

`lib/rehearsal/` is two files and is deliberately not playoff-specific.

- **`season.ts`** — a synthetic `SleeperSource` for a whole 2026 season in
  motion. `rehearsalSeason({ played: 1 })` is a week-one rehearsal, `played: 8`
  a midseason one, `played: 16` the semifinal. League, users and roster
  identities come from the **real** fixtures; only the matchups, the standings
  and the two brackets are synthesised, and the unpaired rows a bye or an
  eliminated roster produces are synthesised too, because those are what
  `lib/sleeper/weeks.ts` exists to classify.
- **`harness.ts`** — `standUpLeague` imports the recorded 2024/2025 history and
  opens 2026 exactly as `scripts/seed.ts` does; `playForward` plays the season
  through **`runTuesday`**, the deployed cron's own entry point, one week at a
  time against a Sleeper that has played exactly that many.

**A week-N workstream should extend this rather than write a third season
generator.** `lib/sleeper/test-source.ts` is the older, narrower one — it pairs
all ten rosters every week forever and has no bracket — and it is left in place
because two suites depend on its exact shape.

Sixteen weeks through the real job costs about eight seconds.

---

## 3 · Defects found, and fixed

### 3.1 · The Slice could not have printed a single week of the season — **launch blocker**

`factPacket` asked whether the **season** was finalized (`seasons.finalized_at`,
the January close) and passed that as the week's `finalized` flag. Every game of
a live season therefore came back suppressed `season-not-finalized`,
`assemblePacket` refused `not-final`, and the Tuesday job's draft step declined —
**every week, from September to January.**

Nothing would have looked broken. `runTuesday` reports a refusal as a *skipped
step* rather than a failure, so the job would have returned 200 with a sentence
in `skipped` and an empty press desk, all season.

`lib/stats/finality.ts` was written for exactly this and names the Slice as one
of its two consumers — *"the Slice, which will not print an unfinalized week"* —
but only weekly stakes was ever wired to it. `lib/stakes/facts.ts` carries the
same correction made from the other side during the weekly-stakes slice; it was
never carried across.

**Fixed.** `seasonWeeks` now returns `seasonFinalizedAt` and a
`weekFinalizedAt` map, and `factPacket` asks `weekFinality` **per week**. A week
is final on the Tuesday the job closes it. The season-level flag is untouched
where it is the right question — the finalized margin and score *populations*
still read closed seasons only, because a percentile that shifts under a
published fact makes the fact retroactively wrong.

The old test that should have caught this (`withholds every result while a
season is open`) passed for the wrong reason: 2026 holds no games in the
fixtures, so it could not tell `no-week` from `not-final`. It is now two tests
that can.

### 3.2 · The homepage board would have read WEEK ONE in December

`boardFace` has taken a `week` since it was written; `app/page.tsx` never passed
one, so the hero fell through to its offseason branch. Not stale copy — a false
statement on the largest object in the room, on every load, for four months.

**Fixed.** The page passes the last week the Tuesday job closed
(`latestFinalizedWeek`). Before the first Tuesday of a season it is null and the
hero says WEEK ONE, which is then true. The source is deliberately not the
calendar and not Sleeper's `state.week`, which rolls over on Tuesday morning —
the reason `lib/sleeper/weekly.ts` already refuses to ask it.

### 3.3 · `seasons.status` was written once and never again

`status` is seeded from Sleeper's lifecycle **on insert only** — the deliberate
half of *"Sleeper seeds; Tony's owns"*. The other half was missing: nothing in
the product ever wrote it. A season created during the preseason stays
`DRAFT_PREP` through its whole year **and through its own finalization**, and
four surfaces read `status = 'ARCHIVED'` to mean *"this is history"*: the
receipt's finish line, Tonight's champion line, Tonight's history line, and the
board's featured matchup. All four would have gone on ignoring 2026 after the
books were shut on it.

**Fixed at the close, not at Sleeper's signal.** `finalizeSeason` and the
importer's `finalizeYears` path now write `status: 'ARCHIVED'` alongside
`finalized_at`; `unfinalizeSeason` writes `'ACTIVE'`. Sleeper's `complete` is
still refused as a finalization signal for the reasons that have not changed.

**No in-season `DRAFT_PREP → ACTIVE` transition was added.** Nothing reads
`ACTIVE`, and adding a transition with no defect behind it is scope this
rehearsal did not have.

### 3.4 · The `elimination` story could not fire, on any real bracket

It was derived from *"the loser meets no other playoff team again this season"*.
That describes a bracket which drops its losers, and this league's does not: the
first-round losers meet each other in week 16 for fifth, and the semifinal
losers meet each other in week 17 for third. Every playoff loser plays another
playoff team the week after losing.

**Measured, not reasoned.** Across the six playoff weeks of the two recorded
seasons, `elimination` appears nowhere — not as a lead, not in `rest`, not
suppressed, not demoted. Dead code on real data.

**Fixed** to the recorded placement: a playoff game whose **winner finished
first or second** and whose **loser did not**. That is the same authority the
championship story uses, and it is true whenever it fires — it cannot name a
consolation roster, and it cannot name the fifth-place game, because neither
side of either can hold rank 1 or 2.

Two headline templates had to change with it. They read *"{l} is done for the
year"* and *"End of the road for {l}"* — claims that the loser has stopped
playing, which the bracket makes false. Nothing untrue was ever printed, because
the candidate could not fire; the moment it could, it would have been. They now
say what the story establishes: the loser will not be champion.

**It is retrospective, and that limitation is pinned by a test.** Ranks one and
two do not exist until the final has been synced, so the paper printed on the
Tuesday of the semifinal cannot carry this story — only a later rendering of
that week can. See §5.

---

## 4 · What was exercised, and what it showed

Sixteen weeks played through `runTuesday` against a season in motion, with week
16 shaped to the brief: **one close finish** (0.42), **one clear win** (41.86),
**eliminations**, and **two managers advancing to the final**.

| | Result |
|---|---|
| Qualifiers | the six the fourteen-week table produced, and only those |
| Byes | the top two seeds, derived from the draw rather than from seeding |
| Eliminated managers | all ten memberships intact — active, full 14-game record, tokens standing |
| Final rank after week 16 | 5, 6, 7, 8, 9, 10 written; **the four semifinalists null** |
| Consolation | 7th–10th all held by rosters with `made_playoffs = false` |
| Ring on a semifinal | **none.** `verifiedTitles` still returns 2024 and 2025 only |
| Ring on a replayed grant | none. `collectibles.grant_key UNIQUE` |
| Ring after the final, books still open | **none** — the second gate holds |
| Ring after the books are shut | exactly one, to the champion; a replay grants none |
| Ring in the loot table | never — asserted against the **stored** reward table, not the catalog |
| Week 16 rewards | 5 × `MATCHUP_WIN`, 1 × `WEEKLY_HIGH_SCORE`. No advancement, seeding or consolation bonus |
| Week 15 rewards | 4 wins, not 5 — **a bye pays nothing** |
| Token expiry | none. No `SEASON_AWARD` row exists; every balance stands through the postseason |
| Silent auction | not activated, not reachable, not referenced |
| Sunday snapshot, week 15 | 10 rosters read, **4 games photographed, 2 byes left out** — a bye is not a game |
| Sunday snapshot, retaken | refused. The score before Monday is unrecoverable once Monday has happened |
| Slice at week 16 | prints; leads with the close semifinal; validator clean |
| Slice at week 17 (unplayed) | refused `no-week` |
| Publication | **17 versions, all `needs_review`. Nothing approved, nothing published** |
| Season transition | 2026 not finalized, not `ARCHIVED`; weeks 1–16 closed and week 17 open |

### Homepage precedence — the brief's premise was false

The mission expected the Tonight board to give championship and playoff
elimination a high priority. **It has no playoff line at all.** The five lines
it can emit are the kickoff countdown, the standing champion, the heaviest
finalized game, who has picked up their keys, and which seasons are on the
books. There is no precedence rule about the playoffs to verify, correctly or
otherwise.

That is **reported rather than fixed**: a playoff line is new curated copy in
Tony's voice, and `CLAUDE.md` reserves that for the commissioner. A test pins
the current set so the day one is added it reads as a change.

What *was* wrong on the homepage was the board's hero, and that is §3.2.

### Playoff Slice facts — what the paper can and cannot distinguish

The Slice **does not** distinguish advanced, eliminated, consolation or
championship berth in week 16, and it does not invent them. The dateline says
`Week 16 · Playoffs`; the scoreboard prints five games; the lead is the
semifinal's margin. The consolation games appear in the scoreboard as scores,
which asserts nothing about what they meant.

The only bracket-shaped claims the paper can make are `championship` — the two
finalists **by recorded placement**, which fires correctly in week 17 of both
recorded seasons — and `elimination`, which is now correct and retrospective.

No AI path is involved. The deterministic renderer is the default, the validator
passed clean on every rehearsed week, and the approval gate held for all
seventeen drafts.

---

## 5 · Open, and for the commissioner

1. **A live elimination story needs the bracket persisted.** The product stores
   `made_playoffs` and `final_rank` and nothing else about the postseason
   structure. Both are consequences of the bracket rather than the bracket, so
   *"who advanced this week"* is not answerable on the Tuesday it happened. A
   `playoff_bracket` table fed by the sync would answer it — that is a feature,
   it is not in `16`'s v1 list, and it was not built.
2. **Tonight has no playoff voice.** See above. New curated lines.
3. **A stale standings payload moves the table backwards for a week.** Injected
   and observed: `reconcileSeason` catches it and names both records for all ten
   rosters, but the disagreement is a *warning* rather than a *conflict*, so
   `sync_runs.status` stays `SUCCEEDED`. That is deliberate — 2024's records and
   its weekly points disagree permanently, and a run that read `NEEDS_REVIEW`
   every week would teach whoever reads it to stop reading — but a commissioner
   reading only the status would not see it. Recorded as behaviour, not filed as
   a defect.
4. **`factPacket` reports a season with no stored game as `no-season`.** An
   older imprecision, unrelated to the postseason, left alone.

---

## 6 · Failure injections

| Injected | Result |
|---|---|
| Bracket a round behind its own matchups | **no placement claimed for anybody.** The week's five games still store and finalize |
| Standings two weeks behind their own matchups | detected and named per roster; official record stored; run reads `SUCCEEDED` (§5.3) |
| The Tuesday job run twice on the semifinal | nothing moves — rewards, ledger, finalizations, Slice versions and rings all identical; the draft reports `noop` |
| A ring grant retried | zero granted, twice |
| A ring grant on a semifinal | zero — no rank 1 exists |
| A ring grant on a completed bracket with the books open | zero — the season gate holds |
| A consolation result | never reaches a title-track surface; cannot produce an elimination or championship candidate |
| A week nobody has played | refused, rather than printed as a quiet week |

**A tiebreak rule was not manufactured.** The league has none written down
anywhere in the repository, and inventing one to test it would have been the
fabrication the mission forbids. What is asserted instead is the conservative
half — a drawn playoff game has no winner and no loser, both bracket stories are
built from the decided games, and neither can therefore name it. If Sleeper's
own bracket breaks a tie it does so in the match's `w` field, and the placement
follows from that: the bracket's answer, read rather than derived. Beside that,
the behaviour already asserted elsewhere still holds — `RenderedScore` carries
`tie`, a tied game pays no `MATCHUP_WIN`, and a tied high score pays everyone
who posted it.

---

## 7 · Performance on the deepest data set

Week 16 of the third season is the high-water mark — week 17 adds two games and
January adds nothing — so `lib/rehearsal/performance.test.ts` measures there:
two complete historical seasons, a third 16 weeks deep, ~97 ledger rows, 17
Slice versions.

| Read | Measured | Budget |
|---|---|---|
| `tonightBoard` (the homepage) | 21.5 ms | 2 s |
| `factPacket` week 16 (the Slice) | 14.6 ms | 3 s |
| `rackIssue` | 17.1 ms | 3 s |
| `timeline` | 18.5 ms | 3 s |
| `collectionFor` | 1.0 ms | 2 s |

**Nothing scales with season length.** `factPacket` re-derives the two previous
issues and each derivation walks every game of the season, which is the shape
most exposed to a long year — week 4 costs 12.3 ms and week 16 costs 12.6 ms.
The test asserts the **ratio** rather than a millisecond bound, because a ratio
survives a noisy CI runner and a bound does not.

The budgets are an order of magnitude above the measurements on purpose. They
are regression tripwires for a query that became quadratic, not benchmarks.

**No query was changed for performance.** There was no evidenced launch risk to
fix.

---

## 8 · What was deliberately not done

Out of scope by the mission's own boundaries, and none of it started: the
championship ring **ceremony** (`16` defers it to v1.1, in January, and three of
its four pieces do not exist), the silent auction, the Underground, any
postseason UI redesign, and any new speculative postseason feature. No legacy
concept from the older documents — end-of-week token expiry, the prop-bet
system, peer side bets — was resurrected; §4 asserts their absence rather than
assuming it.
