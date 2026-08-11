# Tony's Pizza Fantasy — Underground Casino V1 Architecture Investigation

**Status:** investigation and planning only. **Nothing here is approved and nothing was
implemented.** No migration, no route, no flag change, no economy value, no art.

**Authority:** commissioner ruling of 2026-08-11 resolving `docs/OPEN_ITEMS.md` **G1** —
the Underground opens with **blackjack** and **slots**, staked in fictional Tony Tokens.
No real money, no purchase, no cash-out, no roulette, no external service, no paid API.

**Base:** `origin/main` at `72c2902`, fetched 2026-08-11. Branch
`claude/underground-casino-investigation-mu3ayr`, zero commits ahead or behind at the
time of investigation.

**Claim:** none taken. `docs/ACTIVE_WORK.md` scopes claims to *"one row per meaningful
workstream — something that will take a branch and a pull request"*, and explicitly
excludes commissioner decisions. An investigation that ships a document and opens no PR
is not that. **The first implementation branch must claim before writing code.**

---

## A. Current repo state

### A.1 The ten questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Current route(s) | **None.** `/underground` is deliberately not a route (`18 §5`, `BACK_HALL_BOUNDARY §0`). `app/` has no casino directory |
| 2 | Locked/placeholder state | An inert `ShutDoor` on `/back-hall` — `lib/backhall/objects.ts` object `curtain`, rect `[204, 104, 88, 276]`, no `href`, line *"Don't worry about it."* verbatim |
| 3 | Navigation path | Parlor rear doorway (Door ⑦, baked into the shell, never glows) → `/back-hall` → stairs `/rooms` (open) · curtain (shut). Two taps is the approved maximum depth and the **only** approved exception to one-tap |
| 4 | Casino UI / game code | **None anywhere** |
| 5 | Old blackjack/slots code | **None.** No dead branch, no stub, no retired module |
| 6 | Old specs | They describe **blackjack and slots specifically**, not generic games: `03 §13`–`§16`, `04 §11`, `09 §11`–`§12`, `02 §7`, `14 §4`, `16 §13` P10 |
| 7 | Reusable wager infrastructure | **Yes, substantially** — see §B |
| 8 | Underground room shell | **No registry row exists.** `zone_back_hall_shell` and the three `zone_room_shell_*` entries exist at `320x569`; there is no `zone_underground_*` slug |
| 9 | Migrations anticipating casino | **None.** `drizzle/0000`–`0018`; `16 §5` records `casino_*` as *removed and deferred to Phase 10* |
| 10 | Text still claiming G1 unresolved | **Yes, four places** — see §A.3 |

### A.2 The contradiction the ruling resolves, and the loser

`CLAUDE.md` requires a material contradiction be reported rather than silently resolved.
It was reported in **G1** and it is now settled:

| Source | Says | Status |
|---|---|---|
| `03 §14`, `04 §11`, `09 §12`, `16 §13` P10 | The launch games are **blackjack and slots** | **WINS** — confirmed by the 2026-08-11 ruling |
| Reopening brief, 2026-08-09 | *"avoid building slots, roulette, blackjack clone, poker"*; *"prefer a small number of meaningful league-native games"* | **LOSES.** Superseded for the Underground only |

The 2026-08-09 brief is not wholly overturned: its *"league-native games"* preference
still describes the three wagering families in `16 §9`, which are built and live in the
Slice. What is overturned is its instruction not to build blackjack and slots.

**G1's three preconditions, re-evaluated against the ruling:**

1. *"A ruling on whether the Phase 10 games stand"* — **satisfied.**
2. *"A season, or at least twelve team-weeks, for anything settled from football"* —
   **no longer applicable.** This was G1's strongest argument and it was about *football*
   wagers. A blackjack hand settles from a shuffled deck in the same request; it needs no
   week, no finalization, and no `week_finalizations` row. **This is the substantive
   change the ruling makes**: the casino is buildable now in a way Tony's Line is not.
3. *"An economy simulation for whatever wagering is added, on the same footing as the
   box's price"* — **still binding, still unmet.** See §E.

G1's remaining argument — *"building it early costs the reveal"* (`18 §6`: a locked door
opens for everyone at once, as an announced event, and can only be spent once) — is
unaffected and is why §K.10 is a real decision.

### A.3 Documents that must be corrected when the first branch lands

Not corrected here, because a document claiming the decision is settled should land with
the code that settles it.

| File | Line | What it says |
|---|---|---|
| `docs/OPEN_ITEMS.md` | 30, 737, 745–791 | **G1** as an open decision; *"the Underground has no honest content"* |
| `lib/stats/unsupported.ts` | 247 | *"the casino… has an open decision in `docs/OPEN_ITEMS.md` **G1**"* — inside `wouldNeed` on `casino-and-collectible-history`. The entry itself stays: casino history is still not a football fact, and `unsupported.test.ts` parses `lib/db/schema.ts` and goes red the day a table it calls absent is created (`absentTables` is empty here, so adding casino tables does **not** trip it) |
| `docs/BACK_HALL_BOUNDARY.md` | §6 | *"What is actually in the Underground… not in v1"* |
| `docs/CHECKPOINT.md` | 2015, 2505, 3131 | *"the casino foundation"* as a future milestone; `back-hall-both-open` unphotographable |

---

## B. Reusable token infrastructure

### B.1 The canonical path, as it actually is

| Concern | Mechanism | Where |
|---|---|---|
| Balance lives | `season_memberships.token_balance`, one integer per manager per season | `0005` |
| Deltas written | **`apply_token_delta(...)`, a Postgres function** — the only entry point | `0005:157` |
| Non-negative | `CHECK (token_balance >= 0)` on the column | `0005:31` |
| One write path | Trigger pair: `apply_ledger_to_balance` raises a transaction-local flag for exactly its own `UPDATE`; `reject_direct_balance_write` refuses every other change | `0005:50–85` |
| Idempotent | `token_transactions.idempotency_key UNIQUE` + `ON CONFLICT DO NOTHING`; a replay returns the same id, **a key reused for a different delta raises** | `0005:202–231` |
| Audit trail | `token_transactions` append-only by trigger; `reason_code`, human `description`, `source_ref`, `actor_user_id` | `0005:95–106` |
| Closed books | The function refuses a season with `finalized_at` set (`03 §6`) | `0005:195` |
| Zero refused | `RAISE` on `amount = 0` | `0005:174` |

**Existing callers, and the pattern each contributes:**

| Caller | Contributes |
|---|---|
| `purchaseBox` (`lib/counter/boxes.ts:129`) | Debit **first**, in one transaction, so an unaffordable purchase creates nothing. The box's `grant_key` is *derived from the ledger key*, so the artefact and the debit share one identity |
| `openBox` (`:339`) | Four locks: a **transaction-scoped advisory lock on the manager**, `SELECT … FOR UPDATE` on the box, `box_openings.box_id UNIQUE`, `collectibles.source_opening_id UNIQUE`. The roll is recorded beside the table version so the outcome recomputes |
| Duplicate salvage (`:458`) | Ledger key names the **occasion** (`salvage:<boxId>`) and omits the amount, so a mid-season reprice raises instead of paying twice. `box_openings_salvage_is_paid` makes an unpaid salvage physically unwritable |
| `placeEntry` (`lib/stakes/service.ts:336`) | Same debit-first transaction, plus `isBalanceViolation` matching on **constraint name**, not message |
| `settleStake` (`:462`) | The resolution row is inserted **first**, so `stake_resolutions_one_per_stake` is what a concurrent second settlement collides with *before any token moves* |
| `weeklyRewards` (`lib/rewards/`) | No `SELECT … WHERE already_rewarded` exists anywhere — *"that is a race with a comfortable-looking body"* |
| `applyTokenDelta` wrapper (`lib/counter/tokens.ts:209`) | Holds no arithmetic and offers no way to set a balance |
| `buyBoxAction` (`app/actions/counter.ts:132`) | The client token is format-checked and **namespaced server-side** under the session user id |

### B.2 Can blackjack and slots reuse it?

**Yes, unchanged, and no new abstraction is needed.** The canonical path already provides
every guarantee `09 §12` demands of casino integrity — validated amount, sufficient-token
check, atomic bet and payout, idempotency, replay rejection, no client-authoritative
result — and it provides them in the database rather than in a service.

**Do not propose a `casino_balance`, and nothing here needs one.**

Exactly three additive changes, each with a precedent in this repository:

1. **Two `token_reason` values**, `CASINO_WAGER` and `CASINO_PAYOUT`, via
   `ALTER TYPE … ADD VALUE IF NOT EXISTS` — the change `0010` made for
   `STAKE_PLACED`/`STAKE_PAYOUT` and `0014` for `DUPLICATE_SALVAGE`. `09 §11` names *casino
   bet* and *casino payout* as distinct ledger reasons, so this is specified rather than
   chosen. Two reasons rather than one net delta is also **forced** by the function: a
   blackjack push is a net-zero movement and `apply_token_delta` refuses a zero amount.
2. **Add the corresponding two entries to `LiveTokenReason`** in `lib/counter/tokens.ts`.
3. **Extract `isBalanceViolation`.** It is already duplicated verbatim in
   `lib/counter/boxes.ts:208` and `lib/stakes/service.ts:410`. A third copy is the smell.
   Extract *that one helper* and nothing else — see §I on not building a framework.

### B.3 The four rules a casino caller inherits, and must not route around

- **Never read a balance and decide.** The `CHECK` refuses the wager; catch the constraint
  by name. `purchaseBox`'s comment is the standing rule: *"a read-then-check is a race, and
  two purchases arriving together would both pass it."*
- **Debit before the game record exists.** The wager leaves the tab in the same transaction
  that creates the hand or the spin, and the game record's key derives from the ledger key.
- **The idempotency key names the occasion and omits the amount.**
- **The open season is resolved by the caller and injected**, never looked up inside the
  service — the rule every dated or seasonal input in this project follows.

### B.4 One consequence nobody has looked at yet

`16 §8`: **the token-leader award is measured on tokens earned — the sum of positive
ledger entries.** A `CASINO_PAYOUT` is a positive ledger entry. Unless it is excluded,
the token-leader award becomes winnable by grinding slots: churn 10 tokens through a 90%
RTP machine a thousand times and you have "earned" 9,000 tokens while losing 1,000.

The award is not implemented yet, so nothing is broken today. It is surfaced as a
commissioner decision (**§K.11**) because the answer changes the schema's reporting
surface, not just a query.

---

## C. Blackjack V1 recommendation

### C.1 The ruleset

| Rule | V1 | Why |
|---|---|---|
| **Hit** | ✅ | The game |
| **Stand** | ✅ | The game |
| **Bust** | ✅ | |
| **Dealer draw** | ✅ | Dealer stands on all 17, **including soft 17 (S17)**. One rule, no soft-hand branch on the dealer side, most player-favourable of the common variants |
| **Natural blackjack** | ✅ | Ace + ten-value on the first two cards. Immediate, no player turn |
| **Push** | ✅ | Equal totals, and dealer-natural-vs-player-natural |
| **Double down** | ❌ | The one real loss. It is *additive* — one action, one extra debit key, one card, forced stand — so it is the obvious V1.1. Excluded now because it doubles maximum exposure per hand, which is an economy question the simulation has not answered |
| **Split** | ❌ | The expensive one. It turns one hand into N hands, one wager into N wagers, one settlement into N settlements. Every idempotency and payout guarantee in §G multiplies, and re-split and split-aces need their own rules. This is where a small state machine becomes a large one |
| **Surrender** | ❌ | Returns **half** a stake. Tokens are integers; an odd stake needs a rounding rule nobody wants to litigate |
| **Insurance** | ❌ **permanently** | A side bet that raises the house edge and preys on the uninformed. `16 §8`'s explicit non-goals include loss-chasing prompts. Recommend this be recorded as a decision, not a deferral |

**Deck: a freshly shuffled single 52-card deck per hand.** No shoe, no persistence between
hands, no counting to model. Each hand is independently auditable from its own stored deck.

**House edge:** with S17, 3:2 naturals, and no double/split/surrender, roughly **2.5–3%**
against a player who hits below 17 — a slow, steady sink, which is what §E wants. It also
means correct play is nearly trivial, which is exactly `03 §13`'s *"instantly
understandable"* Super Mario 64 DS direction rather than a strategy game.

### C.2 The payout arithmetic constrains the stakes

3:2 on a natural pays `stake × 1.5`. Tokens are integers. **So every stake denomination
must be even**, or the natural payout produces a fraction:

| Stake | 3:2 pays | Integral? |
|---|---|---|
| 10 | 15 | ✅ |
| 20 | 30 | ✅ |
| 25 | 37.5 | ❌ |
| 50 | 75 | ✅ |

This is why §K.2 and §K.3 are one decision in practice: the natural payout and the stake
denominations must be chosen together. If the commissioner prefers 2:1 naturals (simpler,
more generous, ~0.3% more player-favourable) the constraint disappears entirely.

### C.3 Randomness — three options, and the recommendation

| Approach | For | Against |
|---|---|---|
| **A. Crypto RNG, store the resulting deck permutation** *(recommended)* | `09 §12` requires a *"cryptographically appropriate random source"* and `lib/counter/rng.ts` already is one (`crypto.randomInt`, one override point, `Math.random` refused with a written reason). A stored 52-element permutation is self-describing: the audit does not depend on an algorithm staying frozen. Tests drive it through the existing `setRandomSource` | 52 smallints per hand. Trivial |
| **B. Seeded PRNG, store the seed** | Smaller row | The shuffle algorithm and the PRNG become **permanent** — change either and every historical hand re-derives to different cards. It also makes the seed a secret: leak it and the player knows the deck |
| **C. Commit–reveal (hash the deck at deal, reveal at settle)** | Provable fairness the *player* can verify | Solves a trust problem ten friends do not have, adds a column and a verification surface. Genuinely cheap if the commissioner wants it later — it is additive to A |

**Recommend A**, with the deck column made **immutable by trigger** the moment it is
written (the shape `stake_entries`' pick columns already use). That gives the same
guarantee commit–reveal gives, at the cost of trusting the database rather than a hash.

**The undealt deck never leaves the server.** The action returns revealed cards only. This
is the single most likely way to ship a correct engine with a fatal information leak, and
it deserves its own test (§J).

---

## D. Slots V1 recommendation

| Decision | Recommendation | Why |
|---|---|---|
| Layout | **3 reels, one payline (the centre)** | `03 §13`: instantly understandable. Multi-line slots require a bet-per-line concept and a payline diagram, which is a legend on screen |
| Symbols | **6**, Tony's Pizza themed (`03 §14`) | Enough for a readable paytable at 360px. Six symbols on three reels is 216 outcomes — small enough to enumerate the whole distribution *exactly* in a test rather than sample it |
| Paylines | **No** | See above |
| Stakes | **Two or three fixed buttons.** No free-text amount | A numeric input on a phone inside a pixel room is a web form, and a max-stake field invites grinding |
| Jackpot | **No progressive jackpot.** A fixed top prize for three-of-a-kind on the rarest symbol | A progressive is a shared mutable pot — a second balance in all but name, with its own concurrency story. A fixed top prize is a row in the paytable. If a jackpot is approved it **must be capped in tokens, not stated as a multiplier**: 1000× on a 10-token stake is 10,000 tokens, which is 50 pizza boxes and single-handedly breaks the approved `6–12 boxes per manager per season` range |
| Outcome generation | Three independent `rollBelow()` draws against a stored, **content-hash-versioned** reel strip; resolved against a stored paytable. **Store the three raw rolls and the table version** | Exactly `box_openings.roll` + `reward_table_version`. The outcome recomputes from the row, which is what makes *"was that real"* answerable without trusting the server |
| Configuration | A content-hashed, append-only versioned table — **the `reward_tables` shape**, which already carries `version UNIQUE`, `entries jsonb`, `provisional boolean` and a rewrite-refusing trigger | A rebalance writes a **new version**; every recorded spin keeps pointing at what it actually rolled against |
| Spin state | **None.** A spin is one transaction: debit, draw, resolve, credit if it won, insert the row. Atomic, no resumability required | |
| Idempotency | `slot_spins.spin_key UNIQUE`, `spin:<userId>:<clientToken>`; ledger keys derived from it | The `purchaseBox` pattern: artefact and debit share one identity |
| Animation | **Client-side, on a server-decided outcome.** The server returns three symbols; the reels spin and stop on them | `04 §11`: *"the client receives only information needed to animate the already-committed outcome"* |

**One prohibition worth writing into the component, not just the plan.** `16 §8`'s explicit
non-goals include **near-miss animations**. A reel must not be authored to stop one symbol
short of a win more often than the distribution produces it. That is a rule about the
*strip layout and the stop animation*, and it is the sort of thing that gets added later
because it "feels better".

---

## E. Economy impact

### E.1 What the casino can and cannot do to the economy

A house edge below 100% RTP makes the casino a **net token sink in expectation** — it
cannot be a faucet in aggregate. That is not the risk. The four real ones:

1. **Variance widens the box distribution.** `checkRanges` gates on the **median** boxes
   per manager-season (6–12). A casino leaves the median roughly intact while stretching
   the tails — and the tails are where legendaries are minted. **A median cannot see this
   failure**, which is why §E.3 recommends adding a spread measurement.
2. **Grind-to-zero starves the collection.** The approved economy assumes tokens go to
   boxes: ~10 boxes a season at 200 each, plus two free ones. A manager who loses their
   income at the table stops collecting, and the collection is the product.
3. **An uncapped top prize breaks the range outright** (§D).
4. **Compounding.** The manager with the most tokens can take the most variance, and can
   absorb a losing run the poorest manager cannot. This needs measuring, not assuming.

### E.2 What must be simulated before either flag flips

`16 §8` gates every economy value on the multi-season simulation, and G1's third
precondition requires the casino be held to the same footing as the box price. The gate is
`lib/economy/simulate.ts`, it runs at **50 seasons × 10 managers**, and it currently
passes 24 of 24 seeds and selects 200 for the box.

**Add a casino participation policy to `SimulationInput`, defaulting to none.**

> **This default is the requirement, not a convenience.** With the casino off, the gate's
> output must be **byte-identical** to today's. An extension that moved the approved
> numbers would re-open a price the commissioner fixed on 2026-08-04, and a gate whose
> baseline moved is a gate that proves nothing.

Three archetypes, layered onto the existing best/median/worst football profiles:

| Archetype | Behaviour |
|---|---|
| **Heavy** | Wagers a fixed fraction of every token above the box price, every week |
| **Casual** | A handful of hands or spins a week, minimum stake |
| **None** | Never enters. This must remain a first-class case — the Underground is optional |

**What to measure and report:**

| Measurement | Why |
|---|---|
| Boxes per manager-season — **median (existing gate) plus p10 and p90** | The new one. A median that holds while p90 doubles is the failure a median cannot see |
| Legendaries league-wide, derived (existing) | Already `(openings ÷ seasons) × configured rate` with a 4σ binomial tolerance — it moves on its own when throughput moves, so it needs no change |
| Tokens wagered / returned / net, per archetype per season | Confirms the sink direction empirically rather than by argument |
| Longest losing run, and **weeks spent below the box price** | Grind-to-zero, measured as *"how long was this manager unable to collect"* |
| Ratio of heavy-archetype boxes to none-archetype boxes | Compounding, in one number |

`lib/economy/catalog-sizing.ts` already models per-manager archetypes with per-week
participation and is the better host for the *behavioural* half; `simulate.ts` is the
release gate and is where the pass/fail lives. Use both, do not fork a third model — the
repository has already reconciled two rehearsal harnesses at merge once.

### E.3 The numbers this investigation deliberately does not pick

Nothing in the repository approves a stake size, a limit, an RTP or a paytable. Every one
is a commissioner decision **after** the simulation, on the same footing the box price got
(§K.2–§K.6). This document proposes none of them.

---

## F. Persistence model

### F.1 The smallest schema

**Two tables, plus one versioned config table, plus two enum values. No `casino_events`
spine, no generic `casino_rounds` abstraction over two dissimilar games, and no
duplication of the ledger as game history.**

`04 §11` recommends *"`casino_sessions` or `casino_rounds`"* plus `game_configs`. Its
`game_configs` recommendation is sound and is satisfied by the existing content-hashed
versioned-table pattern. Its single-rounds-table recommendation is **not** followed, and
the reason is the same one `16 §4.1` gives for deferring `league_events`: a spin has no
state and settles in one transaction; a hand has a turn, a resumable position and an
ordered action sequence. One table serving both would be half-null in every row and would
need a discriminator to know which half to trust.

#### `slot_spins` — fully immutable, written once

```
id · user_id · season_id · spin_key UNIQUE · stake_tokens
table_version · rolls smallint[3] · symbols text[3]
payout_tokens · wager_tx_id · payout_tx_id · created_at
```

- Append-only trigger (no UPDATE, no DELETE) — the `box_openings` guard.
- `CHECK (payout_tokens >= 0)` and `(payout_tokens > 0) = (payout_tx_id IS NOT NULL)` —
  the `box_openings_salvage_is_paid` shape: a paid spin with no ledger row is unwritable.

#### `blackjack_hands` — resumable, settles once

```
id · user_id · season_id · hand_key UNIQUE · wager_tokens
deck smallint[52]            -- the full permutation, immutable, server-only
player_cards smallint[] · dealer_cards smallint[] · step integer
status: 'player_turn' | 'settled'
outcome: 'win' | 'loss' | 'push' | 'blackjack' | null
payout_tokens · wager_tx_id · payout_tx_id
created_at · settled_at
```

Guarantees, all in the database:

| Guarantee | Mechanism |
|---|---|
| One open hand per manager, ever | **`CREATE UNIQUE INDEX … ON blackjack_hands (user_id) WHERE status <> 'settled'`** — one line answers *"opening multiple hands at once"* |
| The deck and the wager never change | Immutability trigger, `stake_entries`' pick-column shape |
| A hand settles exactly once | Settle-once trigger — settlement columns go null → value and never again (`stake_entries_settle_once`) |
| Settlement is complete or absent | `CHECK`: outcome, payout and `settled_at` all null or all set (`stake_entries_settlement_complete`) |
| A hand is never deleted | Undeletable trigger |
| A paid hand has a ledger row | `CHECK ((payout_tokens > 0) = (payout_tx_id IS NOT NULL))` |

`step` is the count of player actions taken; it is the optimistic-concurrency token (§G).

**Storing the full permutation rather than an action log** is deliberate. The hand's state
is fully determined by `(deck, actions)`, and the dealt cards *are* the action record —
anybody holding the row can check that every card came off the top of the recorded deck in
order. A separate `blackjack_actions` table would store the same information a second time.

#### Configuration

Two homes, both existing patterns, neither new machinery:

- **Stake denominations and limits → `economy_configs`.** Season-scoped, content-hashed,
  `provisional: true`, append-only, already read by `economyFor()`. Same place the box
  price lives, which is right: they compete for the same tokens.
- **The slots reel strip and paytable, and the blackjack rule version → a content-hashed
  append-only table on the `reward_tables` model.** A rebalance writes a new version;
  recorded spins keep pointing at the version they rolled against.

### F.2 What this gives, checked against the ask

| Requirement | Where it comes from |
|---|---|
| Resumability | The open hand *is* the state. Walk up to the table, the hand is there |
| Auditability | Deck + rolls + table version → outcome recomputes. `wager_tx_id`/`payout_tx_id` join to the ledger |
| Idempotency | `spin_key UNIQUE`, `hand_key UNIQUE`, the partial unique index, the settle-once trigger, `apply_token_delta`'s key |
| Truthful history | Both tables append-only; nothing rewrites an outcome |
| Enough to render current state | One row, minus the undealt deck |

---

## G. Idempotency, concurrency and security

**The two games need different idempotency mechanisms, and the repository has already
ruled on why** (ruling index, 2026-07-30): *"a token delta needs a client-supplied
idempotency key; opening a box does not. A delta is an event with no natural key; a box
opens once and has one."*

- **Creating** a spin or a hand is an event → **client-supplied token**, format-checked
  and namespaced server-side under the session user id.
- **Settling** a hand is an operation on a thing that exists → **natural key**, the hand id.

| Threat | Protection | Layer |
|---|---|---|
| Double-tapped SPIN | `spin_key UNIQUE` — the second insert conflicts and the existing spin is returned | **DB** |
| Double-tapped DEAL | `hand_key UNIQUE` + the partial unique index on open hands | **DB** |
| Double-tapped HIT | `SELECT … FOR UPDATE` on the hand serializes; the client's echoed `step` deduplicates — `step < hand.step` is a replay and returns current state unchanged, `step > hand.step` is refused | **DB lock + transaction** |
| Refresh mid-hand | The open hand is loaded and rendered. No recovery path, because nothing was lost | **App, over DB state** |
| Multiple tabs | Both see the same open hand; the `step` check means the stale tab's action is a replay, not a second card | **DB lock + transaction** |
| Retry after network loss | The client reuses the same token; every path above is a replay | **DB** |
| Concurrent spins | Serialized by a transaction-scoped **advisory lock on the manager** (`openBox`'s fourth lock) before the balance is touched | **DB** |
| Two hands at once | The partial unique index | **DB** |
| Stale client balance | Irrelevant by construction — the balance is never read and checked. The `CHECK` refuses the wager | **DB constraint** |
| Replaying an old request | `token_transactions.idempotency_key UNIQUE`; a key reused for a *different* delta **raises** rather than silently no-opping | **DB** |
| Negative balance | `CHECK (token_balance >= 0)`, caught by **constraint name** | **DB constraint** |
| Crash mid-settlement | One transaction: resolution row and both ledger movements commit together or not at all. Insert the settlement **first**, so a concurrent second settler collides before any token moves (`settleStake`'s argument) | **Transaction boundary** |
| Duplicate payout | Settle-once trigger + the payout ledger key `blackjack:payout:<handId>` | **DB** |
| Grinding / spam | Minimum interval between wagers, evaluated **inside the transaction** against the manager's last row, under the advisory lock | **App logic over DB state** |
| Client submitting card state | The action takes a hand id, a step, and nothing else. No card, no total, no outcome | **App boundary** |
| Client learning the deck | The undealt tail is stripped from every response | **App boundary — needs its own test** |

**Do not build an in-memory rate limiter.** Vercel serverless functions share no memory
between invocations, so an in-process limiter is a limiter that does nothing while looking
like a control. `lib/auth/rate-limit.ts` is the repository's answer to this and it is
*computed from stored failures, never stored* — the same shape applies here: derive the
decision from `max(created_at)` on the manager's own rows, inside the transaction. No new
table, no lock flag to get stuck on.

**No abandoned-hand cron.** A manager who deals and walks away has an open hand and a
debited wager; both are still there when they come back. `03 §16`'s anti-farming needs are
met by the limits above, and **no scheduled casino job should exist** — the two crons in
`16 §4.3` are the complete set.

---

## H. Mobile UX

Primary target **390 / 375 / 360 px, iPhone Safari, portrait**, per `MANDATE §7`.

**Both games open as a transient panel over the Underground room, in place — not at a new
route.** Two reasons, and the first is structural: `18 §5` caps Rooms and the Underground
at two taps and calls it the *only* approved exception to one-tap depth. A game at
`/underground/blackjack` is three. The precedent is the counter tray, which opens a box in
place and never navigates. The mechanism already exists: `components/scene/room-stage.tsx`
owns *which one surface is up* and `components/scene/room-panel.tsx` is the panel, both
built in the RoomDisplay pass. **Use them; do not build a second panel.**

| | Blackjack | Slots |
|---|---|---|
| Layout | Dealer row top, player row beneath, totals as plates | Three reels across one window, centre line marked |
| Actions | **Two** buttons — HIT · STAND — at thumb height, ≥44 CSS px on 360 | One stake control, one SPIN |
| Long content | A hand can exceed five cards. Cards **wrap**, they never shrink — `MANDATE §6`: *"panels adapt around readable text — text is never shrunk to fit a panel"* | Fixed |
| Type | Every string through `lib/design/type.ts` roles. `checkTypeFloor` measures the **computed** size of every rendered text node at every state and width | Same |

**Card faces are drawn from the type system, not authored as art.** Fifty-two card assets
is not a viable batch — it is more files than every collectible, wearable and room shell
in the project combined — and a card rank must be legible at 390px, which favours the type
case over a 46×46 sprite. This is the manager sprite's shapes-not-pixels decision applied
a second time.

**Avoid:** a felt-table rendering of a real casino · a modal over a modal · a persistent
chip-count bar bolted to the chrome (the balance lives on the receipt, per the 2026-07-30
ruling) · any near-miss stop animation · a "double or nothing" prompt after a loss.

---

## I. Casino room art requirements

**No art is created here and none is briefed.** This is the reservation list for a future
image-generation workstream.

### I.1 Geometry

The Underground shares the parlor's coordinate system — `ROOM`, **320 × 569** logical, one
portrait shell plus transparent overlays, `Page oneScreen`, no scroll. Every hit region
clears **44 CSS px on a 360px phone**, which is 39.1 room units.

> **Register the canvas at `320x569`.** All four existing room shells were originally
> registered at `960x1707`, copied from an entry that had never shipped a file, and
> `process-art.ts` resizes to whatever the registry says — it would have shipped a
> 3×-oversized room. `lib/rooms/objects.test.ts` pins it; the Underground's entry must not
> inherit the old mistake.

### I.2 Slots to reserve

| Slug | Role | Notes |
|---|---|---|
| `zone_underground_shell` | Scenery | The room. Dark, colourful, Nintendo-era minigame room — **not** a sportsbook (`02 §7`, `03 §13`) |
| `object_blackjack_table` | Display | Guessable before tapping. **Drawn with no cards on it** |
| `object_slot_machine` | Display | **Drawn with blank reel windows** |
| `object_door_return` | Door | Exists. Back up to the Back Hall |
| `object_door_underground_open` | Door | **Exists, registered, never shipped.** The Back Hall side, for the day it opens |
| `symbol_slots_*` × 6 | Object | Small fixed canvas, one per reel symbol. The only new art the games themselves need |

### I.3 What the art must reserve, and must never bake in

**Prepared and drawn empty** — anything painted here is covered at runtime and reads as a
bug (the six prepared places in `BATCH_E_BASEMENT_HANDOFF.md` are the precedent):

- three reel windows on the machine, blank
- a dealer area and a player area on the table, bare
- a plate or surface where the hand's result is printed

**Never in the art:** a token balance · a wager amount · a payout figure · any card face ·
any reel symbol in a window · a win/lose word · any number at all.

Inside the room, naming it a casino is fine — the reveal has happened. **On the Back Hall
side it is still forbidden**, and `backhall.test.ts` plus `checkBackHall` already fail a
build where the word reaches that page.

**Placeholder-first is approved and proven.** `/rooms` and `/back-hall` both shipped as
flat rectangles drawn from the same numbers the hit regions use, and `/rooms` now declares
which half rendered (`data-room-shell`) so the gate goes green on the better picture the
day the shell lands. Do the same here. **The room does not wait for art.**

---

## J. Test and rehearsal plan

### J.1 Deterministic unit — no database

- **Blackjack hand evaluation:** hard and soft totals · ace demotion (A,A,9 = 21) · a
  five-card hand that stays under · dealer S17 with a soft 17 · natural vs 21-in-three
  (natural wins, and this is the case everyone gets wrong) · both naturals is a push.
- **Payout arithmetic is integral for every approved stake × every outcome.** A property
  test, not three examples — this is the 3:2 constraint from §C.2.
- **Slots:** enumerate **all 216 outcomes** against the strip and assert the exact RTP as a
  rational. Not sampled. The economy-gate correction of 2026-08-10 is the standing rule —
  *assert the configuration exactly, simulate only for emergent outcomes*.
- **Table versioning:** two identical configs hash equal; one changed weight hashes
  different; a recorded roll + recorded version reproduces the recorded outcome.

### J.2 Integration — a real Postgres, the pattern the 30 M2 tests set

| Blackjack | Slots |
|---|---|
| win · loss · push · natural payout · player bust · dealer bust | win · loss · **maximum payout** |
| **double-tapped DEAL → one hand, one debit** | **duplicate spin submit → one spin, one debit** |
| **double-tapped HIT → one card** | retry with the same token → replayed, no second debit |
| retry after a lost response → same hand, same state | insufficient balance → refused, nothing written |
| refresh mid-hand → the open hand resumes | stale balance → irrelevant, the `CHECK` decides |
| insufficient balance for the wager → nothing written | **payout transaction rolled back → no spin row, no debit** |
| **duplicate settlement → one payout** | |
| **two concurrent hits → one card, no deadlock** | **two concurrent spins → serialized, both settle correctly** |
| **a second hand while one is open → refused by the partial index** | |
| a finalized season → refused by `apply_token_delta` | same |
| **the response never contains an undealt card** | the response never contains the strip |

### J.3 Visual — `npm run visual:qa`, 3 widths, existing gates

New states: `underground` (the room) · `blackjack-idle` · `blackjack-player-turn` ·
`blackjack-win` · `blackjack-loss` · `blackjack-push` · `blackjack-blackjack` ·
`slots-idle` · `slots-win` · `slots-loss` · `casino-insufficient` · a game shut by flag.

`MANDATE §8` **requires** these by name over time: *casino win / loss / push · insufficient
balance · duplicate wager · network failure and retry.* Duplicate-wager and network-retry
are `reach: 'client'` states, driven from the harness.

Existing gates apply unchanged: `checkTypeFloor` · `checkTargets` · `checkObjectMap` ·
`checkOneTransient` · `checkFocusVisible` · `checkColourFidelity` · `checkRarityContrast`
(the panel's material must carry `on-paper` — that defect has now shipped twice, on the
Collection and again on `RoomPanel`) · `driver-coverage.test.ts` so a declared state
nobody photographs fails the build.

**`back-hall-both-open` becomes photographable in this work.** `openTo()` throws today
because the flag would render a `<Link>` to a 404; the route existing is what closes it,
and `BACK_HALL_BOUNDARY §8.2` says so explicitly.

### J.4 Economy

Per §E: the three archetypes, the p10/p90 spread, the losing-run and weeks-below-price
measurements, the compounding ratio. **And one control assertion that matters more than any
of them: with the casino policy off, `checkRanges` returns exactly what it returns today,
on all 24 seeds.**

### J.5 What is *not* needed

- **No rehearsal scenario.** `lib/rehearsal/` drives the Sunday→Tuesday cron chain. The
  casino has no cron, no weekly step and no seam in that chain. `WEEK_1_REHEARSAL.md §8`'s
  rule — *write a season, do not add a fifth verb* — means the answer here is neither.

---

## K. Commissioner decisions

Ten from the brief, plus one this investigation surfaced. Nothing else is escalated.

**A note on deadlines.** Nothing here blocks V1 launch — the Underground is shut and
`docs/ACTIVATION.md`'s five human actions are unaffected. The binding date is **the day
either flag flips**, and the sensible earliest is **after week 1 pays**, because a manager
who loses their 250 opening balance in the preseason has no income until the first
Tuesday and cannot buy a 200-token box.

| # | Decision | Options | Recommendation | Consequence | Latest reasonable deadline |
|---|---|---|---|---|---|
| **1** | Blackjack V1 ruleset | (a) hit·stand·natural·push only · (b) + double · (c) + double + split | **(a)** | (b) is additive and the obvious V1.1. (c) multiplies every idempotency guarantee in §G | Before the blackjack branch starts |
| **2** | Blackjack min/max stake | Fixed denominations vs a range | **Fixed, even-numbered denominations**; values from the simulation | Odd stakes make 3:2 fractional (§C.2). A high max is the compounding risk in §E | After the simulation, before the flag |
| **3** | Natural payout | 3:2 · 2:1 · 6:5 | **3:2**, the standard, with even stakes | 2:1 removes the divisibility constraint entirely and is ~0.3% more player-favourable. **6:5 is a house-edge grab and should be refused on principle** | With #1 |
| **4** | Slots stake options | One fixed · two or three fixed · free amount | **Two or three fixed buttons** | A free amount is a web form in a pixel room and invites max-stake grinding | With #2 |
| **5** | Slots RTP and paytable | Target RTP, then a strip derived to hit it | **A target RTP; the strip is engineering.** The exact figure is the commissioner's | RTP is the sink rate. It cannot be tuned after launch without a new table version and a note to the league | After the simulation, before the flag |
| **6** | Jackpot | None · fixed top prize · progressive | **Fixed top prize, capped in tokens** | A progressive is a second balance. Any prize stated as a *multiplier* can exceed the box-range gate on one spin (§D) | With #5 |
| **7** | Play / session limits | None · minimum interval only · daily loss or play cap | **Minimum interval only** | `03 §16` requires *"session and daily loss/play monitoring"*, and a daily cap is the one casino mechanic that resembles the streaks and calendars `16 §8` bans. An interval is anti-spam; a daily cap is a schedule | Before the flag |
| **8** | Net-negative by design | Yes · neutral · deliberately generous | **Yes, explicitly** | Every other answer is either a faucet or a coin flip on whether the box economy holds. Worth stating as a ruling so no future tuning drifts past 100% | Before the simulation is run |
| **9** | Game history visible to others | Private · a summary somewhere · a feed or leaderboard | **Private in V1** | The Underground is a private vice and the Slice is where the league's shared record lives. A casino feed is a second social surface competing with it. `lib/stats/unsupported.ts` already declines a jackpot story | Before the flag |
| **10** | Both games together | Ship together · slots first | **Together** | `18 §6`: a locked door opens for everyone at once as an announced event, and the reveal can only be spent once. Opening onto one working game and one covered machine spends it on half a room. Engineering still builds them in sequence (§L) | Before the flag |
| **11** | **Casino payouts and the token-leader award** *(new — §B.4)* | Exclude casino payouts from *tokens earned* · include them · drop the award | **Exclude** | `16 §8` measures the token-leader award on the sum of positive ledger entries. A `CASINO_PAYOUT` is one, so including it makes the award grindable: churn a stake through a 90% machine a thousand times and "earn" nine thousand tokens while losing one thousand. The award is unbuilt, so nothing is broken today — but the answer changes how the ledger is queried | Before the award is built, or before the flag, whichever is first |

---

## L. Implementation workstream map

**Four workstreams, three code branches. Nothing starts without an `ACTIVE_WORK.md` claim.**

```
      ┌──────────────────────────────────────────────┐
      │ W1  Underground room + token boundary + SLOTS│  ← must merge first
      └───────────────┬──────────────────────────────┘
                      │
      ┌───────────────▼──────────┐   ┌──────────────────────┐   ┌────────────────┐
      │ W2  BLACKJACK            │   │ W3  Economy sim ext. │   │ W4  Art        │
      │     (depends on W1)      │   │     (parallel)       │   │  (parallel)    │
      └──────────────────────────┘   └──────────┬───────────┘   └────────┬───────┘
                      │                         │                        │
                      └─────────────────────────┴────────────────────────┘
                                          ▼
                              FLAGS FLIP (needs W1+W2+W3, and §K)
```

### W1 — Underground room, token boundary, and slots *(first, blocking)*

Migration: `slot_spins` · the two `token_reason` values · the casino config table.
`lib/casino/` service · one server action · `/underground` route on the room grammar with a
drawn stand-in · `object_*` geometry · `underground` + two per-game flags · extract
`isBalanceViolation` · demo states · gates.

**Slots first, and `16 §13` P10 already says so** (*"Slots, then blackjack"*). It is one
transaction with no resumability, so it proves the entire token, idempotency, concurrency
and room-integration path against the smallest possible state machine — and it makes
`back-hall-both-open` photographable.

### W2 — Blackjack *(after W1)*

Its own additive migration for `blackjack_hands` (the repository's convention is one
migration per slice, not one big one up front). The engine, the turn state machine, the
panel, the states in §J.3. Merges after W1 so it inherits the settled boundary rather than
negotiating with it.

### W3 — Economy simulation extension *(parallel with W1, merges before any flag)*

`lib/economy/simulate.ts` casino policy, defaulting off · the archetypes · the p10/p90
spread · the losing-run and compounding measurements · `docs/ECONOMY_SIMULATION.md`.
Touches no product code, so it genuinely parallelises. **It is the gate on §K.2, §K.4 and
§K.5, and no flag flips before it is green.**

### W4 — Art *(parallel, no code dependency)*

Brief `zone_underground_shell` and the object slots **to the geometry W1 fixes**, which is
the order the storeroom shell established after the alternative cost a re-aim of eight hit
regions. Six reel symbols. No card art.

### What must not happen in any of them

No third cron · no `casino_balance` · no `casino_events` spine · no change to the box
price, the rarity table, salvage, weekly rewards or any approved economy value · no
roulette (`lib/flags.ts` keeps the key permanently unopenable, including by the preview
override) · no merge into `weekly_stakes` · no Back Hall redesign · no manager-sprite work
· no real-money mechanic, purchase or cash-out of any kind.

### Relationship to weekly stakes — what is shared and what is not

**Shared, and should be:** `apply_token_delta` · the overdraft constraint-name recogniser ·
the server-side namespacing rule for client tokens · the room panel and transient owner ·
the type case.

**Not shared, deliberately:** the `weekly_stakes` table. A casino wager is not *"a claim
made in advance from verified facts, checked later against finalized ones"* — it settles
instantly, from a shuffled deck, and knows nothing about football. Putting it there would
break `weekly_stakes_line_pays_double`, the per-kind outcome trigger, the `week` column,
`fact_refs`, `allowed_numbers` and the week-finality gate, all at once. **Two things moving
tokens is not a reason to merge them.**

**Also not shared:** the Slice's validator and `lib/stats`. A casino outcome is not a
football fact, no casino sentence goes near the fact packet, and
`lib/stats/unsupported.ts`'s `casino-and-collectible-history` entry stays — with the one
sentence about G1 being open corrected.
