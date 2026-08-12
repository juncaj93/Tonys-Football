# V1 collectible catalog — candidate board, round 2

**Status:** curation only, 2026-08-12. **Nothing implemented, no art generated, no
catalog modified, no rename, no PR.** Round 1 is
[`CATALOG_CURATION_PROPOSAL.md`](CATALOG_CURATION_PROPOSAL.md) — its structural and
safety findings are commissioner-accepted and are not restated here.

**Rulings applied.** Manager-representation quotas are removed as an axis entirely —
no item is scored, flagged or demoted because of who else appears in the catalog.
Finished art no longer protects an item. Category C (generic pizzeria filler) is
eliminated aggressively; category B (Tony's parlor lore) is protected. Bapple brand
approved. Cottage Inn identity approved with the silhouette carrying recognition.
Feasel is withdrawn pending commissioner lore.

---

## 0. Two things this pass found that round 1 missed

Both are **real, verified league data already committed to this repository**, and
neither had ever been read as collectible lore.

### 0.1 The team-name archive — and it is being lost

`fixtures/sleeper/league/*/users.json` holds every manager's team name for 2024,
2025 and 2026. `docs/DATA_AUDIT.md §127` records that **the application never stores
seasonal team names and Sleeper overwrites them on rename** — so these strings survive
in the committed fixtures and nowhere else. This is literally league archaeology.

| Manager | 2024 | 2025 | 2026 |
|---|---|---|---|
| Alex | **Cadillac of Novi HR** *(championship season)* | Juncer's Hog Formation | Juncer's Hog Formation |
| Cheese | **Jimmy and the Crown Vics** | **Jimmy and the Crown Vics** | **Jimmy and the Crown Vics** |
| Matt Lee | **Oil Money** | **Oil Money** | **Oil Money** |
| Matty B | The Coop Kupp Klan | SmittyWerbnjägermanjensn | SmittyWerbnjägermanjensn |
| Nathan | CTE Ambassador | Ooo decisions, decisions | Ooo decisions, decisions |
| Nick | Corny and Horny | God Hates Jags | God Hates Jags |
| RonJonathan | **Freddy's Balls** | Fantastic Sloppy | Fantastic Sloppy |
| Brandon *(imbrickedup22)* | Freakbob | Saquon my Chubb | Saquon my Chubb |
| Joe | Damardiac Arrest | *(see §5.6)* | *(see §5.6)* |
| Berardo | **Injury Prone** *(his only season, then exiled)* | — | — |
| Topouzian *(Tupaz11)* | — | Ceedeez Nuts | — |

**Three names survived all three seasons unchanged** — Cheese's Crown Vics, Matt Lee's
Oil Money, and Alex's Hog Formation from 2025. A name somebody kept for three years is
the strongest available evidence that a joke stuck.

### 0.2 The player-nickname archive — Alex priced his own roster

`rosters.json` carries per-player nicknames. Alex has **about thirty of them, stable
across all three seasons.** Two patterns dominate:

**He put his players up for sale, with prices.** `For sale: $8 FAAB` ·
`For sale: $6 FAAB` · `For sale: $3 FAAB` · `New starting RB for sale`. His roster is
a used-car lot, and his championship-season team name was *Cadillac of Novi HR*. This
is the single best-evidenced joke in the whole archive and round 1 missed it
completely — I proposed a generic napkin for the trade joke when the real artifact was
sitting in the data.

**Six of his nicknames are about Joe.** `Joe's biggest regret` · `I know Joe wants
this kid` · `Joe's 13th Reason Why` · `The one that got away from Joe` ·
`Joe's wet dream` · `Joe actually got this`.

And one piece of genuine archaeology: **`Berardo's worst nightmare` is still on Alex's
2026 roster** — two seasons after Berardo was exiled. The Berardo File was already a
lock; this is the receipt for it.

**Roster 4's nicknames outlived three different owners.** The same fixed set —
`D Flop`, `Dust`, `Waste`, `Retire Already?`, `Kareem Punt`, `It's Not Your Fault` —
appears on the slot held by Berardo in 2024, the Topouzian account in 2025 and Zack in
2026. `14 §13`'s shared-slot mythology is *literally true in the data*: the slot kept
its opinions while the people changed.

---

## 1. LOCKS

Seventeen items that unquestionably deserve a launch slot.

| # | Display name | Rarity | Lore | The joke, in one sentence | 23×23 readability | Art |
|---|---|---|---|---|---|---|
| 1 | **The Bapple Tree** | legendary | League | A houseplant bearing Busch Light Apple cans as fruit, presented completely straight. | **Strong** — tree silhouette, red cans against green. Proven, it is painted | **YES** |
| 2 | **The Topouzian Jersey** | legendary | League | A framed jersey with a signature nobody can read, and two brothers who both claim it. | **Strong** — jersey shape inside a frame. Proven, it is painted | **YES** |
| 3 | **The Portable Sauna** | epic | League | Brandon's barrel sauna, whose existence is funnier than any explanation of it. | **Strong** — barrel with a door. Proven | **YES** |
| 4 | **The Burn Barrel** | epic | Tony | Where failed trade offers, retired takes and Tony's old receipts go. | **Strong** — flames read instantly | **YES** |
| 5 | **Tony's Neon Sign** | epic | Tony | The parlor's own sign, glowing, off the wall and into your basement. | **Strong** — emissive, highest contrast object in the catalog | **YES** |
| 6 | **McDonald's Cookie Bag** | rare | League | Joe's cookie tote, arches and all. | **Strong** — bag silhouette plus the arches as a pure shape | **YES** |
| 7 | **The Reddi-wip** | rare | League | Joe's other one. | **Adequate** — aerosol can with an angled nozzle; the nozzle is what separates it from a beer can | **YES** |
| 8 | **Clooner** | rare | League | A novelty fish on a plaque that sings one line: *Farmingtonnn, Farmington Hillllls.* | **Strong** — widest silhouette in the catalog, fish on a board | **YES** |
| 9 | **Freddy's Bowl** | rare | League | Brandon's golden doodle has a bowl in Tony's basement, name stencilled on the side. | **Adequate** — a low wide bowl; the stencil is texture, the shape carries it | no |
| 10 | **The Berardo File** | rare | League | A sealed folder with the name blacked out; the mystery is the joke, and *Berardo's worst nightmare* is still on Alex's roster two years later. | **Strong, with a condition** — see §4 | no |
| 11 | **Cottage Inn Bag** | rare | League | The insulated delivery bag he dropped on his way in, still asking where Brandon is. | **Strong, with a condition** — see §4 | no |
| 12 | **Join the Revolution** | rare | Tony | A campaign nobody remembers the origin of, still taped to a wall. | **Strong, with a condition** — see §4 | no |
| 13 | **A Single Bapple** | common | League | One can. Not the tree. | **Strong** — the tree's own can, drawn once, at full size | no |
| 14 | **Freddy's Tennis Ball** | common | League | Chewed flat, one seam gone. | **Strong** — a sphere is unmistakable; the flattening is what makes it *his* | no |
| 15 | **The Snapped Controller** | common | League | A controller snapped and taped back together after a game that did not go well. | **Strong** — controller outline is one of the most recognizable shapes there is | no |
| 16 | **Tony's Token** | common | Tony | Tony's own wordmark, stamped in brass, in your hand. | **Adequate** — a disc; it is small and round and that is all it needs to be | **YES** |
| 17 | **Tony's Receipt Spike** | common | Tony | The receipts Tony keeps on everybody, on the spike he keeps them on. | **Strong** — vertical spike with a fan of paper; nothing else in the catalog looks like it | no |

**Every rarity above is the slot's existing assignment.** Nothing was moved.

---

## 2. STRONG CANDIDATES

Good enough for V1, replaceable if better lore arrives.

| Display name | Rarity | Lore | Why it is not a lock |
|---|---|---|---|
| **The Corner Cabinet** *(arcade cabinet)* | epic | Tony | Weakest personality of any item here. It earns the slot on **silhouette** — the tallest, most instantly readable outline in the catalog — and on `06 §10` naming it an interactive parlor prop. Painted. An epic slot is only 2.5% of openings, which makes it the least valuable place to spend a new joke |
| **Tony's Menu Board** | common | Tony | Concept is right — it is the parlor's own board and it hangs, which the room needs. **The briefed art is weak at 23px** (see §4) and needs a stronger interior before it is locked |
| **"For Sale: $3 FAAB"** | common | League | **New in round 2, and it replaces "Trade Offer, Declined".** A neon-orange used-car windshield starburst, stuck to the glass. Alex genuinely priced his own players in FAAB on his roster and named his championship team *Cadillac of Novi HR*. Better joke, better evidence, and a **far** better silhouette than the napkin it replaces — nothing else in the catalog is a starburst. Needs one line of confirmation (§5.1) |
| **The Crown Vic** *(or the Dealer Keyring)* | common | League | **The object is undecided, the lore is not.** *Jimmy and the Crown Vics* is the only team name in the league that survived all three seasons unchanged, and Cheese's canon is the Cadillac of Novi job he dislikes. A die-cast Crown Victoria reads far better at 23px than a keyring does (§4). Brand-adjacent — the ex-police sedan **shape** carries it with no badge, exactly as the Cottage Inn ruling asks. Needs the object choice settled (§5.2) |
| **Checkered Tablecloth** | common | Tony/filler | On the block per the ruling, and it survives this round on two arguments: it is the **only soft-goods silhouette** in twenty-four objects, and red-checkered cloth is the single strongest visual shorthand for "this came from a pizzeria." It is painted. **If one good common joke arrives, this is the slot** |

---

## 3. CHOPPING BLOCK

| Item | Rarity | Verdict | Why |
|---|---|---|---|
| **The Diner Mug** | common | **CUT** | Pure category C. A white mug with a stripe references nothing, belongs to nobody, and is the most-seen tier in the game. It occupies a slot **only** because it is painted, which the ruling explicitly says is not a reason. The art stays in the repo, unwired, for later reuse |
| **"Trade Offer, Declined"** *(napkin)* | common | **CUT — replaced, not lost** | My round-1 proposal, withdrawn on its own merits. At 23px it is a pale blob with grey marks, indistinguishable from the menu board, the poster and the file. The joke it was reaching for is better served by **"For Sale: $3 FAAB"**, which is grounded in verified roster data instead of a generic trading premise |
| **Feasel Fables, Vol. 1** | rare | **WITHDRAWN** | Per ruling. It was an object invented to represent a joke rather than an artifact from one. Slot marked **NEEDS COMMISSIONER LORE**. No replacement Feasel concept is proposed and none should be invented |
| **Checkered Tablecloth** | common | **REPLACE-FIRST, not cut** | Listed here because the ruling put it here. Argued in §2 — it is the only soft object and the strongest pizzeria shorthand available. First to go when a joke arrives |
| *(already cut in round 1)* | | | Parmesan shaker · squeeze bottle · napkin dispenser · booth cushion · pizza cutter · lava lamp · CRT television · pinball machine. All were placeholders with no art; cutting them cost nothing |

**Nothing on this list is here because a manager already appears elsewhere.** That axis
was removed entirely. Brandon-associated items in the proposed 24 — the sauna, Freddy's
bowl, Freddy's tennis ball, the Cottage Inn bag, and possibly the snapped controller —
are **five**, and not one of them is flagged, downgraded or scored for it.

---

## 4. The tiny-art test

> *At 23×23 with no readable text, will the player know what physical object this is?*

**The catalog has a silhouette-collision problem and it is the main structural finding
of this round.** Six proposed items are "flat pale rectangle": the menu board, the
napkin, the Berardo file, the revolution poster, the Feasel zine and the framed jersey.
At thumbnail size they compete with each other, not just with legibility.

Cutting the napkin and withdrawing the zine takes it from six to four, which is
survivable — but each survivor now has to be **drawn to differ**, and that is an art
instruction, not a curation one.

| Item | Verdict | The condition |
|---|---|---|
| **Berardo File** | **PASS, conditional** | It must be **manila**, not paper-white — a warm tan against the poster's and menu's pale grounds is what separates them at 23px. The folder **tab** must break the rectangle's top edge, and the redaction must be a hard high-contrast **bar**, not a smudge. Three shapes: tab, bar, corner of a photo showing. Do not rely on the bar reading as "redacted" — rely on it reading as *a black bar on a folder* |
| **Join the Revolution** | **PASS, conditional** | **The raised fist is the subject and the lettering is texture.** A fist silhouette in high contrast is readable at 23px; the words are not and must never be load-bearing. This is the only one of the four rectangles with a strong interior *shape*, which is why it passes most comfortably |
| **Tony's Menu Board** | **WEAK as briefed — needs a stronger interior** | "A board with a nail and a curled corner" is a pale rectangle. Recommendation: give it **one big pizza-slice graphic** at the top with hand-lettering below as texture. Then it reads as *the board with the slice on it* rather than as paper. Without that change it is the weakest passing item in the catalog |
| **Dealer Keyring** | **FAIL as briefed** | A ring plus a fob plus a tag is three thin elements at sub-pixel weight. Either draw it as the **big plastic dealer key tag** (a solid diamond of colour with a metal ring at one corner — one bold shape, one small one), or take the Crown Vic instead. **Do not draw a keyring** |
| **"For Sale: $3 FAAB"** *(replacement)* | **PASS** | A neon-orange starburst is the most distinctive silhouette added in either round and collides with nothing else in the catalog. The price is the display name's job, not the art's |
| **The Crown Vic** | **PASS** | A car in profile is one of the most legible small silhouettes available, and the ex-police sedan proportions carry it with no badge and no lettering |
| **The Reddi-wip** | **PASS, painted** | Noted only because the aerosol nozzle is the sole thing separating it from A Single Bapple's can shape at thumbnail size. Both are painted or will be; the nozzle must stay pronounced |
| **A Single Bapple** | **PASS** | Red can, white label band, blue crest. It is the tree's own fruit at full size, so it inherits a silhouette that already works |
| Everything else in §1 | **PASS** | Tree, jersey-in-frame, barrel, neon sign, bag, aerosol, fish-on-plaque, dog bowl, ball, controller, token, spike |

---

## 5. Open lore opportunities

**These are discovery prompts, not slots that need filling.** No lore is invented below.
Each entry is the *smallest useful question* — the one whose answer would immediately
produce an artifact.

### 5.1 Alex — the strongest unmined vein in the archive

His roster is priced like a used-car lot and his championship team was named after
Cheese's hated dealership job.

> **Q1.** Is *"For sale: $8 FAAB"* the joke I think it is — that you put your whole
> roster on the lot every year — and is a **neon-orange windshield price starburst** the
> object? One line: yes / no / it is actually about something else.

Also unmined: the six nicknames about Joe, the Juncer Score, the FIFA misses.

> **Q2.** Six of your player nicknames are about Joe wanting somebody. Is there a
> *specific* player Joe never got that the group still brings up — and is there a
> physical thing attached to it?

### 5.2 Cheese — the object, not the joke, is undecided

*Jimmy and the Crown Vics* is the only team name that survived all three seasons.

> **Q3.** Crown Vic or dealer key tag — and **who is Jimmy?** If Jimmy is a person or a
> specific car, that changes what gets drawn.

### 5.3 Nathan — nothing yet, and one live thread

Canon gives him collector energy and the Joe rivalry, neither of which is an object.
His roster carries *"Blind them w/ your veneers"*.

> **Q4.** Is *veneers* a real recurring joke about somebody, and is there an object —
> a whitening tray, a dental mirror, a mouthguard? If not, say so and Nathan simply
> does not get one, which is fine.

### 5.4 Matty B — the thinnest lore in the league

Canon is *quiet competence*, which actively resists objecthood. He is the 2025
champion, and the championship ring already exists as a separate system item.

> **Q5.** *SmittyWerbnjägermanjensn* survived two seasons as his team name. Is that the
> Matty B joke, or is there something else? A tombstone would carry it visually but
> depends on unreadable lettering — is there a different object?

### 5.5 Matt Lee — one durable name, one unusable joke

*Oil Money* survived all three seasons. The restricted adult joke is not eligible for a
Showcase-visible surface under `16 §310`.

> **Q6.** What is *Oil Money*? If it is a specific purchase, car, chain, jacket or
> object, that is the artifact and it is a good one.

### 5.6 Content in the archive that is not proposed, stated once

The fixtures also contain team names and player nicknames that are crude, edgy or —
in at least one case — about a real criminal case involving minors. Naming them
plainly rather than quietly omitting them: `Epsteins YoungHoe Island` (Joe, 2025–26),
`Osama bin Hampton` and `Actual Terrorist` (Nathan), `Corny and Horny` (Nick, 2024),
`Ceedeez Nuts` (Topouzian, 2025), `Saquon my Chubb` (Brandon), `Shoot His Other Leg`
(roster 4).

**None is proposed as a collectible.** The Showcase is visible to the whole league and a
collectible is permanent and undeletable by design. That is a product-surface
observation, not a judgement about the group chat — **the call is the commissioner's**,
and if any of these should become an artifact, say which and it will be treated like
any other lore.

### 5.7 Other veins worth one question each

> **Q7 — the no-kicker rule.** The league runs defenses and no kickers. Is that an
> old joke with a story behind it? *"The last kicker"* — a single retired kicking shoe
> or a tee under glass — would be a strong common if it is.

> **Q8 — the 2025 season nobody got over.** RonJonathan finished **11–3 with the most
> points in the league and no ring**; Joe finished **3–11 with the most points against**.
> Those are the two most complain-worthy seasons in the archive. Is there an object
> attached to either — something thrown, broken, worn as a punishment, or paid?

> **Q9 — league punishments.** Round 1 asked this and it is still the single highest-value
> unanswered question, because a punishment object is *automatically* funny, physical
> and instantly recognized. Is there one?

> **Q10 — draft night.** Brandon hosts. Is there an object that is always there, always
> ruined, or always argued about?

### 5.8 A contradiction to report before any of this is attributed

**Two files in the repository disagree about who three managers are.**
`content/managers.md` maps `RonJonathan → Ryan`, `imbrickedup22 → Brandon`,
`jfletcher433 → Joe` as settled fact. `content/counter-greetings.md` says those exact
accounts are *"not confidently mapped"* and explicitly declines to guess, warning that
`complainer` and `no_trades` lines *"must land on the right person or the joke is
simply wrong about someone."*

The archive suggests the mapping may be wrong. `RonJonathan`'s 2024 team name is
**Freddy's Balls**, and canon `14 §17` says Freddy is **Brandon's** dog. `RonJonathan`'s
2025 season — best record, most points, no ring — is the most complain-worthy season on
record, and *complainer* is Brandon's canon tag. One of Alex's player nicknames is
**"Ron's Death Sentence"**.

> **Q11.** Is `RonJonathan` Ryan or Brandon? This is not a collectible question — it
> decides whose dog, whose sauna and whose broken controller these are, and it should be
> settled before any lore is attributed on a permanent surface.

**Not resolved here.** Per `CLAUDE.md`, material contradictions get reported, not
quietly picked.

---

## 6. The current top 24

Using only what is known today. **LOCK** = ship it · **PROVISIONAL** = right concept,
one open detail · **REPLACE-FIRST** = the slot to take when better lore arrives.

### Legendary (2)

| Slot ID | Name | Status | Art |
|---|---|---|---|
| `collectible_bapple_tree` | The Bapple Tree | **LOCK** | YES |
| `collectible_signed_jersey_legend` | The Topouzian Jersey | **LOCK** | YES |

### Epic (4)

| Slot ID | Name | Status | Art |
|---|---|---|---|
| `collectible_portable_sauna` | The Portable Sauna | **LOCK** | YES |
| `collectible_burn_barrel` | The Burn Barrel | **LOCK** | YES |
| `collectible_neon_tony_sign` | Tony's Neon Sign | **LOCK** | YES |
| `collectible_arcade_cabinet` | The Corner Cabinet | **PROVISIONAL** — strongest silhouette, weakest joke | YES |

### Rare (8)

| Slot ID | Name | Status | Art |
|---|---|---|---|
| `collectible_cookie_tote` | McDonald's Cookie Bag | **LOCK** | YES |
| `collectible_reddiwip` | The Reddi-wip | **LOCK** | YES |
| `collectible_singing_fish` | Clooner | **LOCK** | YES |
| `collectible_freddy_bowl` | Freddy's Bowl | **LOCK** | no |
| `collectible_revolution_poster` | Join the Revolution | **LOCK** — art condition §4 | no |
| `collectible_crt_tv` | The Berardo File | **LOCK** — art condition §4 | no |
| `collectible_pinball_machine` | Cottage Inn Bag | **LOCK** — art condition §4 | no |
| `collectible_lava_lamp` | **⚠ NEEDS COMMISSIONER LORE** *(the Feasel slot)* | **UNFILLED** | no |

### Common (10)

| Slot ID | Name | Status | Art |
|---|---|---|---|
| `collectible_parmesan_shaker` | A Single Bapple | **LOCK** | no |
| `collectible_ketchup_bottle` | Freddy's Tennis Ball | **LOCK** | no |
| `collectible_booth_cushion` | The Snapped Controller | **LOCK** *(attribution pending Q11)* | no |
| `collectible_arcade_token` | Tony's Token | **LOCK** | YES |
| `collectible_receipt_spike` | Tony's Receipt Spike | **LOCK** | no |
| `collectible_napkin_dispenser` | "For Sale: $3 FAAB" | **PROVISIONAL** — pending Q1 | no |
| `collectible_pizza_cutter` | The Crown Vic *(or dealer key tag)* | **PROVISIONAL** — pending Q3 | no |
| `collectible_paper_menu` | Tony's Menu Board | **PROVISIONAL** — needs the stronger interior in §4 | no |
| `collectible_checkered_cloth` | Checkered Tablecloth | **REPLACE-FIRST** | YES |
| `collectible_coffee_mug` | ~~The Diner Mug~~ | **⚠ OPEN SLOT — cut, nothing chosen** | YES *(now unwired)* |

### Honest accounting

**The catalog is not finalized and this document does not claim it is.**

- **17 LOCK** — ship-ready concepts.
- **4 PROVISIONAL** — right concept, one open detail each (Q1, Q3, the menu-board
  interior, and the arcade cabinet's justification).
- **1 REPLACE-FIRST** — the tablecloth.
- **2 genuinely unfilled**: the **rare Feasel slot**, blocked on commissioner lore, and
  the **common slot freed by cutting the Diner Mug**, with nothing chosen for it.

**Both unfilled slots are safe to leave open.** Every slot resolves to
`placeholder_pizza_box` today, so an unfilled slot is not a broken slot — it is an
item still in its box, which is the designed in-world state. Neither blocks kickoff and
neither costs anything to decide late. The mug's art stays in the repo, unwired, and can
be re-wired in one registry row if nothing better arrives.

**Best single answer to fill both:** Q9 (league punishments) and Q7 (the no-kicker rule)
are the two questions most likely to produce an artifact that is instantly recognized,
physically specific and funny on a common. Q6 (*Oil Money*) is the best-evidenced of the
manager threads.

---

## 7. Art cost, if this board were locked today

Unchanged from round 1 in every respect that matters.

| | |
|---|---|
| Painted and staying painted | **10** — the twelve minus the cut mug and, if it goes, the tablecloth |
| Free renames, zero generation | **3** — Topouzian Jersey · Reddi-wip · Clooner |
| To generate | **12**, plus whatever fills the two open slots |
| Blocked on a commissioner answer before generation | **4** — Cottage Inn Bag *(approved, art brief needs the silhouette rule)*, For Sale sticker (Q1), Crown Vic (Q3), Feasel slot (lore) |
| Championship ring | separate, before the first title |

**No generation should start until the two open slots are decided**, because the commons
are the batch that matters and two of them are unresolved.

---

## 8. What was not done

No product code, schema, migration, registry row, rarity, price, salvage value, odds,
catalog size or reward-table version was changed. No artwork was generated, processed or
deleted — **including the Diner Mug's, which stays in the repository unwired.** No slug
was renamed. No PR was opened. `docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` still briefs
the old generic subjects and will be rewritten only after the 24 is locked. `G2`
(24 → 32) is untouched and `CATALOG_SIZE` stays 24.
