# Sleeper Stats & Data Audit

**Status:** ✅ Accepted as the current data baseline. Documentation only — no implementation.
**Date:** 2026-07-29
**Audited at:** `4204f43` (2 commits ahead of `origin/main` @ `8b8ebb6`; contains the merged PR #7 V0 pipeline)
**Scope:** Sleeper ingestion, data correctness, historical records, deterministic calculation, identity mapping.

**Method:** every number in this document was computed directly from the committed fixtures in `fixtures/sleeper/`, in integer cents, not read from a summary or a prior document. Where this audit disagrees with an earlier document, the fixtures are the evidence.

**Test suite at time of audit:** `npm test` → **130 passed, 28 skipped**. The 28 skips are `lib/sleeper/persist.test.ts` (16) and `lib/db/identity.test.ts` (12), which skip without `DATABASE_URL`. CI supplies Postgres, so they run there.

> **Phase A is implemented.** The rulings arrived on 2026-07-29 and the correctness guardrails are built on `claude/sleeper-phase-a-correctness`. This document is unchanged as a record of what was found; **§15 records what Phase A did about it**, and the findings below are annotated where behaviour now differs. Phase B (the weekly persistence layer) remains gated.

---

## Why this document exists

The product's core promise is that **Tony is always right about fantasy facts**. Accuracy outranks humor (`CLAUDE.md`), deterministic calculation outranks model inference, and material contradictions must be reported rather than resolved silently (`16 §12`).

The Sleeper adapter (`lib/sleeper/`) is complete and well-tested for **ingestion**. What does not yet exist is the layer between ingestion and product: nothing persists weekly results, and no module computes a statistic. Meanwhile PR #8 is landing the first features that *read* fantasy facts (receipt, derived tags, Counter Greeting), so the correctness rules need to be pinned down now — before a wrong number reaches a manager's screen.

The audit found **one Critical data conflict in the 2024 season**, **one Critical trap in how weekly points must be read**, and a small number of structural gaps. It also found that the adapter is genuinely good and should not be rewritten.

---

## 1. The current data pipeline, in plain English

```
scripts/record-fixtures.ts ──(live HTTPS, the ONLY networked file)──> fixtures/sleeper/*.json + manifest.json
                                                                              │
lib/sleeper/transport.ts  (live source)  ◄── same interface ──►  lib/sleeper/fixtures.ts (replay source)
                                                                              │
                                                          lib/sleeper/codec.ts   tolerant decode → warnings
                                                                              │
                                                          lib/sleeper/chain.ts   walk previous_league_id,
                                                                                 derive pairings + placements
                                                                              │
                                                          lib/sleeper/persist.ts one transaction, never overwrite
                                                                              │
                                                    users · seasons · season_memberships · sync_runs
```

- **Fixtures are the default.** `npm run sleeper:import` reads from disk; `--live` opts into the network. The whole test suite is offline.
- **Nothing throws on a network fault.** Every transport call returns a result value (`ok` / `empty` / `error`). 404, `null`, and `[]` all decode to `empty` — correct, because Sleeper answers a quiet week that way.
- **Retries:** 3 attempts, 10 s timeout, 250 ms doubling backoff, retry only on 429/5xx/network. Requests are serialized with a 60 ms courtesy gap. Sound.
- **Decoders are deliberately tolerant** — unknown fields warn, structural mismatches throw. Correct trade for an undocumented API.
- **Persistence is all-or-nothing** in one transaction; the `sync_runs` audit row is written *outside* it so a failure leaves evidence.
- **Re-import is a no-op** and is tested (`chain.test.ts` "produces identical output on a second import", `persist.test.ts` "changes nothing on a second run").
- **Synchronization cadence: none exists yet.** There is no cron job, no scheduled sync, no live sync. Import is a manual CLI invocation. Per `16 §4.3` two cron jobs are planned (Sunday snapshot, Tuesday finalize) and **live in-game sync is forbidden forever**.
- **The offseason** is represented only by 2026 Sleeper league status `pre_draft` → seeded as `DRAFT_PREP`. Nothing computes "days until kickoff" or an offseason state today.
- **Corrections / re-syncs:** re-running the importer is safe but *cannot* change an existing membership's owner — it records a conflict and leaves the row alone. There is no correction path beyond hand-editing the database.

---

## 2. Sleeper endpoints and data sources in use

| Endpoint | Where | Used for | Persisted? |
|---|---|---|---|
| `GET /league/{id}` | `endpoints.ts` `kind:'league'` | season, status, `previous_league_id`, `roster_positions`, `scoring_settings`, `playoff_week_start` | partially — `year`, `sleeperLeagueId`, seeded `status` |
| `GET /league/{id}/users` | `kind:'users'` | display names, `metadata.team_name`, avatar | display name only |
| `GET /league/{id}/rosters` | `kind:'rosters'` | owner, co-owners, W/L/T, PF/PA/PP, players, starters, roster metadata | owner + co-owner + curated metadata (W/L/PF **added by PR #8**) |
| `GET /league/{id}/winners_bracket` | `kind:'winners_bracket'` | placements 1–6, champion | `finalRank` only |
| `GET /league/{id}/losers_bracket` | `kind:'losers_bracket'` | **fetched by the recorder, committed as a fixture, and never read by any code** | ❌ no |
| `GET /league/{id}/matchups/{w}` | `kind:'matchups'`, w=1…18 | weekly points, starters, player points | ❌ **discarded** |
| `GET /league/{id}/transactions/{w}` | `kind:'transactions'`, w=1…18 | adds/drops/waivers/trades/FAAB | ❌ **discarded** |
| `GET /state/nfl` | `kind:'state'` | NFL calendar position | ❌ decoded by `decodeState`, **never called** |
| `GET /players/nfl` | `scripts/record-fixtures.ts:162` only | player id → name/position/team | projected to 351 players, committed as a fixture |

**Not used at all:** `/league/{id}/drafts`, `/draft/{id}/picks`, `/league/{id}/traded_picks`, `/user/{id}`. Drafts are absent entirely, though `04 §7` lists `fantasy_drafts` / `fantasy_draft_picks`. Draft night is deferred (`16 A.3`), so this is a gap, not a bug.

**Configuration:** league ID lives in `.env.example` → `SLEEPER_LEAGUE_ID=1385016656425668608`, with a hardcoded fallback `DEFAULT_LEAGUE_ID` at `scripts/import-league.ts:25`. Only the **current** season's ID is ever configured; earlier seasons come from the chain. No credentials — the API is public.

**The chain, verified:** `1385016656425668608` (2026, `pre_draft`) → `1240008879295713280` (2025, `complete`) → `1113249275284205568` (2024, `complete`, `previous_league_id: null`). Tier 1 succeeds; Tiers 2 and 3 are not needed, confirming `16 §12`.

---

## 3. Persisted vs derived map

**Persisted today (4 tables, `drizzle/0000` + `0001`):**

| Table | Holds |
|---|---|
| `users` | permanent person · `sleeper_user_id` · `pin_hash` · `is_admin` · `is_retired` |
| `seasons` | `year` (unique) · `sleeper_league_id` (unique) · `status` · `is_historical` · `title` |
| `season_memberships` | `season_id` + `user_id` + `roster_id` · `co_owner_user_id` · `sleeper_metadata` · `final_rank` · `is_active` |
| `sync_runs` | kind · status · source · counts · warnings · error |

**Computed in memory during import and then thrown away:**

`ImportedWeek` (per-week matchup entries, pairings, winners, margins, unpaired rosters), `SleeperTransaction[]` (961 transactions across both seasons), starter lineups, per-player weekly points, bracket structure, `potentialPoints`, `pointsAgainst`, league `scoring_settings`, `playoff_week_start`, the losers bracket.

`scripts/import-league.ts:58` calls `traverseChain(source, leagueId, { includeWeeks: false })` — **the weekly fetch is switched off in the only production import path.** The weekly code path is exercised only by tests.

**Consequence:** of the twelve capabilities the audit brief asks about, the current persistence layer can support **three** (manager records via PR #8, historical champions 1–6, head-to-head *nothing*). Weekly matchups, standings, streaks, high/low scores, head-to-head history, league records, Tony predictions, and Slice fact candidates all require data that is fetched, normalized, validated — and then discarded.

**Missing tables from `16 §5.2`:** `league_events`, `fantasy_matchups`, `fantasy_lineups`, `fantasy_player_scores`, `fantasy_transactions`, `weekly_analytics`. All still to come.

---

## 4. Identity-mapping assessment

**This part is correct, and it is the most important thing in the codebase.** Verified against the fixtures:

| Roster 4 | Owner | Sleeper user ID |
|---|---|---|
| 2024 | `Anthonyberardo` | `690209715904417792` |
| 2025 | `Tupaz11` (co-owner `topouzzz` = `604375476017885184`) | `1251952575964524544` |
| 2026 | `zackstephens54` | `1385054341806686208` |

Three distinct accounts in one slot. Roster 7 is `imbrickedup22` all three years — continuity, not turnover. Both are asserted in `chain.test.ts`.

Checks against the brief:

| Requirement | Verdict |
|---|---|
| A roster ID is never a permanent identity | ✅ `season_memberships` keys on `(season_id, roster_id)`; permanent things FK to `users.id` |
| Changing team names does not create a manager | ✅ team name is never persisted at all (see gap below) |
| Roster reassignment cannot attach history to the wrong person | ✅ `UNIQUE(season_id, roster_id)` + `UNIQUE(season_id, user_id)`, both season-scoped, DB-enforced and tested |
| A manager missing one season stays the same person | ✅ Anthonyberardo (2024 only), Tupaz11 (2025 only) each hold one membership and one `users` row |
| 2024/2025 history maps to the right people | ✅ mapping is by `sleeper_user_id`, which is stable across the chain |
| PIN identity cannot expose another manager's records | ⚠️ not assessable — auth lands in PR #8, outside this audit's base |
| Co-owners | ✅ `topouzzz` gets a `users` row and no membership; a second co-owner aborts the import (`MultipleCoOwnersError`) |
| Deletion safety | ✅ `onDelete: 'restrict'` on both FKs, tested |

**Three identity gaps:**

1. **Seasonal team name is never stored.** `decodeUsers` reads `metadata.team_name` into `SleeperUser.teamName`, `chain.ts` carries it, and `persist.ts` drops it. Sleeper overwrites it when a manager renames — so *"Cadillac of Novi HR"* (Alex, 2024) and *"The Coop Kupp Klan"* (Matty B, 2024) are already unrecoverable from the live API and survive **only** in the committed fixtures. The brief's "do not use current team names for old seasons" is currently unenforceable because old team names do not exist in the database. **High.**
2. **`users.display_name` is newest-name-wins** (`collectPeople`, seasons arrive newest-first). Correct for a permanent identity, but it means a 2024 story must not print `display_name` as "who they were then".
3. **Four 2025 Sleeper accounts are still unmapped to canon names** (`RonJonathan`, `Tupaz11`, `imbrickedup22`, `jfletcher433` → Ryan, Brandon, Joe, Topouzian in some order). Documented in `content/counter-greetings.md`; blocks Group B greetings only. **Commissioner ruling required.**

---

## 5. Historical verification — 2024 and 2025

Every cell derived from the fixtures. **Legend:** `S` = verified from Sleeper · `D` = derived deterministically · `C` = **conflicting**.

### 2024 — league `1113249275284205568`, "Tony's Pizza Fantasy Bonanza", status `complete`

| Slot | Manager (Sleeper) | Team name that season | W-L-T `S` | PF `C` | PA `S` | Finish `D` | Playoffs `D` | Reg high (wk) `D` | Reg low (wk) `D` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BigJuncer | Cadillac of Novi HR | 11-3-0 | 1787.52 | 1617.94 | **1 · Champion** | yes | 163.98 (11) | 104.74 (5) |
| 2 | NateyDee | CTE Ambassador | 9-5-0 | 1786.99 | 1598.26 | 2 · Runner-up | yes | 160.44 (4) | 70.48 (11) |
| 3 | jfletcher433 | Damardiac Arrest | 5-9-0 | 1523.70 | 1700.70 | 10 | no | 150.40 (4) | 81.60 (2) |
| 4 | Anthonyberardo | Injury Prone | 6-8-0 | 1778.94 | 1758.64 | 6 | yes | 153.20 (9) | 98.16 (6) |
| 5 | SuggMyNick | Corny and Horny | 6-8-0 | 1743.38 | 1850.94 | 7 | no | 160.00 (6) | 94.66 (2) |
| 6 | RonJonathan | Freddy's Balls | 8-6-0 | 1922.06 | 1736.88 | 5 | yes | 154.30 (8) | 113.44 (7) |
| 7 | imbrickedup22 | Freakbob | 9-5-0 | 1784.24 | 1707.54 | 3 · Third | yes | **183.94 (9)** ← league high | 81.28 (4) |
| 8 | cheeseking | Jimmy and the Crown Vics | 1-13-0 | 1529.62 | 1847.72 | 9 | no | 146.12 (11) | 83.18 (1) |
| 9 | MattLee04 | Oil Money | 10-4-0 | 1693.78 | 1580.68 | 4 | yes | 136.00 (10) | 92.88 (3) |
| 10 | MattyB2317 | The Coop Kupp Klan | 5-9-0 | 1687.48 | 1838.42 | 8 | no | 154.20 (8) | 96.46 (6) |

League-low regular-season week: **70.48, NateyDee, week 11.**

### 2025 — league `1240008879295713280`, "Tony's Pizza Fantasy", status `complete`

| Slot | Manager (Sleeper) | Team name that season | W-L-T `S` | PF `S` | PA `S` | Finish `D` | Playoffs `D` | Reg high (wk) `D` | Reg low (wk) `D` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BigJuncer | Juncer's Hog Formation | 9-5-0 | 1859.74 | 1622.34 | 5 | yes | **182.52 (4)** ← league high | 84.40 (14) |
| 2 | NateyDee | Ooo decisions, decisions | 5-9-0 | 1526.16 | 1560.42 | 7 | no | 157.30 (13) | 72.10 (14) |
| 3 | jfletcher433 | Epsteins YoungHoe Island | 3-11-0 | 1568.78 | **1776.20** ← most PA | 8 | no | 131.26 (6) | **62.74 (1)** ← league low |
| 4 | Tupaz11 (co: topouzzz) | Ceedeez Nuts | 9-5-0 | 1699.36 | 1620.86 | 6 | yes | 149.18 (8) | 86.42 (6) |
| 5 | SuggMyNick | God Hates Jags | 10-4-0 | 1767.04 | 1681.36 | 4 | yes | 172.28 (4) | 67.44 (13) |
| 6 | RonJonathan | Fantastic Sloppy | 11-3-0 | **1868.70** ← most PF | 1635.74 | 2 · Runner-up | yes | 158.24 (5) | 100.50 (14) |
| 7 | imbrickedup22 | Saquon my Chubb | 4-10-0 | 1460.36 | 1770.00 | 9 | no | 139.02 (9) | 79.82 (1) |
| 8 | cheeseking | Jimmy and the Crown Vics | 9-5-0 | 1797.04 | 1631.42 | 3 · Third | yes | 169.52 (10) | 94.58 (8) |
| 9 | MattLee04 | Oil Money | 3-11-0 | **1430.34** ← fewest PF | 1638.70 | 10 | no | 156.92 (5) | 66.76 (12) |
| 10 | MattyB2317 | SmittyWerbnjägermanjensn | 7-7-0 | 1651.46 | 1691.94 | **1 · Champion** | yes | 164.74 (7) | 90.22 (13) |

**Every fact the drafted Counter Greetings depend on checks out.** 7–7 champion ✓ · 11–3 / 1868.7 no ring ✓ · 1859.7 at 9–5 ✓ · 1776.2 PA at 3–11 ✓ · 1430.3 fewest ✓ · roster 4 three occupants ✓ · Zack has no prior season ✓ · `missed_playoffs_both_seasons` = jfletcher433 alone ✓.

**Missing:** nothing material for 2024/2025. Both seasons are complete — 18 weeks of matchups, 961 transactions, both brackets, full rosters. `16 §12`'s claim that Tier 1 succeeded is confirmed.

**2026** is `pre_draft`: zero matchups, zero transactions, all records 0-0-0, bracket drawn but undecided.

---

## 6. Statistic inventory and correctness findings

There is exactly **one** statistical module today: `derivePlacements` in `lib/sleeper/chain.ts`. PR #8 adds `lib/tags/derive.ts` and `lib/parlor/receipt.ts`.

| Statistic | Definition | Source | Scope | Persisted? | Tests | Verdict |
|---|---|---|---|---|---|---|
| `championRosterId` / `runnerUp` / `thirdPlace` | winner/loser of winners-bracket games carrying `p` | `winners_bracket` | postseason | via `final_rank` | 4 tests | ✅ correct |
| `byPosition` → `final_rank` | `p` → winner, `p+1` → loser | `winners_bracket` | postseason | yes | yes | ⚠️ **only covers 1–6**; 7–10 always null |
| `ImportedPairing` winner/margin | higher `points` wins; equal = null (tie) | `matchups` | all weeks | ❌ | 5 tests | ⚠️ correct rule, **wrong source for 2024** (see C1) |
| `unpairedRosterIds` | `matchup_id === null` | `matchups` | all weeks | ❌ | 1 test | ⚠️ conflates bye / eliminated / post-season noise |
| `verifyLeagueShape` | DEF present, K absent, 10 teams, 0.5 PPR | `league` | season | ❌ | 4 tests | ✅ correct, and empirically confirmed |
| PR #8 `wins/losses/ties/PF/PA` | verbatim `rosters.settings` | `rosters` | **regular season only** | yes | yes | ✅ right source, ⚠️ scope undocumented |
| PR #8 `madePlayoffs` | appears in a *decided* winners bracket | `winners_bracket` | postseason | yes | yes | ✅ genuinely well reasoned |
| PR #8 derived tags | see `lib/tags/derive.ts` | above | mixed | no | 307 lines | ✅ spot-checked all against fixtures; ties shared, not broken |

**Facts established by this audit that no code currently encodes:**

- **Regular season is weeks 1–14; playoffs are 15–17; week 18 is not a fantasy week.** `playoff_week_start = 15` in all three seasons. Sleeper's `settings.wins+losses` sums to exactly **70 = 14 × 5** in both completed seasons, and `metadata.record` is a 14-character string. Confirmed both ways.
- **`rosters.settings.fpts` is regular-season only.** In 2025 it equals the week 1–14 sum to the cent for all ten rosters. (In 2024 it does not — that is C1.)
- **There are no median/all-play games.** `settings.league_average_match = 0` in all three seasons. Every "all-play" statistic must be labelled as *computed by Tony*, never as a league result.
- **There are no ties.** Zero across both seasons. Tie handling is untested against real data and must be fixture-tested.
- **Byes are real.** Week 15 has two unpaired rosters (2024: 1 & 9; 2025: 5 & 6) — the top two seeds' first-round byes, distinguishable only via the bracket.
- **Defenses and no kickers confirmed empirically**, not just from config: across 360 matchup entries, every entry starts exactly 10 players, includes exactly one DEF, and starts **zero** kickers.
- **`points` is internally consistent**: `sum(starters_points) === points` in all 360 entries. One empty starter slot exists league-wide (player id `"0"`).
- Rounding: `codec.points()` recombines `fpts`/`fpts_decimal` as hundredths and rounds to 2dp; margins round to 2dp. Correct. **All comparisons should be done in integer cents** to avoid float drift — this audit did.

---

## 7. Bugs and risks, ranked

### 🔴 CRITICAL

**C1 — The 2024 season contains a genuine, unresolved contradiction between Sleeper's standings and Sleeper's current weekly points.**

Sleeper's own two record sources (`rosters.settings` and `metadata.record`) agree with each other. The `matchups` payload does not agree with either:

| Roster | Manager | `settings` record | Recomputed from current weekly points |
|---|---|---|---|
| 5 | SuggMyNick | 6-8-0 | **5-9-0** |
| 6 | RonJonathan | 8-6-0 | **9-5-0** |
| 9 | MattLee04 | 10-4-0 | **9-5-0** |
| 10 | MattyB2317 | 5-9-0 | **6-8-0** |

Two games, both razor-thin:
- **wk 13** — MattLee04 130.84 vs MattyB2317 131.40. Sleeper records **MattLee04** as the winner.
- **wk 14** — SuggMyNick 149.18 vs RonJonathan 149.90. Sleeper records **SuggMyNick** as the winner.

And `settings.fpts` differs from the week 1–14 sum for five rosters:

| Roster | Stored PF | Weekly sum | Δ |
|---|---|---|---|
| 1 BigJuncer | 1787.52 | 1788.52 | +1.00 |
| 2 NateyDee | 1786.99 | 1786.00 | −0.99 |
| 3 jfletcher433 | 1523.70 | 1522.70 | −1.00 |
| 5 SuggMyNick | 1743.38 | 1742.38 | −1.00 |
| 10 MattyB2317 | 1687.48 | 1688.48 | +1.00 |

**The two are consistent with each other**, which identifies the cause: apply the PF deltas back and both disputed games flip to Sleeper's recorded result (MattLee04 130.84 > 130.40; SuggMyNick 150.18 > 149.90). This is **an NFL stat correction landing after the 2024 season was finalized**: Sleeper updated the player scores but never recomputed the standings. 2025 is clean — zero drift on any roster.

*Why it is Critical:* any statistic recomputed from weekly points will contradict the receipt on the same screen. Concretely — the **closest 2024 regular-season game (0.56 margin) is one of the two corrupted ones**, so "closest matchup ever" ships the wrong winner today. `16 A.5` already rules on the adjacent case ("rewards computed once against a stored snapshot, never auto-revoked"); this needs the same treatment stated for facts.

**Recommended rule (awaiting Technical Lead ruling — see §13.1):** Sleeper's `rosters.settings` W/L/PF is the league's **official** record and wins every conflict. Weekly points are the record of *what was scored*, snapshotted at finalize and never recomputed. Where the two disagree, persist both and flag the week. **Not resolved in code by this document.**

**C2 — Week 18 (and unpaired playoff-week rosters) carry points that are not fantasy results.**

Week 18 has all ten rosters scoring with `matchup_id: null` in both seasons. These are NFL week-18 player scores accruing on rosters after the league's season ended in week 17. Likewise, six rosters in week 17 and eliminated teams generally keep scoring.

A naïve "lowest score ever" over all weeks returns **26.50 (Tupaz11, 2025 wk 18)** and **37.80 (Anthonyberardo, 2024 wk 18)** — both false as fantasy facts. The true regular-season lows are 62.74 and 70.48.

`ImportedWeek.unpairedRosterIds` documents the phenomenon but there is no `isScored` / `weekType` flag, and `importSeason` happily includes week 18 in `weeks[]` because it has non-zero entries. Every future record query is one missing `WHERE` away from publishing a fabricated record.

### 🟠 HIGH

**H1 — Placements 7–10 are never derived, although the data is committed.** `losers_bracket` is fetched, hashed, and stored as a fixture, and no line of code reads it. Four managers per season get `final_rank = null`. PR #8's `describeFinish` renders that as *"Missed the playoffs"* — true, but it discards a derivable finish. Both consolation brackets resolve cleanly with `place = p + playoff_teams` (verified: 2024 winners bracket entrants = places 1–6 exactly; losers entrants = places 7–10 exactly; no gaps, no duplicates). Full 1–10 standings for both seasons are in §5.

**H2 — `derivePlacements` will silently produce a false champion if ever handed the losers bracket.** Sleeper's `p` is *bracket-relative*: in the losers bracket `p=1` means **7th place**. `decodeBracket` is generic and `derivePlacements` takes any `SleeperBracketMatch[]`. Nothing in the type system or the function prevents `derivePlacements(losersBracket)` from returning "2024 champion = SuggMyNick". A landmine, not yet a bug.

**H3 — Seasonal team names are dropped at persist and are already unrecoverable upstream.** See §4. Every 2024/2025 team name survives only in `fixtures/sleeper/`.

**H4 — Every weekly fact is fetched, normalized, tested — and discarded.** `includeWeeks: false` in the only production import path. 961 transactions, 360 matchup entries, all lineups and player scores. Nothing that needs a week (streaks, head-to-head, records, upsets, Slice candidates, `league_events`) can be built until this is persisted.

**H5 — The two database-backed test files skip silently in local development.** 28 of 158 tests. CI runs them, so this is a developer-experience and false-confidence risk rather than a coverage hole — but a local `npm test` reporting green means less than it appears to.

### 🟡 MEDIUM

**M1 — Greeting lines hardcode numbers that the tag system does not guarantee.** `content/counter-greetings.md` A6 says *"Eighteen sixty-eight"*, A7 *"Eleven and three"*, A9 *"Seventeen seventy-six"*, A1 *"Seven and seven"*. The tag guarantees the line reaches the right **person**; nothing guarantees the **number** in the sentence still matches. Given C1 proves Sleeper's numbers do move retroactively, this needs either template variables or a test asserting each literal against imported data.

**M2 — Re-sync now overwrites historical W/L and PF (introduced by PR #8).** `persist.ts` gains an update branch: *"Sleeper owns that number, so it wins here."* Correct for a live season. For a completed season it means a future upstream recomputation silently rewrites 2024's history, with only a `records_changed` counter as evidence. Recommend: completed seasons become immutable, and a delta on an archived season raises a conflict rather than an update.

**M3 — `GET /state/nfl` is decoded but never called.** `decodeState` exists and is tested; nothing invokes it. "Current week status" and "days until kickoff" have no source. The fixture is recorded and stale (`week: 0`, `season_type: "pre"`).

**M4 — No sync-health surface.** `lastSuccessfulRun` exists; nothing renders it. `09 §14` wants last-successful / last-attempted / changed / skipped / warnings visible to the commissioner.

**M5 — Bracket matches cannot be joined to weekly matchup rows.** Bracket `m` and matchup `matchup_id` are unrelated numbering. Round → week must be derived (`week = playoff_week_start + round − 1`). No code does this and no test asserts it, so playoff scores cannot currently be attached to playoff games.

**M6 — Fixture staleness has no alarm.** `npm run sleeper:check` re-records and diffs, but nothing runs it on a schedule. C1 is exactly the class of upstream change it would catch.

### 🟢 LOW

**L1** — `DEFAULT_LEAGUE_ID` hardcoded at `scripts/import-league.ts:25` (duplicates `.env.example`).
**L2** — `MAX_WEEK = 18` is a constant; a season with a different `playoff_week_start` would not adapt.
**L3** — `codec.ts:332` treats a `custom_points` override as authoritative and warns. Correct, but the warning is not surfaced anywhere. Neither completed season uses it.
**L4** — `potentialPoints` (PP) is decoded and dropped. Needed later for bench-decision analysis (`04 §7`); cheap to keep now.
**L5** — `chain.ts:471` skips a week with no matchups *and* no transactions. A real week with a total Sleeper outage would be silently omitted rather than flagged.
**L6** — `EXPECTED_TEAM_COUNT` / `EXPECTED_RECEPTION_POINTS` are module constants, not configuration.

---

## 8. Hardcoded, placeholder, or mocked data still present

**No fantasy statistic is mocked or invented anywhere.** The adapter earns its "never fabricate" claim — the audit specifically looked for guessed champions, defaulted records, and invented placements and found none. Defaults that do exist (`wins: 0`, `points: 0`, `status: 'unknown'`) are accompanied by warnings.

| Item | Where | Assessment |
|---|---|---|
| `DEFAULT_LEAGUE_ID` | `scripts/import-league.ts:25` | Low — dev fallback |
| `EXPECTED_TEAM_COUNT`, `EXPECTED_RECEPTION_POINTS` | `lib/sleeper/chain.ts:69-70` | Low — validation constants |
| `MAX_WEEK = 18` | `lib/sleeper/endpoints.ts:22` | Low |
| Asset registry: **every** slug → placeholder | `art/assets.inventory.json` | Expected per `17`; not a data issue |
| `app/page.tsx` (audit base) | — | Renders only asset-registry counts. No fantasy data at all |
| Literal numbers inside greeting lines | `content/counter-greetings.md` | **M1** — true today, unguarded |
| Recorded fixtures | `fixtures/sleeper/` | Real recorded payloads, hash-verified. `players/nfl` is deliberately projected 12202 → 351 and documented as the one asymmetry |
| `fixtures/sleeper/state/nfl.json` | — | Stale (`week: 0`); harmless while unused (**M3**) |

---

## 9. Recommended deterministic product insights

Ordered by value-per-unit-of-work. Every one is a pure function over imported data — no inference.

| # | Insight | Required data | Deterministic rule | Valid when | Edge cases | Slice |
|---|---|---|---|---|---|---|
| 1 | **Complete 1–10 historical finish** | both brackets | `place = p + playoff_teams` for the losers bracket; assert the two brackets partition all rosters into 1..N | now | validate no gaps/dupes before trusting | **V1** |
| 2 | **Your receipt** (record · finish · PF · PA) | `rosters.settings` + `final_rank` | verbatim; never recomputed | now | 0-0-0 preseason → "no record on file" | **V1** (PR #8) |
| 3 | **Season high / low weekly score** | `matchups` wk ≤ 14 | max/min over *scored regular-season* entries only | after persist | **C2** — exclude wk 18 and unpaired; ties share | V2 |
| 4 | **Head-to-head, all-time** | pairings + memberships | map roster→user *per season*, then aggregate by user pair | after persist | departed managers; **C1** for 2024 | V2 |
| 5 | **Longest win/loss streak** | pairings in chronological order | walk weeks ascending; regular season only; a bye does not break a streak | after persist | must be ordered by week, not by `matchup_id`; carry across seasons only if the commissioner says so | V2 |
| 6 | **Closest game / biggest blowout** | pairings | min/max `abs(pointsA − pointsB)` | after persist | **2024's closest game is corrupted (C1) — must be flagged or excluded** | V2 |
| 7 | **League records book** (high, low, blowout, most PF in a season, most PA) | all of the above | one query per record, regular season, labelled "since 2024" | after persist | never claim "all time" — say "since we started recording" (`16 §12`) | V2 |
| 8 | **Rivalry summary** | #4 + finishes | H2H record + last meeting + biggest margin between two users | after persist | needs ≥3 meetings to be interesting | V2/V3 |
| 9 | **Current week status** | `GET /state/nfl` | `week`, `season_type`; days-to-kickoff from the injected clock | needs M3 fixed | preseason `week: 0`; must use `lib/clock.ts` | V1 (small) |
| 10 | **Largest weekly upset** | pairings + standings-to-date | winner's record worse than loser's by the largest margin at that point | after persist | needs standings *as of that week*, not final | V3 |
| 11 | **Playoff clinch / elimination** | pairings + `playoff_week_start` + `playoff_teams` | exhaustive enumeration of remaining schedules — never a heuristic | in-season only | must state the tiebreaker; do not ship a probability | V5 |
| 12 | **"Tony was right/wrong"** | stored prediction + result | compare stored prediction to the finalized snapshot | in-season | prediction must be stored *before* the week; see `16 §9` | V3 |
| 13 | **Tonight at Tony's change lines** | `league_events` diff vs. watermark | ≤4 lines, newest first | after spine | offseason has no changes — needs a designed quiet state | V1 (offseason) / V5 |
| 14 | **Slice fact candidates** | everything above | emit a typed fact packet; the renderer never computes | V5 | validation must reject any number not in the packet | V5 |

**Not recommended:** all-play / median records (the league has none — labelling required and the payoff is low), luck indices, projection deltas (`07 §3` calls projections unreliable), and anything implying win probability (`16 §9` bans the language).

> **All-play is OVERRULED IN PART — COMMISSIONER RULING, 2026-08-10 (R2).**
> This row and `07 §7.5` disagreed, and the disagreement is resolved in favour of
> keeping the measurement. Play-everyone is permitted as a **secondary contextual
> historical measurement**, explicitly labelled and derived from the same verified
> eligible games — which is the labelling this row asked for, now enforced rather
> than requested (`COMPUTED_NOT_PLAYED` is a required field on the fact).
>
> **The rest of the row stands unchanged.** *Luck indices* remain refused:
> `lib/stats/luck.ts` emits two records and a signed difference, and no luck
> score, fraud flag or ranking by desert. Projection deltas and win-probability
> language remain banned.
>
> `docs/HISTORICAL_ANALYSIS_BOUNDARY.md §9`

---

## 10. Proposed phased plan

**Phase A — Correctness guardrails (no schema change).** Encode the four facts this audit established, so nothing downstream can get them wrong: week classification (regular / playoff / unscored), full 1–10 placement from both brackets, a bracket-kind guard on `derivePlacements`, and a fixture-backed test asserting the 2024 conflict is *detected* rather than silently averaged.

**Phase B — Persist the weekly layer** (`fantasy_matchups`, `fantasy_lineups`, `fantasy_player_scores`, `fantasy_transactions`, seasonal team name, PP/PA). Additive migration. Turn on `includeWeeks: true`. Idempotent, re-import stays a no-op.

**Phase C — The derived-stat layer** (`weekly_analytics` + a pure `lib/stats/` module with an algorithm version). Records, streaks, head-to-head, extremes — all with the week-classification rules from Phase A baked in.

**Phase D — Live sync + `league_events`.** The two cron jobs, the finalize snapshot, sync-health reporting, stat-correction alerts. Season-critical, before 10 September.

---

## 11. Recommended first slice, and files it would touch

**Phase A only.** It is small, has no migration, has no UI, and it is the piece that stops a wrong number reaching a manager. **Not started — gated per the banner at the top of this document.**

| File | Change |
|---|---|
| `lib/sleeper/weeks.ts` | **new** — `classifyWeek(week, playoffWeekStart)` → `regular` \| `playoff` \| `unscored`; `isScoredEntry(entry, weekType)`. The single answer to "does this score count". |
| `lib/sleeper/placements.ts` | **new** — `deriveFullPlacements(winners, losers, playoffTeams)` → complete 1–N, asserting the two brackets partition the league. |
| `lib/sleeper/chain.ts` | Add a `bracket: 'winners' \| 'losers'` discriminator to `SleeperBracketMatch` (H2). Add `weekType` to `ImportedWeek`. Fetch the losers bracket in `importSeason`. **Additive only — no signature removed.** |
| `lib/sleeper/reconcile.ts` | **new** — compare `rosters.settings` against recomputed weekly totals; return a typed conflict report. Detects C1; resolves nothing. |
| `lib/sleeper/*.test.ts` | Tests for all of the above against the real fixtures, including a test that **asserts** the 2024 discrepancy so a future re-record cannot bury it. |

Explicitly **not** touched: `codec.ts`, `transport.ts`, `fixtures.ts`, `persist.ts`, `lib/db/schema.ts`, `drizzle/`, anything under `app/`, `components/`, or `art/`.

---

## 12. Overlap and conflict risk with PR #8

**Real and material.** PR #8 (`claude/v0-pipeline-v1-doors-open-n9imrr`, open at time of audit, 92 files) is not confined to visuals — it modifies three files at the centre of this audit:

| File | What PR #8 does | Conflict risk |
|---|---|---|
| `lib/sleeper/chain.ts` | Adds `playoffRosterIds` to `SeasonPlacements`, rewrites `derivePlacements` | 🔴 **High** — same function |
| `lib/sleeper/persist.ts` | Adds `SeatRecord`, persists W/L/PF/PA/`madePlayoffs`, adds an update-on-change branch | 🟠 Medium |
| `lib/db/schema.ts` | +325 lines; `drizzle/0002_auth_content_records.sql` adds the record columns | 🟠 Medium |
| `lib/tags/derive.ts`, `lib/parlor/receipt.ts` | New — consume the statistics this audit governs | 🟡 Semantic, not textual |

PR #8's data work is **good**. `madePlayoffs` correctly refuses to read a *drawn* 2026 bracket as a *played* one; ties are shared rather than broken; the receipt prints "no record on file" instead of a zero. Its derived tags were checked against the fixtures and no incorrect claim was found.

Two things it inherits from this audit: it renders `final_rank = null` as *"Missed the playoffs"* (H1 — 7th–10th is derivable), and it makes historical records overwritable on re-sync (M2).

**Consequence for sequencing:** a Phase A branch cut from today's `main` would conflict on exactly the function PR #8 rewrites. Implementation waits for PR #8 to merge or otherwise reconcile, then branches from the resulting `main`.

---

## 13. Open questions — with the Technical Lead for formal ruling

1. **C1 — which source is authoritative for 2024?** Recommended: `rosters.settings` is the official record; weekly points are the scoring record; conflicts are persisted and flagged, never averaged. *This is the "report, don't silently resolve" case and is deliberately unresolved in code.*
2. **Do the two flipped 2024 games get surfaced in-product?** Two managers' seasons look different depending on which source is read. Silent is defensible; so is a Timeline note.
3. **Are completed seasons immutable once imported?** (M2) Recommended yes: an archived season that disagrees with Sleeper raises a conflict, never an update.
4. **Streaks across seasons** — does a win streak carry from week 14 of 2024 into week 1 of 2025, or reset? Affects every streak claim.
5. **Playoff games in "records"** — do the league high/low and biggest-blowout books include weeks 15–17? Recommended: regular season by default, playoffs labelled separately.
6. **Sleeper username → canon name for the remaining four accounts.** Blocks Group B greetings and any manager-specific fact. Already open in `content/counter-greetings.md`.
7. **Seasonal team names** — persist them (recommended; they are already lost upstream) or accept that old seasons are described by permanent names only?
8. **How far back does "league records" claim to reach?** Recommended wording: *"since we started recording"* — the league may predate 2024, and the chain terminates there.

> **Questions 4, 5 and 8 are RESOLVED — 2026-08-10.** Recorded here so they are
> not carried forward as open.
>
> - **4 · Streaks across seasons** — they **reset each season**. `§15` below
>   already encoded the policy; `lib/stats/history.ts`'s `seasonStreaks` is the
>   implementation, and there is deliberately no cross-season streak. A run
>   spanning an offseason, a draft and a different ten-man roster is a
>   coincidence of the calendar dressed as momentum.
> - **5 · Playoff games in records** — **regular season by default, playoffs
>   separate and labelled**, exactly as recommended. `DEFAULT_RECORD_STAGES` is
>   `['regular']`, and every answer carries the `stages` it used, so a
>   playoff-inclusive record cannot be printed as a regular-season one. The 2024
>   playoff high of 188.02 is real and is not the record; the record is 183.94.
> - **8 · How far back records reach** — resolved by making the scope a **typed
>   value on the fact** rather than a wording convention. `HistoricalScope`
>   carries the seasons and the approved label, and `all-time`, `ever`, `in
>   league history` and `franchise record` are refused by the Slice validator.
>   Both recommended forms stay approved; `since 2024` is preferred because a
>   reader can check it.
>
> `docs/HISTORICAL_ANALYSIS_BOUNDARY.md` — canonical account and source-of-truth
> matrix. Questions 1, 2, 3, 6 and 7 are unaffected by this ruling.

---

## 14. Verification the first implementation slice must satisfy

```bash
npm ci
npm run typecheck && npm run lint
npm test                     # the existing 130 stay green, plus the new fixture tests
npm run db:up && npm run db:migrate
npm run sleeper:import       # from fixtures
npm run sleeper:import       # again — must report "records changed: 0"
npm run build
```

New tests must assert, against the committed fixtures and nothing else:

- 2024 full placement = BigJuncer · NateyDee · imbrickedup22 · MattLee04 · RonJonathan · Anthonyberardo · SuggMyNick · MattyB2317 · cheeseking · jfletcher433
- 2025 full placement = MattyB2317 · RonJonathan · cheeseking · SuggMyNick · BigJuncer · Tupaz11 · NateyDee · jfletcher433 · imbrickedup22 · MattLee04
- Week 18 classifies as `unscored` in both seasons; the regular-season low is 62.74 (2025) and 70.48 (2024), **never** 26.50 or 37.80
- `deriveFullPlacements` rejects a losers bracket passed as a winners bracket
- The reconciler reports exactly 4 record conflicts and 5 points conflicts in 2024, and **zero** in 2025

**Fixtures still needed** (synthetic, alongside the recorded ones): a tied matchup · a season with a different `playoff_week_start` · a manager absent for one season then returning · an incomplete current week · a mid-season roster handover · a duplicate sync after a correction. The recorded league already supplies playoff byes, a consolation bracket, a co-owner, a vacant-seat path, a no-kicker lineup, and defense scoring.

---

## 15. Phase A — what was implemented

**Branch:** `claude/sleeper-phase-a-correctness`, cut from `main` @ `4204f43`.
**Authority:** Technical Lead rulings 2026-07-29, plus the identity correction issued the same day.

Phase A adds correctness guardrails around the existing adapter. The transport, retry behaviour, tolerant decoders, fixture replay, hash verification, transactional persistence, no-op re-import, and the permanent-manager/seasonal-roster split were **not** rewritten.

### The two historical-source rules, in code

| Rule | Where it lives |
|---|---|
| Finalized standings are official; weekly points are a separate, upstream-mutable snapshot | `lib/sleeper/reconcile.ts`, and `season_memberships` records sourced only from `rosters[].settings` |
| Conflicting values are never averaged | The reconciler detects and reports; it has no resolution path at all |
| Downstream facts know which source they hold | `SeasonReconciliation` is carried on `ImportedSeason`; `isWeekDisputed` / `isPairingDisputed` gate any weekly-scoring claim |
| Every weekly snapshot is datable | `ImportedWeek.capturedAt` per week; `seasons.snapshot_captured_at` persisted |

### The 2024 contradiction

Detected, reported, never resolved. `reconcileSeason` finds **exactly** the four record conflicts (rosters 5, 6, 9, 10), the five points conflicts (rosters 1, 2, 3, 5, 10), and the two disputed games — and **zero** of any kind in 2025. Both are asserted against the committed fixtures.

Product handling, as ruled:

- manager-facing records come from the finalized standings, so Nick is 6–8, Ryan 8–6, Matt Lee 10–4, Matty B 5–9;
- the contradiction surfaces only in `sync_runs.warnings` and the importer's diagnostics;
- `isPairingDisputed` exists so weekly-score analytics can exclude an affected game. A test asserts the trap directly: **2024's closest regular-season game (0.56) is one of the disputed two**, so "closest game ever" must not publish a winner from the snapshot;
- the recomputed winner is never presented as the official historical winner.

One deliberate choice: a reconciliation conflict does **not** set the sync run to `NEEDS_REVIEW`. It is a permanent, known property of 2024, and flagging every future import forever would make the status meaningless. A conflicting re-sync against a *finalized* season does set `NEEDS_REVIEW`, because that is a new event.

### Week classification

`lib/sleeper/weeks.ts` is the single authority. Boundaries derive from `settings.playoff_week_start` and `settings.last_scored_leg`, falling back to the bracket's round count — **week 15 is nowhere hardcoded**. `WeekType` is `regular` · `playoff` · `unscored` · `unknown`, and `unknown` is treated as not-scored so an unclassifiable week can never reach a record.

Verified: weeks 1–14 regular, 15–17 playoff, 18 `unscored` in both seasons. Week 18 has ten rosters with real points and **zero** scored entries. Byes are distinguished from eliminations (`explainUnpaired`), and a bye is neither a win nor a loss.

### Full placements

`lib/sleeper/placements.ts` derives 1–10 from both brackets, offsetting the consolation bracket's relative `p` by `playoff_teams`. The kind is checked twice — by label, and by entrant count against the league's own configuration — so a mislabelled bracket is rejected rather than reporting the 7th-place finisher as champion. No manager is left at `final_rank = null` in a completed season.

### Completed-season immutability

`seasons.finalized_at`, set **explicitly** and never inferred from Sleeper's `complete` status — the 2024 conflict is the proof that `complete` arrives before corrections stop. Enforced by two database triggers (update and delete), not by application discipline. A conflicting re-sync reports and writes nothing; `unfinalizeSeason` is the one documented way past the guard.

### Identity

`content/manager-mappings.json` is the authority for `users.display_name`. All thirteen Sleeper accounts across three seasons are mapped, each with a `source`. `users.sleeper_username` keeps the Sleeper handle as separate provenance.

Ryan (`RonJonathan`) — one identity, no separate "Ron". Shant (`Tupaz11`), Armen (`topouzzz`), and Berardo (`Anthonyberardo`) are retired, never deleted: every membership, team name, record, finish, and the Shant↔Armen co-owner link is preserved and asserted. Armen and Shant stay distinct people with no history moving between them.

### Seasonal team names

Persisted to `season_memberships.team_name` from `users[].metadata.team_name` — Sleeper keeps the name on the user; the roster's own metadata carries only nicknames, record, and streak. This closes **H3**: "Cadillac of Novi HR" and "The Coop Kupp Klan" are now in the database rather than only in the fixtures.

### Findings this closes

| Finding | Status |
|---|---|
| **C1** 2024 contradiction | Detected and reported; resolution is a product rule, not a data edit |
| **C2** Week-18 phantom scores | Closed — `unscored`, with a test proving 26.50/37.80 cannot become records |
| **H1** Places 7–10 never derived | Closed |
| **H2** `derivePlacements` accepts either bracket | Closed |
| **H3** Seasonal team names dropped | Closed |
| **M2** Re-sync overwrites history | Closed by finalization + triggers |
| **H4** Weekly facts discarded | **Open — Phase B.** Weeks are now fetched and reconciled, still not persisted |
| **H5** DB tests skip locally | Unchanged; CI supplies Postgres |
| **M1** Hardcoded numbers in greetings | Open — belongs to the content slice |
| **M3**–**M6**, **L1**–**L6** | Open |

### Streak and record policy — encoded and documented

Encoded: week classification, scored-entry determination, bye handling, the finalized-versus-snapshot split.

**Documented, not built** (no derived-stat module exists yet — that is Phase C):

- streaks reset each season, use finalized results, and are never recomputed from the mutable weekly snapshot; a bye neither counts nor breaks a streak;
- record books default to the regular season; playoff records are separate and labelled;
- unscored week-18 entries never count;
- **banned historical overclaims:** `all-time`, `ever`, `in league history`, `franchise record`. Approved wording is `since 2024` or `since we started recording`. ~~These belong in the Slice's banned-phrase validator (`16 §9`), which does not exist yet — adding it now would mean building the validation system, materially widening the slice. **Phase C or the Slice slice must add these four terms to that scan.**~~ **BUILT 2026-08-10.** The four terms live in `lib/stats/scope.ts` as `HISTORICAL_OVERCLAIMS` and are imported into `lib/slice/validate.ts`'s `BANNED` scan — one list, not two — so every surface that validates prose refuses them. `lib/slice/validate-overclaims.test.ts` pins each term and the near-negative pair (*"ever"* refused and *"since 2024"* passed around an identical, correctly derived number). Struck through rather than deleted because the *reasoning* — that the qualifier cannot be left to whoever writes the sentence — is what the scope layer implements.

### Deferred to Phase B and beyond

`fantasy_matchups` · `fantasy_lineups` · `fantasy_player_scores` · `fantasy_transactions` · `weekly_analytics` · per-week capture timestamps in the database · the derived-stat module (records, streaks, head-to-head, extremes) · scheduled sync jobs · the History UI · the banned-phrase validator.

---

## 16. Reconciliation with merged V1

**Date:** 2026-07-29 · **Base:** `main` @ `09735af` (#8 V1 Doors Open, #11 art quantizer)
**Authority:** TECH LEAD RULING on PR #10

Phase A was written against `4204f43` and reconciled after #8 and #11 merged. Seven files conflicted; all resolved per the ruling. The behaviour recorded in §15 is unchanged — what follows is what the merge altered around it.

### Migration renumbered to `0003`

`0002_auth_content_records` is `main`'s and owns that number. Regenerating against the merged schema shrank Phase A's migration to four columns, because the six record columns arrived with #8 and are already applied:

```
season_memberships.team_name
seasons.finalized_at
seasons.snapshot_captured_at
users.sleeper_username
```

Both immutability triggers moved with it. No applied migration was edited.

### Points are `numeric`, not floating point

Phase A had declared `points_for` / `points_against` as `doublePrecision`; #8 declared them `numeric(8, 2)` with `mode: 'number'`, and that declaration was already applied. **#8's is correct and Phase A's is gone.** Points decide who holds `most_points_2025`, and exact decimal storage is the right call.

The reconciler is unaffected: it always compared in integer cents. That now hardens the arithmetic on top of exact storage rather than compensating for inexact storage — belt and braces instead of a workaround.

### `TRUNCATE` and the immutability triggers

The merged test helper (`resetDatabase`) truncates every table in one statement. `TRUNCATE` does not fire row-level triggers, so it bypasses the finalized-season guard.

That is deliberate, not a hole. `TRUNCATE` requires table ownership, which no application role holds; `UPDATE` and `DELETE` are what an importer, a migration, a script, or a hand-run statement could plausibly issue, and those are guarded. A test harness that owns its database sits outside that threat model by construction. Recorded in both the helper and `0003` so it is not later mistaken for an oversight.

### Two sources for `users.display_name`

The reconciliation left two files able to set it:

| | `content/managers.md` (#8) | `content/manager-mappings.json` (Phase A) |
|---|---|---|
| Covers | the ten current managers | all thirteen accounts |
| Applied by | `scripts/seed.ts` | the importer |
| Also carries | — | `is_retired`, mandatory per-mapping `source` |
| Former occupants | left under Sleeper handles | Berardo · Armen · Shant |

They agree on all ten current managers, `RonJonathan → Ryan` included, and differ only on the three former occupants — where the markdown says *"until somebody says otherwise"* and the identity correction of 2026-07-29 said otherwise.

They also compose rather than merely coincide: the importer names all thirteen, the seed then rewrites only its own ten, and a first seed on a clean database reports `Names 0 renamed`. `lib/identity/consistency.test.ts` fails CI if they ever disagree.

**Consolidating to one source is open** — a `DECISION REQUEST — TECH LEAD` on PR #10. Not blocking, and guarded meanwhile.

### The deploy seed finalizes

`scripts/seed.ts` now passes `finalizeYears: [2024, 2025]`. Without it the triggers existed in production and protected nothing. The years are named by hand rather than derived from Sleeper's `complete` status — that distinction *is* the ruling, and 2026 is deliberately absent.

### Verification after reconciliation

- **440 tests across 26 files, none skipped**, against a real Postgres — Phase A, #8's auth/greeting/tags, and #11's art tests green together
- four migrations applied to a freshly created database; both triggers present; `points_for` confirmed `numeric(8,2)`
- deploy path (`migrate → seed → build`) run twice: 48 records changed, then 0
- the four 2024 record conflicts, five PF conflicts, and two disputed games still detected exactly; 2025 still clean
- all ten managers carry a finish and a seasonal team name in both completed seasons

### Still open

`final_rank = null` renders as "Missed the playoffs" in #8's receipt. Now that 7th–10th derive, that case no longer arises for a completed season, so the copy describes a state that no longer occurs. Flagged per the ruling and deliberately not rewritten — a content decision, not a reconciliation one.
