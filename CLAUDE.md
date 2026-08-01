# Claude Code Instructions

This repository contains the complete product specification for **Tony’s Pizza Fantasy**.

Before planning or implementing any feature, read:

0. `docs/PRODUCT_DELIVERY_MANDATE.md` — **the standing commissioner mandate. Read this first.** It defines what "complete" means, the permanent visual standard, the mandatory screenshot loop, demoability, specialist ownership, and the deterministic stats-fact layer.
1. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — **the approved plan.**
2. `PROJECT_SPEC/17_ACCELERATED_ROADMAP.md` — **the approved implementation ordering**
3. `PROJECT_SPEC/18_PARLOR_NAVIGATION_MAP.md` — **how the room works. Read before touching any parlor object.**
4. `docs/IMPLEMENTATION_HANDOFF.md` — **the current assignment**
5. `README.md`
6. Every numbered file inside `PROJECT_SPEC/`, in order
7. `CLAUDE_FIRST_PROMPT.md`

The files inside `PROJECT_SPEC/` are the canonical product specification.

`16_FINAL_RECONCILED_PLAN.md` is approved and sits at the top of the source-of-truth hierarchy. Documents `00`–`15` remain the foundation and govern wherever `16` is silent, but every conflict resolves in favour of `16`. Appendix A of that document lists each superseded requirement — do not re-litigate a decision recorded there.

Do not begin implementation if any file listed in the manifest inside `README.md` is missing.

## Core Product Identity

Tony’s Pizza Fantasy is a persistent social game layered on top of Sleeper.

Sleeper remains the fantasy-football source of truth.

The product is built around weekly league stories, persistent collectibles, manager basements, fictional tokens, friendly trash talk, league history, inside jokes, and Tony’s Pizza Parlor as the central world.

This is not a Sleeper replacement and should not become a generic fantasy dashboard.

## Core Rules

- Accuracy is more important than humor.
- All fantasy facts must come from Sleeper or verified persisted application records.
- Generative AI is limited to Tony’s Tuesday Slice.
- Ordinary Tony, manager, NPC, casino, event, notification, and UI dialogue must use curated content or validated templates.
- The league uses defenses and has no kickers.
- Permanent manager identity must remain separate from seasonal Sleeper roster identity.
- Zack’s personality must not be invented.
- Collectibles persist across seasons.
- Seasonal tokens reset.
- Loot boxes are purchased with tokens.
- Token mutations must use an append-only ledger.
- Token, loot-box, casino, auction, and reward actions must be server-authoritative, transactional, auditable, and idempotent.
- Blackjack and slots are the casino games, deferred to Phase 10. **The casino is not in v1.**
- Roulette is never built. A reserved feature-flag key is the entire required scaffolding.
- Do not introduce achievements, levels, clout, prestige, unrestricted room drag-and-drop, Crash, or real-money custody.
- The first season of Tony’s Tuesday Slice requires commissioner approval before publication.
- Do not silently resolve material contradictions. Report them before implementation.

## Approved Scope (from `16_FINAL_RECONCILED_PLAN.md`)

**Removed from the product entirely:** real-money peer side bets · the prop-bet system (replaced by one weekly "Tony's Line" inside the Slice) · roulette · reward claiming · public guest mode · punishment mechanics that cost tokens or require chores · analytics vendors.

**Deferred:** casino (P10) · manager basements (P6, v1.1) · silent auction · seasonal events (P8) · draft night · Season Story · vending machine (P7).

**In v1:** the event spine · the six-zone Dynamic Pizza Shop · Tonight at Tony's · the Tuesday Slice with Tony's Line, bounties, and the chalkboard prediction · token ledger and weekly rewards · one loot box and a 24-item catalog · wearables and championship rings · the public Showcase · the Timeline · the content engine · historical seasons · persistent login.

**Architecture invariants:**

- One `league_events` spine. Shop state, Tonight, Timeline, Season Story, Slice candidates, and unread markers are all *views* over it — never stored state.
- One content engine (`content_entries`) covers Tony lines, manager lines, NPC events, lore, and shop dressings. Do not add a parallel dialogue or NPC system.
- All token movement goes through `apply_token_delta` with an idempotency key. Balance is trigger-maintained with `CHECK (balance >= 0)`. No feature gets its own balance-writing path.
- No database client in the browser. Server-side access only; `anon` privileges revoked.
- Two cron jobs, no more: Sunday pre-Monday snapshot, Tuesday finalize. **No live in-game score sync, ever.**
- 6-digit PINs, 90-day rolling sessions.
- The Slice must publish correctly with the AI API key unset.
- **The room is not a grid of hotspots.** It is **one portrait shell plus transparent overlays** (`18 §8`). Every parlor object is exactly one of Door, Display, Toy, or Scenery. An object earns a destination only if a manager can guess where it goes before tapping it — if a label is needed to explain why, the mapping is wrong. Most of the room is scenery, permanently.
- **The homepage has exactly eight interactive objects** — **3 Doors, 4 Displays, 1 Toy** (`18 §3`). A Door **glows only when it has something to say**; typically one or two at once, and **only Doors ever glow**. There is **no basement door, no Underground door, no display case, no second door, and no floor hatch** on the homepage.
- **`/counter` is the collectible-economy route** (`/counter/collection`, `/counter/showcase` beneath it). `/collection` is not a route. **One rear doorway → `/back-hall`**, and Rooms (`/rooms`) and Underground (`/underground`) exist **only inside the Back Hall**. An owned loot box **opens at the tray, in place** — never after a navigation.
- **Silhouettes are alpha-derived** — `filter: drop-shadow()` on the overlay's own alpha. No authored masks, polygons, or hit-map images. All changing text is runtime HTML over blank baked surfaces.
- Reward pacing and pricing are **simulation-gated** — no values are locked until the multi-season simulation runs in P3.

**Art:** placeholder-first. Every asset is referenced by slug through the registry; swapping a placeholder for final art is a registry row, never a code change. See `art/ASSET_PIPELINE.md`.

## Current Status

**Implementation is underway on the accelerated roadmap (`17`).**

Shipped: the Next.js foundation, the injected clock, the asset registry, the identity schema, the Sleeper adapter, and the idempotent historical import with recorded 2024–2026 fixtures.

**V0 Pipeline** — shipped. Neon production and sandbox, Vercel on `main`, migrations and seeding as a deploy step, a live `*.vercel.app` URL. See `docs/DEPLOYMENT.md`.

**V1 Doors Open** — shipped. Claim flow, 6-digit PIN, 90-day rolling session, derived tags, content engine v0 seeded from Group A, the six-zone parlor, Tonight at Tony's, the Counter Greeting, the receipt, and the offseason dressing.

**Autonomous delivery** — shipped. `AUTONOMY.md` is the operational contract, `VISUAL_ACCEPTANCE.md` is the second gate, and `npm run visual:qa` enforces the machine-checkable part of it on every pull request.

**M2 — the complete pizza-box loot loop** — shipped to production 2026-07-30 (`238dfca`, PR #23). All twelve items of the commissioner's definition, as one experience rather than four features:

- A manager has a **tab** — tokens on their receipt — and a **box on the counter**, lit. Tapping it **opens it in place**: an anticipation beat, then the collectible on the tray under a light whose colour says how rare it is, and a plate naming it. It never leaves the room.
- From the plate to **`/counter/collection`**, twenty-four spots with theirs filled and the rest named and empty, then **`/counter/showcase`**, one thing each out where the league can see it. The parlor's receipt reflects what is on display.
- Every guarantee is **in the database, not in a service**: `box_openings.box_id UNIQUE` makes a box open once whatever asks; `CHECK (token_balance >= 0)` makes overdraft impossible; a trigger pair gives the balance exactly one write path; openings, the ledger, reward tables and economy configs are append-only; a trigger — not an FK — enforces that you may only showcase *your own* item.
- Reward weights and prices live in content-hash-versioned rows flagged **provisional until the P3 simulation**. The recorded roll plus the recorded table version recompute an outcome exactly, so "was that legendary real" is answerable without trusting the server.

**Wearable *equipping* is M3's, not M2's** — twelve wearables and five slots need a character to attach to. Recorded in the ruling index so it is not read as an omission.

**GitHub Actions conservation (commissioner, 2026-07-31).** The account is near its monthly included Actions minutes. `visual-qa.yml` runs on pull requests and `ci.yml` on pull requests and pushes to `main`, so **work goes to a durable branch with no open PR, where neither fires.** No new PRs, no pushes to a branch that has one, no pushes to `main`, no merges, no manual dispatch, no re-runs. **The gates are not weakened, only deferred** — `npm run check` and `npm run visual:qa` still run in full, locally, on a production build against a fresh database. The reset is confirmed by an explicit commissioner statement or by billing evidence, never by the calendar. See `AUTONOMY.md §4`.

**Weekly stakes — the complete slice** — built this session. One table with a type discriminator (`16 §9`), covering all three approved families:

- **Tony's Line** — the line is the season's **lower median team-week score**, the manager takes over or under on their own team, the stake is fixed and the payout is fixed at 2×, enforced by a database CHECK. No projection of any kind, which is what killed the prop-bet system it replaces. **Flag-gated and shut in v1** (`18 §3.4`), because a season median needs a season.
- **Bounties** — one number chosen at authoring and frozen: *beat the best single week anybody has posted*. Rolling, auto-settling, on the paper rather than the sign (`16 §38`).
- **The chalkboard** — three prediction shapes in a fixed priority order, with a no-repeat rule that reorders and never silences.

Everything a stake knows about football comes through **one Stats boundary** that computes nothing of its own, and every sentence goes through **the Slice's own validator** — so the banned-term scan already refuses odds and win-probability language without anybody having to remember to.

**Week-level finality had to exist for any of it to pay.** Two standing rules contradicted each other: a stake settles only from finalized results, and `apply_token_delta` refuses a finalized season — so a stake was settleable exactly when it was unpayable. Neither was relaxed. A **week** is final on Tuesday (`week_finalizations`, what `16 §4.3`'s Tuesday job writes); a **season** closes in January. A stored resolution records which source it trusted.

**Seventeen board states are reachable by name** (`?board=<key>`), rendered through the production pipeline and **writing nothing** — `lib/slice/editions.ts`'s design, for the same reason. The database guarantees are thirty tests against a real Postgres, because a screenshot cannot show idempotency.

**Commissioner direction, 2026-08-01 — homepage visual cleanliness.** ✅ **Shipped in PR #52.** Recorded here for the reasoning; the boundary document is still the canonical account. `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md` carries it. Two parts: **Tony still clips briefly seconds after the homepage settles** — a *separate* defect from PR #50's hydration repair, transient, so a single screenshot is not evidence and the regression must be timed and must fail on the old behaviour; and **the homepage reads as burnt, scratchy and muddy** where it should read as clean pixel art, most obviously the Tonight board's face and the wall behind Tony. Tony is **not** redesigned. **No new art is required from the commissioner**, and the mechanism chosen for each surface is part of the deliverable. It lands on the next homepage/parlor visual slice, ahead of other visual work.

**The homepage visual-cleanliness slice** — shipped (PR #52, `27cdbc7`). Tony holds still, the Tonight board is a flat cream writing surface, and `checkTonySteady` samples him every animation frame across five passes at all three widths and fails on the old CSS. The ceiling (visual debt 9) and `.affordance-on-request` (visual debt 10) were deliberately left open with their reasons.

**The Slice review chain** — built this session, and it is what the Tuesday job was actually waiting on. `16 §4.3`'s chain ends **`draft Slice → notify commissioner`** and `16 §9` makes approval mandatory in season one; there was no queue for that notification to land in, no approval state and no publication record, so scheduling the cron would have published an issue nobody approved or dropped the draft on the floor. A **governance** gap, not a functional one.

- `generateDraft → submitForReview → approve → publish → the rack`, with reject-and-revise beside it. `/admin/slice` is the desk; `/admin/slice/<version>` is one draft and the decision about it, showing the paper as it will print plus the candidates, their scores, the suppressions and the validator's verdict (`08 §22`).
- **The rack now serves only what was approved.** `rackIssue` prefers the most recently published issue and falls back to the historical rendering only while nothing has ever been published — which is the approval gate made real on the reader's side.
- Every guarantee is **in the database**: content immutable once written · regeneration idempotent by content hash · a version the validator refused unapprovable · publication requiring a recorded approval **naming a person** · one published version per issue · the manual hold blocking publication for every caller · review history and holds append-only.
- **There is no prose editing and no candidate override**, and both absences are decisions. A free-text edit would let a sentence no validator passed reach the surface the league reads as true; a candidate override would move `MANDATE §9`'s Stats authority into the reviewer's hands. Recorded in `docs/SLICE_REVIEW_BOUNDARY.md §7`.

**Next assignment:** **the Tuesday job** (`16 §4.3`'s second cron), now unblocked. It writes `week_finalizations`, calls `authorStakesForWeek` and `settleSeason`, and ends at `generateDraft(..., { submit: true })` — all four exist, are idempotent and are tested. What remains is operational: `vercel.json`, a secret-protected route, and what the job does when a week refuses to draft. See `docs/CHECKPOINT.md` for the durable state.

**Previously:** the Back Hall as a room (visual debt 5) — one compact pixel-art scene with two environmental choices, not the three stacked panels `18 §5` forbids. Placeholder architecture is approved and M3 has shown what it looks like: a drawn stand-in at the right size, as geometry data, rather than a sign. `docs/BACK_HALL_BOUNDARY.md` carries the route contracts, the flag-based state boundary, the five asset slots and the five demo states. Stats Intelligence (#26) and M3 (#24) are both shipped.

**No paid API use** (commissioner decision, 2026-07-30). The orchestrator workflow is retired to manual dispatch only and `ANTHROPIC_API_KEY` is unset — nothing in this repository spends money. This affects no product scope: generative AI is limited to Tony's Tuesday Slice, and `16 §9` already requires the Slice to publish correctly with the key unset. Delivery runs on the label lifecycle in `AUTONOMY.md §2` plus the two unpaid gates, `npm run check` and `npm run visual:qa`. Do not reintroduce a paid dependency without a new decision.

The engineer runs continuously inside a vertical slice and stops only at the conditions in `17 §8`. PR checkpoints are the six categories in `17 §7` — not every subtask.

### Ordering versus scope

`17` changes **only the order** in which work becomes visible. It introduces no new scope. Every invariant, gate, and scope decision in `16` still holds. Where the two disagree about order, `17` wins.

### The offseason matters

Today is late July; the season starts around 10 September. The site launches into a deliberate **offseason state** built on imported 2024/2025 history. Day one needs no live scoring, no economy, and no Slice pipeline.

## Build Behavior

Before writing implementation code:

1. Confirm that the complete manifest from `README.md` is present.
2. Read `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` first, then the rest of the specification.
3. ~~Present an architecture review~~ — **complete.** Delivered across five review rounds and approved 2026-07-28. The result is `16_FINAL_RECONCILED_PLAN.md`.
4. Build in the **vertical-slice order of `17 §4`**, honouring the release gates in `16`. The phase table in `16 §13` is superseded for ordering only.

Work the assignment in `docs/IMPLEMENTATION_HANDOFF.md`. Do not begin a slice that has not been assigned, and do not absorb scope from a later slice — propose it instead.

## Source of Truth

`docs/PRODUCT_DELIVERY_MANDATE.md` is the latest commissioner ruling and sits above everything else. Below it, follow the source-of-truth hierarchy in `README.md` and `AUTONOMY.md §1`.

**Do not preserve incorrect behaviour because an old Markdown file still describes it.** Correct the loser, and add a test so the contradiction cannot return.

Prefer the most specialized canonical document for a system after applying that hierarchy.

Examples are illustrative unless explicitly labeled as fixed requirements.

## Implementation Philosophy

Favor simple systems over clever systems, one polished vertical slice over many unfinished features, deterministic calculations over model inference, configuration over scattered hardcoding, recoverable operations over destructive shortcuts, responsive and accessible interfaces, strong data integrity, and minimal weekly commissioner work.

A feature is not complete merely because it appears visually. It must also be secure, tested, accessible, recoverable, and operationally manageable.
