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

**Deferred:** casino (P10) · manager basements (P6, v1.1) · silent auction · seasonal events (P8) · draft night · Season Story · vending machine (P7) · **the `league_events` spine (commissioner ruling, 2026-08-06 — deliberately deferred, not missing; see the invariant below and `docs/CHECKPOINT.md`)**.

**In v1:** ~~the event spine~~ · the six-zone Dynamic Pizza Shop · Tonight at Tony's · the Tuesday Slice with Tony's Line, bounties, and the chalkboard prediction · token ledger and weekly rewards · one loot box and a 24-item catalog · wearables and championship rings · the public Showcase · the Timeline · the content engine · historical seasons · persistent login.

**Architecture invariants:**

- ~~One `league_events` spine.~~ **Deferred by commissioner ruling, 2026-08-06 — kept here rather than deleted, because half of it survives and governs.** Shop state, Tonight, Timeline, Season Story, Slice candidates and unread markers are still all *views* and **never stored state** — but they are computed from the verified domain tables directly, and **those tables are the source of truth** for matchups, rewards, box transactions, Slice facts, Timeline facts, and current shop and room state. **Do not duplicate those facts into a generalized event log to satisfy this older statement.** Revisit only when a concrete feature needs a unified chronological feed, ordering across heterogeneous event types, per-manager read/unread state, notification delivery, or replay — and then design the spine around that consumer. `docs/CHECKPOINT.md` carries the ruling in full.
- One content engine (`content_entries`) covers Tony lines, manager lines, NPC events, lore, and shop dressings. Do not add a parallel dialogue or NPC system.
- All token movement goes through `apply_token_delta` with an idempotency key. Balance is trigger-maintained with `CHECK (balance >= 0)`. No feature gets its own balance-writing path.
- No database client in the browser. Server-side access only; `anon` privileges revoked.
- Two cron jobs, no more: Sunday pre-Monday snapshot, Tuesday finalize — **both now built**. **No live in-game score sync, ever.**
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

**The text-surface refresh** — built this session, and it fixed a **cause** rather than a screen. The commissioner's direction named the review-refused screen as a worked redesign and asked for that quality in the product; underneath it was an audit finding of **sixteen distinct font sizes across roughly two hundred call sites**, seven of them at 8 or 9 pixels, thirty files with text under 16px, and no typography module at all. Restyling one screen would have been the fourth "raise the small type" pass, and the previous three each left instances behind.

- **`lib/design/type.ts` is the type case.** A component names the *job the words are doing* — `TYPE.body`, `TYPE.sectionHeading`, `TYPE.ledgerValue` — and the role decides face, size, leading, tracking, casing and numerics. **Six sizes, down from sixteen**, chosen against browser measurements of both faces: Silkscreen's capitals at 15px are exactly as tall as VT323's at 17px, and Silkscreen is half again as wide per character, so a display role is only ever short. Nothing is fluid and nothing is fractional — both faces are pixel faces.
- **Enforcement is in two halves and neither is sufficient.** `lib/design/typography.test.ts` refuses a size at a call site; `checkTypeFloor` in the visual driver measures the **computed** size of every rendered text node at every state and width, which is what catches an inherited size, a one-state size, or a size the browser supplied. **One declared exemption** — the season year painted on a pennant, marked in the DOM, and a second kind of it is itself a failure.
- **The surfaces adopted it.** `components/scene/text-surface.tsx` is the printed vocabulary: a mounted sheet with a dark frame and corner brackets, a two-line masthead, printed rules, plaques, a drawn warning glyph, and a **bordered ledger** with keys left and values right-aligned. The review screen answers its six questions by geometry rather than by paragraph; the Slice gained a nameplate that no longer wraps wherever the browser chose, a masthead flag on a title week, and a board whose scores are no longer the quietest thing in the row.
- **Nothing behavioural moved**, and `components/slice/presentation.test.tsx` holds it: the display components may not import `lib/stats`, the Slice's selection, packet, validation or edition modules, or the database, and may not do arithmetic on a fact. `Edition` is untouched, so no content hash moved.
- One real defect fell out of it: **a drawn game printed *"A over B"***. `leftWon` is false on a tie and the board's separator was the literal word `over`. `RenderedScore` has carried `tie` since it was written.

`docs/TEXT_SURFACE_BOUNDARY.md` is the canonical account.

**The Tuesday job** — built. `16 §4.3`'s second cron, as `lib/slice/tuesday.ts` plus one secret-protected route and one entry in `vercel.json`. Every operation it calls already existed, idempotent and tested; what did not exist was the **sequence**, which has failure modes its parts do not.

- **It never publishes.** The last thing it does is `submit: true`, so the draft lands on the press desk and stops. `16 §9` and `docs/SLICE_REVIEW_BOUNDARY.md` make that permanent, and there is no parameter on the route that can change it.
- **The door is a shared secret and unset means shut.** It answers **404** rather than 401, like `requireAdmin()`. `CRON_SECRET` must be set in Vercel production before the job can run at all — that is the one remaining human-only step, and until it is set the job is scheduled and inert.
- **One cron, not two.** The Sunday pre-Monday snapshot is specified and unimplemented; a cron pointed at a route that does not exist is a scheduled 404 every week.
- **A step that throws no longer costs the paper.** `authorStakesForWeek` throws on a season with no stored economy config — deliberately — and drafting comes after authoring, so the first version would have produced an empty desk with no explanation on it. Each step is attempted, a throw is recorded against the step that threw, the chain finishes, and the route answers 500 so the platform retries. Safe, because retrying is a read: four separate database mechanisms, none of them added here.

**Batch B launch art — complete** (PR #55, `aaff231`). **12 of 24 collectibles** have production assets, which is the number `ASSET_PIPELINE.md §5` commits to at launch, plus `object_box_owned` on the homepage tray. `scripts/prepare-incoming.ts` now normalizes framing mechanically before `art:process`, because across three rounds of candidates not one arrived correctly cropped and that is the one thing generators are worst at. **No further action is required on this art slice** — the remaining twelve collectibles draw `placeholder_pizza_box` by design.

**Visual debt 13 — Tony's clip is the entrance, not the glow.** Closed with measurement first. `drop-shadow(0 0 0 transparent)` and `filter: none` render him **pixel-identically at all three widths**, the halo never touches a pixel inside his alpha, and a frame-by-frame screencast of the real ramp fades monotonically — which eliminates every mechanism `TEXT_SURFACE_BOUNDARY §10` scoped. What drops him is the rule at the top of `arrival.tsx`: the server draws him standing, the entrance is attached from a `useEffect`, and `tony-steps-up`'s opening keyframe under `animation-fill-mode: both` **drops him 62.42px behind the counter** the instant `.arriving` lands — 311ms after the room finished painting, under an 8× throttle. `ENTRANCE_STALE_AFTER_MS` refuses an entrance on a room that has already been on screen, measured from `first-contentful-paint`. Two gate defects came with it: `checkTonySteady` was clearing the entrance with a **navigation-clock** constant while the animation runs on the **hydration clock**, and no pass had ever measured a slow arrival. Pass F delays the client bundle 700ms and **fails on the old build at all three widths**. `docs/HOMEPAGE_CLEANLINESS_BOUNDARY.md §10`.

**The RoomDisplay pass — visual debts 3, 4 and 10 were one defect.** Closed. They were filed as three cosmetic items on three surfaces and are one fact: **the room had no owner for its transient state** — five surfaces (three `RoomDisplay` panels, the champion panel, Tony's pad, the shut door's line, the reveal plate), five private `useState`s, nothing arbitrating. `components/scene/room-stage.tsx` is the owner, and it is the provider `counter-tray.tsx` had already argued for in a comment while writing `data-parlor-focus` onto `document.body` because no common client ancestor existed. It owns **which one surface is up** and nothing else — no data, routing, permissions, ownership, statistics or navigation — and **renders no DOM**, because debt 12 is still open. `components/scene/room-panel.tsx` replaces two hand-built dialogs that disagreed on the scrim, the padding, the width and the close control, none of which was a decision. **Debt 10 is deleted, not wired up**: `18 §9.4` derives affordance from the overlay's own alpha and five of the eight homepage objects are baked into the shell, so an affordance for them is an authored rectangle `MANDATE §6` bans — and the half the entry did not name is that **the parlor had no visible focus indicator at all**, WCAG 2.4.7, photographed clean by `keyboard-focus` for as long as it has existed. Two new gates fail on the old build at all three widths. `docs/ROOM_TRANSIENTS_BOUNDARY.md`.

**The Sunday snapshot and the Monday comeback** — shipped, and the cron architecture is now complete at two. `16 §4.3` allows exactly two scheduled jobs and specifies both; Tuesday shipped in #56 and Sunday shipped here. **There is no third.** It exists for one sentence — *"the only way the Monday-comeback stories required by `07 §8` can be truthful"* — and it did **not** ship alone: `07 §8`'s story had no implementation anywhere, so a snapshot table by itself would have been a photograph nobody looks at. **`55 4 * * 1`** is Sunday 23:55 ET in EST and Monday 00:55 ET in EDT — after Sunday night football either way; the obvious `55 3 * * 1` would be *inside* that game for half the season. **Remaining-Monday exposure is not recorded and cannot be**: Sleeper's league API carries no NFL schedule, and *"starters on zero points"* cannot tell a player who has not played from one who scored nothing. **Idempotency is stronger here than anywhere else in the schema** — a second capture is a *worse* photograph, not a fresher one, so `UNIQUE` + `ON CONFLICT DO NOTHING` + an append-only trigger make the first one permanent and there is no correction path. A comeback needs the result to have **flipped** *and* the deficit to clear a 10-point gate, and it scores on the deficit rather than the final margin. `docs/SUNDAY_SNAPSHOT_BOUNDARY.md`. **`CRON_SECRET` is the only remaining activation step, and it activates both jobs at once.**

**Weekly token rewards** — built. `03 §4`'s fantasy-performance token sources, as producer, record, audit and surface. **The premise everyone had was wrong**: `weekly_rewards` did not exist and nothing was half-wired — the schema had `reward_tables`, which is the loot-box weight table and is fully used. What existed was `token_reason`'s `MATCHUP_WIN` and `WEEKLY_HIGH_SCORE`, declared since `0005` and deliberately unwired because *"do not invent a weekly reward that fires on nothing"* — the two crons did not exist. **Both now do**, so the precondition was met rather than the rule waived.

- **The amounts are specified, not chosen.** `03 §4` names **150** for a matchup win and **400** for the weekly high score, in the same list that gave the 250 opening balance, and requires final numbers be configurable and simulation-reviewed — which is what `economy_configs` already is. No commissioner decision was required. **Do not tune them**; that is P3's job.
- **Two reasons, and every absence is a decision.** Upset, playoff advancement and consolation placing are **not in `03 §4` at all** — the schema would accept them and that is not a reason. `SEASON_AWARD` stays declared and unwired. **Week type is not a multiplier**: a playoff win and a consolation win each pay 150, and two tests pin the absence of a branch. A tied game pays no win; a tied high score pays everyone who posted it, in full.
- **The finality gate had a defect the integration test found.** `weekFinality` *prefers* a week's own finalization when both records exist, and the Tuesday job writes that row in step 1 — so the obvious `source === 'season_closed'` check never fires on a closed season and the ledger raises from four frames down instead. Every week of 2024 and 2025 sits in exactly that position. The gate now tests `seasons.finalized_at` directly, **the same condition the ledger enforces rather than a proxy for it**. *No fabricated failures* — the quiet partner of no fabricated data.
- **Idempotency is two database locks and no application check.** No `SELECT ... WHERE already_rewarded` exists anywhere: that is a race with a comfortable-looking body. The key names the **occasion** and **omits the amount**, so a mid-week rebalance raises instead of paying twice at two prices. Payment first, justification second, because the ledger is the authority.
- **Rewards are not coupled to Slice approval.** `16 §9` requires a person to approve the *paper*; nothing makes a manager's 150 tokens wait on an editor, and the coupling would have been invisible because the desk would look merely quiet.
- **`/counter` gained a statement** through the existing `Ledger` primitives — `recentTransactions`' first caller since the ledger shipped, and what `03 §5`'s "the displayed balance should reconcile to the ledger" finally has something to reconcile.

`docs/WEEKLY_REWARDS_BOUNDARY.md` is the canonical account.

**The economy ruling, 2026-08-04 — the P3 gate, and everything it required** — shipped. `16 §8`'s multi-season simulation is built (`lib/economy/simulate.ts`), and **it did not pass**: a median manager earning up to 550 tokens a week against a **50-token box** bought **31.5 boxes a season** against a 6–12 range, dragging legendaries to **8 league-wide** against 2–3. The **legendary rate per opening was inside its range the whole time** (~2.4%) — the rate was right and the number of openings was wrong, so the commissioner moved the price and **left the rarity table alone**.

- **The box costs 200**, from `economy_configs` rather than any component. Bounded tuning authority was 175–225 in steps of 25; all three pass at 50 seasons and 200 is the commissioner's value. **The gate runs at 50 seasons, not 5**, because at 10 managers × 5 seasons a 2% legendary rate has a Poisson spread wider than the 2–3 range itself and the gate flipped on the seed — *a release gate that depends on luck is not a gate*. It now **fails on drift**: halving the price back to 50 puts it red.
- **Two seasonal free boxes**, season-opening and midseason, owed to an **active seat** rather than earned. `loot_boxes.grant_key UNIQUE` is the entire idempotency mechanism and `milestonesDue` is **monotonic**, so this is a *catch-up* rather than a schedule — a manager seated in week 9, a retried Tuesday, and a mid-season seed all end with the same two boxes. Not an achievement, level or streak; not coupled to Slice approval; not clawed back from a manager who later goes inactive.
- **Duplicate salvage** is `16 §8`'s sentence finally implemented in full — *roll rarity → pick an unowned item in that tier → if exhausted, salvage tokens*. M2 shipped only the first clause. The roll still names the tier and never leaves it, so **a legendary is exactly as likely as it was**. Values are `03 §12`'s per-rarity share of the price: **20 / 40 / 70 / 120**.
- **It needed a fourth lock.** `openBox`'s three are all scoped to a *box*; choosing an unowned item reads the *collection*, so two boxes opened at once by one manager would both hand over the same item. A transaction-scoped **advisory lock on the manager** serializes them. There is deliberately **no `UNIQUE (user_id, slug)`** — every database that opened a box since M2 legitimately holds duplicates, and `collectibles_undeletable` makes clearing them impossible on purpose.
- **The payment is a constraint, not a convention.** `box_openings_salvage_is_paid` makes a converted spare with no ledger row physically unwritable. Where salvage cannot be paid — a closed season, a manager with no seat — the box is **left unopened** rather than opened for nothing.
- **A schema comment was wrong rather than outdated.** *"Duplicates are an ordinary outcome of a weighted table"* contradicted `16 §8` from the day it was written; five tests asserted the same thing, including a demo state whose premise had become unreachable **while still passing**. All five now assert the rule.

`docs/ECONOMY_SIMULATION.md` is the measurement; `docs/ECONOMY_RULING_BOUNDARY.md` is the runtime.

**Tony's glow-off clip, 2026-08-05** — reported as a follow-on, treated as a fresh report, and **real**. It is *not* visual debt 13, which was the entrance: this one is the `filter` transition promoting a compositing layer, and tearing that layer down re-rasterizes a fractional-size sprite on a different pixel grid. **27 / 320 / 90 darker pixels** at the three widths, **zero** after `will-change: filter`. The important half is the gate: `checkTonySteady` reads `getBoundingClientRect` and was **structurally unable to see this** — no rectangle ever changed — so `checkGlowLeavesTonyAlone` samples compositor frames over CDP instead. Two false starts are recorded in the boundary document, because both were the measurement fooling the measurer. #67.

**Homepage art fidelity, 2026-08-05 — the room got four colours it never had.** The commissioner reported *"much of the homepage art now has distorted coloring and shading"* and said not to reach for new art first. **The distortion is palette quantization**, proven by rendering the pipeline's own intermediate stage: the incoming source is clean, the lanczos downscale is clean, and the snap to the shared 32 is the defect. **No new art was required** — which supersedes `art/SHELL_AUDIT_zone_parlor_shell.md`.

- **The palette has three creams and the room never picks them.** Measured on the shell, `paper` took **0.1%** of the pixels and `amber` — *lamp glow* — took **27.3%**, at a mean error of 35 of a possible 441. That is why walls, ceiling and floor rendered as though lit by sodium light while the source was cream.
- **Four colours, by weighted k-means over the worst-served pixels.** The first run was thrown away: unconstrained it proposed a **blue** and swallowed the approved `wood` and `red` ramps whole. Minimising an average is not extending a palette. Shell error **35.0 → 21.6**, counter-front **36.4 → 20.1**.
- **Scoped to the `zone` family**, by commissioner decision. Applied globally the same four rewrote all twelve approved Batch B collectibles by up to 39% — a re-approval event rather than a defect fix. The extension is **additive and never replaces a shared colour**, so every other family is byte-identical. Six assets change; Tony and every collectible do not.
- **Re-deriving the shell's two one-time corrections is where the real defects were**, and all three were exposed rather than caused: a ceiling with two field tones against a cleanup that wrote one constant; a morphological opening that only shrinks a thick blob by a ring, so the surface was never a fixed point; and a despeckle rectangle overlapping the ceiling by eight rows **and running after it**, which had been costing idempotency for longer than this change.
- **The measuring instrument had the same class of defect.** `palette-study.mts` never gained the `family` parameter `process-art.ts` has, so every number it printed was silently the shared 32 — a before-picture presented as an after. The report now prints the shipped per-family table beside the shared one, unconditionally rather than behind a flag.
- **It does not fix Tony and does not claim to.** His coverage was always fine; his **11.06% isolated-pixel rate** is what a palette cannot fix, and more colours measurably make it slightly worse. Recorded as open.

`docs/PALETTE_FIDELITY_BOUNDARY.md` is the canonical account; `docs/evidence/palette-fidelity/` is the pictures.

**Homepage fidelity, 2026-08-06 — typed family palettes, because the shared 32 served 2% of the room.** Tony's clipping is confirmed fixed and closed. The remaining report was broader — *"the entire homepage, including Tony, does not preserve the visual quality of the original approved art"* — with the ruling that **visual fidelity at true phone size is the acceptance criterion** and that mean error, palette usage and isolated-pixel rate are explicitly not sufficient. The 2026-08-05 four-colour pass was the right diagnosis at the wrong scale.

- **The source art is not pixel art.** The shell arrives 941 × 1672 with **153,738 distinct colours** and 2.9% blockiness; Tony 480 × 1315 with 72,004. These are continuous-tone paintings, and the pixel-art look is manufactured by the pipeline. The shared 32 were chosen for 46 × 46 collectibles generated in independent batches — **the count was a convention, not a measurement.**
- **The room is drawn at 1170 device pixels from a 320-pixel file** — 3.66× at 390 — so every artifact is magnified before anybody sees it. Integer scaling is unavailable and cannot be bought: `gcd(1080, 1125, 1170) = 45`.
- **Option B, sized by measurement.** `zone` gets **64** colours (error 35.0 → **5.9**), `character` gets **16** (30.3 → **14.5**), each derived by weighted k-means from that family's own art and written into `palette.json` as literals. Additive, so seven files change and every collectible is byte-identical. Option A is refused by its own number — the `zone` extension carries **97.93%** of the room. Option C (no quantization) is the benchmark and costs 406 KB against 60 KB. Option D (more resolution) is **not needed**: the unquantized 320 render is already close to the source.
- **The isolated-pixel rate is the wrong instrument** and it went **2.23% → 13.46%** while the picture got much better. A second proxy nearly shipped as a gate: an all-dark-3×3 ceiling scan reports **593 blocks on the faithful ceiling against 18 on the posterized one**. A gate that prefers the worse picture is not a gate.
- **`clean-parlor-surfaces.ts` is deleted** with its thirty-four tests. All three of its repairs were undoing quantization damage — its own header said so — and keeping it would **overpaint the approved art**. Visual debts 8 and 9 stay closed by the cause going. `shift-tonight-board.ts` stays because it is *geometric*.

`docs/evidence/homepage-fidelity/` is the full page at 390 / 375 / 360, before and after. **Shipped as #68** (`dde6237`), both hosted gates green first time.

**Actions conservation is a hard stop right now** (commissioner, 2026-08-05). 1,800 of 2,000 included minutes are spent and there is **no local machine until next week**, so the one-PR-per-slice authorization is withdrawn and nothing may be handed off as *"run these commands when you get back."* Remote feature branches with no open PR are **storage only** — verified, not assumed. Prohibited until explicitly released: opening or merging a pull request · pushing to `main` or to a PR branch · re-running or dispatching a workflow · **setting `CRON_SECRET`** · **claiming production is verified.** `AUTONOMY.md §4` is the rule; `docs/PHONE_ONLY_HANDOFF.md` is the merge queue and its price.

**The event spine is unbuilt, and that is a reported contradiction rather than an oversight.** `16 §4.1` calls `league_events` *"the central design decision"* and it is first in the v1 list above — but the six surfaces meant to read it were built to compute from the verified domain tables instead, which is what the *same section* asks for (*"Nothing stores… It is **computed** from current state on every load"*). A spine duplicating `fantasy_matchups` would put two records of one fact in the database. What it would uniquely buy is ordering across heterogeneous facts and per-manager watermarks; neither has a surface asking for it yet. **A commissioner decision is wanted before it is built or struck.**

**Next assignment:** see `docs/CHECKPOINT.md` for the durable state and the ordered queue.

**Previously:** the Back Hall as a room (visual debt 5) — one compact pixel-art scene with two environmental choices, not the three stacked panels `18 §5` forbids. Placeholder architecture is approved and M3 has shown what it looks like: a drawn stand-in at the right size, as geometry data, rather than a sign. `docs/BACK_HALL_BOUNDARY.md` carries the route contracts, the flag-based state boundary, the five asset slots and the five demo states. Stats Intelligence (#26) and M3 (#24) are both shipped.

**No paid API use** (commissioner decision, 2026-07-30). The orchestrator workflow is retired to manual dispatch only and `ANTHROPIC_API_KEY` is unset — nothing in this repository spends money. This affects no product scope: generative AI is limited to Tony's Tuesday Slice, and `16 §9` already requires the Slice to publish correctly with the key unset. Delivery runs on the label lifecycle in `AUTONOMY.md §2` plus the two unpaid gates, `npm run check` and `npm run visual:qa`. Do not reintroduce a paid dependency without a new decision.

**Commissioner ruling, 2026-08-03 — six narrow brand/logo exceptions to `ART_SPEC.md §10`.** This is a private, non-commercial, small-friend-group project, and the commissioner has approved real-brand resemblance on exactly six assets: the arcade token and neon sign (Tony's own wordmark/mascot — extends the 2026-07-29 house-branding ruling), the whipped-cream can (Reddi-wip-inspired), the pizza box the player opens (Tony's branding), the Bapple Tree (now Busch Light Apple-style cans in place of the half-apple/half-banana fruit), and the portable sauna (a barrel sauna replaces the fabric tent). `docs/art/BRAND_EXCEPTIONS.md` is the canonical record. **This is not a general loosening** — every other asset stays under the unmodified no-third-party-brand rule. The pizza box also had a real runtime-fit defect found alongside this ruling: only `object_box_owned` is ever rendered (the rarity-tiered box slots are unused registry rows for a feature that doesn't exist), and its registry canvas was wrong (96×96, corrected to the actual 44×30 `TRAY_BOX` footprint).

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
