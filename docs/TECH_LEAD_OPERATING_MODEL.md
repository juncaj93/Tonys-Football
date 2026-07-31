# Technical Lead Operating Model

**Status:** active, approved 2026-07-29.
**Purpose:** how the Technical Lead, the implementation workstreams, and the commissioner divide work — and where rulings live so nobody has to relay them.

---

## 0. Why this file exists

Rulings were being carried between chats by the commissioner, and the ruling record lived only in a session-local plan file that does not survive the session. Neither is a canonical record.

**GitHub is the shared communication layer.** Rulings are PR comments; the durable index is this file. A ruling that exists only in a chat did not happen.

---

## 1. Roles

| Role | Owns |
|---|---|
| **Technical Lead** | Workstream sequencing · branch and PR strategy · delegation · reconciliation of overlapping changes · review of diffs, tests, CI and previews · the canonical product and architecture record · deciding when work is integrated enough to ask the commissioner |
| **SW Initial Product** | Parlor art, homepage integration, application implementation |
| **Stats & Data** | The Sleeper adapter, correctness guardrails, derived statistics |
| **Commissioner** | Product taste, visual approval, production deployment |

---

## 2. The two message formats

Both go on the relevant PR. Neither goes through the commissioner.

### `TECH LEAD RULING`

Posted by the Technical Lead. Always carries:

1. Exact work authorized
2. Owner and target branch or PR
3. Required preserved behaviour
4. Tests and verification
5. Stop conditions
6. **Whether merge is authorized after green CI**

### `DECISION REQUEST — TECH LEAD`

Posted by a specialist that needs a ruling to continue. State the question, the options considered, what each costs, and what you would do absent a ruling. The Technical Lead answers on the PR and the specialist continues — **do not wait on the commissioner, and do not ask the commissioner to relay.**

If the answer turns out to be the commissioner's (see §4), the Technical Lead escalates it, not the specialist.

---

## 3. Delivery principle — group work into judgeable milestones

**Do not ask the commissioner to approve an isolated technical change that cannot be judged in the real website.** A palette metric, a coordinate correction, and a migration renumber are not things anyone can look at.

Dependent work is grouped onto an **integration branch** and reviewed on its Vercel preview. The commissioner sees the actual iPhone experience, the important interaction states, before-and-after context, and any remaining visible compromises — once, when it is ready to be judged.

**This rule exists because it was broken.** The first merge order was sequenced to minimise conflicts: `#8 → #11 → #10 → #9`. It was right about conflicts and wrong about the product — `#8` put the legacy homepage into production and `#11` put the approved shell in beside it, unwired, so the public preview regressed. Optimising merge order for PR cleanliness produced an incomplete public visual state.

**Never merge an incomplete visual milestone to `main` because an individual PR is technically green.**

---

## 4. Escalation boundary

### Goes to the commissioner

- An actual visual preview needing taste or approval
- Two or more materially different product outcomes, both valid
- An expensive or destructive redesign
- A new product rule the specification does not cover
- Production deployment approval

### Never goes to the commissioner

Branch mechanics · PR creation · rebasing and reconciliation · factual measurements · implementation choices with one clearly correct answer · test failures and fixes · CI maintenance · documentation updates · temporary preview deployments · routine merge sequencing.

---

## 5. Merge policy

Merge to `main` only when **all four** hold:

1. The integrated result is coherent as a product, not merely as a diff
2. Required CI is green **on the actual merged result**
3. The Technical Lead has reviewed it
4. Any required commissioner visual approval has been received

**Merging `main` deploys production.** `vercel-build` runs migrate → seed → build, so there is no such thing as a quiet merge to `main`. Do not deploy outside the repository's approved merge/deployment policy.

Work freely on branches and previews. That is what they are for.

---

## 6. Reconciliation principles

Learned from three-way merges that were genuinely hard, and worth stating once:

- **Documentation absorbs code, never the reverse.** A docs PR should reconcile against what shipped, not force shipped code to match a stale count.
- **Never delete an approved slug, record, or asset to satisfy an older number.** Recalculate the number.
- **When two branches change the same decision in opposite directions, the ruling decides — not the merge.** Resolve it before the conflict, and record which side won and why.
- **Keep both sides of an additive conflict.** A test deleted to make a conflict disappear is a regression with a green tick beside it.
- **A merged PR is finished.** It cannot track new work. New commits on its branch need a new PR.

---

## 7. Where the record lives

| Kind | Location |
|---|---|
| Product specification | `PROJECT_SPEC/`, hierarchy in `README.md` |
| Parlor navigation and object map | `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` |
| Art pipeline and its rulings | `art/ASSET_PIPELINE.md` |
| Measured shell geometry | `art/SHELL_AUDIT_zone_parlor_shell.md` |
| Data policy and audit | `docs/DATA_AUDIT.md` |
| Current assignment | `docs/IMPLEMENTATION_HANDOFF.md` |
| **Ruling index** | §8 below |

A ruling that changes canonical direction is **folded into the specialized document** as well as indexed here. The index is a pointer, not the source of truth.

---

## 8. Ruling index

Chronological. `PR #n · comment` is the authoritative text.

| Date | Ruling | Where |
|---|---|---|
| 2026-07-29 | Palette quantization: **plain Euclidean RGB**; luma weighting never reintroduced | `art/ASSET_PIPELINE.md §4` · PR #11 |
| 2026-07-29 | Full-batch regeneration; B0 re-approval required after a quantizer change | PR #11 |
| 2026-07-29 | Cream board **closed at step 2** — metric correction alone; palette stays 32 colours | PR #11 |
| 2026-07-29 | Receipt is **trigger-only**; every blank surface classified surface-rendered or trigger-only | PR #9 |
| 2026-07-29 | Tony's Pizza **first-party branding permitted**; generic jersey numbers permitted; `16` canonical. Test is **identifiability, not decoration** | `art/ART_SPEC.md` · PR #11 |
| 2026-07-29 | Champion banners: **year-only fabric**, names in `/timeline`, six left-aligned slots, current season reveals `TBD` | PR #9 |
| 2026-07-29 | Banner rail reclassified **Display** → homepage is **3 Doors · 4 Displays · 1 Toy** | PR #9 |
| 2026-07-29 | Individual banner selection via **real DOM buttons**, not pointer arithmetic; bounded WCAG 2.5.8 AA exception that **does not generalise** | PR #9 |
| 2026-07-29 | `zone_parlor_counter_front` **withdrawn** — the shell's lower half is the foreground layer | PR #11 |
| 2026-07-29 | Board shift is **+5, not +6** — the board is 132 units, not 130 | PR #13 |
| 2026-07-29 | The board correction stays **provenance, not a pipeline stage**; every asset remains a pure function of its source | `art/ASSET_PIPELINE.md §4a` · PR #13 |
| 2026-07-29 | Merge order **superseded** by the integration-branch model | PR #14 |
| 2026-07-29 | Finalized seasons refuse record updates; open seasons still update | `docs/DATA_AUDIT.md` · PR #10 |
| 2026-07-30 | **Full autonomous delivery mandate** — Technical Lead is also integration owner, visual gate, and delegated commissioner for V1 | this file |
| 2026-07-30 | **COMMISSIONER: standing Product Delivery Mandate.** The objective is a demonstrable, polished, statistically trustworthy product — not the existence of routes, schemas or PRs. Completion bar, permanent visual standard, mandatory screenshot loop, demoability, specialist ownership, deterministic stats-fact layer | `docs/PRODUCT_DELIVERY_MANDATE.md` |
| 2026-07-30 | **COMMISSIONER: the Tonight board is not clear.** Too small, too many words, colliding with the frame. It should read like `WEEK 5` plus one short fact, elegantly, inside the cream field | `TONIGHT_FIELD` · `lib/parlor/tonight.ts` |
| 2026-07-30 | Typography floor is **16–18 CSS px, adjusted upward when the pixel font needs optical size** — supersedes the bare "17px floor". Panels adapt around readable text; text is never shrunk to fit a panel | `PRODUCT_DELIVERY_MANDATE.md §6` |
| 2026-07-30 | **COMMISSIONER: the league does not pay for API use.** The orchestrator is reduced to manual dispatch, `ANTHROPIC_API_KEY` is removed, and no paid dependency may be reintroduced without a new decision. No product scope is affected — `16 §9` already requires the Slice to publish with the key unset | `AUTONOMY.md §4` · issue #18 |
| 2026-07-30 | Transient panels are **set down in the room**, never bottom sheets. Sized to content, centred, pixel-bevelled, shared material with Tony's box and the champion panel | `components/scene/room-object.tsx` |
| 2026-07-30 | **Body copy floor is 17px.** Size the container to the type, never the type to the container | `components/scene/tony-toy.tsx` |
| 2026-07-30 | The Tonight board is **surface-rendered**: state line + one headliner on the board's own face, all four lines in the panel | `TONIGHT_FIELD` |
| 2026-07-30 | The prediction sign gets a **wiped-board** treatment — chalk residue, no invented prediction | `PREDICTION_SLATE` |
| 2026-07-30 | **The tray's destination is conditional.** Empty tray → `/counter`. Box on it → **opens in place**, no navigation. One object either way; the box is a *state of the tray*, never a ninth object | `components/scene/counter-tray.tsx` · issue #17 |
| 2026-07-30 | Because of the above, **`/counter` must stay reachable in every tray state.** The reveal plate carries the onward step. A route reachable only sometimes is the same defect class as a link to a route that does not exist | `VISUAL_ACCEPTANCE.md §6` |
| 2026-07-30 | `object-map` asserts **the whole map by marker identity** (`data-room-object` / `data-room-kind`), not a count of anchors. `banners` is the **only** partitioned object (`data-room-partition`) | `VISUAL_ACCEPTANCE.md §3` · `scripts/visual-qa.mts` |
| 2026-07-30 | New **`glow` gate**: nothing in the room carries `drop-shadow` except the tray's box states and a rarity treatment | `VISUAL_ACCEPTANCE.md §3` |
| 2026-07-30 | **`box_openings.box_id UNIQUE` is the idempotency mechanism** for opening — the operation has a natural key. No client-supplied idempotency key; that invariant belongs to `apply_token_delta`, where a delta has no natural key | `lib/db/schema.ts` |
| 2026-07-30 | The reward table is **stored, versioned by content hash, and append-only**. A rebalance writes a new version; openings keep pointing at the version they rolled against. Weights ship `provisional = true` until the **P3 simulation** signs them off | `lib/counter/rewards.ts` |
| 2026-07-30 | The **catalog is derived from the asset registry**, not duplicated in a table. Rarity and the item's name (its `alt`) have one home; `CATALOG_SIZE` is asserted so a registry edit cannot silently change the economy | `lib/counter/catalog.ts` |
| 2026-07-30 | Randomness is **injected like the clock** — one override point, `crypto.randomInt`, never `Math.random` | `lib/counter/rng.ts` |
| 2026-07-30 | **Rarity is the word first**, then frame geometry, then colour. Colour is an accent *inside* a house-material surface, never the surface's own border | `app/globals.css` |
| 2026-07-30 | `PlaceholderSign` is for **surfaces**; small objects use `PlaceholderObject` via `AssetView … compact`. The wall sign does not shrink | `lib/assets/placeholder.tsx` |
| 2026-07-30 | The revealed collectible **rests on the tray**, where the box was. Motion may lift it; geometry may not float it | `TRAY_REVEAL` |
| 2026-07-30 | `apply_token_delta` is a **Postgres function**, not a service. The balance column has one write path, enforced by a trigger pair — a direct `UPDATE` of `token_balance` raises | `drizzle/0005_token_ledger.sql` |
| 2026-07-30 | **A token delta needs a client-supplied idempotency key; opening a box does not.** A delta is an event with no natural key; a box opens once and has one. The two slices differ on purpose | `lib/counter/tokens.ts` |
| 2026-07-30 | Reusing an idempotency key for a **different** delta raises rather than silently no-opping — a silent no-op would tell a caller it moved tokens that never moved | `apply_token_delta` |
| 2026-07-30 | Overdraft is refused by `CHECK (token_balance >= 0)`, never by a read-then-check in a service. The Buy button is **never disabled on a client-read balance** | `lib/counter/boxes.ts` |
| 2026-07-30 | Purchase debits **before** creating the box, so an unaffordable purchase creates nothing. One transaction; the box's `grant_key` is derived from the ledger key | `purchaseBox` |
| 2026-07-30 | `apply_token_delta` refuses a **finalized season** (`03 §6` closes the books). 2024/2025 are finalized in every environment, so this is reachable | `drizzle/0005_token_ledger.sql` |
| 2026-07-30 | The purchase idempotency key is **namespaced server-side** under the session's user id, so a client cannot craft a key that reaches another ledger row | `app/actions/counter.ts` |
| 2026-07-30 | The token balance lives on the **receipt**, not in the utility bar — a balance bolted to the chrome is the first step toward the dashboard `16 §1` names as the failure mode | `app/page.tsx` |
| 2026-07-30 | **New gate:** no Tailwind class may reference an undefined `--color-*` token. Four sites shipped invisible or accidentally-inherited text | `lib/design/colour-tokens.test.ts` |
| 2026-07-30 | Body copy inside a cream `PixelPanel` is **`text-ink-700`**, never `text-paper-*`. Cream on cream shipped on three routes | `VISUAL_ACCEPTANCE.md §4` |
| 2026-07-30 | `tray-reveal` is a **required** visual state now that a box can be bought per width | `VISUAL_ACCEPTANCE.md §1` |
| 2026-07-30 | **`RoomBehind` was drawing the withdrawn two-tile room** behind every interior route since V1. Now the one approved shell. The `legacy` and `colour-fidelity` checks run on **every** state — a skip list is a place for defects to live | `components/scene/room-behind.tsx` |
| 2026-07-30 | The `legacy` gate matches the withdrawn **root** `/collection`, anchored to a path boundary. `/counter/collection` is canonical and must not trip it | `scripts/visual-qa.mts` |
| 2026-07-30 | The collection shows the **whole 24-item catalog**, unowned entries named and deliberately empty. Set progress is a statement about the gap | `app/counter/collection/page.tsx` |
| 2026-07-30 | **Duplicates are counted, never converted.** `03 §12` defers salvage until after simulation; a salvage rate here would be a P3 decision taken early | `lib/counter/collection.ts` |
| 2026-07-30 | Collection filters are **URLs, not client state**, and an unrecognised value means "everything" rather than an error | `parseFilter` |
| 2026-07-30 | The Showcase is **one column on `users`**, no levels or clout (`16 §5.3`, `18 §4`). Ownership is enforced by a trigger — an FK can say "a collectible", not "*your* collectible" | `drizzle/0006_showcase.sql` |
| 2026-07-30 | The Showcase wall lists **every manager including retired ones and those showing nothing** — omitting them makes "has not picked" look like "is not in this league" | `lib/counter/showcase.ts` |
| 2026-07-30 | **Wearable equipping belongs to M3**, not M2. `03`'s 12 wearables / 5 slots need the character system to be equipped onto; the allowed M2 action is the Showcase | this file |
| 2026-07-30 | **An empty spot is empty, not a dark card.** Raising the contrast of a filled rectangle where nothing is standing does not fix it — a rectangle with nothing in it reads as a failed render at any brightness. Unowned collection spots and managers showing nothing are drawn as *absence* | `app/counter/collection/page.tsx` · `app/counter/showcase/page.tsx` |
| 2026-07-30 | **Set progress is the rarity filter.** Two blocks saying the same four words took a third of a 390 before a collectible appeared. Still URLs, not client state | `/counter/collection` |
| 2026-07-30 | A shelf row's height **follows what is standing on it** — a board with jars is taller than a bare board. Fixed heights gave even pitch and 120px of nothing under a row of names | `rows()` |
| 2026-07-30 | The way back is labelled **"out front"**, never "the counter". `/counter` is a real route, so a back link to `/` naming the counter points at the page you are on | `ReturnPlate` |
| 2026-07-30 | **COMMISSIONER, ABSOLUTE: retired managers are never product participants.** Armen, Shant and Berardo appear in **no** structured surface — not listed, not labelled "retired", not disabled, not behind an alumni page, not explained away with text. The **only** exception is a rare name inside Tony's casual dialogue, carrying no link, avatar, record, collectible, score or account, and never entering a Slice story, standing, record, receipt or statistical summary | `lib/league/membership.ts` |
| 2026-07-30 | **Membership derives from an active season seat, never from the existence of a row.** A `users` row, an old membership, a welcome box, a token transaction, a collectible, a historical matchup, a seed entry or a cached object makes nobody visible. **Preserve the data, hide the person** — deleting them would take audit history and referential integrity with it | `activeSeat` · `activeLeagueManagers` |
| 2026-07-30 | **One canonical boundary, never scattered exclusions.** No `name !== 'Armen'` in a component. `APPROVED_2026_ROSTER` is the *assertion*, not the mechanism — `membership.test.ts` fails if seats and roster disagree | `lib/league/membership.ts` |
| 2026-07-30 | **A fact may name a retired manager; a published claim may not.** Ryan beating Berardo by 140.72 is the largest margin on record and stays in the fact layer, the audit trail and the history. The editorial filter lives at the *publication* boundary — suppressing at derivation would make a fact's truth depend on who is seated this season | `lib/stats/board.ts` |
| 2026-07-30 | ~~The door opens for the whole permanent record~~ — **superseded the same day** by the commissioner ruling above. The reasoning that lost: permanent identity *is* separate from a seasonal roster, but that separation is a **storage** property. It keeps a row joinable; it confers nothing visible | PR #34 → this batch |
| 2026-07-30 | **COMMISSIONER: readability wins over styling, always.** A beautiful colour that takes effort to read is a defect. Judge at true iPhone size, never zoomed. Palette purity never outranks comprehension. Every visual milestone gets a dedicated polish pass, and the test is *"would Nintendo ship this?"* | `VISUAL_ACCEPTANCE.md §7`–`§8` · `docs/VISUAL_DEBT.md` |
| 2026-07-30 | **COMMISSIONER: a workstream is only "running" if an actor is implementing it.** An issue, a label or a role contract is not execution. Every workstream carries one explicit mode — `TECH_LEAD_IMPLEMENTING`, `SPECIALIST_SESSION_REQUIRED`, `QUEUED_NOT_ACTIVE` — and none may sit in an ambiguous "assigned" state | `docs/CHECKPOINT.md` |
| 2026-07-30 | **Stats may not both calculate and approve its own claims.** The typed-fact pipeline is verified independently by recomputation from the raw fixture files, sharing no code with the pipeline — not by pinning numbers the pipeline produced | `lib/stats/independent-verification.test.ts` |
| 2026-07-30 | **The door opens for the whole permanent record, not this season's roster.** Keying it on the current seat put a co-owner and two former managers behind a 404 at their own door while the seed granted each a welcome box they could never reach. `is_retired` is explicitly *not* a filter — the mappings file says retirement is not deletion | `listDoorManagers` |
| 2026-07-30 | **A seatless manager owns, opens and showcases; they cannot spend.** Collectibles are permanent, tokens are seasonal (`CLAUDE.md`). Never grant tokens to make a surface stop looking broken — say the true thing instead | `app/counter/page.tsx` · `app/page.tsx` |
| 2026-07-30 | **Demo states get one reserved seat each**, and every key they write is derived from the state's name and generation. Re-applying is a no-op through the product's own unique constraints — which is *why* there is no destructive reset. A retire never deletes: `token_transactions` refuses DELETE for everyone, demos included | `lib/demo/seat.ts` · PR #32 |
| 2026-07-30 | **A demo seat is never part of a claim about the league.** Counts, walls and standings exclude them; the door does not, because a seat nobody can sign in as is not a demo. Shipped after the board read *"5 of 14 managers"* on a preview | `lib/demo/boundary.ts` |
| 2026-07-30 | **Weekly points are stored in integer cents.** `154.42 - 103.91` in IEEE 754 is `50.510000000000005`, and a margin is published as a fact. A CHECK constraint makes the stored margin unable to disagree with its own points | `drizzle/0007_fantasy_matchups.sql` |
| 2026-07-30 | **Every significance tier above `beat` needs two independent reasons** — an absolute floor *and* a league-relative percentile. A floor alone imports another league's scoring; a percentile alone makes a quiet week produce a blowout | `lib/stats/significance.ts` |
| 2026-07-30 | **Calibration: `handled` gains a 70th-percentile gate.** Every absolute floor the commissioner set is kept verbatim. Measured over all 162 finalized games, this league's median margin is 20.6, so a bare `>= 20` covered 54% of games — a tier describing the majority is not a classification | `PROVISIONAL_TIERS` |
| 2026-07-30 | Significance thresholds are **simulation-gated and content-hash versioned**, exactly as reward weights are. A fact records the policy version it was classified under, so an old fact never silently re-means itself | `significance_policies` |
| 2026-07-30 | **A fact that cannot be evidenced is suppressed with a recorded reason**, never softened into vaguer prose. Four reasons: a tie, a disputed game, an unfinalized season, a roster that resolves to nobody. There is **no fallback to a Sleeper handle** — a fallback there is the bug | `lib/stats/facts.ts` |
| 2026-07-30 | The board renders **two names and nothing else**. The intensity and the margin travel with the fact to surfaces that have room to state them; a loaded word on the largest object in the room without its evidence is what `MANDATE §9` forbids | `lib/stats/board.ts` |
| 2026-07-30 | The `users → collectibles` FK is declared in **SQL, not `schema.ts`** — the reverse reference makes the table types mutually recursive and TypeScript stops inferring both (TS7022). It also extends `TRUNCATE ... CASCADE` to reach `users` | `drizzle/0006_showcase.sql` |
| 2026-07-30 | **COMMISSIONER: Tony owns both ends of the pizza-box loop.** He hands over the first box and he offers the next one. *"The experience should feel like Tony handing something across the counter, not like the application generated inventory."* Both dialogue groups approved without line-by-line review | `content/counter-greetings.md` A24–A31 · `content/box-offer.md` O1–O7 |
| 2026-07-30 | **Moment tags outrank standing lines without a priority field.** `first_welcome_box` / `box_waiting` are true of somebody *this second*; the homepage computes audience over `leagueTags`, which holds no moment tags, so their audience is zero and the existing smallest-audience rule picks them. The negative states are the **absence** of a tag, never a `no_welcome_box` | `lib/parlor/moment.ts` |
| 2026-07-30 | **The post-reveal offer is a sentence, not a price beside a button.** Four gates before a line is considered — open season, seat, stored economy, sufficient balance — and any one false means **no offer and no link**. Not greyed out, not explained, not a smaller pitch | `lib/counter/offer.ts` |
| 2026-07-30 | **Purchase eligibility is read on the server, on the request that opens the box**, and the chosen line travels back inside the reveal payload. A remount cannot reroll what Tony said, and no client-read balance decides whether he says it | `openBoxAction` |
| 2026-07-30 | **One parser, one engine, several files.** A second surface gets a `LineSyntax` — file, heading, stop heading, and its **own variable whitelist** — never a second parser. A shared global variable list would let a greeting reference `{price}`, which renders empty rather than failing | `lib/content/parse.ts` |
| 2026-07-30 | ~~The revealed collectible rests on the tray, where the box was~~ — **superseded.** The tray's centre is 43 units right of the room's, so the item stood on the right-hand quarter of its own nameplate. It now stands **on the plate, on the plate's axis**; the small horizontal jump from the tray is the accepted cost. What the old rule got right and keeps: nothing floats | `TRAY_REVEAL` · `lib/parlor/objects.test.ts` |
| 2026-07-31 | **The day's greeting is repeated only while it is still true.** `greetingFor` caches per Eastern day so Tony does not re-greet you every page load — correct for a standing fact about a season, and wrong the moment **moment tags** existed. A new manager was told *"Tony does not charge for the first one"*, opened the box, came back, and was told it again about a box that no longer existed. The repeat now re-checks required and excluded tags against what is held **now**; a stale moment falls through to a fresh draw. Found by walking the loop, not by a test | `stillTrue` · `lib/parlor/moment.test.ts` |
| 2026-07-30 | **Text on the room gets a hard one-pixel outline, never a plate.** An unowned shelf name has no surface by ruling (an empty spot is empty), so it lands on a *drawing* rather than a colour — and over the counter's checker a 55% cream was the "light grey on wood" case `VISUAL_ACCEPTANCE.md §7` already lists as shipped. `.shelf-label` follows `.board-paint`: four hard pixels, **no blur**, because a soft halo is what makes text read as a web label dropped on a screenshot | `app/globals.css` |
| 2026-07-30 | **A panel is for the thing you can act on.** `/counter` was three identical cream panels stacked down the screen — a list of cards, not a counter — and one of them repeated the sentence three lines above it. One panel now (the box), one line of Tony's voice, and the way to the shelves printed straight on the counter | `app/counter/page.tsx` |
| 2026-07-30 | **New `reveal` gate**, and the false green that caused it: `?preview_reveal=` is resolved by the **server**, which needs `DEMO_FIXTURES=1`. The workflow set it only on the driver, so nine reveal states photographed a calm room, were filed under rarity names, and **passed** — with `rarity-contrast` measuring nothing on the surface it was written for. A state that captured the wrong thing is worse than a missing one | `VISUAL_ACCEPTANCE.md §3` · `.github/workflows/visual-qa.yml` |

---

## 9. Current milestone — M2 the loot-box slice

**Slice 1 — the tray holds a real box, and opening it is the moment** (issue #17). Built on `claude/tonys-pizza-tech-lead-iq2n38`.

| | Work | State |
|---|---|---|
| 1 | Ownership, openings and inventory schema — append-only, trigger-enforced | ✅ merged |
| 2 | Stored versioned reward table, provisional until P3 | ✅ |
| 3 | Server-authoritative, transactional, idempotent opening | ✅ |
| 4 | The box on the tray; open-in-place; the reveal | ✅ |
| 5 | `object-map` rewritten to markers · new `glow` gate · `tray-owned-box` state | ✅ |
| 6 | `/counter` made truthful about what is owned | ✅ |

Next slices, as separate issues: **token acquisition** through `apply_token_delta` (which also makes `tray-reveal` a required visual state), then **`/counter/collection`**, then **showcase and equip**.

### The orchestrator is off, and the milestone is unaffected

The model-driven loop never ran a single turn: both runs on 2026-07-30 exited on `Credit balance is too low` before the role file was read. Escalated as issue #18 — and the **commissioner answered that the league does not pay for API use.**

So the loop is retired rather than repaired: `orchestrator.yml` is manual-dispatch only, `ANTHROPIC_API_KEY` comes out of Actions secrets, and #18 is closed as not-planned. Recorded in `§8` and `AUTONOMY.md §4`.

This costs the project nothing that matters. The labels in `AUTONOMY.md §2` are the state machine and the `agents/*.md` files are the role contracts; the workflow was one possible actor reading them, not the mechanism itself. Turns are taken in a session — which is how slice 1 shipped, under exactly the gates the loop would have applied. The two gates that decide whether work is good, `ci.yml` and `visual-qa.yml`, were built to depend on nothing and are untouched.

---

## 10. Previous milestone — V1 Parlor

Integration branch **`integration/v1-parlor-milestone`**, tracked by **PR #14**, which is also the visual gate.

**Complete.** All four steps merged to the integration branch and then to `main`.

| | Work | PR | State |
|---|---|---|---|
| 1 | Board alignment + durable geometry | #13 | ✅ |
| 2 | Sleeper Phase A correctness | #10 | ✅ |
| 3 | Parlor navigation reconciliation | #9 | ✅ |
| 4 | Homepage wiring | #15 | ✅ |
| 5 | Visual polish — panels, typography, board face, prediction slate | direct | ✅ |

### Settled geometry — the wiring builds against these

| Feature | Extent |
|---|---|
| Rail rod | `x 54–184` · 131 units · centre `119.0` |
| Board, as shipped (+5) | `x 54–185` · 132 × 101 · centre `119.5` |
| Banner slots | `56 · 78 · 100 · 122 · 144 · 166` · width 18 · gap 4 · pitch 22 |
| Banner hit row | `y 58–87`, ends extended by `gap / 2` |
| Newspaper rack | `(10, 224)` at 38 × 38 |
| Layer cut | logical **y 292** |
| Tony | `(64, 180)` at 72 × 197, visible band 112 units |
| Tonight board text field | `TONIGHT_FIELD` `66, 99, 99, 67` — inset 6 units in the cream; hero + one short fact, centred |
| Prediction slate | `PREDICTION_SLATE` `154, 184, 37, 59` — chalk residue only |

Board and banner row co-centre at `119.5`, delta `0.0`. Partitions clear WCAG 2.5.8 AA at 24.75 CSS px on a 360 px viewport.

**Gap 4 is load-bearing.** Narrowing it to 3 drops the pitch to 21 → 23.6 CSS px, below AA on a 360 px viewport. If the rod is ever re-measured narrower than 128, the answer is **five slots at gap 4, never six at gap 3.**
