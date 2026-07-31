# M3 — the character boundary, prepared

**Status:** partly implemented, 2026-07-31. The data layer, the compositor and the service exist (`drizzle/0008_character_identity.sql`, `lib/character/`); the manager-facing surface does not. Tony's homepage rendering is untouched.

> **Correction, 2026-07-31.** `§2` below proposed a seven-layer set with `back` and `bottoms` slots at a `64 × 64` canvas. **That was invented, and it was wrong.** The slots, the canvas and all twenty slugs were already canon in `art/assets.inventory.json` — `avatar_hair_01`, `wear_head_pizza_visor`, `32 × 48`, slots `hair` · `body` · `face` · `head` · `hand`. `lib/character/layers.ts` implements the canonical set and `lib/character/character.test.ts` fails the build if the two ever disagree. The reasoning in `§2`–`§7` about *ordering*, *ownership*, *clipping* and *registry conventions* all survives; only the specific layer names and the canvas were wrong. Read the code, not `§2`'s table.

The commissioner's instruction is explicit: *"Do not begin full final character implementation yet. You may safely prepare the schema, the contracts, the layer ordering, the compositing rules, the clipping tests, the registry conventions, the preview fixture design, the migration strategy, and the specification for manager avatars versus Tony."*

This file is that preparation. It is a **decision record with the decisions made in advance**, so that when M3 opens the work is implementation rather than design, and so that nobody arrives at it having to re-derive what the room already fixed.

---

## 0. What already exists, and what must not move

| | |
|---|---|
| **Tony on the homepage** | **Baked art.** `character_tony_neutral` · `_pleased` · `_unimpressed`, drawn into the room portrait's foreground layer at a fixed scale and position. `lib/parlor/tony-scale.test.ts` fails the build if the scale changes. |
| **The 24 collectibles** | `46 × 46`, bottom-centre anchored, drawn on the tray, the shelf and the Showcase. |
| **The twelve wearables and five slots** | Specified in `03`. **Not built.** Wearable *equipping* is M3's, recorded in the ruling index so it is not read as an M2 omission. |
| **`equipped-wearable`** | A named demo state that `lib/demo/apply.ts` refuses with a sentence saying why. It is in the catalog on purpose — a state that cannot be produced yet is honest; a state quietly absent is not. |

**The preserved baseline.** `M1` is a visual baseline (`docs/CHECKPOINT.md`): no later milestone may reintroduce Tony clipping, tiny type, contaminated colour, blurred pixel art, or visibly unfinished states. Two of those are *specifically* character defects that shipped once and were repaired in #28 — Tony cut through the hands, and Tony enlarged to fix a position problem. Both are guarded by tests. **M3 must not weaken those guards to make layering easier.**

---

## 1. Manager avatars are not Tony, and the difference is structural

This is the single most consequential decision in M3 and it is easy to get backwards.

| | Tony | A manager |
|---|---|---|
| How many | one | ten, and the set changes between seasons |
| Who authors him | the product | the manager, within a constrained set |
| What varies | **expression only** — three states | body, hair, face, and up to five worn slots |
| Where he is drawn | baked into the room's foreground | composited at runtime, wherever a manager is shown |
| What a wrong render costs | a slightly off shopkeeper | **somebody's likeness, wrong, in front of their league** |

**Therefore Tony stays baked.** Compositing him would buy nothing — he has no configuration — and would put the room's most-looked-at object onto a code path whose first version will have bugs. `character_tony_*` remains three finished PNGs and `tony-scale.test.ts` keeps guarding them.

**The compositor is for managers only.** That keeps the blast radius of every M3 defect inside surfaces that do not exist yet.

---

## 2. The layer set — fixed, and fixed before any art is drawn

`16 §5.2`'s constraint is *constrained and dependable*, not expressive. A fixed layer set is what makes a character recomposable from a row of integers rather than from a saved image, and it is what lets a wearable be drawn once and worn by anybody.

**Seven layers, drawn in this order, back to front.** The order is load-bearing and is not a rendering detail:

| # | Layer | Slot? | Notes |
|---|---|---|---|
| 1 | `back` | worn | Anything behind the body — a cape, a chair back, a bag strap that passes behind |
| 2 | `body` | base | Base body. The only layer that is never empty |
| 3 | `bottoms` | worn | |
| 4 | `top` | worn | |
| 5 | `face` | base | Eyes, mouth, expression. Never a worn slot — a manager does not equip a face |
| 6 | `hair` | base | Drawn **after** `face` and **before** `head`, so a fringe overlaps the brow and a hat overlaps the fringe |
| 7 | `head` | worn | Hats, helmets, headbands |

**Five worn slots**, matching `03`: `back` · `bottoms` · `top` · `head`, plus **`hand`** — which is not a z-order layer of its own but a variant of `top` (see §4).

**Three base layers** the manager configures and never equips: `body` · `face` · `hair`.

### Why the order is fixed rather than per-item

An item carrying its own z-index is the design that always arrives first and always fails: two items authored months apart pick the same number, and the fix is to renumber one of them, which breaks every saved configuration that used it. **A slot has an order; an item has a slot.**

---

## 3. Compositing rules

1. **One canvas, one scale, nearest-neighbour.** Every layer is authored at the same logical canvas and drawn 1:1. A layer that has to be resampled to fit is a layer authored wrong, and `art:validate`'s existing canvas check extends to it directly.
2. **Bottom-centre anchoring**, exactly as collectibles use. A short character and a tall one share a floor line; vertical space goes above.
3. **No partial alpha**, anywhere, for the same reason it is banned on collectibles: the affordance glow is `drop-shadow` over the composite's own alpha, and a soft edge produces a glow around a shape the character does not have.
4. **An empty slot is an empty layer**, never a transparent placeholder PNG. A missing file is a defect; an unequipped slot is a normal state and must be representable without a file existing.
5. **The composite is deterministic.** Same configuration in, same pixels out — so a character can be screenshotted in a test and compared, and so a saved configuration renders identically on every device.

---

## 4. The hand slot, and why it is a variant rather than a layer

A held object belongs in front of the body and *behind or in front of* the arm depending on which hand holds it, and modelling that honestly needs the body split into arm layers — which triples the base art and is exactly the kind of expressiveness `16 §5.2` rules out.

**The decision: a hand item is authored as a `top`-slot overlay that includes the hand.** One item, one PNG, drawn at the `top` layer. It costs a small amount of authoring duplication and removes an entire class of z-order bug.

---

## 5. Ownership and equipping — the contract

Equipping is a **state change on a collectible somebody owns**, and it must obey the same invariants the Showcase already does.

| Rule | Mechanism |
|---|---|
| You may only equip an item **you own** | A trigger, not a foreign key. The Showcase already proves an FK cannot express *"your* collectible" (`docs/CHECKPOINT.md`) |
| One item per slot | A partial unique index on `(user_id, slot) where equipped` |
| Equipping is **not** consuming | The collectible row is unchanged except for its equipped state; duplicates are still counted, never converted (`03 §12`) |
| A base configuration is a row of small integers | `body` · `face` · `hair` variant ids, plus a palette id. Never a serialized image and never JSON with free-form keys |
| Changing a configuration is **recoverable** | Append-only history, or at minimum a previous-value column. A manager who taps the wrong hair and loses a look they spent time on is a support request nobody can answer |

**Wearables are not in the 24-item collectible catalog** — **commissioner ruling, 2026-07-31**, settling what was an open contradiction. The two are separate product families and separate progression surfaces:

| | Family | Slugs | How you get one |
|---|---|---|---|
| Pizza-box collectibles | `collectible` | 24 × `collectible_*` | the loot box |
| Character equipment | `avatar` | 12 × `wear_*` | the character system |

`CATALOG_SIZE = 24` is asserted and must not be satisfied by adding wearables to it (`AUTONOMY.md §5` — never delete or repurpose an approved slug to satisfy a count). The mechanism is the registry family, not a convention: `catalog()` is `assetRegistry.byFamily('collectible')`, so a wearable cannot reach the reward table without somebody editing a `family` row.

**Crossover is not approved.** A future explicit ruling may let a box award a collectible, a wearable, or a mixed reward. Until that ruling exists, the absence of a crossover is a **product decision**, not an unimplemented feature — and `lib/character/separation.test.ts` fails the build in every direction that could quietly turn it into one, including the inventory comment that was wrong for a week while every test passed.

---

## 6. Registry conventions

Same rule as every other asset: **referenced by slug through the registry, swapped by a registry row, never by a code change.**

```
character_body_<variant>          base, layer 2
character_face_<variant>          base, layer 5
character_hair_<variant>          base, layer 6
wearable_<slot>_<name>            worn,  layer per slot
```

Each row carries `canvas`, `anchor: bottom-center`, `family: character` or `wearable`, and — new for M3 — **`layer`**, so the compositor reads the draw order from the registry rather than from a switch statement. That is what makes adding a wearable a data change.

`lib/assets/art-slots.test.ts` already asserts canvas, anchor, rarity and name for all 24 collectibles and caught a real defect on its first run. **The M3 equivalent must exist before the first character sprite is drawn**, not after — the 32-vs-46 resample was discoverable only *after* the art existed, and it cost a batch.

---

## 7. Clipping — the tests that must exist first

Tony cut through the hands once, and the lesson recorded in `docs/CHECKPOINT.md` is the one that matters here: **geometry read off a screenshot is wrong.** The eye kept confidently reporting it had measured something it had not.

So the clipping tests are **arithmetic over the PNG's alpha channel**, not screenshots:

1. **Every layer occupies the same canvas.** A mismatch is a resample.
2. **The composite's occupied box stays inside the canvas.** A wearable that pushes the silhouette past the edge clips at the container and looks like a rendering bug.
3. **Contact row.** The composite's lowest opaque pixel is the floor row, whatever is equipped. A hat must not lift a character off the ground; a long coat must not sink them through it.
4. **Slot exclusivity.** For every pair of items in the same slot, exactly one may be drawn.
5. **Overlap where overlap is intended.** `hair` and `head` must overlap by at least one row for every combination, or a hat floats.

Number 5 is the one that will fail, and it will fail on a specific pair of variants rather than systemically. That is why it is a matrix test over all combinations and not a spot check.

---

## 8. Preview fixtures

The pattern is settled and should be copied rather than reinvented: `?preview_reveal=` (`lib/demo/preview.ts`) and `?edition=` (`lib/slice/editions.ts`). Both resolve **on the server** behind `assertDemoAllowed`, write nothing, and are stamped with a marker the visual driver checks.

For M3: **`?character=<configuration>`**, resolving a frozen configuration to a composite, with:

- a **named catalog** of configurations, one per case worth looking at: nothing equipped · every slot filled · the tallest hat with the longest hair · the widest `back` item · a duplicate owned twice · a slot whose item was retired
- a `data-character-preview` marker, so a server missing `DEMO_FIXTURES=1` cannot photograph an ordinary page under a preview's name — the false green that has now happened twice and is guarded twice
- an **exhaustiveness throw** for a configuration declared and not implemented, matching `resolveEdition`
- a **driver-coverage test** matching `lib/slice/driver-coverage.test.ts`, so a configuration the driver would never photograph fails the build

---

## 9. Migration strategy

M3 adds tables and a registry family. It changes **nothing** that exists.

1. `character_configurations` — one row per user, base variant ids and a palette id. Defaulted, so every existing manager has a valid character the moment the table exists.
2. `wearable_equips` — `(user_id, collectible_id, slot, equipped_at)`, with the ownership trigger and the partial unique index from §5.
3. Registry rows for the base variants and the twelve launch wearables, all `art_status: placeholder` until art arrives — the same placeholder-first discipline the collectibles use, so the system is exercised before any sprite exists.

**No migration touches `users`, `collectibles`, `loot_boxes`, `season_memberships` or the ledger.** If an M3 migration finds itself altering one of those, the design has drifted and the right move is to stop rather than to widen the migration.

---

## 10. What would make this wrong

Stated so it can be checked rather than assumed:

- **If manager characters turn out never to be shown anywhere in v1**, the compositor is speculative work and the whole of M3 should be re-scoped to *"wearables can be equipped and the Collection says so"* with no rendering at all. `16` defers basements to v1.1, and the basement is the surface a character most obviously stands in.
- **If the twelve wearables turn out to be drawn as objects rather than as worn items**, §2's layer set is over-built and three layers would do.

Both are questions for the commissioner **at the point M3 opens**, not now, and neither blocks anything today.
