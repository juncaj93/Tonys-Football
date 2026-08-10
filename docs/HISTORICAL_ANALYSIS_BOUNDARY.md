# The deterministic historical-analysis layer — the canonical account

**Built 2026-08-10.** `lib/stats/` could answer *"what happened this week"* in
considerable detail and could not answer *"has this ever happened before"* at
all. This is that half.

It is a **library, not a surface**. Nothing was wired into a page, no route was
added, no table was created, and no migration exists. `docs/OPEN_ITEMS.md`
records that v1 is functionally ready and that new surfaces are not wanted; the
gap this closes is in the layer `MANDATE §9` makes the sole authority for
*"records · rankings · streaks · historical comparisons"*, three of which had no
implementation.

---

## 0. Canonical sources, and what each governs

Located by reading the repository rather than by trusting the file name. The
older `07` is **current and unsuperseded** — it is where the deterministic /
editorial split is specified — but four later documents govern where they touch
it.

| Path | Governs | Bearing here |
|---|---|---|
| `docs/PRODUCT_DELIVERY_MANDATE.md` **§9, §10** | Specialist ownership; the typed-fact contract | Top of the hierarchy. §9 gives Stats sole authority over records, rankings, streaks and historical comparisons; §10 lists the fields a typed fact must carry and requires suppression with a recorded reason |
| `PROJECT_SPEC/07_AI_STORY_ENGINE_AND_EVENT_ANALYSIS.md` | The story engine: layer separation, candidate categories, scoring, validation | **The design document for this work.** §2 is the deterministic/editorial split; §7 is the candidate catalogue evaluated in §2 below; §7.4 forbids inventing a rivalry; §7.5 scopes the luck metric; §8 forbids reconstructing a Monday story |
| `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` **§9, §12** | The Slice pipeline and validation; the historical import | §9 makes validation deterministic and bans win-probability language. §12 is *"never fabricate"* and the source of *"highest since we started recording"* |
| `docs/DATA_AUDIT.md` **§5, §6, §9, §13, §15** | The measured data baseline | §5 is the independently computed 2024/2025 record every integration assertion is checked against. §6 records `league_average_match = 0`. §15 encodes the streak policy and lists the four banned historical overclaims as *"documented, not built"* |
| `docs/IN_SEASON_SYNC_BOUNDARY.md`, `docs/SUNDAY_SNAPSHOT_BOUNDARY.md` | What is actually written, and when | The snapshot boundary states that remaining-Monday exposure is *unrecordable*, which is one registry entry below |
| `lib/league/membership.ts` | The retired-manager ruling, 2026-07-30 | Absolute. History counts them; the product never names them |

`CLAUDE.md`'s status section, `docs/OPEN_ITEMS.md` and `docs/CHECKPOINT.md` were
read for current state. **No ZIP copy of any specification was consulted.**

---

## 1. Source-of-truth matrix

What the product can actually verify today, concept by concept. Derived by
reading `lib/db/schema.ts` and querying a migrated, seeded database — not from
any document's summary.

| Concept | Current repo authority | Status |
|---|---|---|
| Matchup scores | `fantasy_matchups.points_{a,b}_cents` | **supported** — integer cents, exact |
| Margins | `fantasy_matchups.margin_cents`, CHECK-tied to the points | **supported** |
| Winner of a game | `fantasy_matchups.winner_roster_id` | **supported**; null on a tie, which is a result |
| Blowouts / close games | `lib/stats/significance.ts` + this layer's record book | **supported** — tier from the policy, record from a min/max |
| Team-week high and low | derived over `fantasy_matchups` | **supported**, regular season by default |
| Streaks | derived; policy in `DATA_AUDIT §15` | **supported**, within a season only |
| Head-to-head | derived via `season_memberships` → `users` | **supported** — built here; was previously unavailable |
| Championship meetings | `season_memberships.final_rank` + `made_playoffs` | **supported** — built here |
| Playoff vs consolation | `season_memberships.made_playoffs` | **supported** — `week_type` alone cannot tell them apart |
| Standings as of week N | `lib/stats/standings.ts` | **supported**, recomputed from games |
| Play-everyone record | derived; `league_average_match = 0` | **supported as a labelled measurement**, never as a league result |
| Monday comeback, 2026 onward | `week_snapshots` + `lib/stats/comeback.ts` | **supported from the first captured week** |
| Monday comeback, 2024–2025 | — | **unavailable** — the job postdates the archive; a snapshot cannot be taken retroactively |
| Remaining Monday exposure | — | **unrecordable** — no NFL schedule in Sleeper's league API |
| Trades / trade revenge | — | **unavailable** — `fantasy_transactions` does not exist |
| Bench decisions | — | **unavailable** — `fantasy_lineups`, `fantasy_player_scores` do not exist |
| Projections / projected upsets | — | **unavailable and banned** — no projection is stored, and `16 §9` bans the language |
| Playoff "must win" | — | **unavailable** — the unplayed schedule is not stored; a heuristic is refused |
| Rivalries | `07 §7.4` | **canonical only** — a series record is derivable, a rivalry is not |
| All-time records | `16 §12` | **out of scope by construction** — the chain terminates at 2024 |
| Seasonal team names | `season_memberships.team_name` | **stored**; period-accurate *display* names are not, and are not attempted |
| Casino history | — | **deferred** (P10) |

**Nothing on the unavailable rows was implemented, reconstructed or approximated.**
Each has an entry in `lib/stats/unsupported.ts`.

---

## 2. The candidate categories, evaluated

`07 §7` lists ten. Each was tested against current storage rather than against
the design.

| `07` category | Verdict | Where |
|---|---|---|
| §7.1 Meaningful blowout | already built | `lib/stats/significance.ts`, `stories.ts`. **Not re-implemented.** `07 §7.1`'s starting thresholds (20/40/60) are *not* used: `significance.ts` recalibrated against all 162 recorded games, and the brief's *"do not use arbitrary old thresholds unless current docs retain them"* points at the newer document |
| §7.2 Heartbreak / comeback | built, with a coverage limit | `lib/stats/comeback.ts`. **Monday-night framing is only honest from 2026** — registry entry `monday-comeback-historical` |
| §7.3 Trade revenge | **not built** | No transaction storage. Registry entry `trade-revenge` |
| §7.4 Rivalry moment | **built as a measurement** | `headToHead` gives the series; `previousChampionshipMeeting` gives the one relationship the bracket proves. The word *rivalry* appears in no output |
| §7.5 Luck or fraud | **built as the neutral half only** | `lib/stats/luck.ts`. Play-everyone record and a signed `scheduleDelta`. No `fraud`, no `luck` score, no ranking |
| §7.6 Legendary performance | **built** | `recordBook` — highest team-week, widest margin, with scope |
| §7.7 Bench crime | **not built** | No lineup storage. Registry entry `bench-crime` |
| §7.8 Casino story | **not built** | The casino is deferred |
| §7.9 Collectible story | **not built here** | `box_openings` holds the data; a collectible claim reads different tables under different rules and does not belong in a football library |
| §7.10 Content announcement | not a derived fact | Commissioner-authored by rule |

New beyond `07`'s list, because the data supports them cleanly: **season
streaks** across the era, and the **record book** as a scoped, holder-attributed
object rather than an ad-hoc query.

---

## 3. What was built

Five files, all under `lib/stats/`, all additive.

### `scope.ts` — the qualifier, as a value

The problem it exists for: *"the highest score since 2024"* and *"the highest
score ever"* are produced by **the same correct query over the same correct
rows.** The number is right in both. Only one is true. Nothing downstream of a
derivation can tell them apart, so the scope travels *on the fact* —
`HistoricalScope` carries the seasons, the observation count, `finalizedOnly`,
and the approved label — and a renderer prints the label rather than deciding how
far back a record reaches.

It also makes `DATA_AUDIT §15`'s four banned overclaims mechanical.
**They had been documented since 2026-07-29 and never built**, because the
validator did not exist when they were written down; the document says so in as
many words. They are now one entry in `lib/slice/validate.ts`'s `BANNED`,
imported from here — one list, not two.

`\bever\b` does not match `never`, `however` or `whenever`. Asserted.

### `era.ts` — the database boundary

`loadTrackedEra(db)` reads every **finalized** season once and resolves every
side of every game to a **permanent manager id**. There is no parameter to
include an open season: an open season's numbers can still move, and a record
that shifts under a published claim makes the claim retroactively wrong.

`16 §5.1` is why the resolution happens at load. Roster 4 is Berardo in 2024,
Topouzian in 2025 and Zack in 2026 — aggregating by roster id across seasons
merges three people while producing entirely reasonable-looking numbers. A test
asserts that Berardo and Shant are distinct people with disjoint seasons and no
series between them.

`GameStage` is the one derivation `week_type` could not supply. Sleeper keeps
every roster playing through the playoff weeks, so a week typed `playoff` holds
bracket and consolation games side by side — eleven per season on record. A game
is `bracket` only when **both** rosters carry `made_playoffs`, which is read from
the winners bracket at import and never inferred from seed or record. Without
this, a ninth-versus-tenth consolation game reads as a playoff meeting.

### `history.ts` — the pure derivations

`headToHead` · `allSeries` · `championshipMeetings` · `recordBook` ·
`seasonStreaks` · `publishableHistory` · `explain`.

Every fact carries `MANDATE §10`'s fields lifted to a cross-season claim: a
stable id, the manager ids, the source game keys, the scope, a support state, and
the evidence. **There is no prose field**, and its absence is the boundary.

### `luck.ts` — the neutral measurement

Separated because it has its own exclusion rule and its own mandatory label.

### `unsupported.ts` — the registry

Nine entries, each with the design section that asks for the story, why it cannot
be proven, the tables that would be needed, and **the nearest true thing to say
instead**. Every entry has a substitute; a registry of refusals with no
alternatives becomes a list of reasons to give up.

---

## 4. Four decisions worth recording

### The disputed game is the trap this layer was most exposed to

`DATA_AUDIT §15`: *"2024's closest regular-season game (0.56) is one of the
disputed two, so 'closest game ever' must not publish a winner from the
snapshot."*

A closest-game record is a `min` over margins, and **the two smallest margins in
the entire archive are the two games nobody can vouch for** — 0.56 in week 13 and
0.72 in week 14, both 2024. A record book written without thinking about it
returns 0.56 and names a winner the official standings contradict. The recorded
answer is **0.18**, from 2025 week 1, and the integration suite asserts it both
positively and negatively.

### A disputed *week* is dropped whole from play-everyone, not a disputed game

Everywhere else in `lib/stats`, a disputed **game** is excluded. That is not
enough for an all-play tally, because one manager's number depends on *every
score in the week*: dropping one game would leave eight managers measured against
nine opponents while everybody else used ten, and the resulting table would look
completely normal. 2024 loses weeks 13 and 14 entirely, the excluded weeks are
named on the fact, and the support drops to `partial`.

### There is no luck score, and no `fraud` boolean

`07 §7.5` puts *"fraud"* in the editorial layer's mouth and requires the fact
packet to carry *"the metric and the calculation"*. So this produces two records
over the same games and a signed subtraction between them. It does not rank
managers by desert, and `scheduleDelta`'s sign carries no judgement. The word
`expected wins` is additionally a banned term in the Slice validator, which is a
second reason the number is not called that.

### The record book is regular-season by default, and says which population it used

`DATA_AUDIT §15`: *"record books default to the regular season; playoff records
are separate and labelled."* The bracket is the best half of the league in a
three-week window; mixing it in makes the ordinary look unusual. The 2024 playoff
high of **188.02** is real and is not the record — the record is **183.94**. Each
answer carries its `stages`, and the bracket book has a different id, so the two
cannot collide in a cache and print as each other.

---

## 5. The event spine — not created, and not needed

**No `league_events` table was created and none is proposed.** `docs/OPEN_ITEMS.md`
**G** defers it by commissioner ruling of 2026-08-06, with the revisit condition
written down.

Nothing here wanted it. Every derivation is a pure function over
`fantasy_matchups`, `season_memberships` and `users`, and persisting a second
record of facts those tables already hold is precisely the duplication the
invariant refuses. The two things a spine would uniquely buy — ordering across
heterogeneous event types, and per-manager watermarks — are still not asked for
by anything, and are not asked for by this either.

**No table, no column, no migration, no trigger.** The whole slice is pure
functions and one loader.

---

## 6. Tests

**88 new assertions across four files.** The pure suites build eras by hand
through `buildEraGame` — the same constructor the loader uses — so stage
classification and countability are exercised rather than asserted into
existence.

| File | Covers |
|---|---|
| `lib/stats/scope.test.ts` | Scope construction and refusals; the four overclaims; the near-negative pair (*"ever"* vs *"since 2024"* around an identical correct number) |
| `lib/stats/history.test.ts` | Every category: positive, near-negative, tie, shared record, disputed exclusion, season-boundary reset, consolation-not-bracket, publication boundary, determinism |
| `lib/stats/history.integration.test.ts` | The real 2024/2025 fixtures against a real Postgres, pinned to `DATA_AUDIT §5` |
| `lib/stats/unsupported.test.ts` | Registry integrity, and the schema-drift guard |
| `lib/slice/validate-overclaims.test.ts` | The four terms at the gate every surface passes through |

Load-bearing values are asserted **at their boundary**, so moving one turns a
test red: `MIN_SERIES_MEETINGS` is checked at two meetings (`thin-basis`) and at
three (`verified`); `DEFAULT_RECORD_STAGES` is checked by the regular and bracket
books returning different records under different ids.

### The registry cannot go stale quietly

`unsupported.test.ts` parses `lib/db/schema.ts` and fails if a table an entry
names as absent has since been created. The day somebody adds
`fantasy_transactions`, the trade-revenge entry stops being true and the suite
goes red — which is the only moment anybody would think to rewrite it.

**Its control assertion found a real defect in itself.** The first matcher was
`SCHEMA.includes("pgTable('<name>'")`, and the schema declares its larger tables
across two lines — so the matcher recognised *nothing*, and the absence check was
passing vacuously for every string ever written. The control test, which asserts
the matcher can still see a table that does exist, is what caught it.

---

## 7. What consumes it, and what does not

**Nothing consumes it yet, deliberately.** The brief's own instruction is not to
wire every possible consumer, and a parallel session owns the Slice.

Available now, cleanly:

- **The Slice**, for a rivalry or record candidate — `HistoricalFactBase` already
  carries the evidence and scope a fact packet needs, and `publishableHistory`
  applies the same boundary `assemblePacket` does;
- **The Timeline** (`lib/league/timeline.ts`), which computes from the verified
  tables and could add a records panel with no new storage;
- **Preseason and offseason context**, which is what the product is showing today
  and where a scoped record book is the most useful thing there is;
- **The Counter aside** (`lib/parlor/aside.ts`), already validating Tony's lines
  through the Slice validator against a fact's allowed values.

Each is a decision for whoever owns that surface. The library is complete without
them.

---

## 8. Still open

- **The Monday story before 2026 cannot be told**, and no amount of code changes
  that. Registry entry `monday-comeback-historical`.
- **Period-accurate display names.** `season_memberships.team_name` holds the
  seasonal *team* name; `users.display_name` is newest-name-wins, so a 2024 story
  names who they are now. Registry entry `seasonal-team-name-history`. Not
  attempted — it needs a per-season name history Sleeper does not keep.
- **`07 §5`'s candidate merging** — several events about one game becoming one
  story — is not implemented here. `lib/slice/select.ts` already does duplicate
  suppression by `gameKey` for week stories, and extending it to historical facts
  needs a consumer first.
