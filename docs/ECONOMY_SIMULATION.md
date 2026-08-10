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

**Restated 2026-08-10** against the corrected 17-week season and the corrected
legendary checks (§7). The numbers moved; the ruling did not.

| Range | Target | Measured |
|---|---|---|
| Boxes per manager per season | 6–12 | **11.0** ✓ |
| Reward-bearing weeks, median | 35–60% | 52.9% ✓ |
| Non-weekly reward rate | ~0% | 0 ✓ |
| Legendary mass, configured | exactly 2% | 2.000% ✓ |
| Legendary rate per opening (sampled) | 2.00% ± 0.67 (4σ, n=6,976) | 1.98% ✓ |
| Legendaries league-wide/season | 2–3 | 2.8 ✓ |
| Direct grants per manager/season | exactly 2 | 2.00 ✓ |

**The correction made the ruling stronger rather than weaker.** Re-run at 17
weeks, the sweep is no longer three passes: **175 now fails** on boxes (13.0
against 6–12) and on legendary volume (3.2 against 2–3), while 200 and 225 pass.
The band the commissioner chose from has narrowed onto the value they chose.

| price | boxes / manager / season | legendaries league-wide | |
|---|---|---|---|
| 175 | 13.0 | 3.2 | ✗ |
| **200** | **11.0** | **2.8** | ✓ |
| 225 | 10.0 | 2.7 | ✓ |

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
2. `--weeks` — **17** scored weeks, counted off the recorded fixtures and asserted against them (`SCORED_WEEKS`). It was 14, and that was wrong rather than conservative; see §7.
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

### Two defects in *this* gate — found by that study, **corrected 2026-08-10**

Both were reported and left alone at first, because `16 §8` owns these ranges. The commissioner ruled on them on 2026-08-10 and authorised exactly these two corrections, with the economy explicitly held still: *"the gate should evaluate the real economy rather than make the economy conform to a stale model."*

#### 1. The season is seventeen weeks, not fourteen

`--weeks` defaulted to 14, and §5 above called that *"the imported-season shape"*. It is not. The recorded fixtures hold paired games in **weeks 1–17** — five games a week through 14, then 4, 5 and 2 — and only week 18 is unscored. `lib/rewards/derive.ts` contains no branch on week type, deliberately, so a playoff or consolation win pays the same 150: a season has three more paydays than this gate was modelling.

`SCORED_WEEKS = 17` is now the default, and `simulate.test.ts` asserts it **against the fixture files** rather than against itself, so a return to 14 fails on the league's own record. **No reward amount was touched to compensate**, per the ruling.

What it still simplifies, stated rather than hidden: the last three weeks do not pay everybody — 8 rosters play in week 15 and 4 in week 17 — and `simulate()` models a flat league week, so it slightly **overstates** the postseason. That is the conservative direction for every range here, and the model that resolves participation properly already exists next door in `lib/economy/catalog-sizing.ts`.

#### 2. The legendary check is now two checks

The old check was *"legendary rate per opening, 2–4%"*, measured. `PROVISIONAL_RARITY_MASS` sets legendary mass to **exactly 2%**, so the range's floor sat on the true value and the check resolved on Monte Carlo noise — it passed **5 seeds in 12** at fifty seasons. §3 above diagnosed this shape of problem at five seasons and cured it only by raising the sample, which cannot fix a bound centred on the thing it is bounding.

The ruling's own preference decided the shape — *assert the configuration exactly, and use simulation only for emergent outcomes*:

| check | kind | what it catches |
|---|---|---|
| **Legendary mass, configured** — `exactly 2%` | deterministic, from the stored integer weights. No seed, no sample | a re-weighted table, an edited mass, a tier added — the real regression, caught with no possibility of a lucky pass |
| **Legendary rate per opening (sampled)** — `p ± 4σ`, `σ = sqrt(p(1−p)/n)` over the run's own openings | sampled | a **drawing** defect: the table says 2% and `drawRarity` hands out something else |

**Why 4σ, and why that is not weakening.** At the gate's own configuration — 50 seasons, 10 managers, ~7,000 openings — σ is about 0.17 percentage points, so the band is roughly **1.33% – 2.67%**. Halving the mass to 1% or raising it to 3% lands more than **five sigma** outside and fails; ordinary noise does not, at a two-sided false-failure rate of about 6 in 100,000. The band **narrows as the sample grows** — a longer run is a stricter gate, which is exactly the property the fixed range lacked. The configured 2% remains inside `16 §8`'s stated 2–4%, and check 1 pins it there exactly.

**No seed was cherry-picked and no value was tuned.** The regression tests run twenty-four fixed seeds and assert that the old predicate is *not* stable across them while both new checks are; that the deterministic check goes red on a re-weighted table; that the sampled check goes red on a result whose draw contradicts its own table; and that the band shrinks with the sample.

**No approved economy value changed.** The price, the grants, the rewards, the rarity mass and the salvage values are exactly as ruled on 2026-08-04.

#### What the correction exposed, and did not touch

Re-run at 17 weeks, the **`Legendaries league-wide per season` 2–3 range** — an *emergent* range this ruling did not authorise changing — now measures a mean of **2.78** against a ceiling of 3, and across twenty-four seeds it lands outside on **3 of 24** (it was 24/24 inside at the short season, mean 2.40). The default seed passes and the gate is deterministic, so nothing is flaky in CI. It is reported rather than adjusted, and carried in `docs/OPEN_ITEMS.md` **E6**.
