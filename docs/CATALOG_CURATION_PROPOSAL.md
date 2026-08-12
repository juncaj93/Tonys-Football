# V1 collectible catalog — curation proposal

**Status:** investigation and proposal, 2026-08-12. **Awaiting commissioner approval.**
**Nothing was implemented.** No product code, no schema, no migration, no registry
row, no rarity, no price, no salvage value, no reward-table version, no artwork
generated or deleted, no slug renamed, no PR.

**The ask:** decide what the twenty-four V1 collectibles should *be*, before any
more art is generated. The current catalog is largely generic pizza-parlor
inventory that arrived as convenient placeholders; the product direction is a
collection that is unmistakably this league's.

**The headline:** the strongest version of this catalog costs **zero extra art**.
Twelve items are painted and every one of them stays painted; twelve are
unpainted and every one of them is free to re-content. The curation below
re-points eight unpainted slots at league lore, renames three painted items into
lore they already depict, and generates exactly the twelve sprites that were
already owed.

---

## 1. Current state — the authoritative twenty-four

Read from `art/assets.inventory.json` through `lib/counter/catalog.ts`, not from
any design document. The catalog **is** the registry: `catalog()` selects
`family: collectible`, drops `systemLayer` and drops any record with no `rarity`.

| # | Slug | Name (registry `alt`) | Rarity | Art | Form | Lore today |
|---|---|---|---|---|---|---|
| 1 | `collectible_bapple_tree` | The Bapple Tree | legendary | **ready** | floor | **League — Nick / Bapple** |
| 2 | `collectible_signed_jersey_legend` | Framed signed jersey | legendary | **ready** | wall | none |
| 3 | `collectible_portable_sauna` | Portable sauna | epic | **ready** | floor | **League — Brandon** |
| 4 | `collectible_burn_barrel` | Burn barrel | epic | **ready** | floor | **World — canon §15** |
| 5 | `collectible_neon_tony_sign` | Neon Tony's Pizza sign | epic | **ready** | wall | **World — Tony** |
| 6 | `collectible_arcade_cabinet` | Arcade cabinet | epic | **ready** | floor | world texture |
| 7 | `collectible_cookie_tote` | McDonald's cookie bag | rare | **ready** | surface | **League — Joe** |
| 8 | `collectible_reddiwip` | Can of whipped cream | rare | **ready** | surface | **League — Joe** |
| 9 | `collectible_singing_fish` | Novelty singing fish | rare | **ready** | wall | none |
| 10 | `collectible_lava_lamp` | Lava lamp | rare | placeholder | surface | none |
| 11 | `collectible_crt_tv` | CRT television | rare | placeholder | surface | none |
| 12 | `collectible_pinball_machine` | Pinball machine | rare | placeholder | floor | none |
| 13 | `collectible_revolution_poster` | Join the revolution poster | rare | placeholder | wall | **World — canon §14** |
| 14 | `collectible_freddy_bowl` | Dog bowl | rare | placeholder | surface | **League — Freddy** |
| 15 | `collectible_arcade_token` | Arcade token | common | **ready** | surface | **World — Tony's mark** |
| 16 | `collectible_coffee_mug` | Diner coffee mug | common | **ready** | surface | none |
| 17 | `collectible_checkered_cloth` | Checkered tablecloth | common | **ready** | surface | none |
| 18 | `collectible_pizza_cutter` | Pizza cutter | common | placeholder | surface | none |
| 19 | `collectible_parmesan_shaker` | Parmesan shaker | common | placeholder | surface | none |
| 20 | `collectible_napkin_dispenser` | Napkin dispenser | common | placeholder | surface | none |
| 21 | `collectible_ketchup_bottle` | Squeeze bottle | common | placeholder | surface | none |
| 22 | `collectible_paper_menu` | Paper menu | common | placeholder | surface | none |
| 23 | `collectible_booth_cushion` | Red vinyl booth cushion | common | placeholder | surface | none |
| 24 | `collectible_receipt_spike` | Receipt spike | common | placeholder | surface | none |

**Not in the catalog, carried here so it is not read as an omission:**
`item_championship_ring` (`systemLayer: true`, legendary, placeholder) is granted
by the system and never pulled; `placeholder_pizza_box` has no rarity and is the
universal stand-in art, not an ownable thing.

**Rarity distribution, verified rather than assumed: 10 common · 8 rare · 4 epic
· 2 legendary.** Rarity mass is 60 / 28 / 10 / 2 and is assigned **per tier**,
split evenly among that tier's items — so a common is 6.0% of openings, a rare
3.5%, an epic 2.5%, a legendary 1.0%. This proposal preserves every one of those
numbers exactly.

### 1.1 What is identity and what is presentation

| Fact | Where it lives | Changing it costs |
|---|---|---|
| `slug` | registry key; stored in `collectibles.slug`, `box_openings.collectible_slug`, `reward_tables.entries` | **identity** — see §3 |
| `rarity` | registry `rarity` | **identity** — it is in the reward-table hash and the salvage value |
| **display name** | registry `alt` | **presentation** — one test asserts one string |
| **artwork** | registry `path` / `art_status` | **presentation** — a registry row, by design |
| **lore / flavour** | does not exist yet | new, additive |
| form (`wall`/`surface`/`floor`) | `lib/economy/catalog-audit.ts` | art-planning annotation; enforces nothing |

**No collectible slug is user-visible.** No route takes one (`/counter`,
`/counter/collection`, `/counter/showcase`, `/rooms` — none has a slug segment),
no server action accepts one from the client, and the only place a slug reaches
the browser is as an image `src`. Special behaviour tied to a specific ID:
**none in product code.** The three code-level bindings are all test/tooling:
`lib/demo/apply.ts` (`pull-whipped-cream` → `collectible_reddiwip`),
`lib/counter/boxes.test.ts`, and `lib/assets/batches.ts` (which batch delivered
which file).

**Users can already own every one of the twenty-four** — all are box-eligible,
all four room slots accept all of them, all are showcaseable.

---

## 2. Found art — the complete inventory

Searched: `public/assets/`, `art/incoming/`, `art/`, every `docs/art/` handoff,
the registry, and **the full git history including deleted files**.

**Exactly twelve collectible sprites have ever existed in this repository.**
There is no unused, orphaned, archived, or forgotten collectible art. Nothing is
sitting unwired.

| Asset | Exists? | Production-ready? | Wired? | Current item | Proposed V1 use |
|---|---|---|---|---|---|
| `collectible_bapple_tree` | yes | yes | yes | The Bapple Tree | **unchanged** |
| `collectible_signed_jersey_legend` | yes | yes | yes | Framed signed jersey | **repurpose → The Topouzian Jersey** |
| `collectible_portable_sauna` | yes | yes | yes | Portable sauna | **unchanged** |
| `collectible_burn_barrel` | yes | yes | yes | Burn barrel | **unchanged** |
| `collectible_neon_tony_sign` | yes | yes | yes | Neon sign | **unchanged** |
| `collectible_arcade_cabinet` | yes | yes | yes | Arcade cabinet | **unchanged** |
| `collectible_cookie_tote` | yes | yes | yes | McDonald's cookie bag | **unchanged** |
| `collectible_reddiwip` | yes | yes | yes | Can of whipped cream | **rename → The Reddi-wip** |
| `collectible_singing_fish` | yes | yes | yes | Novelty singing fish | **repurpose → Clooner** |
| `collectible_arcade_token` | yes | yes | yes | Arcade token | **unchanged** |
| `collectible_coffee_mug` | yes | yes | yes | Diner coffee mug | **unchanged** |
| `collectible_checkered_cloth` | yes | yes | yes | Checkered tablecloth | **unchanged** |

Each also has its raw generation source at `art/incoming/<slug>_01.png`. The only
other collectible-family source in `art/incoming/` is
`_source_object_box_owned_flat_rejected.png`, a rejected pizza-box orientation
that belongs to the `object_` family, not the catalog.

**Verified by eye, not by filename.** `collectible_cookie_tote` really does carry
the McDonald's arches, and `collectible_bapple_tree` really does bear Busch Light
Apple-style cans — both are approved brand exceptions, so the art is correct and
the *registry names* are the part that was genericized.

**One documentation defect found:** `docs/art/BRAND_EXCEPTIONS.md` is headed
*"The six exceptions"* and contains **seven** — the cookie tote was added the same
day as item 7 and the heading was never updated. `CLAUDE.md` repeats "six" and
omits the cookie tote from its list. The exception is real and properly recorded;
only the count is stale. Not fixed here (it is not this branch's area).

### 2.1 The named leads, classified

| Lead | Verdict |
|---|---|
| McDonald's Cookie Bag | **1 — shipped production asset**, brand exception 7 |
| Tony's Pizza Box | **1 — shipped**, but as `object_box_owned` (the box you open), *not* a catalog collectible. Brand exception 5 |
| Tony's Neon Sign | **1 — shipped**, brand exception 2 |
| Checkered tablecloth | **1 — shipped**. Red-and-**white** in the brief and the art, not red-and-cream |
| Bapple | **1 — shipped** as the tree (legendary). Brand exception 4. Concept revised 2026-08-03 from half-apple/half-banana to Busch Light Apple-style cans |
| Portable Sauna | **1 — shipped**, brand exception 6. Concept revised from fabric tent to barrel sauna |
| Feasel | **4 — documented concept only.** Canon `14 §11`: rare NPC, dirty-blonde, "Feasel Fables". **No art, no slug, no collectible has ever existed** |
| Cottage Inn Delivery Guy | **4 — documented concept only.** Canon `14 §9`. No art, no slug. The canonical gag involves a firearm |
| Berardo | **4 — documented concept only.** Canon `14 §12`: quietly exiled, *"the mystery is the joke"*. No art, no slug |
| Topouzian Brothers | **4 — documented concept only.** Canon `14 §13`: shared slot, one did the work and the other got the credit. No art, no slug |

Nothing in the lead list is category 2 (processed but unused), 3 (raw art
awaiting wiring), or 5 (rejected). Four of the ten are category 6 in the sense
that matters: **the joke is documented, the object is not.**

---

## 3. Safe replacement strategy

**Question:** can a slot keep its slug and rarity while its name, description,
artwork and lore become a different collectible?

**Answer: yes, and it is the safest available strategy.** Verified against the code:

1. **The reward-table version hashes `slug : rarity : weight` and nothing else**
   (`lib/counter/rewards.ts`, `versionOf`). A name change or an art change does
   **not** re-version the table. Odds, prices, salvage values and the recorded
   audit trail are untouched.
2. **Nothing persisted stores a name or an art path.** `collectibles` stores
   `user_id`, `slug`, `rarity`, `source_opening_id`, `acquired_at`.
   `box_openings` stores the slug, the rarity and the roll. Existing inventory
   stays valid because the slug it points at still resolves.
3. **Collection completion is a count of distinct slugs against `catalog()`.**
   Unchanged.
4. **Swapping placeholder art for final art is already a registry row**, by
   design (`ASSET_PIPELINE.md §1`). Re-pointing a slug at *different* final art
   is the same operation.
5. **Salvage is a pure function of rarity**, so leaving rarity alone leaves
   salvage alone.
6. **Demo and visual-QA states select by rarity and by slug order**
   (`firstOfRarity`, `allOfRarity`), never by name. Keeping slugs keeps all
   one hundred visual states reachable without a driver change.

**Renaming a slug is the one thing that is not free**, and the cost is precise:
it re-versions the reward table (the hash includes the slug), and any already-stored
`collectibles.slug` or `box_openings.collectible_slug` row holding the old value
would no longer resolve — `catalogItem()` throws rather than returning a hole, and
`collectibles_undeletable` means the bad rows cannot be cleaned up. **So: keep all
twenty-four slugs.** Where a repurposed item's content no longer matches its
legacy slug, record the mapping in the registry `$comment` — the same mechanism
already used for the Bapple and sauna concept revisions.

> If the commissioner *wants* slugs realigned, the safe window is before any real
> manager opens a box in production, and it would need a verified-empty
> `collectibles` table plus a new reward-table version. **Not recommended, and
> not part of this proposal.**

### 3.1 One code change is required, and it is small

`lib/counter/catalog.ts` currently uses the registry's `alt` as **both** the
display name and the image `alt` attribute, and its own header anticipates this:
*"If a name ever needs to differ from the alt text, it becomes a registry field
rather than a table here."*

This curation forces it. *"Clooner"* is a good name and a useless alt text — a
screen-reader user needs *"novelty singing fish on a wooden plaque."* So the
repurpose strategy needs an **optional `name` field on the registry record**,
falling back to `alt` when absent. Additive, one field, one line in `catalog()`,
no schema, no migration.

Second, smaller: `lib/demo/apply.test.ts:361` asserts
`catalogItem('collectible_reddiwip').name === 'Can of whipped cream'`. **One
string.** That is the entire test surface bound to any display name in the
repository.

**Nothing else in this proposal touches code.**

---

## 4. Proposed V1 — exactly twenty-four

Category **A** = league lore / inside joke · **B** = Tony-world artifact ·
**C** = pizzeria texture.

| # | Proposed name | Rarity | Cat | Slot / ID | Art | Why it deserves a slot |
|---|---|---|---|---|---|---|
| 1 | **The Bapple Tree** | legendary | A | `collectible_bapple_tree` | **READY** | The league's own mythology, standing in a pot. Nick's obsession made into an object. Nothing beats it |
| 2 | **The Topouzian Jersey** | legendary | A | `collectible_signed_jersey_legend` | **READY** | The existing art is a framed jersey with a deliberately illegible signature — which *is* the Topouzian joke. Two brothers, one slot, one signature, no way to tell who signed it. Name and lore only |
| 3 | **The Portable Sauna** | epic | A | `collectible_portable_sauna` | **READY** | Canon `14 §8`. Its existence is funnier than an explanation of it |
| 4 | **The Burn Barrel** | epic | B | `collectible_burn_barrel` | **READY** | Canon `14 §15` — where failed trade offers, retired takes and Tony's old receipts go |
| 5 | **Tony's Neon Sign** | epic | B | `collectible_neon_tony_sign` | **READY** | The world's own sign. Emissive, best-lit object in the room |
| 6 | **The Corner Cabinet** | epic | B | `collectible_arcade_cabinet` | **READY** | Weakest personality in the epic tier and it earns its place on silhouette: the tallest, most instantly-readable outline in the catalog, and canon `06 §10` names it an interactive prop |
| 7 | **McDonald's Cookie Bag** | rare | A | `collectible_cookie_tote` | **READY** | Joe's. Already painted, already approved, arches and all |
| 8 | **The Reddi-wip** | rare | A | `collectible_reddiwip` | **READY** | Joe's. The art already carries the approved treatment; only the name was genericized to *"Can of whipped cream."* **Rename only** |
| 9 | **Clooner** | rare | A | `collectible_singing_fish` | **READY** | The single best free win in this proposal. A novelty fish on a plaque that sings one line — *Farmingtonnn, Farmington Hillllls.* Canon `14 §10` given a body, at zero art cost |
| 10 | **Freddy's Bowl** | rare | A | `collectible_freddy_bowl` | needed | Brandon's golden doodle, canon `14 §17`. Already briefed with `FREDDY` stencilled; only the registry name is still *"Dog bowl"* |
| 11 | **Join the Revolution** | rare | A | `collectible_revolution_poster` | needed | Canon `14 §14`. A campaign nobody remembers, on a wall. Fills the frame |
| 12 | **The Berardo File** | rare | A | `collectible_crt_tv` | needed | *Replaces the CRT television.* A sealed manila folder, the name blacked out, one photo corner showing. Canon `14 §12` says the mystery is the joke — this is an object that says there is a story and refuses to tell it |
| 13 | **Cottage Inn Bag** | rare | A | `collectible_pinball_machine` | needed | *Replaces the pinball machine.* An empty insulated delivery bag, dropped where he left it. The whole Cottage Inn gag with **no weapon, no person, no likeness** — just evidence he was here. **BRAND-DEPENDENT (§4.3)** |
| 14 | **Feasel Fables, Vol. 1** | rare | A | `collectible_lava_lamp` | needed | *Replaces the lava lamp.* A stapled photocopied zine, dog-eared, a dirty-blonde figure on the cover drawn as a suggestion rather than a face. Canon `14 §11`: fragmentary, exaggerated, treated as accepted lore |
| 15 | **Tony's Token** | common | B | `collectible_arcade_token` | **READY** | Tony's own wordmark in your hand. House branding, approved |
| 16 | **The Diner Mug** | common | C | `collectible_coffee_mug` | **READY** | Painted, charming, and the room needs objects that are just *objects* |
| 17 | **Checkered Tablecloth** | common | C | `collectible_checkered_cloth` | **READY** | Painted. The one soft object in the catalog and the only cloth silhouette |
| 18 | **Tony's Menu Board** | common | B | `collectible_paper_menu` | needed | Already rebriefed as a board that **hangs** — the first common the picture frame can hold. Grease-spotted, hand-lettered, prices that were never updated |
| 19 | **A Single Bapple** | common | A | `collectible_parmesan_shaker` | needed | *Replaces the parmesan shaker — the commissioner's own example of filler.* One dented can, alone. It makes the legendary tree the top of a **family**, and pulling one can when you wanted the tree is a joke that survives being repeated. **BRAND-DEPENDENT (§4.3)** |
| 20 | **Freddy's Tennis Ball** | common | A | `collectible_ketchup_bottle` | needed | *Replaces the squeeze bottle.* Chewed flat, one seam gone. Pairs with the bowl. The cheapest sprite in the catalog and one of the warmest |
| 21 | **The Snapped Controller** | common | A | `collectible_booth_cushion` | needed | *Replaces the booth cushion.* A game controller snapped and taped back together. Canon-approved competitive-rage territory, and a trophy of humiliation nobody has to be named in |
| 22 | **Trade Offer, Declined** | common | A | `collectible_napkin_dispenser` | needed | *Replaces the napkin dispenser.* A trade scrawled on a napkin, taped to the wall, one corner torn. **Wall item** — the frame's second common occupant. Three managers' trading lore in one object, and it is where the burn barrel's contents come from |
| 23 | **Tony's Receipt Spike** | common | B | `collectible_receipt_spike` | needed | Tony keeps receipts on everybody, and the Slice prints them. The one piece of restaurant hardware that carries world meaning |
| 24 | **The Dealer Keyring** | common | A | `collectible_pizza_cutter` | needed | *Replaces the pizza cutter.* A dealership keyring with a paper tag. Deliberately mundane — funny only because the league knows exactly whose job it is. Three managers touch dealership lore. **BRAND-DEPENDENT (§4.3)** |

### KEEP — unchanged in every respect (9)

1 · 3 · 4 · 5 · 6 · 7 · 15 · 16 · 17. Nine items keep their slug, rarity, name
and art exactly as they are today. **Item 23** (Tony's Receipt Spike) also keeps
its slug, rarity, concept and name — it is listed under NEW ART only because it
has never been painted.

### REPURPOSE — slot and rarity preserved, content changed (11)

**Name and lore only, art already finished (3):** 2 (Topouzian Jersey) ·
8 (Reddi-wip) · 9 (Clooner). **These cost nothing at all** — no generation, no
processing, no registry `path` change. Three registry `alt`/`name` edits.

**Name and art, on slots that were placeholders anyway (11):** 10 · 11 · 12 · 13 ·
14 · 18 · 19 · 20 · 21 · 22 · 24 — of which **10, 11 and 18 keep their existing
concept** and only sharpen the name, while **12, 13, 14, 19, 20, 21, 22 and 24
change concept entirely.** Every one is a slot with **no art on disk**, so
nothing is discarded. Item 23 keeps both its concept and its name and is
therefore a KEEP that still needs art.

### NEW ART — the twelve already owed (12)

10 · 11 · 12 · 13 · 14 · 18 · 19 · 20 · 21 · 22 · 23 · 24.
**Exactly the same twelve slots that need art today.** The curation does not add
a single generation.

### EXISTING UNUSED ART

**None exists.** Verified against git history — twelve sprites, all twelve wired.

### CUT — eight generic concepts that do not make V1

| Cut | Was | Why |
|---|---|---|
| Parmesan shaker | common | The commissioner's own example. Restaurant supply with nothing behind it |
| Squeeze bottle | common | Anonymous by design — the brief literally says *"the anonymous diner bottle"* |
| Napkin dispenser | common | Chrome box. Nothing to recognise, nothing to say |
| Red vinyl booth cushion | common | Reads as an unidentifiable red rectangle at 23px |
| Pizza cutter | common | The most predictable object a pizza game could contain |
| Lava lamp | rare | Generic 70s décor with no connection to anything in this world |
| CRT television | rare | Duplicates the arcade cabinet's silhouette — a box with a lit screen — and `docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md` already deprioritised it for exactly that |
| Pinball machine | rare | The second-largest furniture silhouette in a catalog with too much furniture; `BATCH_F §3.2` had already been forced to rebrief it down to just the backglass to make it work at all |

**All eight are placeholders with zero art on disk.** Cutting them costs nothing
and discards nothing.

### 4.1 Families

Restraint applied — no family larger than two, and one hidden connection.

| Family | Items | Tiers |
|---|---|---|
| **Bapple** | The Bapple Tree · A Single Bapple | legendary + common. The chase and the consolation |
| **Freddy** | Freddy's Bowl · Freddy's Tennis Ball | rare + common |
| **Joe's snacks** | McDonald's Cookie Bag · The Reddi-wip | rare + rare |
| **The exiled** | The Topouzian Jersey · The Berardo File | legendary + rare. Two managers who are gone, remembered two different ways |
| **Paperwork** *(hidden)* | Tony's Receipt Spike · Trade Offer, Declined · The Burn Barrel | common + common + epic. Nothing marks the connection; the barrel is where the other two end up |

The Bapple pair is the deliberate one: a manager who pulls the single can knows
exactly what they did not pull. **No set bonuses, no mechanics, no code.**

### 4.2 Visual variety

| Form | Now | Proposed |
|---|---|---|
| **wall** (the room's picture frame) | 4 — and **zero commons** | **6 — two of them commons** |
| surface | 15 | 14 |
| floor (furniture-scale, no room slot) | 5 | **4** |

The wall count is the meaningful move. `docs/CATALOG_SIZING.md` measured that
**35% of managers have nothing to hang by week 8** because no common is a wall
item. Item 18 was already the fix for that at zero cost; item 22 adds a second,
also at zero cost, which should take the figure comfortably past the 84% that one
common wall item was projected to reach. Furniture drops by one (the pinball
machine), which is the direction `BATCH_F §1.1` explicitly asked for.

Silhouette spread across the twenty-four: tall furniture (cabinet, sauna, barrel,
tree) · flat hanging rectangles (jersey, sign, poster, menu board, napkin) · a
plaque (Clooner) · soft goods (tablecloth, tennis ball) · containers (cookie bag,
aerosol can, beer can, delivery bag, mug, bowl) · paper (zine, file, receipts) ·
hardware (token, keyring, controller, spike).

### 4.3 Brand-dependent items — flagged, not resolved

Per the mandate these are **not** silently genericized.

| Item | Brand | Status | Does the joke survive without it? |
|---|---|---|---|
| **McDonald's Cookie Bag** (7) | McDonald's | **Already approved** — `BRAND_EXCEPTIONS.md` item 7. Art shipped with the arches | Mostly — but a plain cardboard tote loses the "everyone knows exactly which cookies" half. No decision needed; it is already approved and painted |
| **The Reddi-wip** (8) | Reddi-wip | **Already approved** — exception 3. Art shipped | Weakly. The joke is specifically that product. Only the *name* is currently genericized; recommend it match the art |
| **A Single Bapple** (19) | Busch Light Apple | **Extension needed.** Exception 4 approves the cans *on the tree*; a lone can is the same treatment on a new slug | **No.** An unbranded beer can is not a Bapple. This item exists or it does not |
| **Cottage Inn Bag** (13) | Cottage Inn | **New — commissioner decision required** | **Partly.** An unbranded rival-pizzeria bag still reads as *"he was here"*, which is the safe core of the gag. The branded version is much sharper. Recommend asking |
| **The Dealer Keyring** (24) | Cadillac / a named dealership | **New — commissioner decision required** | **Yes.** A generic dealer fob with a paper tag carries it; the league supplies the specificity. Recommend generic |

**Also flagged, and deliberately not proposed:** the Cottage Inn gag's canonical
firearm (item 13 carries none), Matt Lee's restricted adult joke (`16 §310` puts
it behind the explicit-language flag and off shareable surfaces — a collectible is
a shareable surface), and the *"Just 18"* soccer player (canon `14 §16` asks for
care and abstraction; a collectible cannot supply either). None of the three
belongs in a launch catalog.

---

## 5. Scores

1–5 on inside-joke value (**J**), pull excitement (**P**), repeat-pull comedy
(**R**), visual distinctiveness (**V**), room-decoration value (**D**).

| # | Item | J | P | R | V | D | Σ |
|---|---|---|---|---|---|---|---|
| 1 | The Bapple Tree | 5 | 5 | 3 | 5 | 5 | **23** |
| 2 | The Topouzian Jersey | 5 | 5 | 3 | 4 | 5 | **22** |
| 9 | Clooner | 5 | 4 | 5 | 4 | 4 | **22** |
| 3 | The Portable Sauna | 5 | 4 | 3 | 5 | 4 | **21** |
| 5 | Tony's Neon Sign | 4 | 4 | 3 | 5 | 5 | **21** |
| 13 | Cottage Inn Bag | 5 | 5 | 4 | 3 | 3 | **20** |
| 7 | McDonald's Cookie Bag | 5 | 4 | 4 | 4 | 3 | **20** |
| 4 | The Burn Barrel | 4 | 4 | 3 | 5 | 4 | **20** |
| 11 | Join the Revolution | 4 | 4 | 3 | 4 | 5 | **20** |
| 21 | The Snapped Controller | 5 | 3 | 5 | 3 | 3 | **19** |
| 19 | A Single Bapple | 5 | 3 | 5 | 3 | 3 | **19** |
| 12 | The Berardo File | 5 | 5 | 3 | 3 | 3 | **19** |
| 10 | Freddy's Bowl | 5 | 4 | 4 | 3 | 3 | **19** |
| 14 | Feasel Fables, Vol. 1 | 5 | 4 | 4 | 3 | 3 | **19** |
| 8 | The Reddi-wip | 5 | 4 | 4 | 3 | 3 | **19** |
| 22 | Trade Offer, Declined | 4 | 2 | 5 | 3 | 4 | **18** |
| 20 | Freddy's Tennis Ball | 5 | 3 | 5 | 2 | 2 | **17** |
| 6 | The Corner Cabinet | 2 | 3 | 3 | 5 | 4 | **17** |
| 18 | Tony's Menu Board | 3 | 2 | 3 | 3 | 5 | **16** |
| 24 | The Dealer Keyring | 4 | 2 | 5 | 2 | 2 | **15** |
| 23 | Tony's Receipt Spike | 3 | 2 | 4 | 3 | 3 | **15** |
| 15 | Tony's Token | 3 | 2 | 4 | 2 | 2 | **13** |
| 16 | The Diner Mug | 2 | 2 | 3 | 2 | 3 | **12** |
| 17 | Checkered Tablecloth | 2 | 2 | 3 | 2 | 3 | **12** |

**The bottom of the table is the useful part, and every one of the five weakest
has to justify itself:**

- **The Diner Mug (12)** and **Checkered Tablecloth (12)** are the two weakest
  items in the proposal, and the only reason they survive is that **they are
  already painted and approved.** If the commissioner wants two more league jokes,
  **these are the two slots to take** — the cost is discarding two finished
  approved sprites. That is a real cost and it is the commissioner's call, not
  the curation's. Recorded as question Q1.
- **Tony's Token (13)** is Tony's house branding on the most-pulled tier. It is
  scaffolding for the world rather than a joke, and the world needs scaffolding.
- **The Corner Cabinet (17)** is the weakest *epic* on personality and the
  strongest object in the catalog on silhouette. Painted, approved, and the epic
  tier is only 2.5% per item — the least valuable slot to spend a new joke on.
- **Tony's Receipt Spike (15)** is the one restaurant object that carries meaning:
  the receipts Tony keeps, the paper the barrel burns, the metaphor the Slice
  already prints on.

### Overall assessment

| | | |
|---|---|---|
| **Personality** | **Strong.** 16 of 24 are league or friend-group lore, up from 6. **Every rare is a league joke.** A stranger opening a box would not understand half of it, which is the point | ★★★★☆ |
| **Comedy** | **Strong.** 68% of openings by weight now land on something with a joke behind it. Weighted by pull share: commons 60% mass and 5 of 10 are league jokes; rares 28% and 8 of 8 are | ★★★★☆ |
| **Chase value** | **Good, not perfect.** Two legendaries is thin — a legendary pull is still a coin flip between two known objects, and `docs/CATALOG_SIZING.md` already recommended a third (approved for ~week 12 under **G2**, not now). Both legendaries are now league mythology rather than one being generic memorabilia, which is the improvement available inside 24 | ★★★☆☆ |
| **Repeatability** | **Much improved.** The single Bapple, the tennis ball, the snapped controller and the declined trade are all funnier the fourth time. The old commons were funnier zero times | ★★★★☆ |
| **Visual diversity** | **Improved.** Wall items 4 → 6 with the first two commons, furniture 5 → 4, and the silhouette spread widens. The room finally has something to hang at every tier | ★★★★☆ |
| **Launch readiness** | **Unchanged, which is the finding.** 12 painted, 12 to generate — the identical number owed before this exercise. Three of the eleven repurposes cost nothing at all | ★★★★☆ |

---

## 6. Art gap

| | Count |
|---|---|
| Production-ready art already | **12** |
| Raw/unprocessed art awaiting wiring | **0** |
| Requiring new generation | **12** |
| Requiring only catalog wiring (a registry name edit, no art) | **3** — Topouzian Jersey, Reddi-wip, Clooner |
| Blocked on a commissioner decision before generation | **4** — items 13, 14, 19, 24 |
| Championship ring | **1**, separate, before the first title is awarded |

### Generation order

Priority is pull frequency first — one common sprite is seen **1.7×** as often as
a rare and **6×** as often as a legendary — then missing-art visibility, then
joke strength, then how easily it reads at 23px.

**Wave 0 — free, do first, no generation at all**
Three registry name edits: `signed_jersey_legend` → The Topouzian Jersey ·
`reddiwip` → The Reddi-wip · `singing_fish` → Clooner. Plus the optional `name`
registry field and the one-string test update. **Three of twenty-four items gain
a league joke for zero art.**

**Wave 1 — the seven commons (42.0% of every box opened)**

| Order | Item | Why here |
|---|---|---|
| 1 | **A Single Bapple** | Strongest common joke; a can is the simplest silhouette in the batch |
| 2 | **Freddy's Tennis Ball** | Trivial to draw, unmistakable at 23px |
| 3 | **Tony's Menu Board** | Wall — closes the frame gap the sizing study measured |
| 4 | **Trade Offer, Declined** | Wall — the second common the frame can hold |
| 5 | **The Snapped Controller** | Distinct silhouette, strong repeat joke |
| 6 | **Tony's Receipt Spike** | Already fully briefed in `BATCH_F §3.1` |
| 7 | **The Dealer Keyring** | Small object; needs the brand ruling first |

**Wave 2 — the five rares (17.5%)**

| Order | Item | Why here |
|---|---|---|
| 8 | **Freddy's Bowl** | Already briefed; only the name changes |
| 9 | **Join the Revolution** | Already briefed; wall |
| 10 | **The Berardo File** | New concept, simple shape — a folder |
| 11 | **Cottage Inn Bag** | Needs the brand ruling |
| 12 | **Feasel Fables, Vol. 1** | Needs commissioner detail before it can be drawn well |

**Wave 3 — `item_championship_ring`**, unchanged, before the first title.

Every one of the twelve uses the existing pipeline unchanged: THE BLOCK +
the collectible FAMILY block + one SUBJECT line, delivered to
`art/incoming/<slug>_01.png`, then `art:prepare-incoming` and `art:process`.
**No new slug, no registry structure change, no `CATALOG_SIZE` change.**

`docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md §3` would be rewritten to these twelve
subjects on approval. Its **P1 (24 → 32)** and **P2 (→ 38)** sections are
untouched by this proposal — **G2** still governs them and execution stays
deferred to ~week 12.

---

## 7. Questions only the commissioner can answer

Each one fills a specific weakness identified above. None is a general request
for more jokes.

**Q1 — the two weakest slots.** The Diner Mug and the Checkered Tablecloth score
lowest of all twenty-four and survive only because they are already painted.
Trading them for two more league jokes means discarding two finished approved
sprites. **Do you want those two slots, and what goes in them?**

**Q2 — four managers have no object.** Nathan, Matty B, Matt Lee and Alex are not
represented (Zack correctly is not — his canon is not to be invented). Nathan is
the collector, so the system is arguably his joke; Matty B's canon is *quiet
competence*, which resists objecthood. **Is there a physical object associated
with Matt Lee that is not the restricted joke — and does Alex's Juncer Score or a
FIFA miss have an object behind it?**

**Q3 — Feasel, precisely.** Canon says dirty-blonde, exaggerated, "Feasel
Fables", and explicitly forbids inventing a biography. The zine is a guess.
**What actually makes the Feasel reference funny, and is there one object from a
Feasel story — a specific thing he had, wore, drove or broke — that the group
would recognise instantly?**

**Q4 — Bapple's definitive artifact.** The tree is legendary and painted. The
proposed common is a single can. **Is a lone can the right second Bapple, or is
there a specific Bapple object or moment the group would recognise faster?**

**Q5 — brand rulings.** Two new ones, both blocking generation:
(a) may **A Single Bapple** use the same Busch Light Apple treatment already
approved on the tree? (b) may the **Cottage Inn Bag** carry Cottage Inn branding,
or should it be an unbranded rival-pizzeria bag?

**Q6 — the commons are the tier that needs the most help.** Five of ten are now
league jokes and the rest are Tony-world or texture. Commons are seen **six times
as often as legendaries**, so this is where a strong answer pays most.
**Is there an object the group repeatedly makes fun of — an infamous food order,
a thing somebody always brings to league events, a physical object attached to a
league punishment, or a draft-day mistake everybody remembers?**

**Q7 — naming managers.** Items 3, 13, 21 and 24 reference a specific manager's
lore without naming them (*"The Portable Sauna"*, not *"Brandon's Portable
Sauna"*). Canon warns against overusing Brandon, and he touches four of the
twenty-four through the sauna, Feasel and Freddy ×2. **Should item names name the
manager, and is four-of-twenty-four too much Brandon?**

---

## 8. Recommendation

**Approve it, with Q5 answered before generation starts.**

This is worth freezing as V1 for three reasons.

**It costs nothing.** Twelve items are painted and all twelve stay painted; twelve
need art and the same twelve still need art. Three items gain a league joke for
zero generations. No rarity moves, no odds move, no price moves, no salvage value
moves, no reward-table version moves, no schema changes, no migration exists to
write. The entire implementation is registry edits, one optional registry field,
one test string, and twelve sprites that were already owed.

**It fixes two measured problems while it is in there.** The room's picture frame
goes from zero common occupants to two, which the sizing study measured as 35% of
managers having nothing to hang at week 8. And furniture drops from five to four
by cutting the one item the art brief had already been forced to redesign down to
a fragment.

**It changes what opening a box means.** Every rare is now something the league
recognises. Five of ten commons are. Two legendaries are league mythology instead
of one being anonymous sports memorabilia. Weighted by how often boxes actually
land, roughly two-thirds of openings now produce something with a story behind it,
against roughly a quarter today.

**Where it is honestly short:** the chase. Two legendaries is thin whatever they
depict, and the fix — a third — is already approved and already deferred to week
12 under **G2**. This proposal does not bring that forward and should not.

**And one caution.** Four items lean on Brandon's lore. Canon `11 §8` warns
specifically against overusing him because his pool is large. Q7 is that question,
and if the answer is *"too much"*, the cleanest trade is **Feasel Fables → the
answer to Q2 or Q6**, which also removes the item with the least specified
concept.

---

## 9. What this document deliberately did not do

- No product code, schema, migration, registry row, rarity, price, salvage value,
  odds, catalog size or reward-table version was changed.
- No artwork was generated, processed or deleted.
- No slug was renamed, and §3 recommends none ever is.
- No PR was opened and nothing was merged.
- **`docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` was not edited.** It still briefs
  the twelve generic subjects. It would be rewritten on approval — not before,
  because the handoff is what a generation session pastes, and a half-approved
  handoff is worse than a stale one.
- **G2 was not touched.** The 24 → 32 growth stays approved-with-execution-deferred,
  and `CATALOG_SIZE` stays 24.
- **A5 was not closed.** Twelve items still have no art. This proposal changes
  what those twelve should depict, not whether they exist.
