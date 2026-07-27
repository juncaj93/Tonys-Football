# 04_BACKEND_ARCHITECTURE_AND_DATA_MODEL.md

Version: 3.0

## 1. Purpose

This document defines the recommended application architecture and conceptual data model for a persistent, multi-season Tony's Pizza Fantasy platform.

It is an architecture specification, not a migration file. Claude Code must review and improve the model before creating production migrations.

## 2. Recommended Stack

### Application

- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- Framer Motion for interface animation

### Data and Storage

- Supabase PostgreSQL
- Supabase Storage or an equivalent object store for approved assets
- Row Level Security where compatible with the custom session model

### Hosting and Jobs

- Vercel deployment
- protected scheduled routes or a job service for weekly syncs
- Cloudflare-managed custom domain/DNS

### External Data

- Sleeper API as authoritative fantasy source
- optional future odds provider for NFL market lines, subject to licensing and cost review
- one configured LLM provider for Tuesday Slice generation and verification

## 3. Architectural Boundaries

Use explicit boundaries:

### Sleeper Adapter

Fetches and normalizes league settings, users, rosters, matchups, transactions, drafts, and players.

### Domain Services

Calculates rewards, balances, records, fraud/luck metrics, story candidates, loot outcomes, casino outcomes, props, season transitions, and auctions.

### Content Services

Select curated dialogue, enforce lore cooldowns, manage NPC appearances, and construct structured Tuesday Slice prompts.

### Presentation Layer

Renders verified state. It does not calculate money, rewards, odds, loot, or authoritative fantasy results.

## 4. Environment Isolation

Support at least two modes:

- `production`
- `sandbox`

Sandbox data must never mutate production balances, inventories, Gazette issues, auctions, bets, or season records.

Prefer an explicit `environment`/`world_id` boundary on mutable game records or separate database projects when practical. Claude must recommend the safest affordable option before implementation.

## 5. Identity Model

Do not treat `roster_id` as a permanent global user identity.

Sleeper roster IDs may be reused across seasons and manager turnover. Separate:

### `users`

Permanent Tony's Pizza person/account.

Suggested fields:

- `id`
- `display_name`
- `pin_hash`
- `is_admin`
- `is_retired`
- `sprite_config`
- timestamps

### `external_accounts`

Maps a user to Sleeper identity.

Suggested fields:

- `user_id`
- `provider`
- `external_user_id`
- current username/avatar metadata

### `season_memberships`

Maps a user to a specific league, season, and Sleeper roster slot.

Suggested fields:

- `season_id`
- `user_id`
- `roster_id`
- active/retired status
- starting and final rank
- timestamps

Use unique constraints scoped to season, not a global unique `roster_id` on users.

## 6. Seasons and Lifecycle

### `seasons`

Suggested fields:

- `id`
- `league_id`
- `year`
- `status`
- regular-season and playoff boundaries
- token spend deadline
- auction start/end
- closed timestamp

Recommended statuses:

- `DRAFT_PREP`
- `ACTIVE`
- `PLAYOFFS`
- `SPEND_DOWN`
- `OFFSEASON`
- `ARCHIVED`

Season transitions must run through a controlled service with validation, confirmation, audit logging, and idempotency.

## 7. Fantasy Data Model

Persist normalized snapshots rather than depending only on live Sleeper responses.

Recommended entities:

### `fantasy_matchups`

One matchup record per pair/week, not duplicate opposing rows unless intentionally modeled.

Fields may include:

- season/week
- roster A and B
- points
- result/final status
- projection snapshots
- matchup metadata

### `fantasy_lineups`

Stores starters and bench by week for bench-decision analysis.

### `fantasy_player_scores`

Stores player-level weekly points needed for story validation, trade revenge, and lineup analysis.

### `fantasy_transactions`

Normalized adds, drops, waivers, and trades with raw payload retained for traceability.

### `fantasy_drafts` and `fantasy_draft_picks`

Stores draft order, pick, player, manager, and available ADP snapshot/source.

### `weekly_analytics`

Stores deterministic derived metrics such as:

- all-play record
- points above/below average
- bench opportunity
- projection delta
- luck/fraud indicators
- streaks

Store algorithm version so metrics can be recalculated without losing provenance.

## 8. Economy Model

### `season_wallets`

Cached current token balance per season membership.

### `token_transactions`

Immutable ledger with:

- season and user
- signed amount
- reason code
- source record
- idempotency key
- resulting balance or reconciliation metadata
- admin actor when applicable

All token-changing operations must occur in a database transaction or secure RPC that updates ledger and cached wallet atomically.

### `economy_configs`

Versioned configuration for rewards, wager limits, box prices, and related season parameters.

Never hardcode live economy values solely in frontend files.

## 9. Item and Ownership Model

### `items`

Master definition:

- stable ID/slug
- name
- category
- rarity
- description
- asset manifest
- audio/animation references
- interaction type/config
- release state
- season introduced
- tradable/auctionable flags

### `item_variants` (optional)

Use only when cosmetics require standardized layers or multiple visual states.

### `user_inventory`

Permanent ownership record:

- user
- item
- acquired season
- source
- acquisition metadata
- quantity if duplicates are stackable
- protected/locked state

Do not cascade-delete permanent inventory when a season or membership is deleted.

### `loot_box_definitions`

Versioned boxes, prices, availability windows, and pool metadata.

### `loot_box_pool_entries`

Per-item weights/eligibility. Store the exact box configuration version used for each purchase.

### `loot_openings`

Auditable purchase/outcome record with server-generated randomness metadata, transaction reference, and revealed item.

## 10. Basement and Character Model

### `basements`

One permanent basement per user:

- selected theme
- equipped entrance animation
- configuration/version

### `basement_slots`

Curated slots rather than arbitrary coordinates:

- shelf slot(s)
- wall slot(s)
- special display slot(s)

Each slot references an owned item and validates category compatibility.

### Character Configuration

A structured JSON configuration is acceptable initially if validated against owned/base options. Separate tables may be introduced later if querying and analytics require them.

Store equipped:

- base appearance
- hair/outfit/accessories
- aura
- animation

## 11. Casino Model

Use modular game services with shared settlement infrastructure.

Recommended records:

### `casino_sessions` or `casino_rounds`

- user/season/game
- wager
- server outcome
- payout
- status
- idempotency key
- fairness/audit metadata

### `game_configs`

Versioned rules and limits for blackjack, slots, and future roulette.

Outcomes must be generated and settled server-side. The client receives only information needed to animate the already-committed outcome.

## 12. Fantasy Props

Recommended entities:

### `prop_markets`

- season/week
- proposition type
- subject(s)
- line
- settlement formula
- source data references
- opens/closes timestamps
- status

### `prop_wagers`

- user
- market
- side
- stake
- settlement status and payout

The line-generation service may use projections and historical data, but the settlement formula must be deterministic and stored before bets open.

## 13. Real-Money Peer Bets

### `peer_bets`

- creator and target
- exact terms
- dollar amount
- objective settlement config or manual flag
- acceptance status
- locked terms hash/version
- winner/void state
- payment status metadata
- timestamps

Do not combine dollar values with Tony Token wallets. Do not implement custody or payment processing.

## 14. Auction Model

Recommended entities:

- `auctions`
- `auction_listings`
- `auction_bids`
- `auction_settlements`

Settlement must atomically:

- verify ownership
- transfer item
- debit winner
- credit seller
- close listing
- write audit/activity events

## 15. Lore, Dialogue, and Tony Knowledge

### `lore_entries`

Commissioner-managed source material:

- title
- type/category
- context
- people involved
- allowed surfaces
- tone/severity
- frequency/weight
- cooldown rules
- active/retired state
- restrictions

### `lore_usage_logs`

Tracks when, where, and for whom an entry was used.

### `dialogue_lines`

Curated runtime lines with:

- speaker
- trigger/category
- manager targets
- context predicates
- cooldown group
- text
- active state

### `character_knowledge`

Stores commissioner-approved traits and evolving facts about users with confidence/source and effective dates.

### `historical_events`

Stores notable verified league memories that Tony may reference later.

AI must not create permanent canon automatically. Suggested memories require commissioner approval or deterministic validation.

## 16. NPC and Appearance Model

Recommended entities:

- `npcs`
- `npc_appearance_rules`
- `npc_appearance_events`

Rules should include rarity, eligible locations, cooldown, triggers, and feature flag. Tony and league members are common cast; lore NPCs are rare.

## 17. Activity Feed

### `activity_events`

Use a typed event schema:

- event type
- actor/target
- season
- source record
- structured metadata
- visibility
- importance score
- created timestamp

Only publish notable events to the visible feed. Retain lower-level audit events separately where needed.

## 18. Tony's Tuesday Slice Data

Recommended entities:

### `story_candidates`

Deterministically generated candidates with:

- week/season
- story type
- verified facts JSON
- source references
- component scores
- total score
- eligibility/confidence
- algorithm version

### `gazette_issues`

- season/week
- title/subtitle
- issue status
- generated content
- prompt/model versions
- verification result
- commissioner edits/approval
- published timestamp

### `gazette_story_blocks`

Optional normalized 4–5 story records for rendering and fact-level verification.

Do not call AI during page loads. Generate once, verify, save, and publish one shared issue.

## 19. Feature Flags and Releases

### `feature_flags`

Support:

- environment
- enabled state
- audience/rollout
- configuration
- effective dates

Examples:

- blackjack
- slots
- roulette
- seasonal events
- rare NPCs
- draft-night mode

### `content_releases`

Optional record for announcing new games, boxes, items, and events in the activity feed and Tuesday Slice.

## 20. Admin and Audit

### `admin_audit_logs`

Log every privileged action with:

- admin
- action type
- target
- before/after metadata where safe
- reason
- timestamp

Destructive or season-closing actions require confirmation and should support a preview/dry-run where practical.

## 21. Authentication and Sessions

Roster-bound PIN access is acceptable for this private ten-person experience, but treat four-digit PINs as low-entropy credentials.

Requirements:

- slow password hashing
- strict rate limits
- temporary lockout/backoff
- secure HTTP-only, same-site cookies
- session rotation and expiration
- CSRF protection where applicable
- admin reauthentication for critical actions
- no exposure of PIN hash or reset state to clients

Claude should review whether adding optional passkeys or email recovery is appropriate while preserving low-friction access.

## 22. Scheduled and Idempotent Jobs

Core jobs:

- regular Sleeper sync
- Tuesday finalization and rewards
- story-candidate generation
- Gazette generation/verification
- prop settlement
- season-state transitions

Each job must:

- authenticate requests
- use idempotency keys
- log start/result/error
- tolerate partial Sleeper outages
- avoid duplicate rewards
- support safe reruns

## 23. Reliability and Backups

- Keep raw Sleeper payloads or hashes for debugging important syncs.
- Use database backups and documented restore procedures.
- Never delete historical seasons or retired-manager history during routine operations.
- Cache external API data but preserve a clear freshness timestamp.
- Show the last successful sync state to admins and users where relevant.

## 24. Recommended Project Organization

```text
app/
components/
features/
  fantasy/
  economy/
  loot/
  basement/
  casino/
  gazette/
  lore/
lib/
  sleeper/
  auth/
  db/
  validation/
  jobs/
public/
  assets/
supabase/
  migrations/
  seed/
```

Exact structure may change after architecture review, but domain boundaries should remain clear.

## Final Backend Principle

The database is the memory of Tony's Pizza. Every permanent item, verified story, championship, trade consequence, and league-era joke must remain traceable without allowing AI or client code to rewrite history.
