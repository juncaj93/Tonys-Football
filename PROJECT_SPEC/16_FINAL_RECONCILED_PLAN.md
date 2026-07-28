# 16 — Final Reconciled Plan

**Version:** 1.0
**Status:** ✅ Approved — canonical. Highest authority in the source-of-truth hierarchy.
**Approved:** 2026-07-28
**Supersedes:** any conflicting requirement in `00`–`15` and in `README.md`

---

## 0. How to read this document

Documents `00`–`15` remain the foundation. They describe the world, the voice, the characters, the lore, and the systems in depth, and that detail is still authoritative wherever this document is silent.

Where this document and an earlier document conflict, **this document wins.** Appendix A lists every such conflict explicitly. Nothing has been silently resolved.

Implementation has **not** begun. It is gated on explicit commissioner instruction to start coding.

---

## 1. Product summary

> Tony's Pizza Fantasy is a private clubhouse that remembers.

Sleeper is the system of record for matchups, rosters, scores, and transactions. Tony's supplies what Sleeper cannot: league memory, comedy, collectibles, weekly stories, and a place that visibly changes as the season moves.

**Three things are permanent and compound over years:** the Slice archive, the collection, and the Timeline. Everything else serves those.

**The failure mode being designed against:** a themed fantasy dashboard with a slot machine bolted on, opened twice and forgotten.

---

## 2. Core weekly loop

Tuesday morning, one visit, about six minutes:

1. The shop has changed — new papers on the rack, a rivalry poster up, someone's photo behind the counter.
2. **Tonight at Tony's** answers "what's new" in ≤4 lines.
3. The **Slice** — 3–5 stories, 3–4 minutes — plus this week's **Tony's Line**, any open **bounty**, and **Tony's chalkboard prediction**.
4. Your **receipt** on the counter: result, tokens, streak, standing.
5. A decision: bank, open a box, or take the Line.
6. A good pull lands in the **display case** where everyone sees it.

**Hard constraint:** a manager who visits *only* on Tuesdays experiences 100% of the product. No mechanic rewards more frequent visits. Nothing is missable.

---

## 3. Locked decisions

| Area | Decision |
|---|---|
| Host / DB | Vercel Hobby · Neon Postgres (free) · ~$15/yr (domain + LLM) |
| Real-money peer bets | **Removed entirely** — legal exposure, zero upside |
| Prop bet system | **Removed** → one weekly "Tony's Line" inside the Slice |
| Casino | **Out of v1** (Phase 10) — must not delay the distinctive core |
| Basements | **v1.1** (Phase 6) — Showcase carries the social weight at launch |
| Guest mode | **Rejected** → commissioner-controlled `noindex` share links per artifact |
| Persistent login | **v1, high priority** |
| Championship rings | **v1**, incl. historical rings for Alex & Matty B |
| Wearables | **v1** — 5 slots: Head · Body · Face · Hand · Aura |
| Historical seasons | **v1** — tiered import, never fabricated |
| Chalkboard prediction | **v1** |
| Closing Night at Tony's | **v1.1** — rings + wheel + portrait + season name, one ceremony |
| Punishment wheel | **v1.1**, annual, **no token deductions** |
| Vending machine | **v1.1** — Tuesday rotation, everything returns, no Legendaries |
| Season identity | **v1.1** — algorithmically suggested, commissioner selected |
| League voting | **Not built.** Expansion path preserved free via the event spine |
| Roulette · Crash · achievements · levels · clout · prestige | **Never** |
| Art | AI-generated, spec-enforced, batched, placeholder-first |
| Reward pacing & pricing | **Simulation-gated** — no numbers locked until multi-season sim runs |

---

## 4. Architecture

**Stack:** Next.js App Router · TypeScript strict · Tailwind · Neon Postgres · Vercel Hobby · Sleeper API · optional Anthropic API.

### 4.1 The event spine — the central design decision

Six surfaces that look like six systems are six **views over one stream**:

```
Sleeper sync + application actions
              ↓
        league_events
   (typed · verified · scored · idempotent)
              ↓
 ┌──────┬──────────┬──────────┬─────────┬──────────┬────────┐
Shop   Tonight    Timeline   Season    Slice      Unread
state  board                 Story     candidates markers
```

Nothing stores "what the shop looks like now." It is **computed** from current state on every load. No drift, no stale rows, no maintenance.

### 4.2 Three deviations from `04` and `09`

**No database client in the browser.** All access runs through server actions and route handlers; the `anon` role's privileges are revoked entirely. Authorization is one testable server-side layer (`requireUser` / `requireAdmin` / `requireOwnership`) rather than RLS policies duplicating application logic. This is *stricter* than RLS — it removes the client's database access rather than constraining it. Documented deviation from `09 §9`.

**One economy primitive.** Every token movement goes through a single Postgres function:

```
apply_token_delta(user_id, season_id, amount, reason_code, idempotency_key, source_ref, actor_id)
```

`UNIQUE(idempotency_key)` on the ledger. Balance is a column written **only** by an AFTER-INSERT trigger, with `CHECK (balance >= 0)`, so overdraft fails at the database and the balance physically cannot drift. No feature gets its own balance-writing path. Supersedes the "cached balance reconciled against the ledger" model in `03 §5` / `04 §8`.

**Static assets in-repo**, served by Vercel CDN. Removes object storage, signed URLs, MIME validation, and upload scanning from v1 entirely. The slug indirection layer (`art/ASSET_PIPELINE.md`) allows a blob store later without touching game code. Supersedes the Supabase Storage direction in `04 §2`.

### 4.3 Scheduling

Vercel Hobby allows exactly 2 cron jobs at daily granularity. We need exactly 2:

- **Sunday ~11:55pm ET** — pre-Monday score snapshot. This is the only way the Monday-comeback stories required by `07 §8` can be truthful; `04 §22` did not specify a job that produces it.
- **Tuesday ~5am ET** — sync → finalize → rewards → settle stakes → detect events → update threads → flag Timeline → refresh shop state → generate vending stock → draft Slice → notify commissioner.

**No live in-game score sync, ever.** It is the fastest route to becoming a worse Sleeper.

The Tuesday job must be **chunked and resumable** against Hobby's function duration ceiling.

---

## 5. Data model

### 5.1 Identity

```
users              permanent person · is_retired · sleeper_user_id · pin_hash
seasons            year · status · phase dates · title · is_historical
season_memberships (season_id, user_id, roster_id)
                   UNIQUE(season_id, roster_id) · UNIQUE(season_id, user_id)
```

Permanent things (inventory, basement, rings) FK to `users.id`. Seasonal things (ledger, stakes) FK to `season_memberships.id`.

**Roster 7 in 2025 is not roster 7 in 2026.** Zack receives a new `users` row, never the Topouzian/Berardo slot.

### 5.2 Core tables

| Group | Tables |
|---|---|
| **Spine** | `league_events` · `story_threads` · `user_watermarks` |
| **Fantasy** | `fantasy_matchups` · `fantasy_lineups` · `fantasy_player_scores` · `fantasy_transactions` · `weekly_analytics` · `sync_runs` |
| **Economy** | `token_transactions` (ledger) · `economy_configs` (versioned JSONB per season) |
| **Items** | `items` · `user_inventory` · `loot_box_definitions` · `loot_box_pool_entries` · `loot_openings` |
| **Content** | `content_entries` · `content_usage_log` · `league_memories` |
| **Slice** | `story_candidates` · `gazette_issues` · `weekly_stakes` |
| **Shop** | `shop_dressings` |
| **Ops** | `sessions` · `feature_flags` · `admin_audit_logs` |

### 5.3 Consolidations

- `lore_entries` + `dialogue_lines` + `character_knowledge` + `npcs` + `npc_appearance_rules` + `npc_appearance_events` + shop dressings → **`content_entries`** with a `kind` discriminator (`tony_line` · `manager_line` · `npc_event` · `lore_ref` · `shop_dressing`), one eligibility engine, one usage log. **8 tables → 2.**
- `external_accounts` → a `sleeper_user_id` column on `users`
- `season_wallets` → trigger-maintained column on `season_memberships`
- Showcase → `showcase_inventory_id` column, not a feature
- Hall of Champions → Timeline filtered to championships, not a page
- **Removed:** `item_variants` · `prop_markets` · `prop_wagers` · `peer_bets` · `casino_*` (deferred to Phase 10)

---

## 6. The five systems

| # | System | v1 contents |
|---|---|---|
| **1. Truth** | Sleeper adapter, normalized fantasy tables, weekly analytics, historical import |
| **2. The Slice** | Candidates → fact packets → template/AI renderers → validation → review → publish → archive · Tony's Line · bounties · chalkboard prediction |
| **3. The Economy** | Ledger, weekly rewards, one box, 24-item catalog, Collection, Showcase, wearables, rings |
| **4. The Shop** | 6 zones, Tonight board, featured rotator, 12 dressing states, seasonal mechanism |
| **5. The Voice** | Content engine, reputation tags, cooldowns, usage log |

Basements (v1.1) and the casino (Phase 10) attach to system 3. Neither is a sixth system.

---

## 7. The Dynamic Pizza Shop

### 7.1 Six permanent zones

Authored as **discrete tiles, never one wide background.** Desktop composes a scene; mobile stacks full-width cards. Same components, same assets, no scaling down.

| Zone | Role | Door to |
|---|---|---|
| Front counter | Tony, greeting, your **receipt** | — |
| Tonight at Tony's | What matters now — ≤4 lines, never scrolls | contextual |
| Menu board | Featured rotator + **chalkboard prediction** | featured |
| Newspaper rack | Latest Slice + archive | `/slice` |
| Display case | New items · legendary spotlights w/ first-owner plaques · manager Showcases | `/collection` |
| Wall (3 dressing slots) | Posters, photos, banners, bracket | — |

**Navigation:** sticky bottom nav of four — Parlor · Slice · Collection · Rooms. Zones are the flavour; the nav is the guarantee. Two deferred doors exist as wall dressings for one asset each: a **boarded-up back door** and a **closed basement door**, so the casino and v1.1 feel like arrivals.

Supersedes the four-tab nav in `02 §3`, which listed Underground and a prop board as launch destinations.

### 7.2 The dressing resolver

```
shop_dressings
  slot_key · dressing_key · asset_slug · condition (JSON predicate)
  subject_type (manager|item|none) · priority · active_window
```

A pure function over a cached league-state object refreshed by the Tuesday job. Highest-priority match wins; no match → slot default.

**Adding a weekly change is one row plus one asset — no code.** That is the entire automation story.

### 7.3 v1 dressing states (12 minimum, ~6 drawn assets)

Text-driven templates multiply: one blank poster becomes losing-streak, rivalry, wanted, high-score, undefeated, and the playoff bracket.

| Trigger | Change |
|---|---|
| Slice publishes | Fresh papers on the rack |
| Win by 40+ | Photo behind the counter |
| 3 straight losses | Losing-streak poster |
| Top-2 seeds meet | Rivalry poster (pre-game only) |
| Legendary pulled | Case spotlight + first-owner plaque |
| Showcase changed | New item on the case shelf |
| Weekly high score | Receipt pinned to the corkboard |
| Biggest upset | Broken chair |
| Undefeated run | Tally mark on the door frame |
| Trade completed | Two receipts stapled on the spike |
| Championship won | **Permanent banner** |
| Season phase = PLAYOFFS | Window swap + bracket rendered from data |

### 7.4 Seasonal and event-driven

Date-windowed dressings at higher priority: opening week · Halloween · Thanksgiving · Christmas · trade deadline · playoff race · playoffs · championship week · offseason · draft season.

**Reserve the strongest transformations for championship week and the offseason flip.** During playoffs, **eliminated managers dim — they do not disappear.** Keep them in the booths with different expressions and dialogue.

---

## 8. Economy — simulation-gated

No numbers are locked. The **multi-season simulation is a Phase 3 deliverable and a release gate**, run across ≥5 fictional seasons at best/median/worst manager performance, evaluating: rewards per manager per season · loot-box frequency · token earning and spending curves · duplicate-protection behaviour · collectible completion speed · whether rewards still feel meaningful in week 15.

**Ranges under test — to validate, not assert:**

| Parameter | Range |
|---|---|
| Boxes per manager per season | 6–12 |
| Reward-bearing Tuesdays (median manager) | 35–55% |
| Non-Tuesday reward rate | ~0% |
| Legendary rate | 2–4% (targeting 2–3 league-wide per season) |
| Direct item grants per manager per season | 2–3 |
| Vending prices | derived from box EV, priced **above** it |

**Fixed regardless of simulation:**

- All tokens arrive **once a week**, with the Slice. No daily anything, ever.
- Rewards **auto-post** to the ledger. No claim button — claiming is a chore.
- Duplicates: roll rarity → pick an **unowned** item in that tier → if exhausted, salvage tokens. No pity timer.
- **Legendaries are pull-only, forever.** Never purchasable.
- Vending: Tuesday-to-Tuesday rotation, **everything returns**, no countdowns.
- **Decouple content rarity from item rarity.** The funniest material lives in dialogue and dressings everyone sees, not in legendaries almost nobody gets.

**Explicit non-goals:** daily rewards · streaks · login calendars · limited-time offers · near-miss animations · loss-chasing prompts · engagement push · permanent badges · token bundles · energy timers.

The only honest countdown is end-of-season spend-down.

**Token-leader award:** measured on **tokens earned** (sum of positive ledger entries), never tokens held. Resolves the hoarding-versus-spend-down tension flagged in `03 §19`.

---

## 9. The Slice

```
sync → story detection → scoring → selection → FACT PACKET
                                                  ├─→ Template renderer (default, deterministic, free)
                                                  └─→ LLM renderer (optional, per story)
                                                        ↓
                    deterministic validation → commissioner review → approve → publish → archive
```

**The site ships working with the API key unset.** The commissioner sees both renderings side by side per story and picks. A generation failure degrades to a publishable issue, never a blocked one.

**Validation is deterministic.** Every number and proper noun must match an allowed value in the fact packet. Banned-term scan: kicker references, invented quotation marks, win-probability language, unreleased features. An LLM is never the sole validator.

**Restricted content never enters an LLM prompt** — curated variants only. Any issue containing restricted content is **automatically flagged unshareable**, so it cannot leak through a share link by accident.

**Weekly stakes** (one table, type discriminator):

- **Tony's Line** — one market per week, line set at a **season median or rolling average** (structurally ~50/50, needs no projection data), fixed stake, fixed 2× payout, settled by the Tuesday job.
- **Bounties** — machine-checkable condition and resolver chosen at authoring time, **auto-settling**, rolling over until claimed.
- **Chalkboard prediction** — one deterministic prediction on the menu board each week; the next issue checks it automatically and Tony gloats or eats it. Makes Tony's Receipts free and always truthful, replacing the manual archive-search design in `08 §15`.

Commissioner approval mandatory in season one. The manual hold switch is permanent.

---

## 10. Content engine and reputation

One table, five `kind` values, one eligibility pipeline:

> active → surface allowed → people relevant → event tags → exact-line cooldown → concept cooldown → per-user cooldown → seasonal cap → incompatibilities → weight → select → **log**

**"No content" is always a valid outcome.** A meaningful quiet probability on every surface is what makes the lines land.

**Reputation = derived boolean tags**, recomputed weekly by the Tuesday job from verified events: `on_hot_streak` · `on_cold_streak` · `defending_champ` · `most_trades` · `close_game_cursed` · `undefeated` · `eliminated` · `celebrity`. Content entries declare `required_tags`. No stats, no RPG, no new tables — this is the lightweight model `11 §16` asks for.

**Restricted content** (Nathan's fan club, Matt Lee's joke, the Cottage Inn gag): `sensitivity=restricted`, surface-gated, behind the explicit-language flag, never in generated prose, never in a shared artifact, commissioner-disableable instantly.

**"Public-style surface"** — undefined in `13 §19`, now defined concretely as: never in the Slice's generated prose, never on any surface with a shareable URL, never in auth/security/error flows, never in an LLM prompt.

Zack receives no invented personality — neutral and event-based only until real history accumulates.

---

## 11. Authentication

- **6-digit PIN** (not 4 — 10,000 combinations against 10 known accounts is trivially brute-forced), argon2id
- **90-day rolling session**, refreshed every visit → a weekly visitor is never logged out
- Signed HTTP-only · Secure · SameSite=Lax cookie holding a session ID
- `sessions` table: device label, created, last seen, revoked_at. Device list in profile. "Sign out everywhere."
- Revocation on: manual sign-out, PIN change, commissioner reset
- New device: **pick your name from ten, enter PIN.** Two taps. The Sleeper ID is never requested again after setup.
- Rate limit 5 / 15 min per account and per IP, exponential lockout, tracked in Postgres
- No step-up auth for players; step-up on admin actions only

Supersedes the 4-digit PIN framing in `04 §21` / `09 §8.2`.

---

## 12. Historical import — tiered, never fabricated

**Starting point:** 2026 league ID `1385016656425668608`.

Sleeper mints a **new league ID each season** when a league is renewed — which is precisely why `previous_league_id` exists. The chain is therefore likely intact even though the ID differs per year.

**Tier 1 — chain traversal (attempt first).** From the 2026 league, follow `previous_league_id` back through 2025 and 2024. Pull users, rosters, matchups, transactions, and the winners bracket; **derive champions from the bracket** rather than entering them.

**Tier 2 — supplied IDs.** If the chain breaks, request the individual historical league IDs from the commissioner. Identical import path from there. **Not a blocker now.**

**Tier 3 — manual.** Anything still unavailable: a one-time commissioner screen for champion, runner-up, final standings, and known stories, stored as `league_memories` with `confidence = commissioner_approved`.

**Never fabricate.** Thinner history for old seasons is acceptable **and must be visible** — Tony says "highest since we started recording," never pretends to know. The UI distinguishes detailed recorded history from thin manual history.

Historical championship rings for **Alex** and **Matty B** are granted once their seasons are verified through any tier.

**Environment note:** `api.sleeper.app` is currently **403-blocked by this environment's network policy** (verified 2026-07-28). It must be allowlisted before live sync verification. All sync development runs against **recorded fixtures** regardless, which is the intended design.

---

## 13. Roadmap

| Phase | Goal | Includes | Excludes | Gate |
|---|---|---|---|---|
| **P0** Foundation | Nothing surprises us later | Repo, migrations, clock abstraction, flags, CI, fixtures, **art test set**, asset inventory | All features | Composite test approved; fixtures replay a fake week |
| **P1** Identity + Sync + Spine | Truth exists, replayable | PIN auth, sessions, claim flow, Sleeper adapter, fantasy tables, **`league_events`**, sync runs, **historical import**, replay harness | All UI | 10 managers map; re-sync is a no-op; history imported or marked thin; security checklist passes |
| **P2** The Shop | It feels like a place | 6 zones, Tonight board, featured rotator, resolver, 12 dressings, receipt, seasonal mechanism, mobile tiles | Collectibles in the case | Five-second test passes on a phone; shop changes across 2 simulated weeks |
| **P3** Economy | Money is trustworthy | Ledger, trigger balance, weekly rewards, **multi-season simulation** | Spending | Overdraft impossible; replayed key is a no-op; **simulation ranges approved** |
| **P4** Collectibles | The reason to care | One box, 24-item catalog, 12 wearables, 5 slots, rings, server-authoritative pull, reveal, Collection, **Showcase** | Basements | Purchase atomic; Showcase live in case; rights review clean |
| **P5** The Slice | The ritual | Candidates, fact packets, both renderers, validation, review screen, publish, archive, **Tony's Line + bounties + chalkboard**, Timeline | — | **Publishes with the API key removed**; planted false claim blocked |
| **LAUNCH** | | | Basements, casino, Season Story, seasonal packs | Full release gate per `15 §21` |
| **P6** Basements | Permanence | 3 themes, curated slots, visiting, character in-room | Drag-and-drop | Inventory ≠ placement; visiting works |
| **P7** Season Story + vending | The season has shape | Thread detection, menu-board lines, vending machine | — | Threads factual, one line each |
| **P8** Halloween | Prove seasonal | Decor, themed box, NPC costumes | — | Activates/deactivates cleanly by date |
| **P9** Playoffs depth + Closing Night | The year's biggest moments | Bracket, dimmed eliminations, ring ceremony + wheel + portrait + season name | — | Portrait snapshots equipped state permanently |
| **P10** Casino | Per direction | Slots, then blackjack | Roulette | No client-authoritative outcome |
| **P11** Museum | Offseason | Archive mode, season close/open | — | No permanent item lost |

---

## 14. Testing

- **Unit:** reward calc · seeded rarity draw · analytics · story thresholds · cooldown eligibility · season transitions · roster mapping · **shop-resolver golden fixtures** (league state → expected dressings)
- **Integration** (local Docker Postgres, never the hosted DB): ledger atomicity · double-spend · replayed idempotency key · box purchase → inventory · PIN lockout · session invalidation
- **E2E** (Playwright incl. mobile viewport): claim → login → read Slice → open box → equip → set Showcase
- **Security checklist before launch:** IDOR on inventory · forged membership · replayed loot request · admin route as player · negative wager · ledger tampering · PIN enumeration
- **Accessibility:** axe in CI · keyboard pass · reduced motion · non-color rarity
- **Synthetic season replay** — a full fake 17-week season through the time machine, asserting economy totals, story counts, zero duplicate rewards, visible weekly shop change, clean season close/open. **Built in P1, not at the end.** Highest-value test in the project.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| **Art volume and consistency** (top risk) | Test-set composite gate · mechanical palette quantization · placeholder-first so it never blocks · batch order by visible return |
| **Shop feels static** | 12 dressing states is the floor; below ~10 the premise breaks. Text-driven templates hold the cost at ~6 drawn assets. |
| **Sleeper API undocumented, no SLA** | Adapter isolation · stored raw payloads · replay from fixtures · currently network-blocked |
| **Runway to kickoff** | v1 gained scope over three rounds; moving casino and basements out bought back more than was added |
| **Hobby function duration** | Chunked, resumable Tuesday job from day one |
| **Economy imbalance** | Simulation is a release gate, not a follow-up |

---

## 16. Open items (non-blocking)

1. **Sleeper allowlisting** — `api.sleeper.app` 403s from this environment
2. **Lions results source** — the victory-maniac cameo needs a non-Sleeper feed; undocumented, degrades gracefully
3. **Simulation output review** — reward and pricing ranges need commissioner sign-off after P3
4. **2024/2025 league IDs** — only if Tier 1 chain traversal fails

---

# Appendix A — Superseded requirements

Every material conflict between this plan and documents `00`–`15`, resolved explicitly.

## A.1 Removed from the product

| Requirement | Source | Reason |
|---|---|---|
| Real-money peer side bets / "After Dark" | `03 §18` · `04 §13` · `09 §13` · `02 §3` | Recording participants, terms, acceptance, and a winner is functionally wager facilitation. Michigan licenses sports wagering. Zero engineering upside — the group already has a chat and Venmo. |
| Fantasy prop-bet system | `03 §17` · `04 §12` · `15 §13` · `02 §3` | Needs reliable projections that `07 §3` itself calls unreliable; needs versioned settlement per prop type; creates a **second weekly commissioner deadline**. Replaced by Tony's Line. |
| Roulette scaffolding | `03 §15` · `04 §11` | `03 §15` asks to scaffold early *and* not to let it delay MVP. A reserved feature-flag key is the entire required scaffolding. |
| Reward "claiming" | implied by `03 §4` | Auto-posting to the ledger removes a chore. |
| Public guest mode | new proposal | Real names attached to crude jokes on a public URL; permanent per-surface audit burden. Replaced by per-artifact `noindex` share links. |
| Punishment *mechanics* (token loss, lockouts, chores) | new proposal | Deprivation invites friction. Punishment is **visibility**, not loss. |
| "Just 18" NPC/collectible | `14 §16` | Highest handling risk, lowest payoff of any lore item. |
| Fugitive-in-a-jumpsuit NPC | new proposal | Comedic payload is entirely borrowed from a real criminal case. Replaced by the health inspector. |
| Analytics vendor | `15 §22` | Log to the event spine. Free, private, no third party. |
| Crash · achievements · levels · clout · prestige | already excluded | Confirmed. The collection is the progression. |

## A.2 Combined

| Was | Now | Source |
|---|---|---|
| `lore_entries` · `dialogue_lines` · `character_knowledge` · `npcs` · `npc_appearance_rules` · `npc_appearance_events` + dressings | **`content_entries` + `content_usage_log`** | `04 §15–16` · `05 §4` · `13` |
| Timeline · Season Story · Tonight board · shop state · Slice candidates · unread markers | **`league_events` spine** | new direction |
| Notifications · activity feed · new/unread | **one watermark over the spine** | `04 §17` · `05 §8.6` |
| Showcase Wall (proposed page) | **`showcase_inventory_id` column**, surfaced in the display case | new proposal |
| Hall of Champions (proposed page) | **Timeline filtered to championships** | new proposal |
| Ring ceremony · punishment wheel · group portrait · season-name reveal | **Closing Night at Tony's**, one annual event | new proposal |
| `external_accounts` table | `sleeper_user_id` column | `04 §5` |
| `season_wallets` cached balance | trigger-maintained column with `CHECK` | `03 §5` · `04 §8` |

## A.3 Delayed

| Requirement | Was | Now |
|---|---|---|
| Casino (blackjack + slots) | `15 §12` Phase 7 / `10 §9` optional in first slice | **Phase 10**, post-launch |
| Manager basements | `15 §9` first release | **Phase 6**, v1.1 |
| Silent auction | `15 §14` | Phase 11 window, November |
| Seasonal events | `15 §15` | Phase 8, Halloween first |
| Draft-night mode | `15 §16` | Next offseason — **ADP source unspecified**, see A.5 |
| Season Story So Far | new proposal | Phase 7 — needs ~4 weeks of data |
| Vending machine | new proposal | Phase 7 |

## A.4 Changed

| Requirement | Was | Now | Why |
|---|---|---|---|
| PIN length | 4 digits (`04 §21`, `09 §8.2`) | **6 digits** | 10,000 combinations against 10 known accounts |
| Environment isolation | `world_id` column on mutable tables (`04 §4`) | **Separate Neon branch/project** | One missing `WHERE` corrupts production permanently |
| Row Level Security | required (`09 §9`) | **Server-only access, `anon` revoked** | Stricter; removes client DB access entirely |
| Asset storage | Supabase Storage (`04 §2`) | **Static in-repo + slug registry** | Deletes an entire security surface |
| Primary nav | Parlor · Underground · Loot · Basement (`02 §3`) | **Parlor · Slice · Collection · Rooms** | Underground and props are not launch destinations |
| Basement themes at launch | "5–10" (`02 §8`) vs "one" (`15 §9`) | **3** | Contradiction resolved |
| Token-leader award | most tokens held (`03 §19`) | **most tokens earned** | Holding rewards hoarding, fighting spend-down |
| Daily login reward | open decision (`03 §4`, `15 §7`) | **Never** | Contradicts the weekly-visit constraint |
| Tony's Receipts | manual archive search (`08 §15`) | **Deterministic chalkboard prediction**, auto-checked | Free, always truthful |
| Animation library | Framer Motion (`04 §2`) | **CSS keyframes + sprite sheets** | 14 effects need zero assets and no dependency |
| Champion emote escalation | escalating rude gestures (new proposal) | **Escalating absurdity**, ending with Tony presenting the hand on a pillow | Funnier, works in any context |
| Nathan's celebrity bit | full anime fan club (new proposal) | **Preserved as restricted content**, silhouette treatment first | Private-league only, never in shared artifacts |
| Vending rotation | 24 hours (new proposal) | **Tuesday-to-Tuesday, everything returns** | 24h is textbook daily-login pressure |
| Reward pacing / prices | fixed values (`03 §4`, `15 §7`) | **Simulation-gated ranges** | No number is proven until simulated |

## A.5 Gaps identified in the original specification

| Gap | Where | Resolution |
|---|---|---|
| No job produces the pre-Monday score snapshot that Monday-comeback stories require | `07 §8` vs `04 §22` | Sunday 11:55pm ET cron added (§4.3) |
| Draft-night ADP source never specified; Sleeper exposes none that is stable and licence-clear | `02 §11` · `05 §9` | Draft night deferred; `search_rank` as a labelled proxy if ever built |
| "Public-style surface" gates restricted lore but is never defined | `13 §19` · `11 §11` | Defined in §10 |
| Stat corrections vs. already-granted rewards is unaddressed | `09 §14` · `08 §27` | Rewards computed once against a stored snapshot, never auto-revoked; material change raises an admin alert with a one-click compensating entry |
| Lions results have no source (needed for the victory-maniac cameo) | new proposal | Non-Sleeper feed required; open item |
