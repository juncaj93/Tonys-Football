# Catalog sizing — how many collectibles a season actually needs

**Status:** analysis and tooling, delivered 2026-08-10. **Nothing in the product changed.** No catalog entry was added, no price moved, no reward table was re-versioned, no room rule was touched. This document and the two modules behind it exist so the art backlog is decided by measurement instead of by feel.

**The question, as asked:** *across one full ten-manager season, how many unique collectibles do we need — by category and rarity — so boxes stay fun, duplicates are meaningful but not exhausting, rare items stay rare, and Alex knows exactly how much art has to be generated?*

```bash
npx tsx scripts/catalog-sizing.ts                     # the audit and every scenario
npx tsx scripts/catalog-sizing.ts --seasons=3 --seeds=40
npx tsx scripts/catalog-sizing.ts --add=common:5,rare:3
npx tsx scripts/catalog-sizing.ts --shape=15,10,4,3
npx tsx scripts/catalog-sizing.ts --json=docs/evidence/catalog-sizing/report.json
```

`docs/evidence/catalog-sizing/` holds the two runs this document quotes, both 40 leagues × 10 managers, box 200, 2 grants: `season-one.*` is the one-season question and `report.*` carries it out to three seasons. Every number below is from those files.

---

## 0. The answer in six lines

| | |
|---|---|
| Unique ordinary collectibles recommended for season one | **32** |
| Existing and usable **today** | **12** (finished art) of **24** (approved slugs) |
| Net-new **art** for season one | **20** — 12 repaints of slugs that already exist, 8 new items |
| Needed **before kickoff** (P0) | **12** — the placeholder slugs. No new items, no catalog change |
| Needed **by week 12** (P1) | **8** new items. Week 12 is when the median manager who runs out of commons runs out |
| Season two (P2) | **6** more, to 38. Not a kickoff decision |
| Championship rings | **separate, and not counted anywhere above** |

**The headline is not the count. It is the art.** The 24-item catalog is deep enough for season one; twelve of its twenty-four items have no art, and because the unpainted twelve are the *most frequently pulled* twelve, **59.5% of every box opened in season one produces the same placeholder pizza box.** That is the repetition problem in this product today, and adding items does not fix it.

---

## 1. What is actually in the catalog

Read from `art/assets.inventory.json` through `lib/counter/catalog.ts`, `lib/counter/rewards.ts`, `lib/counter/tokens.ts` and `lib/rooms/objects.ts` — `lib/economy/catalog-audit.ts` does the reading, so none of it is transcribed.

| rarity | items | with art | placeholder | share of openings | salvage |
|---|---|---|---|---|---|
| common | 10 | 3 | **7** | 60.0% | 20 |
| rare | 8 | 3 | **5** | 28.0% | 40 |
| epic | 4 | 4 | 0 | 10.0% | 70 |
| legendary | 2 | 2 | 0 | 2.0% | 120 |
| **total** | **24** | **12** | **12** | 100% | |

Every item is 46 × 46, `bottom-center`, and **every one of them is accepted by all four room slots and by the Showcase.** Nothing is seasonal, nothing expires, nothing is direct-grant-only, and no item is a system item — with one exception, in §7.

### 1.1 There are no categories, and this analysis did not invent any

`04 §10` asks a room slot to *"validate category compatibility"* and `03 §9` names five categories. **Neither is implemented, deliberately** — `lib/rooms/service.ts` carries the decision in full. A catalog entry is a slug, a name and a rarity. There is no category column in `collectibles`, none in the registry, and none in the reward table.

So the canonical answer to *"what are the current categories"* is: **rarity, and nothing else.** Two other axes exist and are worth naming precisely because they are *not* categories:

- **`systemLayer`** — earned versus pulled. One item (§7).
- **form** — what shape the object is. This is an **art-planning annotation** added by `lib/economy/catalog-audit.ts`, read by no runtime path, stored nowhere, and enforcing nothing.

| form | items | with art | common | rare | epic | legendary |
|---|---|---|---|---|---|---|
| `wall` — flat, hangs | 4 | 3 | **0** | 2 | 1 | 1 |
| `surface` — stands on a shelf or desk | 15 | 5 | 10 | 5 | 0 | 0 |
| `floor` — furniture-scaled | 5 | 4 | 0 | 1 | 3 | 1 |

Two facts fall out of that table and both are art decisions rather than code ones:

1. **Not one common is a wall item.** The room's frame is one of four slots, and the tier that supplies 60% of what a manager owns supplies nothing for it.
2. **Every `floor` item is rare or better, and the room has no floor slot.** The five most exciting objects in the catalog — the arcade cabinet, the pinball machine, the burn barrel, the sauna, the Bapple tree — are furniture, and there is nowhere in a room that furniture goes. That is a **known and accepted** consequence of the room's four curated slots (`docs/ROOMS_BOUNDARY.md`); it is recorded here because it should stop *new* floor-scale items being drawn, not because the room should change.

---

## 2. How the simulation works, and what it assumes

`lib/economy/catalog-sizing.ts`. Deterministic, database-free, imported by no page. It reuses the release gate's PRNG and salvage helper and models the same rules the product runs.

**Measured from the product:** the box price (200), the rewards (150 / 400), the opening balance (250), the two seasonal grants and the welcome box, the salvage values (20 / 40 / 70 / 120), the rarity mass (60 / 28 / 10 / 2) and `16 §8`'s opening algorithm — *roll rarity → pick an unowned item in that tier → if exhausted, salvage tokens*.

**Assumed, in exactly two places:**

### 2.1 The season is seventeen scored weeks, not fourteen

Counted off the recorded fixtures, and asserted by `catalog-sizing.test.ts` against those files:

| weeks | paired games | managers playing |
|---|---|---|
| 1–14 | 5 | 10 |
| 15 | 4 | 8 |
| 16 | 5 | 10 |
| 17 | 2 | 4 |
| 18 | 0 | — unscored |

It matters because **a playoff or consolation win pays exactly like a regular one** — `lib/rewards/derive.ts` has no branch on week type, deliberately, since `03 §4` prices a matchup win once and does not qualify it. Three extra paydays is roughly one and a half extra boxes a season. Who sits out is the one inferred part: week 15's absentees are modelled as byes for the top two seeds and week 17's as everyone outside the top four, which reproduces the recorded game counts exactly.

### 2.2 Five archetypes, and the league's books balance

`simulate.ts` uses three profiles because `16 §8` names three. Sizing needs the middle resolved more finely, because "median" covering eight of ten seats hides the spread that decides how much depth is enough.

| archetype | seats | win rate | high-score rate |
|---|---|---|---|
| elite | 1 | 72% | 22% |
| strong | 2 | 62% | 14% |
| average | 4 | 50% | 9.5% |
| weak | 2 | 38% | 4.5% |
| dire | 1 | 28% | 3% |

**These are not free parameters.** Every week has five winners and exactly one high score, so across the roster the win rates must average 0.5 and the high-score rates must sum to 1.0. They do, a test fails if an edit breaks either, and the model allocates winners and the high score **without replacement** — so a simulated week pays exactly what a real week pays. The release gate flips independent coins per manager, which is fine for its question and would quietly invent tokens for this one.

The spending policy is the gate's: buy whenever the tab allows. It is the ceiling, and a manager who saves is strictly below it.

---

## 3. The finding the rest of this rests on

**Catalog depth and pull odds are independent knobs.**

`standardRewardTable()` assigns mass **per rarity** and divides it evenly among that tier's items. Adding a common changes *which* object comes out of a common pull; it does not change *how often* a common pull happens. So:

- a sizing decision **cannot** disturb the approved rarity curve — a legendary stays exactly 2%, whatever the catalog holds;
- until a tier runs out, **two different catalog sizes are the same experience**. `catalog-sizing.test.ts` proves it by running two catalogs deep enough that nothing exhausts and asserting the openings and the week-by-week unique counts are identical.

That is why every scenario below shows the *same* collection pace — 5 items by week 4, 8 by week 8, 13 by season end — and differs only in **completion percentage** and **when the box stops handing over objects**.

It also reframes what a duplicate is. Since the 2026-08-04 ruling there is no such thing as being handed a second coffee mug: a duplicate is **a box that paid tokens instead of an object**. Everything below calls that the *no-object rate*.

---

## 4. The scenarios

40 leagues × 10 managers, three seasons, box 200. Median manager unless stated.

### 4.1 Shipped — 24 = 10 / 8 / 4 / 2

| | week 4 | week 8 | week 12 | week 14 | season end |
|---|---|---|---|---|---|
| unique owned (p10 / med / p90) | 4 / 5 / 7 | 5 / 8 / 12 | 7 / 10 / 15 | 8 / 11 / 16 | 8 / **13** / 17 |
| completion, median | 21% | 33% | 42% | 46% | **54%** |
| **no-object rate** | 0.0% | 0.3% | 1.6% | 2.8% | **5.0%** |
| managers who have hit it | 0% | 2% | 9% | 14% | **24%** |

Season two is where it gives way: **25.9% of openings pay tokens by the end of season two, and 82% of managers have hit the wall.** The commons tier — 60% of every pull — is exhausted for the median manager by **week 4 of season two**; **29% get there inside season one**, and among those the median week is **12**.

### 4.2 The three candidates

| | shipped 24 | P0 24 painted | **P1 32** = 15/10/4/3 | P2 38 = 18/12/5/3 |
|---|---|---|---|---|
| no-object rate, S1 end | 5.0% | 5.0% | **0.5%** | 0.1% |
| managers hit, S1 end | 24% | 24% | **4%** | 0% |
| no-object rate, S2 end | 25.9% | 25.9% | **10.2%** | 4.5% |
| completion, S1 end | 54% | 54% | **41%** | 34% |
| completion, S2 end | 79% | 79% | **72%** | 63% |
| collection with real art, S1 | 40% | **100%** | **100%** | 100% |
| holds a wall item, week 8 | 65% | **84%** | **95%** | 95% |
| new art required | — | 12 | **20** | 26 |

### 4.3 What "healthy" was taken to mean

Stated so it can be disagreed with in one place:

| | test | shipped 24 | P1 32 |
|---|---|---|---|
| H1 | season one never turns a box into tokens for the ordinary manager — ≤1% at season end | ✗ 5.0% | ✓ 0.5% |
| H2 | season two stays majority-object — ≤15% at season end | ✗ 25.9% | ✓ 10.2% |
| H3 | completion is a multi-season arc, not a chore — 35–55% at S1 end, 65–85% at S2 end | ✓ | ✓ |
| H4 | every room slot has something to put in it — ≥80% hold a wall item by week 8 | ✗ 65% | ✓ 95% |
| H5 | a legendary pull is not predictable — ≥3 legendaries | ✗ 2 | ✓ 3 |
| H6 | the art is not the same picture twice — 100% of a collection painted | ✗ 40% | ✓ 100% |

**H6 is the one that is failed worst and costs the least to fix**, and it is failed by the catalog that exists rather than by any proposed one.

---

## 5. Rarity distribution — the counts are deliberately unequal, and here is the proof

The question was *"do we need equal counts per category? Probably not — prove it."*

Divide each tier's share of openings by the number of items in it, and you get **how often one specific object appears**:

| rarity | share | items | per item | items in P1 | per item |
|---|---|---|---|---|---|
| common | 60% | 10 | **6.0%** | 15 | 4.0% |
| rare | 28% | 8 | 3.5% | 10 | 2.8% |
| epic | 10% | 4 | 2.5% | 4 | 2.5% |
| legendary | 2% | 2 | **1.0%** | 3 | 0.7% |

One common sprite is seen **six times as often** as one legendary sprite. Depth therefore has to track the tier's share, not the tier's prestige: equal counts would exhaust the common tier six times sooner than the legendary tier while spending the same art budget on both.

Two floors override the pure maths:

- **Legendary is a variety problem, not a pace problem.** A manager pulls 0.3 legendaries a season, so two would last a decade. But with exactly two, a legendary pull is a coin flip between two known objects — and half of them is the framed jersey. **Three is the minimum for the moment to be a surprise.** This is the one recommendation the simulation does not make on its own; the pull maths is indifferent and the product is not.
- **Epic stays at four.** 2.5% per item, exhausted by 4% of managers in season one, and all four are already painted. Adding epics is the least valuable art in the catalog.

---

## 6. Collection pace and completion, by archetype

Unique items held, median, shipped catalog. Pace is identical for every catalog size (§3), so this table is the collection curve for **all** the scenarios.

| archetype | week 4 | week 8 | week 12 | week 14 | season end | of 24 | of 32 |
|---|---|---|---|---|---|---|---|
| elite | 6.5 | 11.0 | 14.0 | 15.0 | **16.5** | 69% | 52% |
| strong | 6.0 | 10.0 | 12.0 | 14.0 | 15.0 | 62% | 47% |
| average | 5.0 | 8.0 | 10.5 | 12.0 | 13.0 | 54% | 41% |
| weak | 4.0 | 7.0 | 8.0 | 9.0 | 10.0 | 42% | 31% |
| dire | 4.0 | 6.0 | 7.0 | 8.0 | **8.0** | 33% | 25% |

**The tradeoff, made explicit.** At 24 items the best manager finishes season one at 69% and the league's median completion is 88% by the end of season three — a set essentially finished after thirty months, with every box beyond it paying tokens. At 32 the median is 84% at the same point and the elite manager is at 18.5 of 32 after one season, so there is still something to chase in the product's third year. The cost is that nobody sees a full Collection screen for a long time.

For a private ten-person league, the second shape is the better one — but it is a **taste** decision and it belongs to the commissioner. The simulation's contribution is that neither shape changes how much a manager *gets*; it changes only what fraction of a wall of names they have filled in.

**No archetype is starved.** The dire manager still opens five boxes and ends season one with eight distinct objects, because the two seasonal grants and the welcome box are unconditional. That is the ruling working as intended.

---

## 7. System collectibles, reported separately

| slug | rarity | source | in boxes | in sizing | on the shelf |
|---|---|---|---|---|---|
| `item_championship_ring` | legendary | verified title, `lib/counter/rings.ts` | **no** | **no** | **no** — its own rail |

The ring is `systemLayer: true`, which excludes it from `catalog()` and therefore from the reward table, the reveal pool, duplicate salvage and every demo applier at once. It is **not** one of the two legendaries; the legendary tier holds the Bapple tree and the framed signed jersey. `place()` refuses it, and it is drawn on the pennant rail rather than in a slot.

**Do not let a ring be counted as catalog depth.** It has one art file — the season year is text at runtime, so one asset serves every championship forever — and that asset is still a placeholder. Painting it is a separate, small, non-loot art item; it is listed in the backlog as such.

Wearables (`wear_*`, twelve of them) are also **not** collectibles. The commissioner's ruling of 2026-07-31 is explicit: a pizza box awards `collectible_*`, character equipment uses `wear_*`, and crossover rewards are not approved. They are excluded from every number in this document.

---

## 8. Room-display implications

The room has four curated slots — `shelf_left`, `shelf_right`, `wall` (a picture frame), `bench` (the desk) — plus a derived championship rail and the Showcase's single case. **All four accept all twenty-four items**, so nothing here is a validation gap. The gap is what a manager has that *looks* right in each.

| | supply | a median manager, week 8 |
|---|---|---|
| the two shelf places | 15 surface items | ~5 to choose from |
| the desk | 15 surface items | ~5 to choose from |
| **the frame** | **4 wall items, none common** | **65% chance of owning one at all** |
| the rail | derived — 2 of 10 managers | not a choice |

Over half the league has nothing for the frame in the opening month — the chance of holding a wall item is **47% at week 4** and 65% at week 8. Two fixes, and the cheap one is enough on its own:

1. **Free:** brief `collectible_paper_menu` — already a placeholder, already approved, common — as a **menu board that hangs**. One common wall item, no new slug, no catalog change. Week 8 coverage 65% → **84%**.
2. **P1:** three of the five new commons drawn as wall items. Week 8 coverage → **95%**.

**Do not add category validation.** `lib/rooms/service.ts` argues it out and the argument holds: every collectible is drawn from the same 46 × 46 sprite, so a rule that refused a pizza cutter in the frame would be invisible and would only ever generate refusals. The right lever is supply.

---

## 9. Economy tuning

The brief asked for this to stay separate from catalog sizing, and it does — a catalog problem is not fixed by moving a price.

| knob | value | verdict | why |
|---|---|---|---|
| Standard box price | 200 | **KEEP** | The gate passes. Under the corrected 17-week season it measures 11 boxes a manager a season, still inside 6–12 |
| Seasonal free boxes | 2 | **KEEP** | They are what keeps the dire manager collecting — 5 openings and 8 objects with a 28% win rate |
| Weekly rewards | 150 / 400 | **KEEP** | Named by `03 §4`. Not this study's to move |
| Rarity mass | 60 / 28 / 10 / 2 | **KEEP** | Legendary rate per opening is exactly 2%, mid-range and independent of catalog size |
| Purchase cadence | buy-when-affordable | **KEEP** | Nothing in the product observes restraint; the ceiling is the right model |
| **Duplicate salvage** | 20 / 40 / 70 / 120 | **MONITOR** | A common spare returns **10% of the box price**, and commons are 60% of pulls. Harmless in season one (0.5% of openings under P1); by season two at the shipped catalog it is one box in four. Watch it, and if it needs a change, change the **catalog** first |
| **Gate season length** | 14 weeks | **TUNE — commissioner** | `scripts/simulate-economy.ts` defaults to 14. The recorded seasons score **17**, and playoff wins pay. At `--weeks=17` every range stays green except the one below |
| **Gate legendary-rate range** | 2–4% | **TUNE — commissioner** | The floor **equals the configured mass exactly**, so the check passes on noise. Measured across twelve seeds at 50 seasons: **5/12 pass at 14 weeks, 6/12 at 17.** More seasons cannot fix a range centred on its boundary |

The last two are defects in the **release gate**, not in the economy, and they were found by this study rather than caused by it. They are reported rather than fixed: `16 §8` owns those ranges and `docs/ECONOMY_SIMULATION.md` is a signed-off measurement. Changing either without a ruling would be the gate approving itself.

---

## 10. The art backlog

Existing usable = a slug with a real file. Everything else draws `placeholder_pizza_box`.

| rarity | form | existing usable | recommended S1 | new art | priority |
|---|---|---|---|---|---|
| common | surface | 3 | 12 | 7 repaint + 2 new | **P0** / P1 |
| common | wall | 0 | 3 | 1 rebrief + 2 new | **P0** / P1 |
| rare | surface | 3 | 7 | 4 repaint + 1 new | **P0** / P1 |
| rare | wall | 2 | 3 | 1 repaint + 1 new | **P0** / P1 |
| epic | any | 4 | 4 | **0** | — |
| legendary | wall | 1 | 2 | 1 new | P1 |
| legendary | floor | 1 | 1 | 0 | — |
| **total** | | **12** | **32** | **20** | |
| *system* | | *0* | *1 ring* | *1* | *P1* |

### Batches

| batch | what | count | deadline | why that deadline |
|---|---|---|---|---|
| **P0** | The **7 unpainted commons**, `collectible_paper_menu` rebriefed to hang | 7 | **kickoff** | These seven are **42% of every opening**. Nothing else in the product returns as much per sprite |
| **P0** | The **5 unpainted rares** | 5 | **kickoff** | A further 17.5% of openings. With P0 done, a collection is 100% painted |
| **P1** | 5 commons, 2 rares, 1 legendary — **8 new items**, 5 of them wall | 8 | **week 12** | Not kickoff. Week 12 of season one is when the median manager who exhausts the common tier exhausts it, and the shipped catalog is still handing over objects 95% of the time until then |
| **P1** | `item_championship_ring` | 1 | before the first title is awarded | Not loot. Counted separately |
| **P2** | 3 commons, 2 rares, 1 epic — to 38 | 6 | offseason | Holds season two's no-object rate near 4% |

**What may stay a placeholder through kickoff:** with P0 delivered, nothing. If P0 has to be cut, cut from the back — the five rares before any common, and never the reverse, because a common sprite is seen 1.7× as often as a rare one.

`docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` is the generation brief: subjects, slugs, rarities, forms and the prompt structure, ready to paste.

---

## 11. What is implemented, what is a recommendation, what depends on art

| | |
|---|---|
| **Implemented** | The 24-item catalog, the rarity mass, the opening algorithm, salvage, the two grants, the price, the four room slots taking anything, the ring's exclusion. `lib/economy/catalog-audit.ts`, `lib/economy/catalog-sizing.ts` and `scripts/catalog-sizing.ts` are new and are analysis-only |
| **Simulation recommendation, awaiting a ruling** | Growing the catalog 24 → 32 → 38. **`CATALOG_SIZE` is asserted at 24 and no code here changes it.** Adding an item is a registry row plus that constant plus a new reward-table version; every opening already recorded keeps pointing at the table it rolled against |
| **Future art dependency** | All 20 pieces in §10. None of it blocks anything: every unpainted slug already resolves to `placeholder_pizza_box`, which is why P0 is an improvement rather than a fix |
| **Reported, not acted on** | The two gate defects in §9, and the form/floor mismatch in §1.1 |

---

## 12. Reproducing and extending this

`scripts/catalog-sizing.ts` takes the question directly:

```bash
npx tsx scripts/catalog-sizing.ts --add=common:5            # five more commons
npx tsx scripts/catalog-sizing.ts --shape=15,10,4,3         # an exact catalog
npx tsx scripts/catalog-sizing.ts --price=175 --seasons=4   # a different economy
npx tsx scripts/catalog-sizing.ts --seeds=100               # tighter bounds
```

Nothing has to be rewritten to ask a new question, and nothing it does touches a database, a bundle or a config. To disagree with the answer, change one of these, in this order of how much it moves the result:

1. `ARCHETYPES` and `LEAGUE_ROSTER` — the football.
2. `SEASON_SHAPE` — but it is checked against the recorded fixtures, so change the league first.
3. The spending policy in `runLeague` — currently the ceiling.
4. `--seeds` — if a conclusion moves with the seed count it was never a conclusion. Everything above is stable from 24 seeds to 40.

`lib/economy/catalog-sizing.test.ts` and `lib/economy/catalog-audit.test.ts` hold 28 properties, including the two that stop this from drifting into fiction: the season shape is asserted **against the fixture files**, and the archetype ladder is asserted to pay out exactly what a ten-manager week pays out.
