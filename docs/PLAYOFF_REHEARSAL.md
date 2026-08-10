# The playoff rehearsal — week 16

**Status:** built and green.
**Authority:** `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §4.3` (the Tuesday
chain) · `§9` (the Slice and its approval gate) · `03 §4` (token sources) ·
`lib/sleeper/weeks.ts` (week classification) · `lib/sleeper/placements.ts` (the
bracket-relative placement trap) · `docs/WEEK_1_REHEARSAL.md §8` (how a new
scenario reuses the harness)

The late-season scenario: what this league's postseason actually is, what was
exercised against it, what broke, and what was deliberately left alone.

**Read `docs/WEEK_1_REHEARSAL.md` first.** It owns the harness; this document
owns one scenario written for it.

---

## 1 · Reconciliation — what is this branch's and what is not

Three rehearsals ran concurrently and two of them found the same two defects.
This section exists so nothing below is read as a second claim on somebody
else's repair.

| Defect | Found by | Fixed by | This scenario's contribution |
|---|---|---|---|
| The Slice could never draft during a live season | **all three**, independently | **#85** (Week 1) — `lib/slice/packet.ts` asks `weekFinality` per week | proof it holds to the **semifinal**, not only the opening week: sixteen closed weeks produce sixteen pending-review drafts |
| The homepage board reads WEEK ONE all season | **#86** (Week 8) and this one | **#86** — `currentWeekOf` plus a two-shape `BoardFaceInput` | proof it holds in **December**: after week 16 closes the board reads WEEK 17 |
| `seasons.status` never leaves `DRAFT_PREP` | **this scenario** | this branch | §3.1 |
| The `elimination` story cannot fire on a real bracket | **this scenario** | this branch | §3.2 |

**No duplicate implementation survived integration.** This branch independently
wrote a per-week finality gate in `factPacket`, a `latestFinalizedWeek` helper
and a second season generator; all three were discarded in favour of main's
`weekFinality` call, `currentWeekOf` and `lib/rehearsal/`. What was kept is the
**evidence** — the playoff-week assertions that neither of the other two
scenarios can reach.

---

## 2 · The playoff configuration, as the repository holds it

Read from the recorded 2026 league payload, not written down.

| | | Source |
|---|---|---|
| Teams | 10 | `total_rosters` |
| Playoff field | 6 | `settings.playoff_teams` |
| Playoff week start | **15** | `settings.playoff_week_start` |
| Regular season | weeks 1–14 | derived |
| Rounds | 3 | confirmed against both recorded brackets |
| **Week 16** | **the semifinal** — round 2 of 3 | derived |
| Championship week | 17 | derived |
| Byes | the top two seeds | recorded draw, 2024 · 2025 · 2026 |
| Consolation | 4 teams, 2 rounds, weeks 15–16 | `losers_bracket` |
| Final-rank source | `season_memberships.final_rank`, written at import from **both** brackets | `lib/sleeper/placements.ts` |
| Playoff participation | `season_memberships.made_playoffs`, true only once a bracket game is **decided** | same |
| Playoff rewards | identical to the regular season — 150 a win, 400 the high score | `03 §4`, `lib/rewards/derive.ts` |
| Ring grant | `final_rank = 1` **and** `seasons.finalized_at` set | `lib/counter/rings.ts` |
| Season close | a human-named list in `scripts/seed.ts`, in January | `FINALIZED_SEASONS` |

### The fact that shapes every assertion

**Six of the ten final placements settle in week 16; the four that decide a
championship do not.**

Sleeper's six-team draw puts a `p=5` game in round 2 — the two first-round
losers playing for fifth — and the consolation bracket's round 2 carries `p=1`
and `p=3`, which offset to the league's 7th and 9th. So the Tuesday of week 16
legitimately writes `final_rank` for six managers and legitimately writes
nothing for the four still alive.

---

## 3 · Defects found here, and fixed here

### 3.1 · `seasons.status` was written once and never again

`status` is seeded from Sleeper's lifecycle **on insert only** — the deliberate
half of *"Sleeper seeds; Tony's owns"*. The other half was missing: nothing in
the product ever wrote it. A season created during the preseason stays
`DRAFT_PREP` through its whole year **and through its own finalization**, and
four surfaces read `status = 'ARCHIVED'` to mean *"this is history"*: the
receipt's finish line, Tonight's champion line, Tonight's history line, and the
board's featured matchup. All four would have gone on ignoring 2026 after the
books were shut on it.

**Fixed at the close, not at Sleeper's signal.** `finalizeSeason` and the
importer's `finalizeYears` path write `status: 'ARCHIVED'` alongside
`finalized_at`; `unfinalizeSeason` writes `'ACTIVE'`. Sleeper's `complete` is
still refused as a finalization signal for the reasons that have not changed,
and **no in-season `DRAFT_PREP → ACTIVE` transition was added** — nothing reads
`ACTIVE`, and a transition with no defect behind it is scope this scenario did
not have.

Pinned by *marks the closed season as history so the room can read it*.

### 3.2 · The `elimination` story could not fire on any real bracket

It was derived from *"the loser meets no other playoff team again this season"*.
That describes a bracket which drops its losers, and this league's does not: the
first-round losers meet each other in week 16 for fifth, and the semifinal
losers meet each other in week 17 for third. Every playoff loser plays another
playoff team the week after losing.

**Measured, not reasoned.** Across the six playoff weeks of the two recorded
seasons, `elimination` appears nowhere — not as a lead, not in `rest`, not
suppressed, not demoted. Dead code on real data.

**Fixed to the recorded placement**: a playoff game whose **winner finished
first or second** and whose **loser did not**. That is the same authority the
championship story uses; it cannot name a consolation roster and cannot name the
fifth-place game, because neither side of either can hold rank 1 or 2.
`lib/stats/playoff-stories.test.ts` fails on the old rule.

**Two headline templates had to change with it.** They read *"{l} is done for
the year"* and *"End of the road for {l}"* — claims that the loser has stopped
playing, which the bracket makes false. Nothing untrue was ever printed, because
the candidate could not fire; the moment it could, it would have been. They now
say what the story establishes: the loser will not be champion. Truthful for the
exact state that triggers it, which is the standing rule.

**It is retrospective, and a test pins that.** Ranks one and two do not exist
until the final has been synced, so the paper printed on the Tuesday of the
semifinal cannot carry this story. See §5.

---

## 4 · What the scenario proves

Sixteen weeks driven through `runTuesday` — the deployed cron's own entry point
— one week at a time against a Sleeper that has played exactly that many. Week
16 is shaped to the brief: a **0.42** semifinal, a **41.86** blowout,
eliminations, and two managers into the final.

| | Result |
|---|---|
| Qualifiers | the six the fourteen-week table produced, and only those |
| Byes | derived from the draw; **week 15 stores four games, not five** |
| Week type | weeks 15–16 stored `playoff`, week 14 `regular`, from the league's own `playoff_week_start` |
| Eliminated managers | all ten memberships intact — active, full 14-game record, tokens standing, **and their room still opens** |
| Final rank after week 16 | 5, 6, 7, 8, 9, 10 written; **the four semifinalists null** |
| Consolation | 7th–10th all held by rosters with `made_playoffs = false` |
| Champion banner | 2026 reads *still being played*; 2024 and 2025 untouched |
| Ring on a semifinal | **none**, twice over — no rank 1 exists and the books are open |
| Ring on a replayed grant | none. `collectibles.grant_key UNIQUE` |
| Ring after the final, books still open | **none** — the second gate holds |
| Ring after the books are shut | exactly one, to the champion; a replay grants none |
| Ring in the loot table | never — asserted against the **stored** reward table |
| Week 16 rewards | 5 × `MATCHUP_WIN`, 1 × `WEEKLY_HIGH_SCORE`. No advancement, seeding or consolation bonus |
| Week 15 rewards | 4 wins, not 5 — **a bye pays nothing** |
| Token expiry | none. No `SEASON_AWARD` row; every balance stands through the postseason |
| Silent auction | not activated, not reachable, not referenced |
| Slice at week 16 | prints; leads with the close semifinal; validator clean |
| Slice at week 17 (unplayed) | refused `no-week` |
| Sunday snapshot, week 15 | ten rosters read, **four games photographed, two byes left out** — a bye is not a game |
| Sunday snapshot, retaken | refused. The score before Monday is unrecoverable once Monday has happened |
| Publication | **16 versions, all `needs_review`** after the semifinal and **17** after the final. Nothing approved, nothing published |
| Homepage board | reads **WEEK 17** after the semifinal closes, never WEEK ONE |
| Season transition | 2026 not finalized, not `ARCHIVED`; week 17 still open |
| Championship round | played; all ten ranks settle; the books still do not close on their own |

### Playoff Slice facts — what the paper can and cannot distinguish

The Slice **does not** distinguish advanced, eliminated, consolation or
championship berth in week 16, and it does not invent them. The dateline says
`Week 16 · Playoffs`, the scoreboard prints five games, and the lead is the
semifinal's margin. Consolation games appear as scores, which asserts nothing
about what they meant.

The only bracket-shaped claims available are `championship` — the two finalists
**by recorded placement**, which fires correctly in week 17 of both recorded
seasons — and `elimination`, now correct and retrospective.

No AI path is involved. The deterministic renderer is the default, the validator
passed clean on every rehearsed week, and the approval gate held for all
sixteen drafts.

---

## 5 · Open, and for the commissioner

1. **Live bracket persistence is ruled out for v1** (commissioner, 2026-08-10).
   The product stores `made_playoffs` and `final_rank` and nothing else about
   the postseason's structure; both are *consequences* of the bracket rather
   than the bracket, so *"who advanced this week"* is not answerable on the
   Tuesday it happened. **No `playoff_bracket` table, no second event spine, no
   new playoff-state persistence and no additional sync authority were
   introduced.** Retrospective playoff facts are acceptable and are what shipped.
   Reconsidering it later needs a scoped feature decision of its own.
2. **Tonight has no playoff voice**, and playoff board messaging stays deferred
   in this workstream (commissioner, 2026-08-10). The board's five possible
   lines are the kickoff countdown, the standing champion, the heaviest
   finalized game, who has picked up their keys, and which seasons are on the
   books. **Nothing was prepared behind a typed interface either**, because the
   deterministic half such a line would need — *who advanced* — is exactly the
   bracket state ruling 1 declines to persist, so the only honest states
   available (*championship week*, *champion confirmed*, *season complete*) are
   all copy slots rather than data gaps. Those three are the slots to fill when
   the commissioner writes them. `docs/OPEN_ITEMS.md` **G3**.
3. **Placements follow the bracket alone, so a bracket ahead of its own games
   would write a finish for a game never stored.** Found while building the
   scheduled-but-unplayed injection, which failed first time for exactly this
   reason — and the injection was at fault rather than the code: Sleeper
   resolves a bracket *from* results, so serving a decided bracket over unplayed
   games stages a contradiction rather than a state. Recorded as a property
   rather than filed as a defect; the **lagging** direction is the one that has
   been observed, and §6 covers it.
4. **A stale standings payload moves the table backwards for a week.** Injected
   and observed against the previous harness: `reconcileSeason` catches it and
   names both records for all ten rosters, but the disagreement is a *warning*
   rather than a *conflict*, so `sync_runs.status` stays `SUCCEEDED`. **The
   policy was deliberately not changed here** — 2024's records and its weekly
   points disagree permanently, and a run reading `NEEDS_REVIEW` every week
   would teach whoever reads it to stop reading. If it deserves stronger
   visibility that is a separate hardening task. `docs/OPEN_ITEMS.md` **E7**.

---

## 6 · Failure injections

| Injected | Result |
|---|---|
| Bracket a round behind its own matchups | **no placement claimed for anybody** — and the week's five games still store and close, and `made_playoffs` still reads correctly from the round that *was* recorded |
| The Tuesday job run twice on the semifinal | nothing moves. `observe()` is byte-identical before and after; the draft reports `noop` |
| A ring grant retried | zero granted, twice |
| A ring grant on a semifinal | zero — no rank 1 exists |
| A ring grant on a completed bracket with the books open | zero — the season gate holds |
| A consolation result | never reaches a title-track surface; cannot produce an elimination or championship candidate |
| A drawn playoff game | no winner, no loser, and neither bracket story can name it |
| A **championship week Sleeper has only scheduled** | no game stored, no week finalized, no champion claimed |
| A week nobody has played | refused, rather than printed as a quiet week |

The nine injections week 1 owns — unreachable Sleeper, malformed payload, crash
after the sync, crash after the rewards, stale July re-import, unknown owner, a
scheduled-but-unplayed week, a denied commit — are **not repeated here.** They
are properties of the chain rather than of the round, `lib/rehearsal/week-1.test.ts`
holds them, and a second copy would be the duplication this reconciliation
removed.

**A tiebreak rule was not manufactured.** The league has none written down
anywhere in the repository. What is asserted is the conservative half — a drawn
playoff game has no winner and no loser, both bracket stories are built from the
decided games, and neither can therefore name it. If Sleeper's own bracket
breaks a tie it does so in the match's `w` field, and the placement follows from
that: the bracket's answer, read rather than derived.

---

## 7 · Performance on the deepest data set

Week 16 of the third season is the high-water mark — week 17 adds two games and
January adds nothing. Two complete historical seasons, a third 16 weeks deep,
~97 ledger rows, 16 Slice versions.

| Read | Measured | Budget |
|---|---|---|
| `tonightBoard` (the homepage) | 16.9 ms | 2 s |
| `factPacket` week 16 (the Slice) | 12.1 ms | 3 s |
| `rackIssue` | 14.0 ms | 3 s |
| `timeline` | 9.1 ms | 3 s |
| `collectionFor` | 1.0 ms | 2 s |

**Nothing scales with season length.** `factPacket` re-derives the two previous
issues and each derivation walks every game of the season, which is the shape
most exposed to a long year — week 4 costs 12.0 ms and week 16 costs 10.5 ms.
The test asserts the **ratio** rather than a millisecond bound, because a ratio
survives a noisy CI runner and a bound does not.

**No query was changed for performance.** There was no evidenced launch risk.

---

## 8 · How the harness was extended, and how little

One canonical harness, in `lib/rehearsal/`. This scenario added **no verb**, no
second season generator and no second deploy reproduction. Two additions to
`script.ts`, both scenario data:

- **`ScriptedWeek.postseason`** — a week the *official record does not count*.
  `settings.fpts` and a roster's W/L are regular-season totals, and
  `reconcileSeason` compares them against the sum of the weeks; a playoff week
  folded into that sum manufactures a disagreement on every roster and marks
  real games `disputed`. It says nothing about `week_type`, which is derived at
  import from the league's own `playoff_week_start` — a script that declared it
  would be scripting the answer.
- **`ScriptedBrackets`** — a bracket that *moves*. `made_playoffs` and
  `final_rank` are written at import from the bracket, so a scenario that cannot
  advance one cannot rehearse a placement being settled. A slot is either a
  roster from the draw or `{ fromMatch, take }`, which is Sleeper's own
  distinction and the reason a preseason bracket is not empty: what is knowable
  is a property of the slot rather than of the author's care.

`lib/rehearsal/week-16.ts` is the written season. Weeks 1–14 are generated from
a strength table because seventy games are not readable and only the standings
they produce matter; the three postseason weeks are written out by hand, because
those are the games the assertions name.

---

## 9 · What was deliberately not done

The championship ring **ceremony** (`16` defers it to v1.1, in January, and
three of its four pieces do not exist) · the silent auction · the Underground ·
any postseason UI redesign · any new postseason persistence · any speculative
postseason feature. No legacy concept from the older documents — end-of-week
token expiry, the prop-bet system, peer side bets — was resurrected; §4 asserts
their absence rather than assuming it.
