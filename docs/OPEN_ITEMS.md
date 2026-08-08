# Open items — the canonical ledger

**This is the current list of everything open.** `docs/CHECKPOINT.md` is the
narrative record of how the product got here and stays that; this file is the
answer to *"what is actually left."* When they disagree, this file is newer.

**Reconciled against `main` on 2026-08-08**, at `ad84bbb`, by reading the code
and the database rather than the status paragraphs. Where a document said
something was open and it had shipped, the document is corrected rather than the
work redone; those corrections are in **H**.

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

### C1 · Three reachable routes have never been photographed

`/profile`, `/rooms` and `/admin` are in `ALL_STATES` nowhere. Every other v1
surface is: the parlor, the rack, the Timeline, the counter, the collection, the
showcase, the back hall, the character screen, the press desk and — since #75 —
the front door.

This exact shape has produced a real defect on **first capture**, twice: the
Timeline's sign read `CHAMPIONS $ HISTORY` (#69) and the door's PIN label broke
`IT` onto its own line at 360 (#75). A route the gate has never seen has an
unverified type floor, colour fidelity, tap targets and reduced-motion promise.

`/rooms` is the most exposed of the three, for the reason
`lib/backhall/driver-coverage.test.ts` already gives about the back hall: nobody
will open it for a year, so nobody would notice it looking wrong.

### C2 · One greeting pair still shares a line

SuggMyNick and cheeseking both made the 2025 playoffs without a title and A21 is
the only Group A line keyed to it. Two lines of markdown, no code, and
`lib/content/greeting.test.ts` already asserts the collision so adding a line
shows up as a change. The material exists and is verified.

Carried from `IMPLEMENTATION_HANDOFF.md`. Still true.

---

## D — Engineering complete; Alex has to act

### D1 · `CRON_SECRET` is unset, and it is the only activation step left

Both scheduled jobs are built, tested, scheduled in `vercel.json` and **inert**.
With the secret unset they answer `404` to everything including Vercel's own
scheduler, which is deliberate: a job that runs unprotected is a job whose
missing secret nobody notices.

**The one-time runbook is `docs/DEPLOYMENT.md §2 → "Turning the jobs on"**: how
to generate it, where to set it, why production-only, how to verify without
exposing the value, what success looks like, and how to roll back.

Not urgent before the season's first Tuesday, and free to do early — with no week
played the job reads an empty week and reports that it did nothing.

**This session did not set it and must not.** It is the commissioner's step
(`AUTONOMY.md §4`), and no value for it exists anywhere in this repository.

### D2 · `COMMISSIONER_SLEEPER_USER_ID` — confirm it is set in production

With it unset, `requireAdmin()` answers `notFound()` for everyone and **nobody
can approve a Slice**, so the review chain that `16 §9` makes mandatory has no
one able to work it. The seed prints `Admin  COMMISSIONER_SLEEPER_USER_ID is
unset — nobody is an admin.` when it is missing, so the answer is visible in any
deploy log.

Documented in `docs/DEPLOYMENT.md §2`. Recorded here because nothing in this
session could observe production, and *"probably set"* is not a launch check.

### D3 · Production demo-seat verification — still UNVERIFIED

The read-only query is in `docs/PUBLIC_MODE.md` and has never been run. This is a
**commissioner risk acceptance, not a finding that the count is zero.** Do not
record it as passed. If a `demo:` seat with `is_admin = true` is ever found in
production it is an authentication incident, not a cleanup task.

### D4 · Nobody has looked at production in a browser

`*.vercel.app` is unreachable through the agent proxy, so every claim about
production in this repository rests on GitHub's gate results and Vercel's own
status. Carried since #23 and still true.

---

## E — Technical debt worth doing when it fits

### E1 · `fantasy_lineups`, `fantasy_player_scores`, `weekly_analytics` are specified and unbuilt

`16 §5` lists them beside `fantasy_matchups`. Nothing reads them and no v1
surface needs them, so this is a note rather than a task — recorded so a future
session does not read the absence as an oversight and start writing migrations.

### E2 · `derivePairings` does not filter an unplayed game

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
Postgres and reachable. What stands between here and a working season is **D1**,
one environment variable, plus confirming **D2**. Neither is engineering and
neither can be done from a session.
