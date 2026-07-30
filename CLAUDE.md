# Claude Code Instructions

This repository contains the complete product specification for **Tony’s Pizza Fantasy**.

Before planning or implementing any feature, read:

1. `PROJECT_SPEC/16_FINAL_RECONCILED_PLAN.md` — **the approved plan. Start here.**
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

**M2 slice 1 — the loot box on the tray** — shipped. An owned box sits on the tray, the tray Door glows for the first time, and tapping it **opens the box in place**: an anticipation beat, then the collectible on the tray and a plate naming it. The opening is server-authoritative, transactional and idempotent — `box_openings.box_id` is unique, so a box opens once whatever asks. The reward comes from a stored, content-hash-versioned, append-only reward table whose weights are **provisional until the P3 simulation**, and the recorded roll plus that version recompute the outcome exactly. The 24-item catalog is derived from the asset registry rather than copied into a table.

**M2 slice 2 — token acquisition** — built. `apply_token_delta` is a Postgres function, the balance is a trigger-maintained column with `CHECK (balance >= 0)` and a guard that refuses any other write path, the ledger is append-only, and a replayed idempotency key is a no-op while a *reused* one raises. Managers start the season with a tab and buy boxes at the counter; the debit and the box commit together, so nobody holds an unpaid box. Every number is provisional until the P3 simulation.

**Next assignment:** M2 slice 3 — `/counter/collection`, where a pulled collectible can be looked at. Until it exists the loop dead-ends, which is why M2 work merges to `integration/m2-loot-box` and not to `main`. See `docs/CHECKPOINT.md` for the durable state and `docs/IMPLEMENTATION_HANDOFF.md` for the record.

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

When requirements conflict, follow the source-of-truth hierarchy in `README.md`.

Prefer the most specialized canonical document for a system after applying that hierarchy.

Examples are illustrative unless explicitly labeled as fixed requirements.

## Implementation Philosophy

Favor simple systems over clever systems, one polished vertical slice over many unfinished features, deterministic calculations over model inference, configuration over scattered hardcoding, recoverable operations over destructive shortcuts, responsive and accessible interfaces, strong data integrity, and minimal weekly commissioner work.

A feature is not complete merely because it appears visually. It must also be secure, tested, accessible, recoverable, and operationally manageable.
