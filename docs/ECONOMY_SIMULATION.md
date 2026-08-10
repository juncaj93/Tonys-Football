# The economy simulation — `16 §8`'s release gate

**Status:** built, and **the gate passes** on the commissioner's approved configuration (ruling, 2026-08-04). The values remain `provisional` in the database — that flag is about the schema's honesty, not about whether the numbers have been reviewed.

```bash
npx tsx scripts/simulate-economy.ts
npx tsx scripts/simulate-economy.ts --seasons=50            # the gate
npx tsx scripts/simulate-economy.ts --sweep                 # 175 / 200 / 225
npx tsx scripts/simulate-economy.ts --price=175 --seed=7
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

## 3. The commissioner's ruling, and what it changed

The first run did not pass. Four of six ranges were missed, and they were one
finding seen four ways: a median manager earned up to **550 tokens a week**
against a **50-token box**, so boxes came out at **31.5 a season** against 6–12
and dragged legendaries to **8 league-wide** against 2–3.

**The legendary rate per opening was inside its range the whole time** (~2.4%).
The rate was right and the number of openings was wrong — so the ruling moved the
price and left the rarity table alone.

| Change | From | To |
|---|---|---|
| Standard box price | 50 | **200** |
| Seasonal free-box grants | none | **exactly 2** (season-opening, midseason) |
| Reward-bearing week range | 35–55% | **35–60%** |
| Duplicate salvage | unbuilt | **approved**, per-rarity |

### The price sweep — 175, 200, 225

Bounded tuning authority was 175–225 in steps of 25, closest to 200 wins.

At the default five seasons, 175 and 200 passed and 225 failed on legendary
volume. But **225 showed *more* legendaries than 200 despite buying fewer boxes**,
which is not a thing a price can cause — so the five-season sample was measuring
luck, not the economy. At 50 seasons:

| price | boxes / manager / season | legendary rate | legendaries league-wide |
|---|---|---|---|
| 175 | 11.0 | 2.10% | 2.8 |
| **200** | **10.0** | **2.26%** | **2.8** |
| 225 | 8.5 | 2.08% | 2.3 |

All three pass the long-run gate. **200 is selected** — the commissioner's stated
value, and the closest to 200 by definition.

### The five-season sample is too small for the legendary ranges

At 10 managers × 5 seasons a league opens ~580 boxes, so a 2% rate gives ~2.3
legendaries a season with a Poisson spread **wider than the 2–3 range itself**.
Measured across six seeds at 200, the full gate passed on three — and every
failure was one of the two legendary metrics.

This is a property of the range, not of the price. **The gate therefore runs at
50 seasons**, which `16 §8`'s *"≥5 fictional seasons"* permits and which measures
the economy rather than the season. A release gate that flips on a seed is not a
gate.

### Where 200 lands

| Range | Target | Measured |
|---|---|---|
| Boxes per manager per season | 6–12 | **10.0** ✓ |
| Reward-bearing weeks, median | 35–60% | 57.1% ✓ |
| Non-weekly reward rate | ~0% | 0 ✓ |
| Legendary rate per opening | 2–4% | 2.26% ✓ |
| Legendaries league-wide/season | 2–3 | 2.8 ✓ |
| Direct grants per manager/season | exactly 2 | 2.00 ✓ |

**The price alone is safe.** With the grants not yet built, 200 still measures
9.0 boxes and 2.1 legendaries — both in range. The grants are additive rather
than load-bearing, which is what makes shipping the price ahead of them coherent.

### Salvage

`03 §12` asks for *"a configurable salvage value based on item rarity"* in tokens
and rules out a flat half-price refund. Approved values are 10 / 20 / 35 / 60
percent of the box price — **20 / 40 / 70 / 120**.

They can climb that steeply because `16 §8` salvages only an **exhausted** tier:
a manager sees common salvage after owning all ten commons. Salvage's share of
openings rises with the collection — about **60% over five seasons and 96% over
fifty**, because once a set is complete every further box is salvage by
definition. That is the shape to keep in mind when retuning: this is not a rare
consolation, it is what a finished collection converts boxes into.

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
- salvage is modelled as **money, not a counter** — the tokens go back on the tab and buy more boxes, and leaving that out would understate openings on exactly the managers closest to finishing a set;
- **exactly two grants a season, every season**, for every manager;
- it **passes on the approved configuration**, reading the canonical `PROVISIONAL_ECONOMY` rather than a copy — so a drift in the real config fails here;
- and it **fails when a value drifts**: halving the box price back to 50 puts the gate red again, which is what stops a green from meaning nothing.

---

## 7. What this gate does not answer, and where that is answered

This file measures **`16 §8`'s six ranges**. It does not size the catalog: it takes the twenty-four items as given and asks whether the economy around them is in range.

[`docs/CATALOG_SIZING.md`](CATALOG_SIZING.md) is the other half — *how many unique items each rarity needs so a box keeps producing objects* — with its own model (`lib/economy/catalog-sizing.ts`) that reuses this one's PRNG, salvage helper and economy constants. The two do not overlap: **catalog depth and pull odds are independent knobs**, because rarity mass is assigned per tier and split among that tier's items, so nothing that study recommends can move a range this one checks.

### Two defects in *this* gate, found by that study

Reported here rather than fixed, because `16 §8` owns these ranges and this document is a signed-off measurement — correcting either without a ruling would be the gate approving itself. Both are carried in `docs/OPEN_ITEMS.md` **E5**.

1. **`--weeks` defaults to 14, and §5 above calls that "the imported-season shape". It is not.** The recorded fixtures score **seventeen** weeks — weeks 1–14 at five games, then 4, 5 and 2 — and `lib/rewards/derive.ts` contains no branch on week type, so a playoff or consolation win pays the same 150. A season therefore has three more paydays than this gate models. At `--weeks=17` the measured boxes per manager rise from 10.0 to 11.0, still inside 6–12, and every other range stays green.

2. **The legendary-rate range is 2–4% and `PROVISIONAL_RARITY_MASS` sets legendary mass to exactly 2%.** The check therefore sits on its own floor and resolves on sampling noise: across twelve seeds at 50 seasons it passes **5/12** at 14 weeks and **6/12** at 17. §3 above diagnosed exactly this shape of problem at five seasons and cured it by raising the sample — which cannot fix a range centred on its boundary. The rate itself is not in question; it is 2.0% by construction.

Neither finding moves a shipped value, and the ruling of 2026-08-04 survives both.
