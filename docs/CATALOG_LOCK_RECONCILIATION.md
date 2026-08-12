# V1 collectible catalog — lock and production reconciliation

**Status:** reconciliation only, 2026-08-12. **No catalog mutation, no artwork, no ID
change, no rarity change, no migration, no PR.**

Supersedes [`CATALOG_CURATION_PROPOSAL.md`](CATALOG_CURATION_PROPOSAL.md) and
[`CATALOG_CURATION_ROUND2.md`](CATALOG_CURATION_ROUND2.md) as the content record. Those
two remain for their audit and safety findings, which are unchanged and are relied on
here.

Every fact below is read out of the repository — the registry, the filesystem, git
history, the test suite and the policy documents — not from a prior handoff.

---

## A. Catalog verification

**24 concepts listed, 24 distinct, no duplicates.** Every one maps onto a permanent slot
and the fixed 10 / 8 / 4 / 2 split absorbs the whole catalog with no remainder.

**The arithmetic is exact, not comfortable.** Ten concepts are pinned to a specific slot
because they reuse that slot's finished art or match its slug outright. That leaves
**1 epic · 4 rare · 9 common** free and **14 concepts** to place. Fourteen into fourteen.
There is no spare slot anywhere in the catalog, at any tier.

**No architectural blocker was found.** Nothing prevents any of the 24 occupying a slot,
and no concept had to be dropped, merged or substituted.

**One rarity tension, and it has a free fix** — see §C.1. **Two brand questions** — §I.
**One architectural gap the handoff depends on and the product does not have** — §0.

### 0. The load-bearing gap: there is no flavour-text surface

The handoff's central premise is *"the display name, runtime description, inspection UI
and future interactions can carry the punchline."* Verified against the code:

- `CatalogItem` is `{ slug, name, rarity }`. There is **no description field**.
- The registry record has no description field either — `alt` is the only prose, and it
  is simultaneously the display name **and** the image `alt` attribute.
- The three surfaces that draw a collectible — the reveal plate, the collection shelf
  card, the Showcase — render **the name and nothing else**. There is no inspection view.

So **eleven of the 24 currently have no way to deliver their punchline**, and the ones
that need it most are the ones whose art is forbidden from explaining itself: *For Sale:
$3 FAAB*, *Kickers Lives Matter*, *Most Compliant Award*, *The Bryan Birth Control
Detector*, *The Missing Topouzian Files*.

**The good news is it costs almost nothing.** `content_entries` already exists and is
the one approved content engine (`16 §5.3` bans a parallel one). It carries `surface`
(free text, indexed), `template_text`, `weight`, `cooldown_days` and `active` — which
is rotation, cooldown and A/B weighting for free. Three surfaces already use it through
`lib/content/parse.ts` + `seed.ts` + `select.ts`, each backed by one markdown file in
`content/`. A fourth is: **one markdown file, one parser, one seeder, one selector call
and one render slot. No schema change, no migration, no new system.**

Keying is the one design choice, and `surface` being free text answers it:
`surface = 'collectible:collectible_arcade_token'`.

**This is not in the 24 and does not block the art queue** — it is a small product
addition that Phase A should carry, and §J flags which items depend on it.

---

## B / C. The map — exact ID, name and rarity

**Recommended.** Every rarity is the slot's existing, unchanged assignment. No internal
ID is renamed. `standardRewardTable()` hashes `slug : rarity : weight` and none of those
three moves anywhere in this table, so **the probability fingerprint is bit-identical
before and after.**

### Legendary — 2

| Internal ID | V1 display name | Existing art | Proposed action |
|---|---|---|---|
| `collectible_bapple_tree` | **The Bapple Tree** | Bapple tree | **KEEP EXISTING ART** |
| `collectible_signed_jersey_legend` | **Signed Lions Jersey** | Framed signed jersey | **REUSE ART + RENAME** |

### Epic — 4

| Internal ID | V1 display name | Existing art | Proposed action |
|---|---|---|---|
| `collectible_portable_sauna` | **The Portable Sauna** | Barrel sauna | **KEEP EXISTING ART** |
| `collectible_burn_barrel` | **The Burn Barrel** | Burn barrel | **KEEP EXISTING ART** |
| `collectible_neon_tony_sign` | **Tony's Neon Sign** | Neon sign | **KEEP EXISTING ART** |
| `collectible_arcade_cabinet` | **Feasel Fables** | Arcade cabinet → **retired, preserved** | **REPLACE ART** |

### Rare — 8

| Internal ID | V1 display name | Existing art | Proposed action |
|---|---|---|---|
| `collectible_cookie_tote` | **McDonald's Cookie Bag** | Cookie bag | **KEEP EXISTING ART** |
| `collectible_reddiwip` | **The Reddi-wip** | Reddi-wip can | **REUSE ART + RENAME** |
| `collectible_singing_fish` | **Bloody Cottage Inn Box** | Singing fish → **retired, preserved** | **REPLACE ART** |
| `collectible_pinball_machine` | **Jimmy's Crown Vic** | none | **NEW ART REQUIRED** |
| `collectible_lava_lamp` | **Berardo Files** | none | **NEW ART REQUIRED** |
| `collectible_crt_tv` | **The Bryan Birth Control Detector** | none | **NEW ART REQUIRED** |
| `collectible_freddy_bowl` | **Freddy's Bowl** | none | **NEW ART REQUIRED** |
| `collectible_revolution_poster` | **Join the Revolution Sign** | none | **NEW ART REQUIRED** |

### Common — 10

| Internal ID | V1 display name | Existing art | Proposed action |
|---|---|---|---|
| `collectible_arcade_token` | **Tony's Token** | Brass token | **KEEP EXISTING ART** + **INVESTIGATE PRESENTATION VARIANT** (§G) |
| `collectible_parmesan_shaker` | **A Single Bapple** | none | **NEW ART REQUIRED** |
| `collectible_napkin_dispenser` | **For Sale: $3 FAAB** | none | **NEW ART REQUIRED** |
| `collectible_booth_cushion` | **Ronald's Broken Controller** | none | **NEW ART REQUIRED** |
| `collectible_paper_menu` | **Kickers Lives Matter** | none | **NEW ART REQUIRED** |
| `collectible_receipt_spike` | **The Missing Topouzian Files** | none | **NEW ART REQUIRED** |
| `collectible_pizza_cutter` | **Most Compliant Award** | none | **NEW ART REQUIRED** |
| `collectible_ketchup_bottle` | **Berardo Tombstone** | none | **NEW ART REQUIRED** |
| `collectible_coffee_mug` | **Jet's Pizza Box** | Diner mug → **retired, preserved** | **REPLACE ART** + **COMMISSIONER RULING REQUIRED** (§I) |
| `collectible_checkered_cloth` | **Tony's Boombox** | Checkered tablecloth → **retired, preserved** | **REPLACE ART** |

**Totals: 10 · 8 · 4 · 2 = 24.** ✓

### C.1 The one rarity tension, and the free fix

**Feasel Fables lands in an epic slot, and its art direction is written in legendary
language** — *"grand, mysterious, treasured, almost sacred-manuscript energy, forbidden
or profound knowledge."* Your own stranger-test lists *"a magnificent sacred-looking
book"* **first**. It sits in epic only because both legendary slots are held by items
whose finished art is being reused.

**Both legendary slots can be re-tenanted at zero art cost**, because a slug is opaque
and the jersey sprite can be wired to any slot:

| | `collectible_bapple_tree` | `collectible_signed_jersey_legend` | `collectible_arcade_cabinet` |
|---|---|---|---|
| **Option 1** *(mapped above)* | The Bapple Tree — legendary | **Signed Lions Jersey — legendary** | **Feasel Fables — epic** |
| **Option 2** *(recommended)* | The Bapple Tree — legendary | **Feasel Fables — legendary** | **Signed Lions Jersey — epic** |

**Option 2 costs nothing.** No art is generated or discarded, the jersey sprite is simply
wired to the epic slot instead. The same 16 sprites are needed either way. No rarity is
changed; only which concept sits in which permanent slot, which is the mapping exercise
itself.

**Recommendation: Option 2.** The legendary tier becomes *The Bapple Tree* and *Feasel
Fables* — the two pieces of pure league mythology, the two objects that look like they
should not exist. The framed signed jersey is, by this catalog's own logic, the **least**
legendary thing in it: it is the one artifact a stranger would fully understand.

**One-word ruling needed.** Everything else in this report holds under either option.

### C.2 Why each free slot got what it got

- **The single epic** went to the item whose art direction demands the most presence.
- **Bloody Cottage Inn Box is rare, Jet's Pizza Box is common** — your explicit ruling
  that the bloody one feel more special, satisfied by a 3.5% vs 6.0% pull rate and by
  tier framing at the reveal.
- **Jimmy's Crown Vic is rare**, as required.
- **The Bryan Birth Control Detector is rare** because it is the biggest single "what the
  hell is that" spike in the catalog, and it landed on `collectible_crt_tv` — a slug that
  already meant *chunky boxy electronics with a screen*, the best slug fit in the table.
- **The Missing Topouzian Files is common on `collectible_receipt_spike`** — a paperwork
  slug for a paperwork item. An absence joke is one that *improves* with repetition, and
  putting the two file items at different tiers separates how often they are seen.
- **Tony's Boombox is common on purpose.** It is the one item designed to carry rotating
  copy (§H), and rotating copy is worth most on the item seen most.
- **Berardo Tombstone is common**, so Berardo keeps turning up in your pizza boxes. That
  is the joke improving with frequency, not being wasted.
- **Kickers Lives Matter took `collectible_paper_menu`**, the one common slug already
  briefed as a thing that hangs.

---

## D. Existing-art audit — verified against the filesystem and git

**Exactly twelve collectible sprites exist and have ever existed** in this repository —
confirmed against full git history including deletions. There is no unused, archived or
orphaned collectible art, and **no art from any previous image session is recoverable
from the repo**. If sprites were generated outside git, they are not here.

### D.1 Eight survive — do not regenerate

| Sprite | Serves | Note |
|---|---|---|
| `collectible_bapple_tree` | The Bapple Tree | Verified by eye: Busch Light Apple-style cans on a potted tree. Correct |
| `collectible_signed_jersey_legend` | Signed Lions Jersey | Blue-and-silver, illegible scrawl, **no logos, no number, no name**. Already compliant with the Lions concept without a single protected mark (§I) |
| `collectible_portable_sauna` | The Portable Sauna | Barrel sauna, per exception 6 |
| `collectible_burn_barrel` | The Burn Barrel | |
| `collectible_neon_tony_sign` | Tony's Neon Sign | |
| `collectible_cookie_tote` | McDonald's Cookie Bag | Verified by eye: the arches really are on it. Exception 7 |
| `collectible_reddiwip` | The Reddi-wip | Exception 3 |
| `collectible_arcade_token` | Tony's Token | Exception 1 |

**Not one of these needs regenerating, and two of them are pure renames** — the jersey
and the Reddi-wip change display name only.

### D.2 Four are displaced — retired, not deleted

| Sprite | Was | Its slot now holds |
|---|---|---|
| `collectible_arcade_cabinet` | Arcade cabinet | Feasel Fables *(or Signed Lions Jersey under Option 2)* |
| `collectible_singing_fish` | Novelty singing fish | Bloody Cottage Inn Box |
| `collectible_coffee_mug` | Diner coffee mug | Jet's Pizza Box |
| `collectible_checkered_cloth` | Checkered tablecloth | Tony's Boombox |

**A concrete implementation hazard, found here rather than at merge.** `art:process`
writes to `public/assets/collectible/<slug>.png`. Because the slugs are being reused,
generating new art for these four **overwrites the existing sprites in place**. Preserving
them is not automatic.

**The mechanism already exists.** `ASSET_PIPELINE §3`: *"Retiring an asset never deletes
its history"*, and `registry.test.ts` already asserts that a retired slug counts as
neither placeholder nor art. So Phase B must, **before** any replacement art is processed:
move each file to a preserved path, add a **new registry row** with `art_status: retired`
pointing at it, and leave the active slug's row to receive the new art. Four rows, no
deletions, fully reversible.

**Note for Option 2:** if Feasel Fables takes the legendary slot, the arcade cabinet
sprite is still displaced — the jersey sprite simply moves to the epic slot instead. The
retirement list is identical under both options.

### D.3 The art bill, honestly

| | |
|---|---|
| Sprites surviving unchanged | **8** |
| Sprites displaced and retired | **4** |
| **New sprites required** | **16** — 9 common, 6 rare, 1 epic |

**This is four more than the previous plan, and that is the price of the curation.**
The old plan owed 12 because four finished sprites were being kept for generic items.
Those four items are gone, so their slots need art.

### D.4 The schedule conflict this creates — report, not objection

The freeze criteria in §K include *"no active V1 collectible renders the generic
placeholder."* That is **a change to a standing architectural commitment**, and it should
be made knowingly:

- `art/ASSET_PIPELINE.md §5`, `art/prompts/collectible.md` and `docs/OPEN_ITEMS.md` **A5**
  all commit to **12-of-24 finished at launch**, with `placeholder_pizza_box` as a
  *designed* in-world stand-in — an item still in its box.
- **`lib/assets/art-slots.test.ts` asserts the 12-of-24 split as two hard literals** —
  `expect(byStatus('placeholder')).toBe(12)` and `expect(byStatus('generated')).toBe(12)`.
  This is stronger than "permits placeholders": it **requires** exactly twelve of each.

**That literal pair goes red on the first sprite delivered**, not at the freeze. It is a
correctly-working guard against the split drifting silently, and it now has to move with
the batch. Handled in Phase D — see §L.2.4.

Requiring 24-of-24 converts art from *deferred and acceptable* into a **hard launch
blocker: 16 sprites in roughly four weeks.** Nothing about that is impossible — the
pipeline is mechanical and a batch of twelve has been delivered before — but it is a real
change of state and it should be your decision rather than a side effect.

**If the schedule slips, the graceful degradation already exists and costs nothing:**
ship with the commons complete and let the remaining slots draw the pizza box, exactly as
the product does today. The catalog content is correct either way; only the picture is
missing. **Recommendation: keep 24-of-24 as the target, do not make it a launch gate**
until the commons are in hand and the real burn rate is known.

---

## E. Art production queue

Ordered by pull frequency first — one common sprite is seen **1.7×** as often as a rare
and **6×** as often as an epic — with a prototype pass pulled forward where thumbnail
readability is genuinely uncertain.

### E.0 Prototype pass — 3 sprites, before the batch

These three carry the catalog's two hardest silhouette problems. Getting them wrong at
batch scale means redrawing four items, not one.

| # | Item | Proves |
|---|---|---|
| P1 | **Berardo Files** | The closed-full folder half of the file pair |
| P2 | **The Missing Topouzian Files** | The open-empty half. **Draw P1 and P2 together and compare at 23px before accepting either** |
| P3 | **Most Compliant Award** | Whether a plaque can be told from a sign at 23px, which decides *Kickers Lives Matter* too |

### E.1 Commons — 9 · 54.0% of every box opened

| # | Display name | Internal ID | Current state | Physical subject | Thumbnail risk | Brand |
|---|---|---|---|---|---|---|
| 1 | **A Single Bapple** | `collectible_parmesan_shaker` | placeholder | One Busch Light Apple-style can, dented, standing | **Low** — inherits the tree's own fruit | **Approved** (ext. of 4) |
| 2 | **Ronald's Broken Controller** | `collectible_booth_cushion` | placeholder | Gamepad, snapped, crudely taped, asymmetric damage | **Low** | None — generic pad |
| 3 | **Tony's Boombox** | `collectible_checkered_cloth` | **art displaced** | Beaten late-'90s boombox, twin speakers, handle | **Low** — widest, most distinct outline in the batch | None |
| 4 | **Jet's Pizza Box** | `collectible_coffee_mug` | **art displaced** | Clean **square** pizza box, closed, flat | **Medium** — pairs with #12 | **RULING NEEDED** |
| 5 | **For Sale: $3 FAAB** | `collectible_napkin_dispenser` | placeholder | Loud jagged dealership windshield starburst | **Low** — nothing else is a starburst | None |
| 6 | **Berardo Tombstone** | `collectible_ketchup_bottle` | placeholder | Small rounded-top headstone, standing | **Low–Med** — vs the plaque | None |
| 7 | **Most Compliant Award** | `collectible_pizza_cutter` | placeholder | Corporate recognition plaque, gold seal, bevel | **High** — see E.0 / §F | None — **no Cadillac mark** |
| 8 | **Kickers Lives Matter** | `collectible_paper_menu` | placeholder | Hand-made picket sign **on a stake** | **High** — the stake is the whole fix | None |
| 9 | **The Missing Topouzian Files** | `collectible_receipt_spike` | placeholder | Open file sleeve/box, contents visibly **absent** | **High** — see E.0 / §F | None |

### E.2 Rares — 6 · 21.0%

| # | Display name | Internal ID | Current state | Physical subject | Thumbnail risk | Brand |
|---|---|---|---|---|---|---|
| 10 | **Berardo Files** | `collectible_lava_lamp` | placeholder | Closed, bulging manila folder, tab, redaction bar | **High** — see E.0 / §F | None |
| 11 | **The Bryan Birth Control Detector** | `collectible_crt_tv` | placeholder | Chunky homemade handheld detector, antenna, gauge | **Medium** | None |
| 12 | **Bloody Cottage Inn Box** | `collectible_singing_fish` | **art displaced** | Battered pizza box, lid ajar, dark-red staining | **Medium** — pairs with #4 | **Approved this handoff — needs recording** |
| 13 | **Jimmy's Crown Vic** | `collectible_pinball_machine` | placeholder | Die-cast boxy sedan, model-car presentation | **Low** | None — shape only, no badge |
| 14 | **Freddy's Bowl** | `collectible_freddy_bowl` | placeholder | Dented low wide dog bowl | **Low** | None — **no baked name** |
| 15 | **Join the Revolution Sign** | `collectible_revolution_poster` | placeholder | Creased poster, raised fist, torn curling edges | **Medium** | None |

### E.3 Epic — 1 · 2.5%

| # | Display name | Internal ID | Current state | Physical subject | Thumbnail risk | Brand |
|---|---|---|---|---|---|---|
| 16 | **Feasel Fables** | `collectible_arcade_cabinet` *(or the legendary slot under Option 2)* | **art displaced** | Ornate thick tome, clasps, raised spine bands, corner bosses | **Medium** | None |

### E.4 Art-direction notes

| Item | Core silhouette | Essential cue | Runtime text supplies | Collision risk | Form | Style ref |
|---|---|---|---|---|---|---|
| A Single Bapple | Short wide can | Red body, white label band, blue crest | "A Single Bapple" | Reddi-wip — **keep its nozzle pronounced, keep this top flat** | shelf | `collectible_bapple_tree` |
| Ronald's Broken Controller | Wide two-grip pad with a **visible break** | The snap and the tape | "Ronald's" | Detector, boombox | shelf | — |
| Tony's Boombox | Wide box, **two big speaker circles**, handle arc | Speakers | Song references, later | Detector | shelf | `collectible_arcade_cabinet` |
| Jet's Pizza Box | **Square**, closed, clean, flat | Ordinariness | "Jet's Pizza Box" | Cottage Inn box | shelf | — |
| For Sale: $3 FAAB | **Jagged starburst** | Loud sale-sticker colour | The price | none | **wall** | — |
| Berardo Tombstone | **Rounded-top** standing stone | The round top | The Berardo link | Most Compliant plaque | shelf | — |
| Most Compliant Award | Portrait plaque, **bevelled frame + gold seal disc** | The seal | Cadillac of Novi / HR context | Kickers sign, tombstone | **wall** | — |
| Kickers Lives Matter | Sign board **on a stake** | The stake breaking the rectangle | The exact phrase | Award, poster | flexible | — |
| Missing Topouzian Files | **Open** sleeve, ragged gap where papers are not | **Absence in the outline** | The punchline | **Berardo Files** | shelf | — |
| Berardo Files | **Closed**, bulging, tab up, hard dark bar | Manila warmth vs paper white | The Berardo link | **Missing Topouzian** | shelf | — |
| Bryan Detector | Tall small body, **antenna breaking the top edge**, gauge | The antenna | The entire joke | Boombox, controller | shelf | — |
| Bloody Cottage Inn Box | Battered box, **lid ajar**, drip breaking the outline | Dark-red staining | Nothing needed | **Jet's box** | shelf | — |
| Jimmy's Crown Vic | Boxy sedan profile | Crown Vic proportions | Who Jimmy is — **never explained** | none | shelf | — |
| Freddy's Bowl | Low wide bowl | Dents | "Freddy's" | none | shelf | — |
| Join the Revolution Sign | **Torn, curling** paper edges | Raised fist | The phrase | Award, Kickers | **wall** | — |
| Feasel Fables | **Thick** book, clasps, corner bosses, spine bands | Weight and ornament | "Feasel Fables" | Files, folders | shelf | — |

**Two rules for the whole batch, both already project policy:** no baked text is
load-bearing at 23px, and Feasel Fables may look luminous through **value contrast only**
— no baked bloom, because rarity framing is composited at runtime.

---

## F. Thumbnail collision audit — the 24 as a set

Six collision groups. **Every solution below is a silhouette solution. Not one depends on
readable text.**

| Group | Members | Solution |
|---|---|---|
| **Files** | Berardo Files *(rare)* · Missing Topouzian Files *(common)* | **Closed-and-full vs open-and-empty.** Berardo is a bulging closed folder, tab breaking the top edge, warm manila, one hard dark bar. Topouzian is an **open** sleeve with a ragged void where papers should be — the absence is in the outline, not the interior. Different **outer shape**, not different contents. Different tiers also separates how often they appear |
| **Boxes** | Jet's *(common)* · Bloody Cottage Inn *(rare)* | **Square-clean-closed vs rectangular-battered-ajar.** Jet's is famously a square box; Cottage Inn's is a conventional rectangle — a real-world difference doing free work. The bloody one's lid lifts and a stain **drips past the box edge**, which changes the outline itself |
| **Cans** | A Single Bapple *(common)* · The Reddi-wip *(rare)* | The aerosol's **angled nozzle** must stay pronounced; the Bapple stays flat-topped and shorter/wider. The Reddi-wip is already painted, so only the Bapple has to be drawn to differ |
| **Rectangles** | Kickers sign · Most Compliant Award · Join the Revolution · Signed Lions Jersey | Four rectangles, four different outlines: **a stake** below the sign · a **gold seal disc** and bevelled frame on the plaque · **torn curling edges** on the poster · a **jersey shape with shoulders** inside the frame. This is the group most likely to fail, which is why E.0 prototypes it |
| **Small electronics** | Bryan Detector · Tony's Boombox · Ronald's Broken Controller | **Tall-with-antenna vs wide-with-two-circles vs wide-with-a-break.** Three genuinely different outlines, low risk if the antenna and the speakers are drawn boldly |
| **Stone vs plaque** | Berardo Tombstone · Most Compliant Award | The tombstone's **rounded top** is the entire differentiator. The plaque stays hard-cornered and portrait |
| **Book vs file** | Feasel Fables · both file items | The book must read **thick** — a visible page block and spine depth — with clasps and corner bosses breaking its outline. A folder is flat; a tome is not |

**Residual risk after these fixes: the rectangle group.** It is four items and three of
them are commons, so it is the group a manager meets most. Prototype it first.

---

## G. Tony's Token — cosmetic denominations

**Finding: presentation-only is architecturally possible, but neither available route
survives the display sizes, and one collides with a shipped gate. Ship static in V1.**

### What was checked

- **Runtime text over a baked blank field** is the parlor's own invariant and is
  implemented — for the Tonight board, at room scale. **It is not implemented anywhere at
  collectible scale.** The championship ring is the case everyone cites, and the shipped
  code does something different: `components/counter/championships.tsx` renders the year
  in a `<span>` **beside** the sprite, not over the bezel. The overlay pattern is
  specified in `BRAND_EXCEPTIONS.md` and `BATCH_F §3.3` and does not exist in code.
- **`AssetView` renders a single `<img>`.** There is no overlay slot, so the runtime-text
  route is a component change, not a registry change.
- **The blocker is the type floor.** `checkTypeFloor` in `scripts/visual-qa.mts` measures
  the *computed* size of **every rendered text node** at every state and width, with
  exactly **one** declared exemption — `banner-year`, the season on the pennant. A
  denomination numeral over a token would need a second, and the standing rule is
  explicit that **a second kind of that exemption is itself a failure**.

### The measurement that settles it

The token is drawn at **46 CSS px** on the collection shelf and **23 CSS px** in a
Showcase league row. A legible numeral needs roughly 8–10px of glyph height. At 46px that
is a fifth of the token's diameter — tight but possible. **At 23px it is not possible by
any route**, baked or runtime. So a denomination is invisible on the surface where the
league sees each other's collections, which is where the joke would have to land.

### Recommendation

1. **V1: ship the existing static token.** No change of any kind.
2. **Smallest future path, if pursued: pre-baked deterministic variants.** One slug, N
   PNGs, picked by a hash of `collectibles.id` — a column that already exists. Zero
   runtime text, so **no type-floor exemption is needed and the gate stays intact.** Cost
   is a `variants` array on the registry record plus a deterministic picker, and N
   sprites. One permanent ID, one collection slot, one rarity, no economic difference.
3. **Do not pursue the runtime-overlay route.** It buys nothing the pre-baked route does
   not, and it costs the integrity of a shipped visual gate.

---

## H. Tony's Boombox — rotating song references

**Finding: fully supported by existing architecture. No schema change, no new system, no
audio.**

`content_entries` is the one approved content engine and already carries everything this
needs: `surface` (free text, indexed), `template_text`, `weight`, `cooldown_days`,
`max_uses_per_season`, `active`, `sensitivity`. **Rotation, cooldown and weighting are
free** — they are the same machinery that stops Tony repeating a greeting.

Three surfaces already ride this path — counter greetings, box offers, stats asides —
each as one markdown file in `content/` plus a parser, a seeder and a selector. A fourth
is the same shape.

**The only thing missing is the flavour-text surface itself (§0)**, which is one render
slot. Once it exists, the boombox is *"add rows to a markdown file"* — and so is every
other item's punchline.

**Keying:** `surface = 'collectible:collectible_checkered_cloth'`. Free text, indexed,
no schema change.

**Explicitly not built and not proposed:** audio, playback, playlists, media storage,
streaming, a song database, any new mechanic. **For V1 the boombox is a static
collectible**, and that is sufficient.

---

## I. Brand and policy audit

Read from `art/ART_SPEC.md §10` and `docs/art/BRAND_EXCEPTIONS.md`, not from memory.

**The governing rule, verbatim:** *"No third-party trademarks, no team logos, no real
player likenesses, no real signatures, no copied restaurant branding, no unapproved brand
marks."* Exceptions are itemized, never categorical.

| Reference | Classification | Note |
|---|---|---|
| **Busch Light Apple** — Bapple Tree | **ALREADY APPROVED** | Exception 4 |
| **Busch Light Apple** — A Single Bapple | **APPROVED, needs recording** | Exception 4 is scoped to the tree's slug. You ruled the extension in round 2; it needs to be written into `BRAND_EXCEPTIONS.md` as part of Phase A, not assumed |
| **McDonald's** — cookie bag | **ALREADY APPROVED** | Exception 7. Art shipped with the arches |
| **Reddi-wip** | **ALREADY APPROVED** | Exception 3 |
| **Tony's own marks** — token, neon sign | **ALREADY APPROVED** | Exceptions 1, 2, plus the 2026-07-29 house-branding rule |
| **Cottage Inn** | **APPROVED IN THIS HANDOFF, needs recording** | Not previously in the list. Your ruling here is the approval; it must be recorded as a new numbered exception before the sprite is generated |
| **Cadillac / Cadillac of Novi** | **DOES NOT REQUIRE BRAND ART** | Your own ruling puts the context in flavour text and keeps the mark off the sprite. No exception needed |
| **Game console branding** | **DOES NOT REQUIRE BRAND ART** | A generic gamepad silhouette is unmistakable without a platform mark |
| **Ford / Crown Victoria** | **ALREADY SAFE UNDER EXISTING RULE** | Recognition is carried by the ex-police-sedan **proportions**, with no badge, grille mark or wordmark. Same principle the Cottage Inn ruling states |
| **Jet's Pizza** | ⚠ **NEEDS COMMISSIONER RULING** | **Not covered by any existing exception.** *"No copied restaurant branding"* applies directly. Flagged, not resolved, and not silently genericized |
| **Detroit Lions — the artwork** | **ALREADY SAFE** | `ART_SPEC §10` already approves *"Detroit football expressed through colour, silhouette and a generic number"* (2026-07-29). **The existing jersey sprite carries blue-and-silver, an illegible scrawl, no logo, no number and no name — it is already compliant and needs no change** |
| **Detroit Lions — the runtime name** | ⚠ **NEEDS A ONE-LINE RULING** | See below |

### I.1 Jet's — the two ways out

The policy bans copied restaurant branding, and the joke's whole point is that Jet's is
the ordinary counterpart to the Cottage Inn box. Either:

- **(a) Approve Jet's as a numbered exception**, symmetrical with Cottage Inn, and let the
  square box and its colours carry recognition with no legible lettering. **Recommended** —
  the pair only works if both are recognisable, and approving one but not the other is the
  worst of both.
- **(b) Draw it as an anonymous square pizza box** and let the display name *"Jet's Pizza
  Box"* carry it — the name is text, not a mark.

Either is defensible. **(a) is one sentence and it makes the pair land.**

### I.2 "Lions" in the display name

`ART_SPEC §10` is a **rights rule about artwork**. It says nothing about product copy, and
the product already surfaces real NFL team and player facts throughout the Slice and the
Stats layer — so a team name in a string is not a new category of thing.

**Recommendation: keep "Signed Lions Jersey" and change nothing about the art.** The
mismatch is only that the art policy carefully says *"Detroit football"* where this name
says *"Lions"*, and that is a naming preference, not a conflict. If you would rather they
agree, **"Signed Detroit Jersey"** is the alternative. **Do not** add a logo, a number, a
name or a signature to the sprite to justify either name.

---

## J. Flavour-text plan — which items need it, and what kind

Planning only; no copy written. Depends on §0 shipping.

| Kind | Items | Why |
|---|---|---|
| **Punchline** — the sprite deliberately cannot explain itself | For Sale: $3 FAAB · Kickers Lives Matter · Most Compliant Award · The Bryan Birth Control Detector · Ronald's Broken Controller | The joke is in the words and the art must not attempt it |
| **Intentionally mysterious** — say less than the reader wants | Berardo Files · The Missing Topouzian Files · Berardo Tombstone · Bloody Cottage Inn Box · Feasel Fables · Join the Revolution Sign | `14 §21` lists Berardo's exile, the Cottage Inn motive, the origin of *Join the Revolution* and the truth of Feasel stories as things that **must remain unexplained**. Flavour text here should confirm something happened and refuse to say what |
| **Future rotating copy** | Tony's Boombox · Jimmy's Crown Vic | The boombox is the designed home for rotating song references (§H). The Crown Vic can rotate on *who Jimmy is* while never answering |
| **Straightforward** | The Bapple Tree · A Single Bapple · The Portable Sauna · The Burn Barrel · Tony's Neon Sign · Tony's Token · McDonald's Cookie Bag · The Reddi-wip · Freddy's Bowl · Jet's Pizza Box · Signed Lions Jersey | The object already says it. A short line in Tony's voice, no explanation |

**Eleven of twenty-four are punchline-or-mysterious**, which is the measurement that makes
§0 a real dependency rather than a nicety.

---

## K. Wall / shelf / display balance

No new placement mechanic. All four room slots accept all twenty-four items today and
this changes nothing about that; this is a check that the catalog gives a decorated room
something to look at.

| Form | Items | Count |
|---|---|---|
| **WALL** | Signed Lions Jersey · Tony's Neon Sign · Join the Revolution Sign · Most Compliant Award · **For Sale: $3 FAAB** | **5** |
| **FLEXIBLE** | Kickers Lives Matter *(leans or hangs)* · Berardo Tombstone *(stands anywhere)* | 2 |
| **SHELF / TABLETOP** | the remaining seventeen | 17 |

**The headline: common-tier wall items go from zero to three** — the FAAB sticker, the
Most Compliant plaque and the Kickers sign. `docs/CATALOG_SIZING.md` measured that **35%
of managers had nothing to hang in their room's picture frame by week 8** because not one
common was a wall item; three commons is a decisive fix, better than either previous plan.

**Furniture-scale objects drop from five to four** (Bapple Tree, sauna, burn barrel,
tombstone) — the arcade cabinet and pinball machine are both gone, which is the direction
the art brief already asked for.

**One imbalance worth naming:** seventeen shelf objects is a lot, and four of them are
box-or-paper shapes. §F is the mitigation and it is sufficient, but it is why the
prototype pass exists.

---

## L. Freeze and test plan

### L.1 Already proven — do not weaken any of these

| Requirement | Proven by |
|---|---|
| Exactly 24 active collectibles | `lib/counter/catalog.ts` `CATALOG_SIZE = 24` · `lib/assets/art-slots.test.ts:37` · `lib/economy/catalog-audit.test.ts:23` |
| Tier counts sum to 24 | `catalog-audit.test.ts:92` |
| Rarity mass 60 / 28 / 10 / 2 | `catalog-audit.test.ts:106`, read through the audit rather than restated |
| Prices and salvage unchanged | `lib/counter/tokens.test.ts` · `lib/counter/economy.test.ts` release gate |
| A stored slug must resolve | `catalogItem()` throws rather than returning a hole; `collection.test.ts` covers the unknown-slug case |
| Every slug resolves to art or a placeholder | `lib/assets/registry.test.ts` |
| A real file exists behind every asset claiming art | `registry.test.ts` |
| A retired slug counts as neither placeholder nor art | `registry.test.ts` — **this is what makes the four displaced sprites safe** |
| Duplicate/salvage rules, idempotency, ownership | `boxes.test.ts` · database constraints · `showcase.test.ts` |

### L.2 The four smallest missing tests

**1. The frozen slug list.** Nothing today pins *which* twenty-four slugs exist — only
that there are twenty-four. A test asserting the exact sorted slug list makes an
accidental ID rename impossible. **This is the single most valuable addition**, because
ID stability is the whole basis of the safe-swap strategy.

**2. The reward-table version fingerprint.** Pin `standardRewardTable().version` to its
literal string. That one assertion **is** the proof the handoff asks for — that a
presentation-only change did not move the probability fingerprint. It fails loudly if a
slug, a rarity or a weight ever moves, and it passes untouched through every rename in
this document.

**3. The exact tier shape.** Assert `catalogShape()` is `{common: 10, rare: 8, epic: 4,
legendary: 2}` literally. Today only the *sum* is pinned against the real catalog — the
identical-looking literal in `lib/economy/catalog-sizing.test.ts:33` is an **input fixture
to the simulation**, not an assertion about the shipped catalog, so it proves nothing here.

**4. The art-progress guard has to move with the batch, and then invert.** This is a
sequencing item rather than a new test. `art-slots.test.ts` pins `placeholder == 12` and
`generated == 12` as literals, so **it fails on the first delivered sprite.** Do not
delete it — it is the guard that stops the launch commitment drifting unnoticed. Two steps:

- **Phase D, with the first batch:** replace the two literals with a single monotonic
  assertion — `generated ≥ 12` and `placeholder + generated == CATALOG_SIZE` — so progress
  passes and regression still fails.
- **Phase F, at the freeze:** replace that with the real requirement — every catalog slug
  has a real path and an `art_status` of `generated` or `approved`, so **no active V1
  collectible can render the placeholder.** Only add this once the sprites are in hand;
  added earlier it turns CI red for a month.

### L.3 Files that must move with the content, or they become quietly wrong

- `lib/economy/catalog-audit.ts` — `ITEM_FORM`. Exhaustive over the catalog, so it will
  not *fail* (slugs are unchanged), but its values become wrong: `singing_fish: 'wall'`
  would describe a pizza box. **A silent wrongness, which is why it is listed.**
- `lib/demo/apply.test.ts:361` — the one string assertion in the repository bound to a
  display name.
- `lib/demo/apply.ts` — the `pull-whipped-cream` comment.
- `lib/assets/batches.ts` + `batches.test.ts` — B and B2 manifests describe deliveries for
  four slugs whose art is being replaced. A new batch manifest is needed.
- `art/prompts/collectible.md` — every SUBJECT line.
- `docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` — **fully superseded.**
- `docs/CATALOG_SIZING.md` §1.1 form table — the "no common is a wall item" finding is
  fixed and the table should say so.
- `docs/OPEN_ITEMS.md` **A5** — restated in terms of 16.
- `docs/art/BRAND_EXCEPTIONS.md` — Cottage Inn, the Bapple extension, and Jet's if
  approved. **Its heading still says "six exceptions" while it contains seven.**

---

## M. Implementation sequence

**Phase A — mapping and policy.** Registry names for all 24 · the optional `name` field
so a name can differ from the image `alt` (*"Feasel Fables"* is a name, not a description)
· `ITEM_FORM` · the one test string · **record the brand rulings before any art is
generated** · ship the flavour-text surface (§0) since it is one file and eleven items
depend on it. **No art moves in this phase, and the catalog is content-correct at the end
of it** — every item drawing the pizza box, which is a legitimate shipped state.

**Phase B — retire and reuse, before anything is generated.** Move the four displaced
PNGs to preserved paths and add their retired registry rows **first**, or `art:process`
overwrites them. Then confirm the eight survivors resolve under their new names.

**Phase C — the prototype pass.** Three sprites (E.0). Compare at 23px. Accept or redirect
before committing to the batch.

**Phase D — commons.** Nine sprites, 54% of every box opened. **The first commit of this
phase must also relax `art-slots.test.ts`'s 12/12 literals to the monotonic form (§L.2.4),
or the batch cannot land.**

**Phase E — rares, then the epic.** Six, then one.

**Phase F — freeze.** Add the frozen slug list, the reward-table version fingerprint and
the literal tier shape, then invert the art guard into the placeholder ban.

**Two deviations from the sequence in the handoff, both earning their place:** the
prototype pass is inserted before the batch because four items share two collision
problems, and Phase A ships the flavour-text surface early because it is small, it
unblocks eleven punchlines, and it lets the whole catalog be content-correct while the art
is still being drawn.

---

## N. What needs a ruling

Only these. Everything else is settled by the handoff, the repository or existing policy.

1. **Feasel Fables legendary, or Signed Lions Jersey legendary?** (§C.1.) Costs nothing
   either way. **Recommend Feasel.**
2. **Jet's Pizza — approve as a brand exception, or draw an anonymous square box?** (§I.1.)
   **Recommend approving**, symmetrically with Cottage Inn.
3. **"Signed Lions Jersey" or "Signed Detroit Jersey"?** (§I.2.) Art is unchanged and
   already compliant either way. **Recommend keeping Lions.**
4. **Is 24-of-24 finished art a launch gate, or a target?** (§D.4.) 16 sprites in ~4
   weeks. **Recommend target, not gate** — the placeholder is a designed state and the
   catalog is funny before it is painted.

**Not blockers and not asked:** who Jimmy is, what happened to Berardo, what the Bryan
detector is about. The catalog is allowed to contain unexplained lore, and §J plans for it
deliberately.

---

## O. What was not done

No product code, schema, migration, registry row, rarity, price, salvage value, odds,
weight, catalog size or reward-table version was changed. No artwork was generated,
processed, moved or deleted. No internal ID was renamed. No PR was opened, nothing merged.
`CATALOG_SIZE` stays 24 and `docs/OPEN_ITEMS.md` **G2** (24 → 32) is untouched and stays
deferred.
