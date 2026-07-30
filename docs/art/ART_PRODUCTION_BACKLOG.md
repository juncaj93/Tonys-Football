# Art production backlog

The canonical list of art this product is waiting on, and the exact slot each piece has to fit.

**Nothing here blocks engineering.** Every slot already renders a deliberate in-world stand-in, and every slot is addressed by a registry slug — so supplying final art is a row in `art/assets.inventory.json` plus a PNG, never a change to feature code. That rule is `MANDATE`'s art-slot architecture and `art/ASSET_PIPELINE.md`; this file is the brief that makes it actionable.

Read with `art/ASSET_PIPELINE.md` (how art enters the repo) and `VISUAL_ACCEPTANCE.md` (what it has to survive once it is in).

---

## The rules every slot obeys

1. **Transparent PNG**, authored at its **logical size in CSS pixels**, no larger. The device scales by a whole number and `image-rendering: pixelated` keeps the edges; an oversized source gets resampled and loses them.
2. **No baked text, no baked UI.** Names, rarity words, frames, glows and counts are runtime HTML over the art. A gold frame painted into a legendary's PNG makes rarity un-rebalanceable, and rebalancing is what P3's simulation exists to do.
3. **No baked panel or background.** The item, alpha, nothing else. Silhouette affordances are `drop-shadow()` on the art's own alpha (`18 §9.4`), so a filled rectangle background destroys them.
4. **The parlor palette**, as quantized in `app/globals.css`. Same pixel density as `zone_parlor_shell`: **one art pixel = one room unit**.
5. **Lighting from above and slightly left** — the pendant over the counter. Consistent across every object in the room.
6. **Anchor is bottom-centre** for anything that stands on a surface, so a taller replacement grows upward rather than sinking through the tray.
7. **Dimensions are measured, never guessed.** Scan the shell for the slot's bounds and record the numbers with their provenance, the way `TONIGHT_CREAM` and `TONY` do. Reading geometry off a zoomed screenshot is how the board ended up five units off-centre and how the counter ended up slicing Tony's hands.

---

## Status of the current stand-ins

### The contract is a test now

`lib/assets/art-slots.test.ts` asserts what this file used to only describe: every catalog collectible carries the slot's exact canvas, a `bottom-center` anchor, a valid rarity, and a name. Prose is what a batch of twenty-four sprites gets generated against, so the parts that can be checked are checked.

**What is still a commissioner input.** The art itself. Generating it needs an image generator, and the league does not pay for API use (2026-07-30) — so batches A–C are blocked on the commissioner supplying files, not on engineering. Every slot renders a stand-in until then and every swap stays a registry row.

| Slot | Stand-in today | Safe to test with? |
|---|---|---|
| Unopened box on the tray | `PlaceholderObject kind="box"` — a flat carton, five rectangles | **Yes.** Reads as a sealed box at 44 × 30. |
| A collectible, anywhere | `PlaceholderObject kind="collectible"` — a tagged parcel | **Yes**, and deliberately generic. The blank tag is the tell that nothing has been decided. |
| Tony | `character_tony_neutral` — real art, B0 | Yes. Moods `pleased` / `unimpressed` degrade to neutral. |
| The room | `zone_parlor_shell` — real art | Yes. |
| Rack, banner, clipboard | Real art | Yes. |

Until 2026-07-30 the collectible and the box were **the same drawing**, so the reveal showed a box turning into the same box and every item in the Collection was identical. That is fixed; it is the reason this file exists.

---

## Batch A — the pizza-box opening

The highest-value batch: it is the moment the whole milestone is built around, and it is the one a demo opens with.

| Slug | What it is | Logical size | Notes |
|---|---|---|---|
| `object_box_owned` | Closed box, sitting on the tray | **44 × 30** | Bottom-centre anchor. Lid shut, Tony's mark on it. Must read as *sealed* at actual size on a phone. |
| `object_box_open` | Same box, lid open, empty | 44 × 30 | Same footprint and anchor as closed, so the swap does not move. Interior visible but **unlit** — the glow is runtime. |
| `object_box_shudder_a/b` | Anticipation frames, if sprite-based | 44 × 30 | Optional. The beat is CSS today; supply frames only if the movement wants to be authored rather than transformed. |
| `object_reveal_pedestal` | What the item stands on during the reveal | **46 × 12** | Sits inside `TRAY_REVEAL`. Must not look like a UI plinth — a folded paper mat or a slice board. |

**Not in this batch:** the rarity light. It is `drop-shadow()` at runtime, tinted by tier, and it must stay that way.

Geometry, measured, in `lib/parlor/objects.ts`: `TRAY_SURFACE [156, 284, 94, 25]` · `TRAY_BOX [181, 276, 44, 30]` · `TRAY_REVEAL [180, 262, 46, 46]`.

---

## Batch B — the first collectibles

The catalog is 24 items and the set list is already fixed in the registry. Batch B is **eight** of them, chosen to prove every treatment rather than to fill the shelf:

| Tier | Item | Why this one |
|---|---|---|
| common | `collectible_arcade_token` | The smallest silhouette in the set — proves legibility at the floor. |
| common | `collectible_diner_coffee_mug` | An everyday object with a handle; proves alpha around a hole. |
| rare | `collectible_can_whipped_cream` | **The commissioner's named example.** Tall, cylindrical, a nozzle. |
| rare | `collectible_receipt_spike` | Thin and vertical — the hardest thing to keep readable at 46 units. |
| epic | `collectible_burn_barrel` | Wide and heavy; proves the epic treatment on a dark object. |
| legendary | `collectible_championship_ring` | Tiny and bright; proves gold reads without a baked glow. |
| wearable | one hat or apron | M3 needs a wearable that is also a collectible. |
| junk | one deliberately worthless item | The set's humour depends on it. |

**Size: 46 × 46**, the reveal slot, bottom-centre anchor. **Corrected 2026-07-30:** every collectible was registered at `32x32` while the slot it draws into is 46 — a 1.4375× resample, fractional, and a breach of rule 4 above. Nothing looked wrong because the stand-in is CSS and CSS does not care; it would have become visible only after twenty-four sprites were drawn at the wrong size. The registry now says `46x46` and `lib/assets/art-slots.test.ts` fails the build if it drifts. The Collection and Showcase draw at 46 and 23 — native and a whole division — for the same reason. The same file serves the Collection grid and the Showcase — both scale it by a whole number, so one source is enough. An item that does not fill 46 × 46 should be **short, not floating**: bottom-aligned with empty space above.

`collectible_can_whipped_cream` is the reference piece. Exact perspective, crop and anchor are recorded here once the first one is measured against the real reveal slot rather than described in advance — the Technical Lead owes that measurement before Batch B is generated, not after.

---

## Batch C — Collection and Showcase

| Slug | What it is | Logical size |
|---|---|---|
| `surface_shelf_run` | The shelf the 24 spots sit on | 320 × 40, tiling horizontally |
| `object_slot_empty` | An empty, named spot | 46 × 46 |
| `object_slot_dust` | The same spot, never filled | 46 × 46 |
| `surface_showcase_stand` | The single thing a manager puts out | 64 × 48 |

The **selected**, **equipped** and **on-the-shelf** markers stay runtime — they change with state, and state does not belong in a PNG.

---

## Batch D — character identity (M3)

Prepared, not requested. M3 defines the layer set; generating layers before that lands would fix a rig that has not been designed.

Base bodies · faces · hair · shirts and jerseys · trousers · shoes · accessories · collectible wearables.

The one constraint worth recording now: **every layer shares one canvas and one anchor**, so layering is compositing rather than per-item positioning. `attachment_anchors` in the registry already carries that idea.

---

## How to hand a batch over

Group them. One brief, one palette reference, one pixel-density reference, one sheet — never one image at a time. Include for each slot: slug, logical size, anchor, what the empty space is for, and a screenshot of the slot with the stand-in in it, so whoever draws it can see the hole it fills.

Approved art lands as a row in `art/assets.inventory.json` and a file under `public/assets/`. If a swap needs a code change, the slot was built wrong — fix the slot, not the art.
