# The economy simulation — `16 §8`'s release gate

**Status:** built. **Nothing is approved.** Every economy value stays `provisional` until a person reads these numbers and signs off the ranges — that is what the gate is.

```bash
npx tsx scripts/simulate-economy.ts
npx tsx scripts/simulate-economy.ts --seasons=10 --seed=7 --weeks=17
```

---

## 1. What it is

`16 §8`: *"No numbers are locked. The **multi-season simulation is a Phase 3 deliverable and a release gate**, run across ≥5 fictional seasons at best/median/worst manager performance."*

It measures the rules that exist rather than a second copy of them: the token amounts come from `PROVISIONAL_ECONOMY`, the item odds from the real `standardRewardTable()`, the catalog from `catalog()`. Change a price and the simulation changes with it — there is no separate set of numbers here to drift.

**Deterministic, and that is a requirement.** A gate whose output moves between runs cannot be approved, because "the ranges" would mean whichever run somebody happened to read. Every draw comes from a seeded generator; a report is reproducible from its seed.

## 2. The one assumption, stated in one place

`16 §8` names the ranges but not the football. `PROFILES` is the assumption about what best, median and worst *mean*:

| | win rate | high-score rate |
|---|---|---|
| best | 70% | 25% |
| median | **50%** | **10%** |
| worst | 30% | 2% |

The median row is not a guess: in a ten-manager league every week has five winners, so the median manager wins half by construction, and one manager in ten posts the week's best score. Best and worst are placed either side. A reviewer who thinks a good manager wins 65% should change that table and re-run — it is deliberately the only place to disagree.

**The spending policy is "buy whenever the tab allows"** — the upper bound rather than a guess at restraint. A manager who saves is strictly below one who spends, so the ceiling answers *can the range be reached* without modelling behaviour nothing in the product observes.

## 3. What it found — 5 seasons, 10 managers, 14 weeks, seed 20260804

| Range | Target | As-built | Specified |
|---|---|---|---|
| Boxes per manager per season | 6–12 | ✗ **31.5** | ✗ **34.0** |
| Reward-bearing weeks, median | 35–55% | ✗ 57.1% | ✗ 57.1% |
| Non-weekly reward rate | ~0% | ✓ 0 | ✓ 0 |
| Legendary rate per opening | 2–4% | ✓ 2.43% | ✓ 2.24% |
| Legendaries league-wide/season | 2–3 | ✗ **8.0** | ✗ 7.8 |
| Direct grants per manager/season | 2–3 | ✗ **0.20** | ✗ 0.20 |

### The headline: boxes are roughly three times the intended rate

A median manager earns up to **550 tokens in a week** (150 for a win, 400 for the high score) against a box price of **50**. Buying is close to frictionless, so the collection fills in three seasons and legendaries arrive at **8 a season league-wide** against a target of 2–3.

The legendary *rate per opening* is inside its range at ~2.4%. **The rate is fine; the number of openings is not.** That is worth separating, because it means the reward table is not the thing to change.

Three levers exist and this document deliberately does not choose between them — that is the commissioner's call and `03 §4` names the amounts:

1. raise the box price relative to weekly income;
2. lower the weekly amounts;
3. cap boxes per week.

### Direct grants: the range describes something that does not exist

`16 §8` wants 2–3 direct item grants per manager per season. The **welcome box is the only direct grant in the product**, and it is granted once ever — so five seasons produce 0.2 per manager per season. This is a finding about scope, not a tuning failure: either grants need a source (a season-opening item, a championship ring) or the range needs revising.

### Duplicate protection changes completion, not scarcity

Running both policies is how the open question — *salvage is unbuilt and P3-gated* — becomes answerable:

| | as-built | specified |
|---|---|---|
| Managers completing 24 items in 5 seasons | 8 / 10 | **10 / 10** |
| Earliest completion | season 3 | season 1 |
| Duplicates | 1,411 / 1,648 openings | 1,502 (all salvaged) |

The specified rule completes every collection and does so far sooner. **At the current box rate both policies produce enormous duplicate volume** — roughly 86% of openings — which is the same finding as the headline seen from a different angle. Fixing the box rate shrinks the duplicate problem; it does not remove the argument for salvage, because a manager who has filled a tier still needs the roll to mean something.

## 4. What it deliberately does not do

- **It does not tune anything.** `03 §4` names 150 and 400; `16 §8` says the values are simulation-*reviewed*, not simulation-chosen. Picking new numbers here would be the gate approving itself.
- **It does not check vending prices.** The seventh range in `16 §8` derives them from box EV, and the vending machine is deferred to P7. Reporting a pass on a feature that does not exist would be worse than the gap.
- **It does not model stakes.** Tony's Line is flag-gated shut in v1 (`18 §3.4`) and bounties are rare and authored. Including a market nobody can reach would move the token curves by an amount no manager will experience.
- **It does not write anything.** No database, no config, no approval. The script prints.

## 5. How to disagree with it

In order of how much it moves the answer:

1. `PROFILES` — the football assumption.
2. `--weeks` — 14 scored weeks is the imported-season shape; a longer season pays more.
3. The spending policy in `simulate()` — currently the ceiling.
4. `--seed` — a different league. If a conclusion changes with the seed, it was never a conclusion; the ranges above are stable across the seeds tried.

## 6. Tests

`lib/economy/simulate.test.ts` asserts **properties**, not values — pinning "boxes come out at 31.5" would pin the very number under review. What it holds:

- reproducible from a seed, different on a different seed;
- **no token ever arrives outside the weekly loop** (`16 §8`'s "no daily anything, ever"), measured rather than assumed;
- it reads the prices it is given — doubling the box price roughly halves the boxes, which is what stops the simulation drifting into hard-coded numbers;
- the welcome box is granted once ever, not once a season;
- under the specified policy no owned item is ever handed over twice, and salvage happens only once a tier is exhausted;
- the gate **does not pass** on the provisional numbers, so a future green is a real change rather than a weakened check.
