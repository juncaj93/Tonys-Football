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
