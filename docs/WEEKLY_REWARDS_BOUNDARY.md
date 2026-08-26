# Weekly token rewards — the boundary

**Status:** built. `03 §4`'s fantasy-performance token sources, paid by the Tuesday job from a finalized week.

This is the canonical account of what weekly rewards are, what they deliberately are not, and which decisions are closed. Where it disagrees with an older document, this one wins for this system.

---

## 1. What the assignment said, and what was actually true

The assignment described `weekly_rewards` as an existing table that nothing wrote to.

**There was no such table.** The schema had `reward_tables` — the loot-box weight table, which is written and read — and nothing for weekly token rewards. What did exist was narrower and more interesting: `token_reason` had declared `MATCHUP_WIN` and `WEEKLY_HIGH_SCORE` since `0005`, and `docs/IMPLEMENTATION_HANDOFF.md` recorded exactly why they were unwired:

> Matchup wins and weekly high scores need a played season and the two cron jobs that would award them (`16 §4.3`) do not exist. The enum declares them; nothing is wired to them. **Do not invent a weekly reward that fires on nothing.**

That is a precondition, not a prohibition, and both crons now exist — Tuesday in #56, Sunday in #59. So the work was unblocked rather than the rule waived, and the table is new rather than adopted.

`17 §12` lists *"live weekly rewards"* under **deferred, deliberately**. That is not a contradiction: `16` puts *"token ledger and weekly rewards"* in v1 and in P3's economy phase, and `17` changes only ordering. The deferred item is the *live* variant — rewards arriving during a season in progress — which is what this is, and it became orderable the moment the job that closes a week shipped.

## 2. The amounts are specified, not chosen

`03 §4`:

| Source | Tokens |
|---|---|
| first-season login/start balance | 250 |
| **matchup win** | **150** |
| **weekly high score** | **400** |
| special fantasy accomplishment | commissioner-configured |
| championship and season awards | substantial, plus permanent items |

> Final numbers must be configurable and reviewed against simulations before launch.

No commissioner decision was required, because the specification names both numbers and the repository already has the mechanism the second sentence asks for: `economy_configs`, keyed by content hash, flagged `provisional`, read by `economyFor`, never edited in place. `seasonStartTokens: 250` came from the same list by the same route. **Do not tune 150 or 400** — that is the P3 simulation's job, and moving them early is what the gate exists to prevent.

Adding two keys changes the economy's content hash, so seeding writes a **new version row** rather than editing the old one. That is the designed behaviour and it is safe because `db:seed` is a deploy step; `economyFor` additionally refuses a stored config missing a key, a check written the last time a value was added and every pre-existing environment kept serving a row without it.

## 3. What is paid, and what is deliberately not

Two reasons, both derivable from one finalized week without inference:

- **`MATCHUP_WIN`** — the stored `winner_roster_id`. Never recomputed from the scores.
- **`WEEKLY_HIGH_SCORE`** — the maximum of the week's stored team scores.

**Absent on purpose**, and each for its own reason:

| Not built | Why |
|---|---|
| Upset | Not in `03 §4`. The schema would accept it; that is not a reason. |
| Playoff advancement, consolation placing | Not in `03 §4`. |
| Special fantasy accomplishment | `03 §4` says *commissioner-configured*. There is no mechanism, and inventing one is a product decision. |
| `SEASON_AWARD` | Named in `03 §4` without amounts, and it happens at season close. Still declared and still unwired — the same rule that governed the pair above applies to it. |
| Bounties, Tony's Line | Already built. They pay through `STAKE_PAYOUT` in `lib/stakes/`, and are stakes rather than rewards. |

**Week type is not a modifier.** `03 §4` prices a matchup win once and does not qualify it, so a playoff win and a consolation win each pay 150 and the code contains no branch on `weekType`. A multiplier would be an invented rule. Two tests pin the absence.

## 4. Ties, byes, and the cases that pay nothing

- **A tied game pays no win to anybody.** `03 §4` prices a *win*; `WeekGame.tie` is a stored result, not a missing winner.
- **A tied high score pays every manager who posted it, in full.** `03 §4` gives one number and no rule for splitting it. Halving invents a rounding question the spec never answers; paying nobody punishes the week's best score for being matched. Exact-cent ties are vanishingly rare — this is decided in advance rather than improvised on a Tuesday.
- **A bye is not a handled case, it is an absent row.** `fantasy_matchups` stores only paired games (`CHECK roster_a_id <> roster_b_id`), so a manager with no game never enters the record. A test asserts that stays true rather than becoming a zero award.
- **A zero reward is never written.** `apply_token_delta` rejects a zero delta and `weekly_rewards_amount_positive` rejects it again. A manager who won nothing simply has no row.

## 5. The finality gate, and the defect inside it

A reward may only be paid from a week that is **written down as final**. That much was obvious. The second half was not, and the Tuesday integration test is what found it.

`weekFinality` reports *which* record made a week final, and **prefers the week's own finalization** when both exist — correct for its own question, because that is the narrower claim. The Tuesday job writes that row in **step 1**. So the obvious implementation —

```ts
if (finality.source === 'season_closed') return refuse('season-closed');
```

— never fires on a closed season, because by the time rewards run the source reads `finalized_week`. `apply_token_delta` then raises *"season is finalized; its token ledger is closed"* from four frames down, and an **expected state becomes a failed step**. Every week of 2024 and 2025 is in exactly that position in every environment.

The gate therefore tests `seasons.finalized_at` directly — **the same condition the ledger enforces**, not a proxy for it. A gate that approximates the rule it protects will disagree with it eventually, and the disagreement surfaces as an exception rather than as a decline.

> `MANDATE §9`'s *"no fabricated data"* has a quieter partner: **no fabricated failures either.** A closed season is not an error, it is a season whose books are shut.

## 6. Idempotency is two database locks and no application check

There is no `SELECT ... WHERE already_rewarded` anywhere in this slice. A check like that is a race with a comfortable-looking body: two concurrent Tuesdays both read *"not yet"*, both proceed, and the database is what actually saves it. So the database is asked directly.

| Mechanism | What it stops |
|---|---|
| `token_transactions.idempotency_key UNIQUE` | A second payment for the same manager, week and reason — whatever asks, from wherever |
| `weekly_rewards_once_per_manager_per_reason` | A second *justification*, even if a caller invents a different key format |
| One transaction per week | A half-paid week, which is the one outcome that cannot be reasoned about on a retry |
| Append-only trigger | An edit to a row that already justifies moved money |

The key is `weekly-reward:{season}:{week}:{managerId}:{reason}` — derived from the **occasion**, never from the run. The **amount is deliberately not in it**: if the economy is rebalanced between two runs of the same week, `apply_token_delta` finds the key recording a different delta and raises, which is correct. Putting the amount in the key would instead pay the manager twice at two prices, and both rows would look legitimate.

**Order inside the transaction is load-bearing.** The payment is applied first and the justification written second. The ledger is the idempotency authority, so a replay gets the same transaction id back and the `ON CONFLICT DO NOTHING` on `weekly_rewards` reports it as already paid. Writing the justification first would invert the authority: a crash between the two would leave a reward row with no payment, and the next run would skip a manager who was never paid.

## 7. Why the table exists when the ledger is already idempotent

The unique key on the ledger is genuinely sufficient to stop a double payment, and `weekly_rewards` does not repeat that job. It exists because the ledger answers *what moved* and cannot answer three questions the commissioner will ask the first time somebody disputes a Tuesday:

1. **Was week 5 rewarded?** — an indexed `(season_id, week)` read, rather than parsing text keys.
2. **On what basis?** — the score, the roster and the game, structurally, beside the payment. `MANDATE §9` forbids treating rendered Tony prose as the fact, and `description` is prose for a receipt.
3. **Against which numbers?** — `economy_configs` is versioned by content hash precisely so a transaction stays interpretable, and that is only true if the version in force is recorded at award time.

The unique constraint is therefore a *second* lock on the same door, deliberately: it states the rule in the vocabulary of the domain where the ledger states it in the vocabulary of the key.

**There is no correction path**, and that is a decision. No `updated_at`, no soft delete, no edit. A reward is an event that already moved money; changing it would leave the ledger describing a payment that no longer matches its own justification. A mistake is corrected the way `03 §5` corrects every mistake — a new `COMMISSIONER_ADJUSTMENT` row, visible and attributed.

## 8. Rewards do not wait on the commissioner

`16 §9` requires a person to approve the **paper**. Nothing in the specification makes a manager's 150 tokens wait on an editor.

So the reward step sits inside the Tuesday chain but is independent of the Slice's review state, and a test asserts both halves: tokens move while no version is published. The coupling would have been invisible in production — an unreviewed Tuesday would silently withhold money a finalized week had already earned, and the desk would look merely quiet.

The job's own rule is unchanged and unchangeable: it ends at `submit: true`, and there is no parameter that can make it publish.

## 9. Where it appears

`/counter` gained a **statement** — the balance plus the last six movements, through `Ledger`/`LedgerRow`, the primitives the text-surface pass already built. `recentTransactions` had been written and unused since the ledger shipped; this is its first caller.

It answers `03 §5`'s *"the displayed balance should reconcile to the ledger"*, which had nothing to reconcile until now: a balance used to move when you bought a box, and you had just bought the box. Tokens now arrive on a Tuesday, from a cron, for a game played on Sunday — a number that changes while nobody is looking needs to be able to say why.

It derives nothing: no running total, no re-summed balance. The balance is a trigger-maintained column and a second opinion computed in a browser would be a second opinion about money.

## 10. What is not built

- **No reward surface of its own.** Six movements under the counter, not a season of Tuesdays. That belongs on a surface built for it and no such surface is in v1.
- **No Slice integration.** The paper does not print what the week paid. It could; nothing here decides that it should.
- **No season awards.** `SEASON_AWARD` is still declared and still unwired.
- **No backfill.** 2024 and 2025 are closed seasons and their ledgers are shut. Historical weeks are unpayable by construction, not by omission.

---

## 11. The early-dues thank-you — a credit that is not a reward

Added 2026-08-26, alongside the receipt read model below. It sits in
`lib/rewards/` and is deliberately **not** part of `03 §4`'s fantasy-performance
sources: `deriveWeeklyAwards` does not know it exists, `weekly_reward_reason`
does not gain a value, and nothing about a roster, a score, a week or a finish
enters it.

**What it is.** Two managers paid their 2026 league dues before the commissioner
asked twice, and the commissioner wanted that noticed in the shop. It pays
**twice the standard box price** — 400 today — once, per named manager, per
season.

**The amount is derived, never written down.** `earlyDuesAmount` multiplies
`standardBoxPriceTokens` from the **stored** `economy_configs` row. A literal
`400` would be a third number for the P3 simulation to argue with and would
silently stop meaning *"two boxes"* the next time the price moved — which has
already happened once, when the 2026-08-04 ruling took the box from 50 to 200.
**No economy value changed here**, and a test in `early-dues.test.ts` pins all
four of the ones this slice reads.

**The roster carries its season, and that is the load-bearing part.**
`EARLY_DUES_ROSTER` is a source-controlled list — the shape
`content/manager-mappings.json` established for a fact the software cannot
derive, with a `source` on every row. Each entry names a **season**, because dues
are paid per season: a roster keyed only by handle would hand the same bonus out
again the first time a 2027 season was seeded, paying for something nobody had
done yet. Extending it to another season is a reviewed edit to the array, and a
test goes red until somebody makes it deliberately.

**Matched on the Sleeper handle, case-insensitively.** `11 §2` keeps the three
identities apart; the commissioner named these two by the handle Sleeper shows,
so that is what is matched — never the display name, which is a league decision
that can be re-approved. Handles are unique case-insensitively, so `NateyDee` and
`nateydee` are one account and must not be two answers. An **unclaimed** account
(`sleeper_username IS NULL`) is never eligible, and a test proves a row whose
*display name* is `NateyDee` is not paid.

**Eligibility is that plus a live seat**, `season_memberships.is_active` — the
same filter `grantSeasonalBoxes` uses, and the only opinion in this repository
about who is playing. A named manager holding no seat is **skipped, not an
error**: `apply_token_delta` would raise *"holds no seat"*, turning an expected
state into a failed step, which is exactly the inversion §5 above exists to
avoid.

**Its own `token_reason`, not `COMMISSIONER_ADJUSTMENT`.** The argument `0010`
made for the stake pair: a manager's statement is a thing they read, and an
adjustment is the one line on it that ought to be rare and conspicuous. A
thank-you filed as an adjustment is indistinguishable from the commissioner
correcting a mistake.

**No table of its own**, unlike weekly rewards, and §7's argument is what decides
it rather than being contradicted by it. `weekly_rewards` exists because the
ledger cannot say *on what basis* (a roster, a score, a game) or *against which
numbers*. This gift has no football basis to record — the basis is a roster in
source, reviewable in git — and the one fact the ledger cannot otherwise carry,
the `economy_configs` version the amount was derived from, travels in
`source_ref` as `economy:<version>`. So `0022` creates no table, no trigger and
no constraint. It adds one enum value.

**Idempotency is `token_transactions.idempotency_key UNIQUE`, and nothing else.**
The key is `early-dues:{seasonId}:{userId}` — the occasion, never the run, and
**never the amount**, for §6's reason exactly: a re-priced replay must raise
rather than pay twice at two prices. There is no application check that decides
whether to pay. The single ledger read in `awardEarlyDues` is **a report, never a
gate** — it exists so a deploy can log *"two paid"* rather than *"two
considered"*, two concurrent runs can make it over-count by one, and the money is
correct either way. An integration test races two runs and asserts two rows.

**It is wired into the seed, not the Tuesday job.** The gift is owed the moment
the season is open — a thank-you for something that happened before a ball was
thrown — so making a manager wait for the first Tuesday of October would be the
software deciding when to say thank you. The seed is a deploy step, so this is a
**catch-up** rather than a schedule: a season seeded late, a manager seated late
and a redeploy all end in the same place. A step in the Tuesday chain that can
never do anything after the first deploy is a step that only adds a way for
Tuesday to fail.

## 12. The receipt — data, and no surface

`lib/rewards/receipt.ts` answers one question — *"what has been credited to this
manager that they did not do themselves?"* — and **builds no UI, adds no route
and writes nothing.**

**The rule for what is on it.** A box purchase, a stake placed and a casino wager
are things a manager did with their thumb, seconds ago, on a screen that told
them so. What needs a receipt is money that moved **while they were not here**: a
Tuesday cron paying a week they won, and a thank-you decided off the platform
entirely. So the receipt is exactly `MATCHUP_WIN`, `WEEKLY_HIGH_SCORE` and
`EARLY_DUES_BONUS`.

**`STAKE_PAYOUT` and `SEASON_START` are deliberately absent.** A settled stake is
credited unattended and has an equally good claim — it belongs to `lib/stakes/`,
and adding it from here would be this slice deciding another module's surface. An
opening balance is not news on a *first* login; it is the reason there is a
balance at all. Both are one entry each in `RECEIPT_REASONS` the day somebody
owns that decision.

**The week comes from `weekly_rewards`, joined on `token_transaction_id`** —
which is UNIQUE, so it is a genuine one-to-one and a manager who won in week 3
and week 9 gets the right week on the right line. Matching on the *reason*
instead would collapse both onto whichever row came back first. Nothing is parsed
out of an idempotency key: a key is an identifier, and treating it as a record is
how a format change becomes a data loss.

**The balance is read, never re-summed from the lines.** §9's rule, applied one
layer earlier: it is a trigger-maintained column, the lines are a filtered subset
of the ledger, and adding them up would produce a second, wrong opinion about
money. `credited` is what arrived; `balance` is what is there; a test spends
tokens so the two disagree on purpose.

**There is no seen/unseen state, and that is a decision.** A receipt that shows
each credit once needs a per-manager read watermark — precisely the
`league_events` spine `CLAUDE.md` records as deliberately deferred, to be
revisited *"when a concrete feature needs … per-manager read/unread state."* No
surface exists yet, so building it now would be creating the deferred spine for a
screen nobody has designed. A caller that eventually has somewhere to record a
watermark passes `since`, which is one argument rather than one table.

## 13. What the weekly high score needed, and what it did not

The 2026-08-26 assignment asked for a weekly highest-scorer bonus paid from
finalized Sleeper scoring. **It was already built and is unchanged** — 400 from
`03 §4`, the maximum of a finalized week's stored team scores, paid by the
Tuesday job. Rebuilding it would have been a second opinion about money.

One genuine gap in its *coverage* was closed. The high score is a **league**
measurement, and the fixture that would catch a per-game implementation did not
exist: on a single game, measuring the best score inside the matchup and
measuring it across the week give the same answer, so a defect that pays every
winner 400 looks correct. `derive.test.ts` now plays two games where the winner
of the lower-scoring one is paid a win and nothing else. It fails on a per-game
implementation.

---

## Ruling index

| Decision | Where |
|---|---|
| 150 / 400 are specified, not chosen; provisional until P3 | §2 |
| Only two reward reasons; upset, playoff, consolation deliberately absent | §3 |
| Week type is not a multiplier | §3 |
| Tied high score pays all, in full | §4 |
| Tied game pays no win | §4 |
| A bye is an absent row, not a zero award | §4 |
| The gate tests `seasons.finalized_at`, not `finality.source` | §5 |
| No application-level "already rewarded" check | §6 |
| Amount is excluded from the idempotency key | §6 |
| Pay first, justify second | §6 |
| No correction path; mistakes are `COMMISSIONER_ADJUSTMENT` | §7 |
| Rewards are not coupled to Slice approval | §8 |
| No backfill of closed seasons | §10 |
| The early-dues thank-you is a credit, not a `03 §4` reward | §11 |
| The amount is 2x the stored box price, derived rather than written down | §11 |
| The roster is source-controlled and each entry names its season | §11 |
| Matched on the Sleeper handle, case-insensitively; never the display name | §11 |
| A named manager with no live seat is skipped, not an error | §11 |
| Its own `token_reason`, never `COMMISSIONER_ADJUSTMENT` | §11 |
| No table: the basis is in source, the economy version in `source_ref` | §11 |
| The ledger read is a report, never a gate | §11 |
| Wired into the seed, not the Tuesday chain | §11 |
| The receipt is credits the manager did not initiate | §12 |
| `STAKE_PAYOUT` and `SEASON_START` are deliberately off it | §12 |
| No seen/unseen watermark; `since` is an argument, not a table | §12 |
| The weekly high score itself is unchanged | §13 |
