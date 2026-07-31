# Durable delivery checkpoint

**Resume instruction:** `Read CLAUDE.md and AUTONOMY.md, load the latest durable checkpoint, and continue autonomous delivery.`

This file is the handover record between Claude Code sessions. **Session memory is not a record** — if it is not here, in a PR comment, or in a label, it did not happen (`AUTONOMY.md §0`).

Update it whenever a slice lands, a gate result changes, or the next task changes. Keep it short enough to be read in full at the start of a session.

---

## Execution status — who is actually doing what

**Commissioner ruling, 2026-07-30:** a workstream is only *running* if an actor is implementing it. An issue, a label, a role contract or an `IMPLEMENTATION TASK` comment is **not** execution. Nothing sits in an ambiguous "assigned" state.

| Workstream | Mode | Branch / PR | Last implementation commit | Next executable task |
|---|---|---|---|---|
| **M2 — loot loop** | `TECH_LEAD_IMPLEMENTING` | `main` | #40 | Real collectible art is the only thing left; see "the one thing that needs the commissioner" |
| **SW Initial Product** | `TECH_LEAD_IMPLEMENTING` | `main` | #35, #36, #40 | Collection empty-state pacing (visual debt 1) |
| **Stats & Data** | `TECH_LEAD_IMPLEMENTING`, independently verified | `main` | #33 | Weekly reputation tags (`16 §10`), once a live season produces events |
| **Tuesday Slice** | `TECH_LEAD_IMPLEMENTING`, independently verified | `claude/tonys-pizza-autonomous-jizv8b` | this branch | Tony's Line, bounties, the chalkboard prediction, and the commissioner review queue |
| **Art batches A–C** | `QUEUED_NOT_ACTIVE` — **blocked on the commissioner** | — | — | Supply the files; the slot is enforced |
| **M3 character identity** | `QUEUED_NOT_ACTIVE` | — | — | Issue #24 |

**No fresh specialist session is required right now.** Every SW change to date has been tightly coupled to the branch in flight, small enough that a handoff would cost more context than it saved, and visually verifiable in the same loop — which is exactly the condition the ruling names for implementing directly. When that stops being true the trigger is a durable GitHub task carrying branch, scope, authoritative Markdown, assets, prohibited regressions, required screenshots, acceptance criteria, what not to redesign, and where to stop — then one concise ask.

**Stats independence is satisfied by the acceptable alternative, not by assertion.** `lib/stats/independent-verification.test.ts` recomputes scores, margins, winners, roster attribution and the largest margin **from the raw fixture JSON**, sharing no code with the pipeline — it does not call `traverseChain`, `derivePairings`, `toCents`, `reconcileSeason` or anything in `lib/stats/`. `facts.test.ts` pins values, which is good and is not the same thing: those numbers came off the pipeline's own output, so a consistent bias would have been recorded rather than caught. The one gap is stated in that file: if both implementations are wrong the same way, neither catches it.

---

## Where the product is — 2026-07-31 (second session)

**PR #43 merged.** `main` was `6740408` at the start of this session. The work below is on
`claude/tonys-pizza-autonomous-jizv8b`.

### The Slice is a newspaper

The first implementation printed. It also printed the same three sentences every week, reported
**two of five games**, and read as a list of templated facts — which is what the commissioner
asked to fix, and what looking at nineteen consecutive issues in one column makes undeniable.

What an issue is now: a **masthead and dateline** · a **lead** with a headline, a score deck and a
short body · up to **two secondary stories** · **the board**, every publishable game of the week ·
**Tony's column**, curated and factless · a colophon. One sheet of paper, sections divided by
printed rules rather than by cards.

**A newspaper needs more than two shapes of story**, so the fact layer gained them. `lib/stats/`:

| new | what it owns |
|---|---|
| `week.ts` | the complete week — every paired game, resolved to the people who held those seats |
| `standings.ts` | the table *as it stood after week k*, recomputed from the games; `season_memberships` only holds the final one |
| `stories.ts` | twelve typed, evidenced, gated story kinds: blowout · nail-biter · tie · record margin · record score · high score · low score · upset · streak · standings move · championship · elimination |

Every kind above the floor needs a reason that is not *"biggest one this week"* — the same
two-independent-reasons discipline `significance.ts` already applied to margins. An upset needs a
**defensible baseline**, and the only one this product has is wins already on the board; there is no
projection and `16 §9` bans implying one.

`lib/slice/select.ts` is the desk: rank by significance, then **same-game**, **same-kind**,
**manager-repeat** and **novelty** across the previous two issues, every drop recorded with a
reason. Two floors mean a weak week publishes *fewer* stories — `LEAD_FLOOR` produces a **quiet
edition** that prints the board and says it was quiet, rather than promoting an ordinary result.

### Four defects the walk found, and one lesson worth keeping

1. **A retired manager could consume a story slot.** The publication boundary was applied to the
   finished story list. 2024 week seven was decided by 2.82 points between two current managers and
   the paper led with a streak, because the week's *overall* closest game involved somebody retired,
   the nail-biter candidate was built for that game, and it was then dropped with **nothing taking
   its place**. The boundary is now applied before derivation (`publishableWeek`). Pinned.
2. **Novelty silenced a real story.** The first cut subtracted the recency discount before the
   floors, and 2024 week ten printed *"A quiet week at the shop"* above a board showing a
   fifty-one-point win. **Novelty reorders; it never silences.** A front page that contradicts its
   own scoreboard is worse than a repeated headline.
3. **A hard-coded count in curated prose.** The quiet body said *"Five results"*; four is common,
   because retired managers' games are not on the board. Numbers come from the packet or they do not
   appear — a test now fails any curated string containing a digit.
4. **The record nobody can print.** The largest team-week on record is **188.02** and the widest
   margin **140.72**, and both belong to retired managers, so neither can ever be published. The
   comparison population still includes them, deliberately: a record measured only against
   publishable games would announce a record that is not one. `record-score` is therefore a fixture,
   and that is the layer being right rather than a gap.

### Fifteen editions, reachable by name

`lib/slice/editions.ts` — `/slice?edition=<key>`, resolved on the server behind the demo guard.
Eight are **real weeks of finalized seasons**; five are **frozen fixtures** for states history does
not contain; two are the empty rack. All go through the identical production pipeline, and
**nothing is written to the database** — a Slice demo has no state to isolate.

`npm run demo -- editions` lists them. Three things throw rather than rendering something plausible:
a key declared and not implemented, a fixture the validator refuses, and a driver state with no arm.
`lib/slice/driver-coverage.test.ts` fails the build for an edition the driver would never photograph
— the quiet failure that leaves no trace at all.

### Independent Stats verification, widened

`lib/stats/independent-verification.test.ts` is **6 tests → 19**, still recomputing from
`fixtures/sleeper/**` with `JSON.parse` and arithmetic in the file, calling nothing in `lib/stats`.
Added: ties · weekly high and low · closest and widest per week · the finalized population size ·
percentile placement · score-magnitude and margin-plausibility invariants · participants resolving
inside the right season · finalized-season immutability · canonical name versus Sleeper handle ·
retired managers absent from every published surface **and still present in the fact layer**.

### Exact repository state

| | |
|---|---|
| `main` | `6740408` — PR #43 merged |
| Branch | `claude/tonys-pizza-autonomous-jizv8b` |
| `npm run check` | green — **831 tests across 52 files** |
| `npm run visual:qa` | green — **49 states × 3 widths**, production build, `DEMO_FIXTURES=1` on server *and* driver |

### Tony may mention a result, and may not change one

`lib/parlor/aside.ts` + `content/counter-stats.md` (approved 2026-07-31, eight lines, surface
`parlor_stats_aside`). The greeting stays the default — `17 §3`'s criterion is *one verified thing
about you* — and this is the exception, with a **fortnight** cooldown against the greeting's three
days.

Four rules, each enforced rather than intended:

1. **Only finalized facts.** The input is a `FactPacket`, which refuses an open season outright and
   has already applied the publication boundary. There is no path from an unfinalized week here.
2. **No calculation in dialogue code.** Every number is read off a published fact and written with
   the packet's *own* formatters.
3. **Nothing may change.** The rendered sentence goes through **the Slice's validator**, against the
   fact's own declared allowed sets. A name or number the fact did not supply is refused and Tony
   says nothing about football. One validator, not two — a second would drift, and it would drift on
   the quieter surface.
4. **Never during a moment.** Skipped whenever a moment tag is held, so it cannot collide with the
   welcome box, the waiting box or a reveal.

**One extension the validator needed.** `validateProse` now takes the *templates* a line was rendered
from and treats their capitalised words as house copy. A template contains `{winner}`, never
`Brandon` — a proper noun can only enter through substitution — so this is the same rule
`houseWords()` applies to the Slice's own tables, extended to a surface whose curated strings live in
Markdown. Without it, *"He is not going to pretend that was a game"* was refused because `He` is a
word the Slice's headlines never use.

The champion is a **fallback, not a competitor**: a banner is always true and never news, so it only
speaks when the week itself had nothing loud in it.

### The deploy's seed is idempotent, and now provably so

`scripts/seed-idempotency.test.ts` runs the **real** `scripts/seed.ts` twice in a subprocess and
asserts the second run changes nothing: identical counts across every seeded table, an identical
content fingerprint, and no manager holding two welcome boxes.

`vercel-build` is `migrate → seed → build`, so this runs against a live database on every merge to
`main`. A non-idempotent seed would not error and would not fail a gate — it would show up weeks
later as Tony repeating himself twice as often as his cooldown allows, or as free loot proportional
to how often anybody merged.

### Batch B is one command away

`npm run art:batch` matches filenames, refuses a missing or duplicated asset **by name**, processes,
validates all ten mechanical rules, checks the registry row, captures Reveal / Collection / Showcase,
and prints a per-asset status table. `--register` flips `art_status` to `final` — kept a separate,
deliberate act because `art/ASSET_PIPELINE.md` makes registration a reviewed edit.

`lib/assets/batches.ts` is the manifest and `lib/assets/batches.test.ts` fails the build if it and the
handoff document ever disagree about which sprites a batch contains — a mismatch that would otherwise
surface as a filename error on the one day it is most expensive.

**Batch B2 is specified** — `docs/art/BATCH_B2_COLLECTIBLES_HANDOFF.md`, paste-ready, four sprites
chosen to *expand* coverage rather than repeat it: the only wide silhouette, light escaping through a
hole rather than off a face, a soft-sided bag with a fabric handle loop, and a draped repeating
pattern that has to survive the 23 px Showcase draw. It needs nothing from the commissioner until
Batch B is in hand.

### The next executable task, in order

1. **Integrate the Batch B collectible art** the moment the eight PNGs arrive. One command now:
   `art/incoming/<slug>_01.png` → `npm run art:batch` → look at the screenshots →
   `npm run art:batch -- B2 --register`. **No feature code changes.** Still the only thing between
   M2 and closure.
2. **Tony's Line, bounties and the chalkboard prediction** (`16 §9`). All three read the fact packet
   that now exists; all three need a live season to settle against, so they are authored now and
   settle in September. One table with a type discriminator.
3. **The commissioner review queue** for the Slice. `16 §9` makes approval mandatory in season one
   and the manual hold switch permanent. Not built — the historical issue on the rack does not need
   it, a live one does.
4. **Batch B2** when Batch B is in hand. Specified, paste-ready, needs nothing from anybody until
   then.
5. **Visual debt 3** — the order pad's arrival and dismissal timing against the reveal's.

### Two boundaries prepared, neither started

- **`docs/M3_CHARACTER_BOUNDARY.md`** — the decisions M3 would otherwise make under pressure, made
  now. **Tony stays baked and the compositor is for managers only**, so every M3 defect lands on a
  surface that does not exist yet. Seven layers in a fixed order, with the order in the registry
  rather than in a switch; a hand item as a `top`-slot overlay rather than a split arm; ownership by
  trigger because an FK cannot say *your* collectible; wearables in their own registry family because
  `CATALOG_SIZE = 24` must never be satisfied by adding to it. The clipping tests are arithmetic over
  the alpha channel, **not screenshots** — geometry read off a screenshot is wrong, and the eye kept
  confidently reporting it had measured something it had not.
- **`docs/BACK_HALL_BOUNDARY.md`** — route contracts, the flag-based state boundary (nobody *earns* a
  hallway; progression is not in this product), navigation flow, the five asset slots, demo
  requirements. It corrects an assumption made before reading the page: the Underground is
  deliberately not a route and is handled correctly, with the reasoning already in the file.

**Two real findings, recorded as visual debt rather than fixed** — fixing them would have interrupted
Batch B. *"Don't worry about it."*, the entire reveal of the Underground, is set at **9px** in amber
on cream; and the Back Hall is three stacked panels with headings, which is the menu card `18 §5`
forbids (blocked on art — building the scene against placeholders means building it twice).

### What this session did not start, and why

- **M3 character identity (#24).** Unchanged: do not destabilise M2 before the representative art
  batch has proven the asset system.
- **Safari and hosted-only hardening beyond the seed.** The sandbox proxy denies CONNECT to
  `*.vercel.app`, so viewport-height, back-forward cache and safe-area behaviour cannot be observed
  here — only asserted statically. The seed's idempotency was the one item in that list that is
  fully checkable locally, so it was the one taken.

---

## Where the product is — 2026-07-31

**PR #40, #41 and #42 are merged.** `main` is `ebc0a64`. Three milestones landed this session.

### The Slice publishes, deterministically, with no API key

`16 §9`'s pipeline exists end to end and is visible at `/slice`:

```
lib/stats → lib/slice/packet.ts → lib/slice/render.ts → lib/slice/validate.ts → the rack
```

- **`packet.ts`** is the boundary. Everything upstream is Stats; everything downstream reads only the packet, which **declares its allowed numbers and names as data**. That is what makes *"every number and proper noun must match an allowed value"* a set-membership test rather than an aspiration. The publication boundary (`activeManagerIds`) is applied here, once.
- **`render.ts`** assembles from curated templates keyed on the classifier's `intensity`. It cannot reach for a louder word than the policy earned, and `houseWords()` exports the curated vocabulary so the validator can tell house copy from a name.
- **`validate.ts`** checks the *output* and knows nothing about which renderer made it — so the LLM renderer, when it arrives, is checked by the same rules without a rewrite. Refuses unknown numbers, unknown names, kicker references, win-probability language, unreleased features, and **quotation marks of any kind**.
- **`edition.ts`** puts the last real issue on the rack. An issue the validator refuses is not published.

Verified over **all 36 weeks of both finalized seasons** with zero violations, and independently against raw fixture JSON: `Matty B 184.12, Ryan 109.98, margin 74.14` recomputed by hand with no call into `lib/stats`, `lib/sleeper` or the packet's own helpers.

### Exact repository state — 2026-07-31

| | |
|---|---|
| `main` | **`ebc0a64`** — PR #40, #41 and #42 all merged, all green on real runners |
| Branch | `claude/resume-tonys-delivery-tech-lead-evndmy`, rebuilt on `main`. Nothing outstanding. |
| Open PRs | **none** |
| `npm run check` | green, **755 tests across 48 files** |
| `npm run visual:qa` | green, **34 states × 3 widths**, fresh database, `DEMO_FIXTURES=1` on **both** the server and the driver |

### The next executable task, in order

1. **Integrate the Batch B collectible art** the moment the eight PNGs arrive. The package is `docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md`; the loop is `art/incoming/<slug>_NN.png` → `npm run art:process` → `npm run art:validate` → a registry row → `npm run visual:qa`. **No feature code changes.** This is the only thing standing between M2 and closure.
2. **Tony's Line, bounties and the chalkboard prediction** (`16 §9`). All three read from the fact packet that now exists; all three need a live season to settle against, so they are authored now and settle in September. One table with a type discriminator.
3. **The commissioner review queue** for the Slice. `16 §9` makes approval mandatory in season one and the manual hold switch permanent. Not built — the historical issue on the rack does not need it, a live one does.
4. **Visual debt 3** — the order pad's arrival and dismissal timing against the reveal's. Now unblocked, and the last item on the open list that is not waiting on art.

### What is deliberately not started

**M3 character identity (#24).** The commissioner's instruction is not to destabilise M2 before the representative art batch has proven the asset system, and M3 is where wearable equipping lands — the one part of `03`'s twelve wearables and five slots that M2 explicitly does not own.

### Two defects this slice caught, both by looking rather than by testing

1. **A units bug the tests could not see.** `points()` divided by 100 a second time — `MatchupFact` is already in points — and the page printed a real matchup as *"1.84 to 1.10"*. Every structural test passed, because the allowed-number list and the prose came from the same broken helper and the validator confirmed the symmetry. **Symmetry is not verification.** Pinned now by a range assertion and by recomputation from source.
2. **A visual state with no `case` photographed the parlor and passed.** `slice` was in `StateName` and `ALL_STATES`; its arm never landed. Same false-green shape as the nine reveal states in #40. `reach()` now throws on an unhandled state.

---

## Read this first

`docs/PRODUCT_DELIVERY_MANDATE.md` is a **standing commissioner ruling** and sits above every other document. It defines what "complete" means (§5), the permanent visual standard (§6), the mandatory screenshot loop (§7), demoability as a product requirement (§8), specialist ownership (§9), and the deterministic typed-fact layer that must precede any narrative copy (§10).

---

## Where the product is — 2026-07-30 (second session)

**Nine pull requests landed this session.** In order: **#31** the demo-state catalog and its two isolation guards · **#32** the appliers, the CLI, the one-command database and four demo-backed visual states · **#33** Stats Intelligence — persisted weekly matchups, typed facts, the calibrated significance policy, the board socket · **#34** seatless managers through their own door · **#35** the Collection and Showcase shelf. **#36** the art-slot contract and the photographable reveal · **#37** the retired-manager boundary and the independent Stats verification · **#38** the reveal plate saying what was earned and offering another · **#40** Tony owning both ends of the pizza-box loop.

**#40 also caught a false green in the harness.** The nine `reveal-*` states are resolved by the **server** through `previewReveal(…, process.env)`, and the workflow set `DEMO_FIXTURES=1` only on the driver step. Every one of them had been photographing an ordinary parlor page, filing it as `390-reveal-legendary.png`, and passing — with the `rarity-contrast` gate measuring nothing on the surface it was written for. The wiring is fixed *and* a `reveal` gate now fails a reveal state that contains no reveal, because a wiring fix protects one cause and a gate protects the symptom.

### The M2 loop, walked and scored

The bar is the commissioner's emotional sequence, not the subsystem list. Walked on a production build in #38; screenshots of every beat are in `visual-qa/loop/`.

| Beat | State |
|---|---|
| enter Tony's Pizza | ✅ warm, in-world, legible immediately |
| immediately understand | ✅ Tony opens with a line built from your real record |
| receive a welcome box | ✅ #40 — Tony hands it over: *"First one's on the house. Box is right there."* |
| become excited to open it | ✅ #40 — his line names the box; the glow is no longer the only signal |
| enjoy opening it | ✅ anticipation, rise, rarity flash, plate |
| receive a collectible | ⚠️ correct and **placeholder art** — all 24 items draw the same tagged parcel |
| understand what they earned | ✅ #38 — first / *n* of 24 / the whole shelf |
| want to open another | ✅ #40 — Tony offers, in his own voice, with the price in the sentence |
| continue into Collection or Showcase | ✅ |

**Both of Tony's beats closed in #40**, from the two dialogue groups approved on 2026-07-30. Each is curated content on its own surface, chosen server-side and governed by `assertOnlyApprovedGroups`:

- **`content/counter-greetings.md` A24–A31** — five `first_welcome_box` variants and three `box_waiting`, selected by *moment tags* (`lib/parlor/moment.ts`). A moment tag outranks every standing line without a priority field, because the homepage computes audience over `leagueTags` — which holds no moment tags, so a welcome line's audience is zero and the existing smallest-audience rule picks it.
- **`content/box-offer.md` O1–O7** — the post-reveal offer, on surface `counter_box_offer` (`lib/counter/offer.ts`). Four gates before a line is even considered: an open season, a seat, a stored economy, and a balance that covers the price. Any one false and there is **no offer and no link** — not a greyed-out one.

**The one beat still open is art**, not behaviour.

### Corrections applied after the first report

Four commissioner rulings arrived after the six PRs merged, and one **reverses a decision shipped that day**:

- **Retired managers are never product participants.** #34 put Armen, Berardo and Shant on the door; the ruling is that they appear in **no** structured surface, with no label and no alumni page. Corrected in #37. The reasoning that lost is kept in `lib/league/membership.ts`: permanent identity is separate from a seasonal roster, but that separation is a *storage* property — it keeps a row joinable and confers nothing visible.
- **Membership derives from an active seat**, through one canonical boundary, never scattered exclusions.
- **A workstream is only running if an actor is implementing it** — see the table at the top of this file.
- **Readability wins over styling, always** — `VISUAL_ACCEPTANCE.md §7`–`§8`, with `docs/VISUAL_DEBT.md` for what is not worth stopping for.

### M2 closure — the determination, made from the specification

**Question the commissioner posed:** can M2 be accepted as a production-ready vertical slice with the rest of the catalog tracked as content completion, or does the canonical specification require all 24 finished sprites before the milestone closes?

**Determination: eight is enough to close M2. Twenty-four was never the gate.**

The specification does not merely tolerate partial collectible art — it **plans for it**, in three independent places written before this question came up:

| Where | What it says |
|---|---|
| `art/ASSET_PIPELINE.md §5` | Batch B3 is *"Collectibles (**12 priority of 24**)"* |
| `art/assets.inventory.json`, `_collectibles_B3` | *"12 receive finished art at launch … the rest ship as `placeholder_pizza_box` and **upgrade on any Tuesday**"* |
| `art/prompts/collectible.md` | The same 12-of-24 split, with the placeholder named as thematically correct rather than unfinished |

Three things follow, and none of them is convenience:

1. **An unfilled slot is not a broken slot.** The fallback is `placeholder_pizza_box` — *an item still in its box* — which is in-world by design (`ASSET_PIPELINE §2`). A manager who pulls one sees something Tony would plausibly hand over, not a missing-image box.
2. **The remaining sixteen carry no engineering risk.** A swap is a registry row and a PNG; `lib/assets/art-slots.test.ts` fails the build if a slot ever drifts from `TRAY_REVEAL`, and `npm run art:validate` measures each delivered sprite against it. There is no code change waiting on art.
3. **What M2 has to prove is the *system*.** Eight items covering every rarity, both silhouette extremes, the detail-budget ceiling, an emissive material, a frame that must not read as a UI plate, and the tiny-object anchor case is a proof of the system. Sixteen more of the same is content.

**What this does not license.** The 12-of-24 figure is a **launch** commitment, not an M2 one — the season starts around 10 September. Four more finished sprites beyond this batch are owed before then. That is tracked here as content completion against a date, not as milestone debt.

**M2 therefore closes when the eight-item batch is integrated, validated and polished** — not when the catalog is full.

### The one thing that needs the commissioner

**Collectible art — the eight-item batch.** Every one of the twenty-four items draws the same stand-in, and generating sprites needs an image generator the league does not pay for.

**[`docs/art/BATCH_B_COLLECTIBLES_HANDOFF.md`](art/BATCH_B_COLLECTIBLES_HANDOFF.md) is the package**, written to be pasted into an image-generation session without reinterpretation: the shared style preamble, the shared production constraints, a measured per-item brief for all eight, the output naming, and the validation procedure. Every dimension in it was measured off the running product.

Delivering is `art/incoming/<slug>_NN.png` → `npm run art:process` → `npm run art:validate` → a registry row. No feature code changes. Until then the stand-in is deliberate, not broken.

Everything else below is engineering and does not wait on anybody.

---

## Where the product is — 2026-07-30

**M2 — the complete pizza-box loot loop. ✅ Shipped to `main` 2026-07-30 (`238dfca`, PR #23). Production deployed.**

**Active: M2 completion and polish (commissioner roadmap), with Stats Intelligence running in parallel.**

| Landed since | PR |
|---|---|
| Demo-state catalog and the two isolation guards | #31 |
| Demo appliers, the CLI, the one-command database, four demo-backed visual states | #32 |
| Stats Intelligence — `fantasy_matchups`, the typed fact layer, the calibrated significance policy, the board socket | #33 |

The commissioner's M2 definition is the *whole* dopamine loop, twelve items: acquire → box on the counter → select → anticipation and animation → rarity-legible reveal → transactional idempotent write → server-side persistence → appears in the collection → equip/showcase → the parlor reflects it → duplicate/retry/refresh correct → passes iPhone visual QA. **M2 is not complete after acquisition, storage, a route, or a static reveal.**

Milestones after M2, in order and one at a time: **M3** modular character identity · **M4** Back Hall / Rooms / basement · **M5** one polished server-authoritative casino game.

**M1 (parlor homepage) is a preserved visual baseline.** No later milestone may reintroduce Tony clipping, tiny type, contaminated colour, blurred pixel art, generic web boxes, debug hit regions, legacy homepage art, or visibly unfinished states. A visible regression is a failed gate even when CI is green.

### Branches

| Branch | Role |
|---|---|
| `main` | production. Merging it deploys — `vercel-build` runs migrate → seed → build. There is no quiet merge to `main`. |
| `integration/m2-loot-box` | ✅ merged and finished. Do not add to it. |

**Slices are branching straight off `main` again**, one PR each, merged as soon as both gates are green. That is deliberate and it worked: five PRs landed in one session without a three-way merge. The integration-branch model in `TECH_LEAD_OPERATING_MODEL.md §3` exists to stop an *incomplete visual milestone* reaching production — each of these was individually coherent, so it did not apply. Group onto an integration branch again the moment a slice is only meaningful alongside its siblings.

### Slices

| # | Slice | State |
|---|---|---|
| 1 | Box on the tray · open in place · reveal · persistence | ✅ merged (PR #19) |
| 2 | Acquisition — ledger, trigger balance, opening grant, purchase | ✅ merged (PR #20) |
| 3 | `/counter/collection` — the shelf, set progress, duplicates | ✅ merged (PR #21) |
| 4 | Showcase, and the parlor reflecting the result | ✅ merged (PR #22) |
| — | Delivery mandate persisted + the board fix | ✅ merged (PR #25) |
| — | Countdown de-duplicated; visual-QA database trap documented | ✅ merged (`c91548c`) |

All twelve items of the commissioner's M2 definition are covered by slices 1–4. Wearable *equipping* is explicitly **M3's**, not M2's — twelve wearables and five slots need a character to be equipped onto (ruling index, 2026-07-30).

### The hosted review — 2026-07-30

The commissioner tested production on an iPhone and sent screenshots. **Those screenshots are the source of truth for the hosted experience**, and production is *"the first functioning proof of concept"*, not an accepted visual milestone.

Repaired and deployed in **#28** (`9fd4f6f`): Tony cut through the hands · the board five units off-centre and unreadable on its own dither · a sixth of the screen black above the room · the reveal and Tony's line stacked · the collectible drawn as the box it came out of · the champion's name invisible since V1 · `LEGENDARY` invisible on cream.

**Still open from that review, and not to be read as finished:**

| | Work |
|---|---|
| 1 | **Tony's dialogue still reads as web UI.** Only the *collision* is fixed. It needs to belong to Tony, use the parlor's language, and stop being a dark rectangle across the bottom. |
| 2 | **The reveal is composed but not celebratory.** Anticipation, movement, rarity treatment and "PUT IT ON THE SHELF" are all still the functional version. |
| 3 | ✅ **Demo fixtures — done.** The catalog and isolation landed in **#31**; the appliers, the CLI and the visual-QA wiring in **#32**. Twenty of twenty-one states apply, idempotently, by name. `equipped-wearable` stays named and blocked on M3. |
| 4 | **Art batches A–C are specified, not generated.** `docs/art/ART_PRODUCTION_BACKLOG.md`. |
| 5 | **The menus are still harsh.** The commissioner's standard is Stardew Valley: pixel-art *and* easy to read. Contrast is fixed; density, framing and rhythm are not. |

### Two lessons from #28, both about measurement

- **Geometry read off a screenshot is wrong.** `TONIGHT_CREAM` was wrong on three sides and `TONY`'s cut row was in the worst available place. One art pixel is one room unit — scan the PNG for the feature and record the runs with their provenance. The eye cannot do this job and kept confidently reporting that it had.
- **Reaching for scale to fix a position problem makes it worse.** Enlarging Tony moved the cut to a clean row by making him the largest thing in the room. Three units of `y` did the same job invisibly. `tony-scale.test.ts` now guards the size so the easy fix fails a test.

### Exact next task

**The commissioner's roadmap re-orders the queue.** M2 is to be *completed and visually polished* before the Slice foundation; Stats runs in parallel rather than strictly first.

Item 3 is done. What the demo fixtures immediately exposed, and what is next:

| | Work |
|---|---|
| **D** | ✅ **Collection and Showcase — done** (#35). The shelf is boards with objects standing on them and gaps where nothing is; set progress *is* the filter; the league wall is a ledger on paper rather than ten black cards. The Counter needed only its back-link corrected. |
| **C** | ⚠️ **Art slots — the contract is done, the art is a commissioner input** (#36). `lib/assets/art-slots.test.ts` now asserts canvas, anchor, rarity and name for all 24, and it caught a real defect on its first run: every collectible was registered at `32x32` while the slot it draws into is **46**, a 1.4375× resample that would have blurred every sprite — discoverable only *after* they were drawn. Corrected to `46x46`. **Generating the sprites needs an image generator, and the league does not pay for API use, so batches A–C are blocked on the commissioner supplying files.** |
| **B** | **The reveal.** Anticipation, rarity treatment and the continuation action. Partly delivered in #30 (order pad, overshoot-and-settle, rarity flash, plate delay). What remains is closed-box appearance, shudder timing, lid behaviour, duplicate messaging and the transition out. See the note below about photographing a *specific* rarity — that is the blocker on reviewing it properly. |
| **E** | ✅ **Seatless managers — done** (#34). The door opens for the whole permanent record; the receipt and the counter say the true thing; the full M2 loop walked end to end as Berardo. |

**A known gap in the demo system, recorded rather than papered over:** the *reveal* cannot yet be demoed at a chosen rarity. The roll is injected through `lib/counter/rng.ts`, which is process-global, and the CLI runs in a different process from the server — so a pre-applied `pull-legendary` leaves the box already opened and the tray empty. Photographing a rarity-specific reveal needs an isolated component state, which `MANDATE §8` explicitly permits, and belongs with **B**.

**#26 — the Stats Intelligence deterministic fact layer** is still specified, scoped by a `TECH LEAD RULING` onto `ImportedWeek`, and still gates every piece of narrative copy.

Open a branch off `main` (M2's integration branch is closed; a new milestone gets a new one). The first consumer is already waiting: `boardFace()` takes an optional `matchup` and renders **nothing** when it is absent, because `MANDATE §9` forbids the interface deriving a fantasy fact for itself. Filling that socket is the acceptance test for the layer.

**One outstanding verification, human-only:** the live `*.vercel.app` URL was never loaded — the sandbox proxy denies CONNECT to it. `main` CI and the Vercel deployment both reported success GitHub-side, but *nobody has looked at production in a browser since M2 landed*. See the `RELEASE REVIEW` on PR #23.

### The queue after M2 ships

| | Work | Issue |
|---|---|---|
| 1 | ✅ **Stats Intelligence — the deterministic fact layer** (#33). Weekly matchups persisted, typed facts with evidence and suppression, significance calibrated against the real 162 games, the board socket filled | **#26** |
| 2 | **M3 — modular character identity.** Constrained and dependable: canonical base bodies, fixed layer set, saved configuration, reliable layering. Wearable equip slots land here, with something to attach to | **#24** |
| 3 | ✅ **The demo system** (`MANDATE §8`) — landed in #31 and #32 | — |
| 4 | **The deterministic Slice**, consuming typed facts only |  |
| 5 | M4 Back Hall / Rooms · M5 one polished casino game |  |

Stats (#26) is sequenced **before** the Slice deliberately: `MANDATE §10` requires the fact layer to exist before any narrative copy, and `boardFace()`'s null `detail` is already the socket it fills.

---

## Gate results last recorded

| Gate | Result | Where |
|---|---|---|
| `npm run check` | green — **755 tests, 48 files** | local, throwaway Postgres |
| `npm run visual:qa` | green — **34 states × 3 widths**, production build, on a freshly reset database **and a server carrying `DEMO_FIXTURES=1`** — without which the nine reveal states photograph nothing and pass | local |
| `ci.yml` + `visual-qa.yml` | green on real runners for every M2 slice | PRs #19 #20 #21 #22 |
| PR #23 (integration → `main`) | green on final head `c91548c`; **merged** as `238dfca` | PR #23 |
| Live production URL | ❌ **never loaded.** Proxy denies CONNECT to `*.vercel.app` | — |
| The whole loop, walked on a production build | tab → buy → open in place → reveal → shelf → showcase → receipt. Ledger `SEASON_START 250, BOX_PURCHASE -50` | local |
| Reduced motion | verified in-browser: reveal at 106 ms, `opacity: 1`, `transform: none`, no console errors | local |

**Preview and production URLs cannot be reached from the sandbox** — the proxy denies CONNECT to `*.vercel.app`. Verify GitHub-side and say so explicitly. Never claim a URL was smoke-tested when it was not.

---

## Authoritative Markdown, in reading order

1. `CLAUDE.md` — identity, scope, invariants, current status
2. `AUTONOMY.md` — lifecycle, labels, precedence (`§1`), escalation (`§6`)
3. `VISUAL_ACCEPTANCE.md` — the gates CI is not, and the fixed room geometry
4. `docs/TECH_LEAD_OPERATING_MODEL.md §8` — **the ruling index. Read before any design decision.**
5. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — architecture and scope
6. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — ordering only
7. `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` — the room. `§4` is the counter and the tray.
8. `docs/IMPLEMENTATION_HANDOFF.md` — "Where M2 slice 1 landed" and "What slice 2 owns"
9. `art/ASSET_PIPELINE.md` — art is placeholder-first, swapped by registry row

Precedence when they conflict: commissioner ruling → Technical Lead ruling → approved visual references → `PROJECT_SPEC` → architecture/art specs → handoffs → code → superseded plans. **Correct the loser durably; do not stop to ask for a reconciliation.**

---

## Standing constraints that bite

- **No paid API use** (commissioner, 2026-07-30). The orchestrator is manual-dispatch only and `ANTHROPIC_API_KEY` is unset. Do not recreate a paid cron, add an automatic paid trigger, request reversal, or treat a present secret as authorization to spend. No product scope depends on it — `16 §9` requires the Slice to publish with the key unset.
- **`npm run test` truncates league tables.** Never point `DATABASE_URL` at preview or production. This rule exists because it was broken once and a preview dataset was destroyed. After running tests, re-seed before visual QA.
- **All token movement through `apply_token_delta`** with an idempotency key, balance trigger-maintained, `CHECK (balance >= 0)`. No feature gets its own balance-writing path.
- **`box_openings.box_id UNIQUE` is the idempotency mechanism for opening** — the operation has a natural key. Do not add a client-supplied key there; that invariant is about `apply_token_delta`, where a delta is an event with no natural key.
- **`season_memberships.token_balance` has exactly one write path.** A direct `UPDATE` raises; only the ledger trigger may change it. Move tokens with `apply_token_delta` — the Postgres function, not a TypeScript helper.
- **Never disable a control on a client-read balance.** `CHECK (token_balance >= 0)` is the authority; a client check is a race and a second copy of the rule.
- **Body copy in a cream `PixelPanel` is `text-ink-700`.** `text-paper-*` on a paper panel is invisible, and it shipped on three routes.
- **A Tailwind class naming an undefined `--color-*` token silently inherits.** `lib/design/colour-tokens.test.ts` fails the build for it now.
- **Reward weights and prices are simulation-gated to P3.** Nothing locks before the multi-season simulation. Do not tune to taste.
- **Every asset by slug through the registry.** Swapping art is a registry row, never a code change.
- **The injected clock and the injected RNG.** `new Date()` / `Date.now()` are lint errors outside `lib/clock.ts`; randomness only via `lib/counter/rng.ts`.
- **Never delete an approved slug, record or asset to satisfy an older count.** Recalculate the count.
- **Body copy is 16–18px, adjusted upward wherever legibility needs it** (`MANDATE §6`, superseding the bare 17px floor). Size the container to the type, never the type to the container.
- **`npm run visual:qa` needs a freshly created database and is not re-runnable** — for the *manager-backed* states. The four demo-backed states are repeatable; the rest are not, because `tray-reveal` consumes a box. It opens the welcome box, and a box opens once ever; re-seeding does not restore it. A second run against the same database fails *geometrically* — an object reported "outside of the viewport" — which reads like a layout regression and is not one. Run `npm run db:reset` first. **A green result on a used database means nothing.** CI is immune; it gets a new database every run.
- **The driver does not start a server.** It expects one already on `:3111`. A *stale* `next-server` left from an earlier session will happily serve old code and hand you a confident, wrong green — check `ps -eo pid,args | grep -F next-server` before trusting a local run. (`ss -ltnp` returns nothing useful in this sandbox; an `EADDRINUSE` is the reliable signal.)
- **`PlaceholderSign` is for surfaces.** Small objects use `AssetView … compact`, or a 44-unit slot becomes a 133px slab.
- **The Showcase is one column with no score.** `16 §5.3` and `18 §4`: no levels, prestige or clout, ever. Ownership is trigger-enforced — an FK cannot say "*your* collectible".
- **Duplicates are counted, never converted.** `03 §12` defers salvage until after simulation. A salvage rate is a P3 decision.
- **`users.showcase_collectible_id`'s FK lives in SQL, not `schema.ts`** — declaring the reverse of `collectibles.user_id` makes both table types mutually recursive and TypeScript gives up (TS7022).
- **That FK makes `TRUNCATE collectibles CASCADE` reach `users`** and therefore `loot_boxes` and `sessions`. Do not build test state by truncating a middle table; build it directly. For a local reset, truncate and **re-seed**.
- **A skip list is a place for defects to live.** `colour-fidelity` and `legacy` run on every visual state now. Do not exempt a page from them.
- **SW never decides what a result means.** No blowout classification, no winner inferred from UI values, no loaded language without a Stats classification. `boardFace()`'s null `detail` is the pattern: leave the socket empty rather than infer.
- **Typography is 16–18 CSS px, adjusted upward for optical size** — this supersedes the old bare "17px floor".
- **The board's face is a hero plus at most one short fact.** Sentences go in the panel. Tests cap the hero at 10 characters and the detail at 20 with no full stop.
- **`TONIGHT_FIELD` is inset 6 units inside `TONIGHT_CREAM`.** Text must never touch the painted frame.
- **Demoability is a requirement, not a convenience** (`MANDATE §8`). Preview-only, fixed seeds, never production league data, never a real award.

---

## Local environment recipe

**One command.** `scripts/dev-db.sh` replaces the recipe that used to live here — twice a session lost local Postgres and spent real time retyping it, and a recipe in Markdown is not a workflow: it drifts and it is only ever as good as whoever last remembered to update it.

```bash
npm ci
npm run db:reset      # start Postgres · drop · create · migrate · seed
npm run db:fresh      # the above, then apply every demo state
npm run db:status     # is it up, and what is in it
```

It uses `docker compose` where Docker exists and falls back to the Postgres 16 binaries otherwise — including the part that catches everybody, which is that `initdb` refuses to run as root and has to be driven through the `postgres` user. `reset` refuses outright if `DATABASE_URL` looks hosted; it drops a database, and the rule it protects was broken once already.

Environment defaults are baked in (`DATABASE_URL`, `SESSION_SECRET`, `SLEEPER_LEAGUE_ID`), so nothing has to be exported by hand.

### Demo states

```bash
npm run demo -- list                          # the 21 states and how each is reached
DEMO_FIXTURES=1 npm run demo -- apply broke   # prints a door URL and a PIN
DEMO_FIXTURES=1 npm run demo -- reset         # retire the live generation
```

Two guards, both required (`lib/demo/guard.ts`): production is refused outright, and everywhere else needs `DEMO_FIXTURES=1`. Every write lands on a reserved `demo:`-prefixed seat that no real manager's Sleeper id can match.

**A retire never deletes.** `token_transactions` refuses `DELETE` for everyone, demos included — a demo able to erase its own ledger would be no evidence that a manager's cannot. `npm run db:reset` is the clean slate.

Visual QA needs a **production build** on port 3111:

```bash
npm run build
# DEMO_FIXTURES on the SERVER, not just on the driver — see the note below.
setsid env DEMO_FIXTURES=1 nohup npx next start -p 3111 > /tmp/next.log 2>&1 < /dev/null & disown
export PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
DEMO_FIXTURES=1 npm run visual:qa              # all required states
DEMO_FIXTURES=1 npm run visual:qa -- --state=tray-reveal   # required; buys its own box per width
```

**`DEMO_FIXTURES=1` belongs on both processes, and forgetting the server is silent.** `?preview_reveal=` is resolved inside the render by `previewReveal(…, process.env)`, so a server without it answers every preview request with an ordinary parlor page — and the driver photographs a calm room, files it as `390-reveal-legendary.png`, and passes. That is exactly what CI was doing until #40. The `reveal` gate now fails on it, so the mistake announces itself; the line above is still the fix.

Gotchas that have cost time:
- Sign in as **Alex by name** via `/door`, never by UUID — reseeding regenerates every id. Script PIN is `461902`.
- **Never `pkill -f next-server`, and do not trust `pgrep -f next-server` either** — both match this shell's own command line, so `pkill` kills the session (exit 144) and `pgrep` reports a server that is not running. Use `ps -eo pid,args | grep -F next-server | grep -v grep`, and confirm with `ss -ltnp | grep 3111`.
- A stale `next start` serves old CSS. Confirm the served hash matches `.next/static/css/` on disk.
- Never run `playwright install` here; use the `PLAYWRIGHT_CHROMIUM` path above.
- `visual-qa-*/` and `visual-qa/` are gitignored. Screenshots belong to a workflow run, not to git history.
- `capturing tray-reveal consumes the box.` Restore with:
  ```bash
  npm run db:reset         # drop · create · migrate · seed, in one command
  ```
  Then re-add the three preview seasons for `six-banners` (the SQL block is in `.github/workflows/visual-qa.yml`).

---

## Unresolved / carried forward

- **Reward weights provisional** until the P3 simulation. `PROVISIONAL_RARITY_MASS` in `lib/counter/rewards.ts`.
- **Collectible art is placeholder for all 24.** The box draws a flat carton and the collectible a tagged parcel — different silhouettes since #36, but one silhouette for every item. Specified behaviour; the plate carries identity and the item now stands centred on it. Real art is a registry row. **This is the last thing between M2 and the commissioner's "complete".**
- **Group B content still needs commissioner approval**; seed Group A only.
- **No token sink other than boxes, and no weekly income.** Matchup wins and weekly high scores need a played season and the two cron jobs (`16 §4.3`) that would award them. The reason codes exist; nothing is wired to them. Do not invent a reward that fires on nothing.
- **Salvage for duplicates** is unbuilt and P3-gated.
- **12 of 24 collectibles get finished art at launch**; the rest stay placeholder. Each is a registry row, never a code change.
- **One greeting pair still shared** (SuggMyNick / cheeseking). Two lines of markdown, no code. Asserted in `lib/content/greeting.test.ts`.
