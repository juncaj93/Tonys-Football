# Tony's Line and Tony's Chalkboard — the canonical account

**Commissioner rulings, 2026-08-12.** Fourteen of them, following the
investigation in `docs/evidence/line-and-call/report.md`. Three product changes
and one editorial one:

1. **Tony's Line becomes personal** — a team-total line set for one manager, and
   only that manager may take a side on it.
2. **Tony's weekly-high prediction is retired** and replaced by **Tony's
   Chalkboard**, a rotating league-wide proposition the league **watches** rather
   than wagers on.
3. **A playoff-period issue may sound like one**, without inventing a bracket.

Read with `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md §9` (the stakes system),
`PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md §3.4` (where the market lives), and
`docs/SLICE_RESTRAINT_BOUNDARY.md` (which opened the flag).

---

## 1. The line is now about you

### The formula, whole

```
  n      = that manager's own prior publishable team-weeks
  weight = n / (n + 4)
  line   = weight · median(their scores) + (1 − weight) · median(the league's)
  line   = that, floored to the point and hung on the half
```

`lib/stakes/facts.ts` — `personalLineCents`. Candidate C of the investigation,
the exact deterministic formulation that was measured. Every input is a stored
finalized team score: **no projection, no ADP, no external ranking, no
player-level data, no model, no AI.**

Two details are load-bearing and neither is arbitrary.

- **The shrinkage is what makes an early line honest.** At three of a manager's
  own games the league still carries more than half the number, at eight it is a
  third, and by the end of a season it is a fifth. A raw personal median at n=3
  would be one bad Sunday away from a number nobody recognises.
- **Every line ends `.50`.** A line on a whole point can be landed on exactly, and
  `weekly_stakes_line_pays_double` would then have to pay or refund a result that
  is neither over nor under. Hanging it on the half makes settlement strictly one
  side, always.

`middle()` averages the two middles of an even sample and is **deliberately not**
`lowerMedian`, whose own header argues that a published number should be a score
somebody really posted. That argument does not apply here — the half-point hook
means the line was never going to be one — and the ruling is to ship the
formulation that was measured.

### Where it starts, and what it refuses

`MIN_OWN_TEAM_WEEKS = 3`, which puts the first line in **week four** — the
commissioner's *"available beginning around Week 4"*. Below the floor the manager
gets **no line**, not a league-median one wearing their name.

A week with nobody above the floor reports `thin-basis`, the same word the
league-wide version reported for the same condition, so the Tuesday job's log
reads unchanged.

### How it behaves on the league's real seasons

Measured across every publishable team-week of 2024 and 2025:

| | |
|---|---|
| **48.5%** | of managers cleared their own line — 98 over, 104 under |
| **0–6** | the full range of the explainer's count, well distributed |

Neither side is the obvious bet, and it is not a coin-flip *by construction* the
way a league median is — it is a coin flip **about that manager**.

### The one sentence of context

> *"You've cleared this number in 4 of your last 6."*

`LINE_CONTEXT`, filled from counts **frozen into the stake's terms at authoring**
and validated with the claim. Recomputing at render time would let a later week
quietly restate the context of a bet already placed, and
`weekly_stakes_terms_immutable` exists to stop exactly that.

The window is six, or **everything they have** when that is fewer, and the
sentence is **absent** rather than padded when there is nothing to count. Nothing
about the shrinkage, the weight, the word *median* or the word *percentile*
reaches a manager: the formula is the product's business, the number and whether
they have been beating it are theirs.

### Ownership is an authorization boundary, not a display condition

A week now authors **up to ten `TONYS_LINE` rows**, one per seat, each with
`eligible_user_ids` of exactly one. `stakeKeyFor` gained an optional `rosterId`
that appends `-r{n}`, so ten rows a week fit under the existing
`stake_key UNIQUE` untouched. **No new stake kind was created**, which the ruling
asks for explicitly.

Three layers refuse another manager, and the last one is the one that matters:

| | |
|---|---|
| the surface | `chalkboardFor` selects the manager's **own** line and shows no other |
| the service | `placeEntry` returns `not_eligible` for anybody off the snapshot |
| **the database** | `stake_entries_only_the_offered_may_enter` (`0019`) |

The trigger is written as *"you may only enter a stake you were offered"* — about
**eligibility**, not about the kind. That rule is true of a bounty and a
chalkboard too; they simply carry the whole league in the snapshot. Writing it as
*"a `TONYS_LINE` row must have one eligible user"* would encode today's product
shape into the database and break the day a league-wide market is offered again.

It is the shape `0006` uses for the Showcase, for the same reason: a foreign key
can say *"that stake exists"* and cannot say *"that stake is yours"*.

### The resolver moved with it

`resolveLine` used to count the whole field — *"3 cleared it, 5 did not"*. Against
a number set for one manager those counts are true and irrelevant. It now settles
against **the manager whose line it is**, and a test holds the subject's score
constant while inverting the rest of the league to prove the outcome does not
move.

Two pushes, both of which return the stake:

- the subject landed **exactly** on the number — which the half-point hook makes
  arithmetically impossible, so the branch exists and cannot fire;
- the subject had **no publishable game**. Settled as a push rather than refused,
  because a manager has already spent the stake and leaving the row open holds
  their tokens against a week that will never produce an answer.

The second is what `board-line-push` now photographs. The state used to be *"a
team landing exactly on the line"*, which was reachable while the line was a
league median and is not any more.

### Nothing about the economy moved

Ruling 3, checked against the merged code: the wager is still ten tokens, the
payout is still 2× enforced by `weekly_stakes_line_pays_double`, settlement still
happens on the Tuesday the week closes, every movement still goes through
`apply_token_delta` with a key derived from the stake, and `payMarket` was not
touched — it already settled each entry against **that entry's own manager's**
team, which is why a personal line needed no change there at all.

---

## 2. Tony's Chalkboard

### What it replaces, and why

The old `nobody-clears-record` asked whether anybody would beat the season's best
score. That number is by construction one almost nobody clears, so the call was
easy — and it asked the same question the weekly-high reward, the weekly-high
Slice story and the bounty all already answer.

`leader-holds` and `bottom-club-loses` went with it. They are supportable and
they are **about a manager**, and the Chalkboard is one shared call the league
watches together.

All three stay in `VARIANTS`, keep their resolvers and keep their copy, because a
variant is **stored on the row** and a historical stake has to go on meaning what
it meant. `RETIRED_CHALKBOARD_VARIANTS` names them and `CHALKBOARD_VARIANTS` does
not, and a test asserts that nothing authors one.

### The library — four families

`lib/stakes/propositions.ts`. Both halves of a family — the one that chooses the
number and the one that later says whether it happened — live **next to each
other**, which is the only structural decision in the file. Everywhere else in
this package authoring and resolution are split, and that split is right for the
line and the bounty because they have one shape each. With four families it is
the thing that drifts: a threshold defined as *strictly above* in one file and
*at or above* in the other is a settlement nobody can argue with and everybody
disagrees with.

| Family | The question | The number | History? |
|---|---|---|---|
| `anybody-breaks` | *Anybody putting up {n} this week?* | the **96th percentile** of prior team-weeks | yes |
| `photo-finish` | *A game finishing inside {n} this week?* | **10.00 points**, flat | **no** |
| `half-over` | *{teams} teams over {n} this week?* | the **median** of prior team-weeks, against **half the field** | yes |
| `a-hiding` | *Somebody winning by more than {n} this week?* | **45.00 points**, flat | **no** |

Four rather than the six measured, which is Ruling 7's *"smallest clean library
necessary"* applied rather than quoted. The two left out are approved and unbuilt,
and both were dropped for how they **read** rather than for how they measured:
*the league total* asks about a combined figure near 1,200 that no manager has any
feel for, and *everybody clears the floor* has a double-negative affirmative —
*yes, nobody went below*. Adding either later is one array entry and a copy row.

Every family resolves from ordinary finalized matchup data through `WeekResult`,
which has already applied the publication boundary. **No schedule persistence, no
NFL player data, no projections, no trade or bench data, no playoff state.**

### The calibration had to be re-derived, and that is the finding

**Three of the investigation's four settings do not hold in the product**, and the
reason is a defect in the measurement rather than in the families.
`scripts/line-lab.ts` read stored scores directly, so it measured **ten-team
weeks**. Everything downstream of `publishableWeek` sees **eight**: one manager in
the 2024/2025 archive is not an eligible seat, so one game a week is dropped whole
before any number is taken.

Fewer games is fewer chances at a close one and fewer scores to clear a threshold:

| Family | investigation reported | through the real pipeline |
|---|---|---|
| `anybody-breaks`, 96th | 53% | 47% |
| `photo-finish`, 6 points | 47% | **35%** |
| four teams over the 60th | 53% | **23%** |
| `a-hiding`, 50 points | 50% | 44% |

A 23% call is not an uncertain question — it is Tony being wrong three times in
four. So each knob was swept again against `WeekResult` itself, which is the
verified, publication-bounded sample the product settles from:

| Family | shipped setting | YES rate on 2024–25 |
|---|---|---|
| `anybody-breaks` | 96th percentile | **47%** (14/30) |
| `photo-finish` | 10.00 points | **53%** (18/34) |
| `half-over` | median, half the field | **53%** (16/30) |
| `a-hiding` | 45.00 points | **53%** (18/34) |

Under the rotation, across both full real seasons: **18 of 34, 53%.**

Not exactly 50.0%, and chasing that would be the fake precision the ruling warns
against — 47–53% over thirty-odd real weeks is inside the noise of the sample it
was measured on.

`percentileOf` is **nearest-rank on the real sample**, never an interpolation, so
the number Tony writes up is a team-week somebody in this league actually posted.

### One family counts, and a count has to know how big the field is

*"Do four teams clear the number"* is 53% against an eight-team week and about
**83%** against a ten-team one, because four of ten clearing a median is far
likelier than four of eight. The archive is eight-team and **2026 will be ten**,
so a fixed four would have shipped calibrated and arrived easy.

The count is therefore **half the field**, derived at authoring from the basis's
own `teamWeeks / basisWeeks` — a stored fact, not a guess — and printed as the
number it came out as. Half the field clearing the median of everything played so
far is ~50% by construction at any field size, which is the same structural
argument `16 §9` makes for the line itself.

A field too small to halve is refused rather than asked: *"one team over the
median"* is not a call.

### The rotation

The library is an ordered list and the week chooses where in it to start:
`(week − 1) % 4`. Deterministic, reproducible, and *"why did Tony say that"* has
an answer shorter than a hash — **it is that week's turn**.

The old header argued against a seeded pick for exactly this reason and the
argument survives; what changed is that four comparable families make priority
arbitrary where three unequal ones made it meaningful.

From the starting point it walks the list and takes the first family that can be
calibrated honestly. `MIN_PROP_BASIS_WEEKS = 2`, so the first two Tuesdays of a
season can price neither percentile and the two flat-margin families are the only
ones that build — **which is what Ruling 7 preserves them for**. `lastVariant` is
moved to the back rather than removed: if the repeat is the only family that can
be built, it is built.

### Tony's side, and Tony's record

He backs the affirmative, every time. The generator phrases each question so that
*yes* is the call, and the board reads:

> **Four teams over 130.90 this week? Tony says yes.**

**Nothing anywhere says he always backs his own question.** A board explaining
that has told the reader the call carries no information. The investigation
measured the alternative — a mean-reversion rule that "calls the correction" — at
32–36%, which is a landlord who is wrong twice as often as he is right.

The record is `tonyRecordFor`, counted straight off `stake_resolutions` with **no
separate tracking table**, which is possible only because he backs the affirmative:
`hit` therefore means *the proposition happened* and *Tony was right* at once, so
one column answers both. Finalized outcomes only, by construction — a row exists
in `stake_resolutions` exactly when `resolveStake` accepted a final week.

`MIN_RECORDED_CALLS = 3`. *"Tony's been right 1 of 1 this year"* is not a
fabricated record and it is not a record either; it is a coincidence with a
denominator. Below the floor the sentence is **absent**, not zeroed.

### Watch-only

Ruling 6. No `PickSide`, no YES/NO wagering, no second token stake, no second
settlement economy. Every authored chalkboard row carries a null `stakeTokens`
and a null `rewardTokens`, and `BoardEntry` checks **the kind as well as the
price** — they say different things. A null price is a property of how the row is
authored today; the kind is the *rule*, and a future authoring change that put a
price on a chalkboard row would otherwise quietly grow a second market.

A test walks every board state and asserts no prediction anywhere can pick.

---

## 3. A playoff issue may sound like one

The simulation lab photographed the week-16 paper printing

> *"An ordinary week, and Tony prints those the same as the other kind."*

over a semifinal decided by **0.42 points**. Significance scoring looked at the
margins and found nothing loud. The margins were right; the sentence was wrong —
in December the smallness of a game is the story.

`EditionCharacter` gains **`postseason`**, from `packet.weekType`, which is
`fantasy_matchups.week_type` as Sleeper stored it at import. Deterministic,
already in the packet, already on the dateline. **Nothing new is persisted and
nothing is inferred** — no `playoff_bracket` table, no bracket persistence, no
elimination story.

It is applied **only where the alternative is `ordinary`**. `title`, `record` and
`loud` are already louder and already right, so a coarse context signal is not
allowed to overwrite a derived one.

It is coarse on purpose: regular-season issue versus playoff-period issue, and
nothing else. It does not know which round it is, who is eliminated, who advanced,
or what is at stake — `docs/OPEN_ITEMS.md` **E7** records that `playoff_week_start`
and a round count are not persisted, and the ruling forbids both inferring them
and storing them. The three column lines say none of those words, and a test
scans for seven of them.

The headline size stays at the middle step, like an ordinary week: the signal
changes Tony's **voice**, not how loud the news was, and setting a low-margin
semifinal at championship size would be a component overruling the significance
layer. The masthead gains a flag — *The postseason* — which names the period and
not the round.

---

## 4. What the simulations show

`npm run simulate -- all`, three scenarios through the real crons.
`docs/evidence/slice-simulation/`.

- **Preseason** — no line at all (nobody has played), and the first chalkboard
  question sits open for week 2.
- **Week 8** — ten personal lines from 104.50 to 133.50, explainers ranging from
  1 of 6 to 6 of 6, and seven settled chalkboard calls.
- **Week 16** — ten lines, sixteen chalkboard questions across four families, and
  the paper's character is `postseason` rather than `ordinary`.

### Two observations recorded rather than repaired

- **Every explainer in the week-16 report reads `6 of 6`.** That is the
  **fixture**, not the formula: `WEEK_16_SCRIPT` builds its regular season from a
  fixed per-roster strength with a small deterministic wobble, so a manager's
  scores cluster tightly and a line pulled toward the league sits under all of
  them. The same code on the league's real 2024 and 2025 seasons produces the full
  0-to-6 spread and a 48.5% over rate. The investigation recorded the same fixture
  property when it refused to price lines against the simulated season.
- **Week 1 is never authored.** The Tuesday job authors `week + 1`, so the
  earliest stake any season carries is week 2's — for the line and the bounty as
  well as the chalkboard. Pre-existing, unrelated to these rulings, and visible now
  only because the cold-start families made week 1 a question worth asking about.
  Not changed here.

---

## 5. The gate, and a baseline that had to be run

Every gate is green at the head this shipped from: typecheck, lint, **2,043
tests against a real Postgres**, a production build, and `npm run visual:qa` at
**126 states × 3 widths**.

It took four sweeps, and the third one is worth recording rather than quietly
re-running. It failed on **3** quarantined React `#418` hydration errors against
a ceiling of 2 — and the same commit then swept clean at **0**, with
`origin/main` swept in the identical container in between at **1**.

| Build | Sightings | Result |
|---|---|---|
| branch `3029bac` | 0 | passed |
| **`origin/main` `1692a14`** | 1 | passed |
| branch `130d37d`, run 1 | **3** | failed |
| branch `130d37d`, run 2 | 0 | passed |

**A deterministic mismatch cannot produce 3 and then 0**, and the two branch
builds differ by two display strings and a test selector. `docs/VISUAL_DEBT.md`
carries the table and the reasoning; the ceiling was **not** raised, which the
ruling forbade explicitly.

The baseline was run rather than argued about, because this branch already got
that inference wrong once: `docs/SLICE_RESTRAINT_BOUNDARY.md §5` is a
plausible-story failure on the same gate, where the distribution really was
scattered and the cause really was mine.

### One gate did break, and it was the right kind of break

Renaming the parlor panel took three visual states down on a thirty-second
timeout: the driver reached the object by matching its label, `/prediction/i`.
Loud, immediate, and still the wrong coupling — a gate's job is to open the
object, not to hold its copy still. It now uses `data-room-object`, the id
`objects.ts` assigns and `roomObjectAttributes` writes onto every trigger in the
room. The Back Hall's chain check paid for the other half of that lesson: it
matched a Tailwind class, where *"no chain found"* is the **passing** answer.

---

## 6. What did not change

- **The economy.** Stake, payout, settlement timing, `apply_token_delta`, every
  idempotency key and every constraint.
- **`Edition`'s shape or hash.** `postseason` is a new value of an existing field
  on the *render*, and `characterOf` is not part of `canonical()`.
- **The approval chain.** The cron still ends at `submit`, and publication still
  requires a recorded approval naming a person.
- **The crons.** Two, as `16 §4.3` allows. Step 5's comment was corrected because
  it still said the flag was shut.
- **The restraint work.** The board stays out of the weekly paper,
  `Edition.scoreboard` stays intact as data, and the preseason review stays one
  expandable grade board.
- **The catalog, the art, the rooms, the sprite, the Underground, the casino.**
  Nothing.
- **`docs/ACTIVATION.md`.** All five human actions are unmoved.
