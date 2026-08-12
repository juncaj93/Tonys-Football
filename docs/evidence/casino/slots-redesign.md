# Slots redesign — Phase 3, under the 2026-08-11 rulings

Buttons **5 / 10 / 20** (Ruling 1) · top prize **20×**, 400 tokens at the largest button (Ruling 2) · return rate re-derived toward **≈92%** (Ruling 3) · blackjack untouched (Ruling 4).

## 1. The strip

`crust 24 · pepperoni 21 · mushroom 18 · olive 15 · slice 12 · tony 10` out of 100, identical across all three candidates, so the comparison isolates the return rate.

It is flatter at the rare end than Phase 2. On the old strip the top prize landed **1 in 2,915 spins**, which a regular player would meet once every 5.7 seasons — a top prize the league never sees. It is now **1 in 1,000**.

## 2. Candidate paytables

| | pair pays (crust→tony) | triple pays (crust→tony) | RTP | Hit rate | Payout ≥ wager | True win (>1×) | Top prize | Volatility |
|---|---|---|---|---|---|---|---|---|
| **D · ≈90%** | 1/1/1/2/2/2 | 7/10/11/13/16/20 | **90.54%** | 47.30% | 47.30% | 15.74% | 20× @ 1 in 1,000 | 1.925 |
| **E · ≈92%** | 1/1/1/2/2/2 | 8/10/11/13/17/20 | **92.09%** | 47.30% | 47.30% | 15.74% | 20× @ 1 in 1,000 | 1.986 |
| **F · ≈93%** | 1/1/1/2/2/2 | 8/10/12/14/17/20 | **93.01%** | 47.30% | 47.30% | 15.74% | 20× @ 1 in 1,000 | 2.038 |

*Payout ≥ wager equals the hit rate because no combination in any candidate pays less than the stake — a win that returns half a wager is a loss wearing a win's animation, and `16 §8` refuses that class of mechanic.*

### Expected token loss per spin

| Candidate | 5 tokens | 10 tokens | 20 tokens | Spins per box lost (at 10) |
|---|---|---|---|---|
| D · ≈90% | 0.473 | 0.946 | 1.892 | 211 |
| E · ≈92% | 0.395 | 0.791 | 1.581 | 253 |
| F · ≈93% | 0.349 | 0.699 | 1.397 | 286 |

### Coherence, checked rather than reviewed

| Candidate | Probability space sums to 1 | Rarer pays more | Pair < triple | Integer & ≥ stake | Unique top prize | Inside the 400 cap |
|---|---|---|---|---|---|---|
| D · ≈90% | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| E · ≈92% | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| F · ≈93% | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Every candidate is clean. The full outcome enumeration for the recommendation:

| Combination | Probability | Pays | Contribution |
|---|---|---|---|
| three tony | 0.1000% | 20× | 2.000% |
| three slice | 0.1728% | 17× | 2.938% |
| three olive | 0.3375% | 13× | 4.387% |
| three mushroom | 0.5832% | 11× | 6.415% |
| three pepperoni | 0.9261% | 10× | 9.261% |
| three crust | 1.3824% | 8× | 11.059% |
| two olive | 5.7375% | 2× | 11.475% |
| two slice | 3.8016% | 2× | 7.603% |
| two tony | 2.7000% | 2× | 5.400% |
| two crust | 13.1328% | 1× | 13.133% |
| two pepperoni | 10.4517% | 1× | 10.452% |
| two mushroom | 7.9704% | 1× | 7.970% |
| *nothing* | 52.7040% | 0 | — |
| **total** | **100.0000%** | | **92.094%** |

## 3. Full-season simulation

50 seasons · 10 managers · 17 weeks · box 200 · slots at the 10-token button · blackjack at 40 · 75% of plays are spins · managers gamble before buying and reserve nothing.

### D · ≈90% — RTP 90.54%

| Archetype | Boxes/season p10 · med · p90 | Items after S1 (mean, 50 leagues) | Ending balance p10 · med · p90 | Casino net | Strongest mgr | Weakest mgr | Gate |
|---|---|---|---|---|---|---|---|
| none (0/wk) | 6.0 · **11.0** · 18.0 | **13.3** / 24 | 87 · 120 · 180 | +0 | 20.5 | 6.0 | PASS |
| casual (8/wk) | 6.0 · **11.0** · 18.0 | **12.9** / 24 | 20 · 95 · 172 | -50,040 | 20.6 | 5.7 | PASS |
| regular (40/wk) | 4.0 · **9.0** · 17.1 | **11.6** / 24 | 0 · 110 · 190 | -196,370 | 18.0 | 4.2 | PASS |
| heavy (150/wk) | 1.0 · **6.0** · 14.0 | **9.3** / 24 | 0 · 0 · 90 | -453,730 | 12.0 | 3.3 | PASS |

### E · ≈92% — RTP 92.09%

| Archetype | Boxes/season p10 · med · p90 | Items after S1 (mean, 50 leagues) | Ending balance p10 · med · p90 | Casino net | Strongest mgr | Weakest mgr | Gate |
|---|---|---|---|---|---|---|---|
| none (0/wk) | 6.0 · **11.0** · 18.0 | **13.3** / 24 | 87 · 120 · 180 | +0 | 20.5 | 6.0 | PASS |
| casual (8/wk) | 5.0 · **11.0** · 18.0 | **12.8** / 24 | 0 · 140 · 161 | -57,890 | 19.7 | 5.2 | PASS |
| regular (40/wk) | 3.0 · **9.5** · 17.0 | **11.7** / 24 | 0 · 10 · 162 | -175,760 | 18.7 | 3.5 | PASS |
| heavy (150/wk) | 1.9 · **7.0** · 15.0 | **9.7** / 24 | 0 · 0 · 61 | -364,270 | 13.1 | 3.6 | PASS |

### F · ≈93% — RTP 93.01%

| Archetype | Boxes/season p10 · med · p90 | Items after S1 (mean, 50 leagues) | Ending balance p10 · med · p90 | Casino net | Strongest mgr | Weakest mgr | Gate |
|---|---|---|---|---|---|---|---|
| none (0/wk) | 6.0 · **11.0** · 18.0 | **13.3** / 24 | 87 · 120 · 180 | +0 | 20.5 | 6.0 | PASS |
| casual (8/wk) | 5.0 · **11.0** · 18.0 | **13.0** / 24 | 27 · 105 · 144 | -44,250 | 19.9 | 5.5 | PASS |
| regular (40/wk) | 4.0 · **10.0** · 18.0 | **11.8** / 24 | 0 · 40 · 160 | -165,800 | 19.1 | 4.2 | PASS |
| heavy (150/wk) | 2.0 · **7.0** · 16.0 | **9.9** / 24 | 0 · 65 · 150 | -343,970 | 14.2 | 3.7 | PASS |

## 4. The tradeoff Ruling 3 asked to see

Regular play is the case that decides it — the cadence an ordinary interested manager reaches.

| Candidate | RTP | Regular: boxes/season | Regular: items after S1 | Heavy: boxes/season | Heavy: items after S1 | League net drain / season | Gate at heavy |
|---|---|---|---|---|---|---|---|
| **D · ≈90%** | 90.54% | 9.0 | 11.6 / 24 | 6.0 | 9.3 / 24 | 3,927 | PASS |
| **E · ≈92%** | 92.09% | 9.5 | 11.7 / 24 | 7.0 | 9.7 / 24 | 3,515 | PASS |
| **F · ≈93%** | 93.01% | 10.0 | 11.8 / 24 | 7.0 | 9.9 / 24 | 3,316 | PASS |
| *no casino* | — | 11.0 | 13.3 / 24 | 11.0 | 13.3 / 24 | 0 | PASS |

## 5. The recommendation across all three buttons

E · ≈92%, regular cadence, at each approved button.

| Button | Expected loss/spin | Boxes/season | Items after S1 | Top payout |
|---|---|---|---|---|
| 5 | 0.395 | **10.0** | 12.2 / 24 | 100 |
| 10 | 0.791 | **9.5** | 11.7 / 24 | 200 |
| 20 | 1.581 | **8.0** | 11.4 / 24 | 400 |

