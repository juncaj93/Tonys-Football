# Collectible catalog readiness — can the approved 24 be applied safely?

**Status:** **investigation only, 2026-08-12.** No catalog entry, art file, rarity,
weight, migration or test was changed by the work this document records.

**Why it exists.** A commissioner-owned workstream is curating *which* twenty-four
collectibles launch. This document answers the engineering half — **what it costs
to apply that ruling once it arrives** — measured against the running code rather
than against the older design documents, several of which turned out to be wrong.

**Read `docs/CATALOG_SIZING.md` for how deep the catalog should be** and
`docs/art/BATCH_F_COLLECTIBLE_HANDOFF.md` for the art briefs. This file is the
third question: *can we keep the twenty-four economic slots and replace what the
player sees?*

---

## 1. The answer

**Yes, and with no migration — provided the slug and the rarity of each slot stay
fixed.** Display name, description, artwork and presentation metadata are all
free to change.

The decisive mechanism is one line, `versionOf()` in `lib/counter/rewards.ts`:

```ts
`${entry.slug}:${entry.rarity}:${String(entry.weight)}`
```

The reward table's version hashes **slug, rarity and weight, and nothing else**.
A display name is not in it. So renaming all twenty-four items produces the
byte-identical table version `e768dadb9aec5443`, every stored `reward_tables` row
stays valid, and every recorded roll still replays to the same item.

### What is *not* free

| Change | Cost |
|---|---|
| A slug string | **Identity change.** Stored `collectibles.slug` and `box_openings.collectible_slug` orphan; `catalogItem()` throws on an unresolvable slug. Treat slugs as permanent |
| A slug's rarity | Re-hashes the reward table, and frozen historical `rarity` columns would then disagree with the live catalog |
| The catalog *shape* | 10 / 8 / 4 / 2 is what the P3 simulation was balanced against. Changing it is an economy change, not a content change |
| Catalog *size* | `CATALOG_SIZE = 24`. Growing to 32 is approved but execution-deferred — `docs/OPEN_ITEMS.md` **G2** |

---

## 2. The catalog as the code actually holds it

`lib/counter/catalog.ts` derives everything from `art/assets.inventory.json` via
`assetRegistry`. **There is no catalog table and no second list.** The display
name is the registry's `alt` text.

`RARITIES = ['common', 'rare', 'epic', 'legendary']` — **there is no `uncommon`
tier.** Recorded because a session in this repository has already mis-stated it
once in a written report.

| Tier | Items | Tier mass | Per item | Unpainted |
|---|---|---|---|---|
| common | 10 | 60% | 6.00% | **7** |
| rare | 8 | 28% | 3.50% | **5** |
| epic | 4 | 10% | 2.50% | 0 |
| legendary | 2 | 2% | 1.00% | 0 |

Reward table `e768dadb9aec5443`, `totalWeight` 4000, `provisional: true` until
the P3 simulation signs it off.

**Every epic and legendary is already painted**, so the twelve unpainted items
are exactly the most-pulled twelve: the seven commons are **42.0%** of all box
openings and the five rares a further **17.5%**.

Two collectible-family slugs are deliberately outside the catalog:
`item_championship_ring` (`systemLayer: true`, excluded from every acquisition
path) and `placeholder_pizza_box` (no rarity — the universal stand-in art).

### 2.1 Where identity is named in non-test code — three files, and only three

Nothing in `drizzle/*.sql` contains a collectible slug. Persisted slugs are free
`text`, deliberately not foreign keys: *"Not an FK: the catalog is the registry."*

| File | Holds | Must be edited in the same commit as a rename? |
|---|---|---|
| `lib/economy/catalog-audit.ts` | `ITEM_FORM` — every slug's wall/surface/floor form | **Yes.** Its test asserts exhaustive coverage |
| `lib/assets/batches.ts` | batch membership | **Yes** |
| `lib/demo/apply.ts` | `pull-whipped-cream` → `collectible_reddiwip` | **Yes** |

⚠️ **One test blocks any art landing and is meant to.**
`lib/assets/art-slots.test.ts` hard-codes `expect(byStatus('placeholder')).toBe(12)`
and `expect(byStatus('generated')).toBe(12)`. It is deliberately non-derived —
its own comment explains that deriving it would make it tautological. **Every
batch that lands moves those two numbers on purpose.**

---

## 3. What the basement can display

**Four slots. No floor slot. No placement validation of any kind.**

| Fixture | Hit region | Sprite drawn at | Scaling |
|---|---|---|---|
| `wall` — the picture frame | 100 × 72 | 46 × 46 at `[177, 153]` | none, 1:1 |
| `shelf_left` | 46 × 46 | 46 × 46 at `[140, 216]` | none, 1:1 |
| `shelf_right` | 46 × 46 | 46 × 46 at `[196, 216]` | none, 1:1 |
| `bench` — the desk | 60 × 60 | 46 × 46 at `[263, 292]` | none, 1:1 |

Hit regions are sized for a thumb; art rects are always 46 × 46. Collapsing them
would either shrink the targets to sprite size or stretch every sprite to its
furniture, and the second is the fractional resample the pipeline exists to
prevent.

**Any item may go in any slot.** `lib/rooms/service.ts` records this as a
decision rather than an omission: `04 §10` asks each slot to validate category
compatibility, the shipped catalog has no category axis, and *"a rule nobody can
see costs a manager choices."* `catalog-audit.test.ts` asserts it positively.

`ITEM_FORM`'s wall / surface / floor axis is **art-planning only** — its own
header says it is read by no runtime path, gates nothing and stores nothing.
Six items are marked `floor` and sit on a 46-px shelf plank next to a coffee mug;
that is accepted for the six that exist, and a seventh makes it worse.

---

## 4. The production contract, measured

Verified against `process-art.ts`, `prepare-incoming.ts`,
`validate-collectible.ts` and `art-slots.test.ts`.

### 4.1 Ask the generator for these

Silhouette **readable at 23 × 23** (the Showcase league row, exactly 0.5× — the
binding constraint) · flat front-facing, no foreshortening · one warm key from
upper left, shadows one step darker in the same colour family · ≤ 10 interior
shapes · **no text, no people, no glow, no border, no ground shadow** ·
generated large, never at 46 px.

⚠️ **`art/prompts/collectible.md`'s FAMILY block asks for a "fully enclosed
1-pixel outline in a warm near-black". The twelve shipped sprites do not have
one.** Measured: 12–28 distinct colours each, four to six value steps per
material with visible dithering, and form-shaded edges rather than a keyline.
A prompt written to the file rather than to the shipped art will produce
something flatter than the set it has to join.

### 4.2 Do **not** spend prompt complexity on these — the pipeline does them

`npm run art:prepare-incoming` mechanically performs: background keying
(`--key-background`) · trim to bounding box · reframe to the target aspect ·
horizontal centring · **bottom-anchoring** (`offY = outH - box.height`) ·
44-px max-extent headroom for the reveal's `scale(1.06)` overshoot · removal of
detached debris, keeping only the largest connected component · optional
`--crop x,y,w,h` and `--drop-cool-base`.

Then `npm run art:process`: lanczos downscale to the registry canvas
(`fit: 'fill'`), quantize to `palette.json`, **harden alpha to 0 or 255** at
threshold 128, strip `#000000` / `#FFFFFF`.

This is the manager-sprite lesson applied. `prepare-incoming.ts`'s own header
records that across two batches of candidates **not one arrived correctly
framed**, and the commissioner ruled that framing defects are corrected
mechanically rather than by repeatedly asking a generator for the one thing it
is worst at.

### 4.3 Naming and validation

Incoming `art/incoming/<slug>_NN.png` (auto-numbered so a second candidate never
silently wins) → output `public/assets/collectible/<slug>.png` → `art:process`
writes `path` and `art_status: generated` into the registry itself.

`npm run art:validate` measures a delivered PNG against the slot: exact canvas ·
non-empty · **zero partial alpha** · palette-closed · no pure black or white ·
lowest opaque row is 45 · centre within ±3 of 23 · extent ≤ 44 × 44 · survives
the 23-px halving.

**All twelve shipped sprites pass today**, measured 2026-08-12.

### 4.4 No visual gate photographs a collectible sprite

`checkRevealPresent` asserts a reveal contains a plate, a collectible and a
rarity word; `checkRarityContrast` measures the rarity *word*; `checkColourFidelity`
enforces the palette page-wide. **Sprite quality is validator-checked, not
screenshot-checked**, and that is worth knowing before assuming the sweep would
catch a bad one.

---

## 5. The 46 × 46 contract — keep it

Investigated on the possibility that stranger objects need a second presentation
class. **They do not, and the reason is a measurement.**

The canvas is square; **the object inside it need not be.** Shipped proof:

| | Occupies |
|---|---|
| `collectible_checkered_cloth` | 44 × **17** — wide and low |
| `collectible_reddiwip` | **18** × 44 — tall and narrow |
| `collectible_singing_fish` | 44 × **26** |

The only rules are ≤ 44 on the sides and top, and the bottom row occupied. A wide
sign, a tall bottle and a low cushion all already work.

A second class would need a per-item metadata axis, a second registry canvas,
per-class slot rects, edits at four render sites and a validator change —
and `ITEM_FORM` exists as planning-only precisely to avoid that. **No concrete
reason to change before launch was found.**

The one genuine expressive limit, for the curation workstream rather than for
engineering: a very wide object gets very few rows of detail (a 44 × 12 banner
has twelve), and **anything depending on reading text or recognising a face will
not survive 23 × 23.**

---

## 6. Existing art inventory, from a production standpoint

| Class | Count | |
|---|---|---|
| Registered + shipping | 12 | `public/assets/collectible/`, all `generated`, all pass `art:validate` |
| Processed but unused | 0 | |
| Raw / incoming | 12 | `art/incoming/collectible_*_01.png`, one source per shipped sprite |
| Reference / concept only | 5 | `docs/art/reference/slot-*.png` — slot mockups, not sprites |
| Fails the current contract | 0 | |

### Named concepts, checked by file

| Concept | State |
|---|---|
| McDonald's cookie bag | `collectible_cookie_tote`, rare, shipping |
| Tony's neon sign | `collectible_neon_tony_sign`, epic, shipping |
| Checkered tablecloth | `collectible_checkered_cloth`, common, shipping |
| Bapple | `collectible_bapple_tree`, legendary, shipping |
| Portable sauna | `collectible_portable_sauna`, epic, shipping |
| Tony's pizza box | Exists but is **not a collectible** — `object_box_owned`, family `zone`, 44 × 30, the loot box on the counter |
| **Feasel** | **No file, no slug, no reference anywhere** |
| **Cottage Inn delivery guy** | **Nothing** |
| **Berardo files** | **Nothing** |
| **Topouzian brothers** | **Nothing** |

The last four are net-new art from zero and are the slowest path in any plan
that includes them.

---

## 7. The V1 freeze check — what exists and what is missing

| Criterion | Proven today? | Where |
|---|---|---|
| Exactly 24 collectibles | ✅ | `art-slots.test.ts` |
| Rarity counts unchanged | ⚠️ **partial** | equal weights within a tier and tier ordering are pinned; **10/8/4/2 is not** |
| Every item has unique artwork | ❌ | nothing checks two slugs for one file |
| No placeholder remains | ✅ (inverted) | `art-slots.test.ts` — currently `= 12`, becomes `= 0` |
| Every art slug resolves | ✅ | `registry.test.ts`, two assertions |
| Renders in ≥ 1 basement fixture | ✅ | `catalog-audit.test.ts` |
| Loot-box odds unchanged | ✅ | `rewards.test.ts` version stability |
| Economy inputs unchanged | ✅ | `lib/economy/simulate.test.ts` release gate |
| Existing inventories valid | ⚠️ partial | `catalogItem()` throws on an unresolvable slug, exercised indirectly |

**Smallest additional coverage — three assertions, one file. Not implemented.**

1. Pin the catalog shape: `{common: 10, rare: 8, epic: 4, legendary: 2}`.
2. Pin the reward-table version literal `e768dadb9aec5443`, so a rarity or slug
   change becomes a deliberate act rather than a silent one.
3. Assert art paths are unique.

Plus one operational check that is not a unit test: run `npm run art:validate`
on a complete catalog and confirm it reports `24 of 24`.

---

## 8. Recommended sequence, once the approved 24 arrives

Ordered by what unblocks what. **Nothing here is authorized yet.**

1. **Rename pass, no art.** Apply approved names to `alt`; update `ITEM_FORM`,
   `batches.ts`, `demo/apply.ts`; confirm the reward-table version did not move.
   Ships the same day and every renamed item shows its new name immediately.
2. **Wire any already-finished art.** Today this batch would be empty — nothing
   unregistered exists.
3. **The seven commons** — 42% of every box opened.
4. **The five rares** — 17.5%.
5. **Net-new inside-joke art** for any concept with no file. Slowest; worth
   briefing in parallel with 3.
6. **Freeze check and a visual sweep.**

Batches 3–5 need not be atomic: swapping a placeholder for real art is a file
plus a registry row, so each sprite can land on its own.

---

## 9. Open questions this document does not answer

- **Which twenty-four.** Commissioner-owned, and a separate workstream.
- **Whether the catalog grows to 32.** Approved, execution deferred to ~week 12
  of season one (`OPEN_ITEMS` **G2**).
- **Whether `art/prompts/collectible.md`'s outline instruction should be
  rewritten** to match the shipped sprites, or the shipped sprites are the
  exception. Recorded in §4.1; not resolved here, because that file is pasted
  verbatim into every prompt and changing it changes future art.
