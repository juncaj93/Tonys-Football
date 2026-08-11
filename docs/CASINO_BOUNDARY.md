# The Underground casino — the boundary

**Status:** **rulings recorded · economy analysed · no product code, no migration, no route, no flag.**
The Underground is **CLOSED** and stays closed. `lib/flags.ts` is untouched:
`underground: false`, `roulette: false`, and the curtain in the Back Hall still
says *"Don't worry about it."*

**Authority:** commissioner rulings **R1–R13**, 2026-08-11, which resolve
`docs/OPEN_ITEMS.md` **G1**. `docs/UNDERGROUND_CASINO_INVESTIGATION.md` is the
architecture investigation those rulings approved;
`docs/evidence/casino/analysis.md` is the generated measurement behind every
number here (`npx tsx scripts/casino-analysis.ts`).

---

## 1. G1 is resolved

The Underground opens with **blackjack and slots**, staked in fictional Tony
Tokens. That is settled and **must not be re-raised as an open question.**

| Source | Claim | Status |
|---|---|---|
| `03 §14` · `04 §11` · `09 §12` · `16 §13` P10 | the launch games are blackjack and slots | **WINS** |
| Reopening brief, 2026-08-09 | *"avoid building slots, roulette, blackjack clone, poker"* | **LOSES, for the Underground.** Its *"league-native games"* preference still describes `16 §9`'s three Slice wagering families, which are built |

**G1's second precondition is dissolved rather than met.** It argued the
Underground had nothing to wager on until football existed — an argument about
*football* wagers. A blackjack hand settles from a shuffled deck in the same
request: no week, no `week_finalizations` row, no season of history. The third
precondition — an economy simulation on the footing the box price got — is what
this slice discharges.

## 2. What is fixed, and what is still provisional

Two categories, deliberately kept apart. **Do not read a provisional number as
approved, and do not re-open a fixed one.**

### Fixed by ruling — not to be re-litigated

| | Ruling |
|---|---|
| The games | Blackjack and slots. Nothing else. No roulette, ever (R1) |
| Blackjack rules | hit · stand · natural · bust · dealer draw · push · **dealer stands on all 17** (R2) |
| Blackjack exclusions | **no** split, double, surrender or **insurance** — insurance stays out unless explicitly reopened (R2) |
| Natural payout | **3:2**. 6:5 refused. 2:1 not to be adopted for implementation convenience (R4) |
| Jackpot | **No progressive jackpot**, ever. One rare fixed top prize is allowed (R7) |
| Expected value | The casino is **net-negative to the player by design** — entertainment and an optional sink, never the dominant earning strategy (R8) |
| Session limits | **No daily play cap.** Spam, double-tap and concurrency correctness only — a technical rule, not a behavioural one (R9) |
| History | **Private.** No leaderboard, no activity feed, no public losses or volume (R10) |
| Opening | **Both games ready before the Underground opens.** Independent flags are for engineering and demos only (R11) |
| Earned-token award | **Casino payouts excluded** (R12). See §7 |
| Accounting | Wager and payout are **distinct audited movements** through `apply_token_delta`. No net-only row, no second balance (R13) |

### Provisional — subject to the evidence in §4–§6

Wager denominations · the slots paytable and reel strip · the per-spin ceiling ·
the exact RTP. R3, R5, R6 and R7 all say so in terms, and all four are answered
with evidence in §8.

## 3. Blackjack, measured

Two models, and the difference between them is the point rather than a caveat.

| Model | House edge | Method |
|---|---|---|
| Infinite deck | **2.5438%** | exact enumeration — no sampling, no seed, no tolerance |
| **Single deck — the shipped model** | **2.0306%** | 20M hands, σ/√n = 0.000221, so ±0.009 points at 4σ |

The shipped game shuffles a fresh 52-card deck per hand, and that is **worth
half a percentage point to the player**. The mechanism is the natural: one deck
deals a two-card twenty-one `2·(4/52)·(16/51)` = **4.827%** of the time against
`2·(1/13)·(4/13)` = **4.734%** with infinite cards, because an ace you hold is
one of four rather than one of thirteen. Both figures are closed form.

The full composition-dependent enumeration of the single-deck game is not
tractable — the state is the deck's own composition — so it is **sampled and its
error band reported**, which is the repository's standing division of labour
(`docs/ECONOMY_SIMULATION.md`, the 2026-08-10 gate ruling): assert exactly what
can be asserted exactly, sample only what is genuinely emergent.

| Outcome | Frequency | Pays |
|---|---|---|
| Natural | 4.659% | +1.5× |
| Win | 38.94% | +1× |
| Push | 8.45% | 0 |
| Loss, outdrawn | 30.90% | −1× |
| Loss, bust | 17.05% | −1× |

Standard deviation **0.9866** units per hand. Expected loss: **0.41 / 0.81 /
1.62 tokens** at the 20 / 40 / 80 buttons.

**All three approved buttons are even, and they have to be**: 3:2 of an odd stake
is not a whole number of tokens. R3 and R4 agree by construction, and
`blackjackGame` throws on an odd wager so the next person to move the buttons
finds out immediately.

## 4. Slots, and the ceiling that does not fit

Three candidates, one reel strip (`25 · 22 · 19 · 16 · 11 · 7` of 100), so the
comparison is a comparison of the **rulings** rather than of three machines.
Every figure is a closed-form sum over the 216 outcomes; there is no Monte Carlo
and there must never be one.

| | RTP | Top prize | True win | Money back | Loss | Volatility | Audit |
|---|---|---|---|---|---|---|---|
| **A** — cap 200, buttons 10/20/40 | 85.57% | *three olive*, 5× | 23.71% | 25.39% | 50.90% | 1.098 | **REFUSED** |
| **B** — cap 800, buttons 10/20/40 | 85.13% | three tony, 20× | 8.49% | 40.61% | 50.90% | 1.869 | clean |
| **C** — cap 400, buttons 5/10/20 | 85.13% | three tony, 20× | 8.49% | 40.61% | 50.90% | 1.869 | clean |

### Why A is refused, and it is not a matter of taste

R5's **40-token button** and R7's **200-token ceiling** together permit no payout
above **five times the stake**. Five integer levels cannot carry six symbols
*and* a money-back tier, so the rarest combination on the machine ties with two
commoner ones: **three tony pays the same 5× as three olive**, which is 12× more
likely. The machine has no top prize. `auditPaytable` fails it on exactly that,
and a test asserts the failure — this is the incompatibility R7 asked to be told
about, not a paytable that wants more effort.

The return rate was never the problem: A reaches 85.57%.

Candidate C is the recommendation. It is **B's paytable at half the stake**,
which buys back the top prize. Its lowest button is 5, which is what makes the
20× top prize reachable without committing much, and it puts slots **below**
blackjack's ladder, which is the right relationship: slots is the fast incidental
game, blackjack is the one you sit down for.

> **Correction, ruled 2026-08-11.** This paragraph originally said Candidate C
> *"halves the largest possible single payout to 400 tokens."* That was true only
> against Candidate B, which was never approved — and stating it without the
> comparison invited the reading that C reduces the top payout. **Against the
> approved baseline it raises it.** Relative to R5/R7 as written (40-token
> maximum wager, 200-token ceiling): the **maximum wager halves** 40 → 20, the
> **gross top payout doubles** 200 → 400, and the **maximum net win rises 160 →
> 380**. The underlying analysis is unchanged; only the wording was wrong.

## 5. Baseline preservation

`NEXT PHASE §B`'s first requirement, discharged by construction and then tested.

`CasinoPolicy` is an **optional** field on `SimulationInput`, and every casino
draw comes from a **separate generator** seeded independently. The existing
`next()` stream is never consulted for a casino outcome, so with the field absent
the loop takes the identical branch in the identical order.

| Check | Range | Measured | Recorded in `ECONOMY_SIMULATION.md` |
|---|---|---|---|
| Boxes per manager per season | 6–12 | **11.0** ✓ | 11.0 |
| Reward-bearing weeks, median | 35–60% | 52.9% ✓ | 52.9% |
| Non-weekly reward rate | ~0% | 0 ✓ | 0 |
| Legendary mass, configured | exactly 2% | 2.000% ✓ | 2.000% |
| Legendary rate per opening | 2.00% ± 0.67 (n=6976) | 1.98% ✓ | 1.98% |
| Legendaries league-wide, derived | 2.79 ± 0.94 | 2.76 | 2.76 |

**Identical, figure for figure, including the sample size.** Two tests hold it:
one restating the recorded numbers, and a stronger structural one asserting that
a policy in which *nobody plays* produces the byte-identical league to no policy
at all — manager by manager, season by season. That can only hold if the casino
never draws from the simulation's generator.

## 6. What the casino does to the economy

50 seasons · 10 managers · 17 scored weeks · box at 200. Managers gamble
**before** buying and hold back nothing, which is the conservative assumption for
the question being asked.

### The gate, per archetype

| Archetype | Plays/week | Boxes/season | p10 | p90 | Gate |
|---|---|---|---|---|---|
| none | 0 | 11.0 | 6.0 | 18.0 | **PASS** |
| casual | 8 | 10.5 | 5.0 | 17.0 | **PASS** |
| regular | 40 | 8.0 | 2.9 | 15.0 | **PASS** |
| heavy | 150 | **4.0** | **0.0** | 12.0 | **FAIL** — below the 6–12 floor |
| **mixed league** | — | **10.0** | — | — | **PASS** |

### Season one, which is the only season that exists

The 50-season run **saturates** — every manager owns all 24 items by season two —
so it cannot see damage to collection progression. This is the horizon that
matters:

| Archetype | Boxes in season 1 | Unique items | vs. no casino |
|---|---|---|---|
| none | 10.0 | **13.0** / 24 | — |
| casual | 11.0 | 14.0 / 24 | no measurable harm |
| regular | 5.0 | 8.0 / 24 | **−38%** |
| heavy | 4.0 | 7.0 / 24 | **−46%** |

### The three findings that matter

**1. The casino does not let the rich compound — it does the opposite.** In the
mixed league the heavy gambler is placed on the *best* fantasy manager, which is
where compounding would be loudest. They finish on 10.1 boxes a season against
12.2–12.3 for non-gambling median managers. A 15% house edge is a **progressive
drain on whoever plays most**, and R8's compounding concern is answered
negatively by measurement.

**2. The exposure lands on the manager who can least afford it.** The *worst*
fantasy manager playing at a regular cadence drops to 4.0 boxes a season. That is
the real risk in this product, and it is the opposite of the one that was
expected.

**3. Slots is the drain; blackjack is nearly free.** A 40-token blackjack hand
costs **0.81 tokens** expected; a 10-token spin costs **1.49**. Even at four
times the stake, blackjack costs half as much per play, because its house edge is
2.03% against slots' 14.87%. **Slots is 85% of the total cost of playing**, so
slots is the only lever worth pulling.

### The lever, stated once

A median manager earns **115 tokens a week** (150 × 50% of weeks + 400 × 10%) —
1,955 a season, about 9.8 boxes. Everything above follows from one ratio:

| Buttons (slots / blackjack) | Casual | Regular | Heavy | Heavy as share of income |
|---|---|---|---|---|
| 5 / 20 | 5 | 26 | 99 | 86% |
| **10 / 40** | 11 | 53 | 198 | **172%** |
| 20 / 80 | 21 | 105 | 396 | 344% |

At the 10-token button one box costs **134 spins** of expected loss. At the
5-token button, 269.

## 7. The earned-token award (R12)

**The award does not exist.** `16 §8` specifies it — *"measured on tokens earned
(sum of positive ledger entries), never tokens held"* — and an audit of every
query, service, route and action found **no implementation anywhere**.
`tokensEarned` appears only inside the two simulation models, and `SEASON_AWARD`
is a `token_reason` value declared in `0005` and deliberately unwired.

So R12 cannot be discharged by changing a calculation, because there is no
calculation. **The smallest correct change is to make the award impossible to
build wrong**, and it is one exported constant, landing in W1:

```ts
/** Reasons that count toward `16 §8`'s token-leader award. */
export const EARNED_TOKEN_REASONS = [
  'SEASON_START',
  'MATCHUP_WIN',
  'WEEKLY_HIGH_SCORE',
  'SEASON_AWARD',
  'STAKE_PAYOUT',
  'DUPLICATE_SALVAGE',
] as const satisfies readonly LiveTokenReason[];
```

**An allowlist, not `all positive deltas except casino`**, which is R12's own
stated preference and is the safer shape for one reason: it **fails closed**. A
reason added later — a casino promotion, a vending refund, anything — counts for
nothing until somebody puts it on this list deliberately. The subtractive form
fails open, and it fails silently.

Three consequences, all deliberate:

- **`CASINO_PAYOUT` is absent**, which is R12.
- **`CASINO_WAGER` is absent and irrelevant** — it is negative, and the award
  sums positives only. It cannot distort the total in either direction.
- **No existing source changes meaning.** `STAKE_PAYOUT` and `DUPLICATE_SALVAGE`
  stay in, because both are already how the product pays a manager and R12 says
  not to redefine non-casino sources without necessity.

A test asserting the list is exhaustive over `LiveTokenReason` is what stops a
new reason being silently uncounted. **Nothing in `lib/counter/` was touched in
this slice** — the constant lands with the migration that adds the two casino
reasons, because that is the first moment it can be complete.

## 8. Recommended launch parameters

Everything the commissioner still has to say yes to. **None of it is
implemented.**

| Parameter | Status | Value | Evidence |
|---|---|---|---|
| Games | **approved (R1)** | blackjack, slots | — |
| Blackjack ruleset | **approved (R2)** | hit · stand · natural · bust · dealer draw · push · S17 | — |
| Natural payout | **approved (R4)** | 3:2 | — |
| Blackjack buttons | **recommended: keep R3's 20 / 40 / 80** | 20 / 40 / 80 | §6 finding 3 — blackjack costs 0.81 tokens a hand and is not the drain. All three are even, so 3:2 stays whole |
| Blackjack house edge | **derived, for the record** | **2.03%** | §3 |
| Slots buttons | **needs approval — change from R5** | **5 / 10 / 20** | §4, §6. R5's 10/20/40 with a 200 cap is refused by §4; and at 5/20 a regular gambler keeps 10.5 of 24 items against 8.0 |
| Per-spin ceiling | **needs approval — change from R7** | **400 tokens** (two boxes) | §4. The 200 cap is incompatible with a top prize at any button above 10 |
| Slots RTP | **approved target met (R6)** | **85.13%**, exact | §4 |
| Slots reel strip | **needs approval** | 25 · 22 · 19 · 16 · 11 · 7 | §4 |
| Slots paytable | **needs approval** | pairs 1/1/1/1/2/2 · triples 6/9/11/14/18/20 | §4 |
| Top prize | **needs approval** | three tony, **20×**, 1 in 2,915 spins | §4 |
| Jackpot | **approved (R7)** | none, and never progressive | — |
| Minimum interval between plays | **needs approval** | engineering's to propose in W1 | R9 — correctness only |

**Symbol names are placeholders.** No art is briefed, no final naming is set, and
`art/BRAND_EXCEPTIONS.md` is not extended by this slice.

## 9. Two design elements the transaction work must carry

Both fell out of proving the lifecycle rather than sketching it.

**An abandoned hand cannot outlive its season.** The open hand is its own resume
state — walk back to the table and it is there, and the partial unique index on
open hands stops a second one being dealt. That needs no cleanup and **no cron**,
which is R/F's requirement. But a hand still open when the season closes becomes
**unsettleable forever**: `apply_token_delta` refuses a finalized season, so the
payout can never be written and the index blocks the manager permanently. So
**season close must resolve open hands by refunding the wager**, recorded as a
distinct `voided` outcome. It is part of the existing season-close path, not a
scheduled job, and it is the only non-destructive answer — the alternatives are
keeping a wager for a hand nobody played, or leaving a seat jammed.

**A push is two rows, and that is R13 working rather than a problem.** A push
returns exactly the stake, so a net-only representation would be a zero delta and
`apply_token_delta` **refuses zero outright**. `CASINO_WAGER −40` followed by
`CASINO_PAYOUT +40` is two legal non-zero movements and a truthful audit trail.
R13 asked to be told if the transaction architecture required a different
representation: **it does not.**

## 11. Phase 3 — the slots redesign, and what it settled

**Commissioner rulings, 2026-08-11 (second set).** Buttons fixed at **5 / 10 /
20**; top prize fixed at **20×**, so 400 tokens at the largest button and no
progressive jackpot; **85.13% refused** and the design re-derived toward
**≈92%**, exploring 90 / 92 / 93 with *no assumption that 92 wins*; **blackjack
untouched** at 20 / 40 / 80, 3:2, 2.03%.

`docs/evidence/casino/slots-redesign.md` is the generated measurement
(`npx tsx scripts/slots-redesign.ts`).

### 11.1 The strip moved once, for the top prize

`24 · 21 · 18 · 15 · 12 · 10`, flatter at the rare end than Phase 2's
`25 · 22 · 19 · 16 · 11 · 7`. On the old strip the top prize landed **1 in 2,915
spins** — a regular player meets it once every **5.7 seasons**, which is a top
prize in the paytable and not in the product. It is now **1 in 1,000**, about
once every two seasons per regular player. Criterion 2 asks for memorable wins,
and a win nobody in a ten-person league ever sees is not one.

### 11.2 The pair tier is forced, not chosen

With the top prize fixed at 20×, the whole triple tier can return at most
`3.50% × 20 = 70.0%` even if **every** three-of-a-kind paid the maximum. So **no
paytable can reach 90% — let alone 92% — without a pair tier.** Ruling 2 and
Ruling 3 together determine that this machine pays frequent small wins; that is
arithmetic rather than a design preference, and a test asserts it.

Given that, the tier pays *above* the stake on the three rarer symbols instead of
paying the stake back on everything. Same return rate, but a **real win 15.74% of
the time** rather than money-back 43.8% of the time.

### 11.3 The three candidates

| | triples (crust→tony) | RTP | Hit | True win | Top prize | Loss/spin at 10 | Volatility |
|---|---|---|---|---|---|---|---|
| **D** | 7/10/11/13/16/20 | 90.54% | 47.30% | 15.74% | 20× @ 1 in 1,000 | 0.946 | 1.925 |
| **E** | 8/10/11/13/17/20 | **92.09%** | 47.30% | 15.74% | 20× @ 1 in 1,000 | 0.791 | 1.986 |
| **F** | 8/10/12/14/17/20 | 93.01% | 47.30% | 15.74% | 20× @ 1 in 1,000 | 0.699 | 2.038 |

Pairs are `1/1/1/2/2/2` in all three, so the comparison isolates the return rate.
All three pass every coherence check.

### 11.4 What the simulation actually showed

**Leaving 85% did the work. The choice inside the band did almost none.**

| | RTP | Regular: boxes | Regular: items after S1 | Heavy: boxes | League drain/season |
|---|---|---|---|---|---|
| Phase 2 (85.13%) | 85.13% | 8.0 | 8.0 / 24 | **4.0 — gate FAIL** | 4,333 |
| **D** | 90.54% | 9.0 | 11.6 / 24 | 6.0 | 3,927 |
| **E** | 92.09% | 9.5 | **11.7 / 24** | 7.0 | 3,515 |
| **F** | 93.01% | 10.0 | 11.8 / 24 | 7.0 | 3,316 |
| *no casino* | — | 11.0 | 13.3 / 24 | 11.0 | 0 |

Three results, and the first is the one that matters:

1. **Ruling 3 fixed the gate failure.** At 85% a league of heavy players fell to
   4.0 boxes a season, below the approved 6–12 floor. Every Phase 3 candidate
   **passes the release gate at every archetype.**
2. **Regular play no longer guts the collection.** The cost fell from **5.3 items
   of 13.3 (−40%)** at 85% to **1.6 items (−12%)** at 92%. Criterion 4 is met.
3. **The band is flat.** Across 90 → 93 a regular player gains **0.2 items and
   1.0 boxes**, while the league gives up 611 tokens of sink a season. The
   marginal value of return above 90% is close to nothing, which is why the
   choice inside the band is a judgement about the sink rather than about
   progression.

**Season-one item counts are the mean over 50 independent leagues, not one.** The
first run of the script reported them from a single ten-manager season and they
came out **non-monotonic in the return rate** — the 93% candidate looking worse
than the 90% one. That is sampling noise being read as a finding, the same error
the 2026-08-10 economy-gate ruling was issued about, and the fix is the same:
make the sample big enough that the signal survives it. Each figure now rests on
500 manager-seasons.

### 11.5 The recommendation: **E, at 92.09%**

- **Criterion 1, meaningfully net-negative** — 3,515 tokens a season leave the
  league, about 17.6 boxes of purchasing power. D drains more; the difference
  buys nothing measurable in progression.
- **Criterion 2, memorable wins** — identical across the band by construction:
  same strip, same hit rate, same 15.74% true-win rate, same top prize.
- **Criterion 3, a real 20× top** — 1 in 1,000 spins, 400 tokens at the top
  button, and the rarest symbol is the unique largest payout.
- **Criterion 4, does not gut the loop** — a regular player keeps 11.7 of 13.3
  items. D's marginal extra drain costs a regular player half a box a season for
  no gain elsewhere; F's marginal extra return buys 0.1 items for 200 fewer
  tokens of sink.
- **Criterion 5, no positive-EV grinding** — RTP is below 100% at every button
  and every combination, so there is no positive-EV line anywhere in the game.
- **Lowest complexity** — one strip, six pair values, six ascending triple
  values, no second mechanic and no special cases. Identical in shape to D and F,
  so nothing is bought with complexity.

E is also Ruling 3's stated target. The simulation was run without assuming that
and does not select it by much — but it does select it.

### 11.6 Blackjack is untouched

Ruling 4. Wagers 20 / 40 / 80, 3:2 naturals, S17, the V1 rule set, measured
2.03%. Nothing in the slots redesign touched it, and the 25% of plays that are
hands use the same measured outcome spread as Phase 2.

---

## 12. W1 — built, and the door is still shut

**Approved 2026-08-11 and implemented the same day.** The slot machine works end
to end against a real Postgres. **`underground: false`**, `slotMachine: false`,
`blackjackTable: false` — R11 requires both games before the curtain goes up, and
blackjack is W2.

### 12.1 What landed

| | |
|---|---|
| `drizzle/0019_casino_slots.sql` | `slot_spins` · `casino_tables` · the two `token_reason` values |
| `lib/casino/table.ts` | the shipped paytable (Candidate E), content-hashed and stored, plus the roll → symbol → payout resolver |
| `lib/casino/slots.ts` | `spin()` — one transaction, four idempotency mechanisms |
| `lib/casino/objects.ts` · `components/scene/underground.tsx` | the room, drawn from the same numbers the hit regions use |
| `app/underground/page.tsx` · `app/actions/casino.ts` | the route and the one action |
| `lib/db/errors.ts` | `isBalanceViolation`, extracted from its two existing copies |
| `lib/counter/tokens.ts` | `EARNED_TOKEN_REASONS` — R12 |

### 12.2 The guarantees are in the database, not in the service

`09 §12`'s integrity list, each satisfied by a mechanism rather than by care:

| Requirement | Mechanism |
|---|---|
| Server-generated outcome | `rollBelow` (`crypto.randomInt`); the client sends a stake and a token and nothing else |
| Validated bet amount | Checked against the **stored** paytable's buttons, not a constant |
| Sufficient-token check | `CHECK (token_balance >= 0)`. **Nothing reads a balance and decides** |
| Atomic bet and payout | One transaction; a failure anywhere leaves the tab untouched |
| Idempotency | advisory lock → replay read → `spin_key UNIQUE` → `apply_token_delta`'s key |
| Replay rejection | A recorded spin is returned unchanged, never re-rolled |
| No client-authoritative result | The component holds no paytable, no strip, no odds and no arithmetic |
| Auditability | The three raw rolls and the table version are stored; the outcome recomputes |
| Append-only | Trigger. A recorded spin cannot be edited or deleted |

Two more the migration adds: **`wager_tx_id NOT NULL`** makes a spin nobody paid
for unwritable, and **`slot_spins_payout_is_paid`** makes a claimed payout with no
ledger row unwritable. Both are asserted by test.

### 12.3 Three decisions worth recording

**The anti-spam interval is a database read, not a limiter.** R9 forbids quotas
and requires correctness against double taps. `MIN_SPIN_INTERVAL_MS` is evaluated
*inside the transaction*, against the manager's own last row, under the advisory
lock. An in-memory limiter would be **worse than nothing**: serverless functions
share no memory between invocations, so it would look like a control and do
nothing.

**The action checks the flags for itself.** A server action is a public endpoint,
reachable by anybody who can guess its id whether or not a page renders a button
for it. A shut machine that only hid its UI would still take wagers.

**`back-hall-both-open` is photographable at last.** It was declared, found
impossible, and recorded as *"a demo this document asked for and the product
cannot honestly produce"* — because `openTo()` throws on a flag opening a door
with no route behind it. The prediction was that the casino would bring the route
and the state would arrive with it. It did. The assertion that pinned the
impossibility is **inverted rather than deleted**.

### 12.4 What has and has not been verified

| | |
|---|---|
| `npm run typecheck` · `npm run lint` | PASS |
| `npm run build` | PASS — `/underground` compiles |
| Full test suite | PASS — **2,053 passing**, including 16 slot-machine integration tests against a real Postgres 16 |
| Migration applied to a live database | PASS |
| Seed stores the paytable | PASS — `ad3386079ca387df · RTP 92.09% · buttons 5/10/20 · PROVISIONAL` |
| **`npm run visual:qa`** | **NOT RUN** — see below |

**The visual gate did not run, and that is a gap rather than a pass.** The
container's Playwright browser build does not match the version this repository
pins, and downloading the matching one is blocked by the network policy. The
driver was **not** modified to work around it: weakening a gate to make it pass in
an environment it was not written for is the failure mode the gate exists to
prevent.

So three visual states — `underground`, `underground-covered` and
`back-hall-both-open` — are **declared, wired and unphotographed**. Their
`driver-coverage` tests pass, which proves the states are *declared*, not that
they *look right*. **`npm run visual:qa` must run and pass before W1 merges**, and
the Underground must not open until it has.

---

## 10. What this slice deliberately did not do

No migration · no route · no server action · no component · no feature-flag
change · no art · no third cron · no change to the box price, weekly rewards,
rarity odds, salvage values or catalog size · no `casino_events` or
`league_events` framework · nothing in `lib/counter/`, `lib/stakes/`,
`lib/rewards/` or `lib/flags.ts` · **no public casino history** · **the
Underground is not open.**
