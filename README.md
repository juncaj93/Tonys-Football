# Tony’s Pizza Fantasy — Project Specification

**Version:** 2.0  
**Status:** Complete canonical specification  
**Primary audience:** Claude Code, future AI coding assistants, and human developers

---

## 1. What This Project Is

**Tony’s Pizza Fantasy** is a persistent social game layered on top of one private Sleeper fantasy football league.

Sleeper remains the source of truth for:

- rosters;
- scores;
- standings;
- transactions;
- league settings;
- weekly and seasonal fantasy results.

Tony’s Pizza adds what Sleeper does not provide:

- personality and inside jokes;
- a living retro pizza-parlor world;
- weekly story-driven entertainment;
- permanent collectibles;
- customized characters and basements;
- fictional token gambling;
- social side-bet tracking;
- league history that grows richer every season.

The user-facing brand is **Tony’s Pizza Fantasy**.

The central location is **Tony’s Pizza Parlor**: a 1990s/early-2000s neighborhood pizza diner and arcade in Metro Detroit, with manager basements, collectible displays, Tony’s Tuesday Slice on the counter, and a suspicious underground casino.

This is not intended to replace Sleeper.

It is:

> A persistent social game built around the league’s real fantasy history, friendships, rivalries, collectibles, weekly stories, and inside jokes.

---

## 2. Core Architecture Principle

> **Truth → Systems → Story → Presentation**

1. Sleeper and verified application records provide the truth.
2. Backend systems normalize data and calculate rewards, analytics, outcomes, and story candidates.
3. Generative AI may convert verified story candidates into Tony-style editorial writing.
4. Validation checks every claim.
5. The frontend presents the result as a polished game world.

Never reverse this flow.

Do not use AI to calculate:

- fantasy scores;
- standings;
- records;
- matchup outcomes;
- trade history;
- casino outcomes;
- token rewards;
- loot-box results;
- collectible ownership;
- authoritative league history.

Accuracy is always more important than humor.

---

## 3. Package Completeness Requirement

Do not begin implementation unless every file listed in the manifest below is present.

If one or more files are missing:

1. stop;
2. identify every missing file;
3. do not initialize the application;
4. do not create migrations;
5. do not write implementation code.

The specification must be reviewed as one complete system.

---

## 4. Required Package Structure

```text
TONYS_PIZZA_PROJECT_SPEC/
│
├── README.md
├── CLAUDE_FIRST_PROMPT.md
│
└── PROJECT_SPEC/
    ├── 00_PROJECT_RULES.md
    ├── 01_VISION_AND_DESIGN_PHILOSOPHY.md
    ├── 02_UI_UX_AND_FRONTEND_SPEC.md
    ├── 03_GAME_SYSTEMS_AND_ECONOMY.md
    ├── 04_BACKEND_ARCHITECTURE_AND_DATA_MODEL.md
    ├── 05_CONTENT_BIBLE_AND_DIALOGUE.md
    ├── 06_ART_BIBLE_PIXEL_STYLE_AND_ASSET_RULES.md
    ├── 07_AI_STORY_ENGINE_AND_EVENT_ANALYSIS.md
    ├── 08_TONYS_TUESDAY_SLICE_GAZETTE_SYSTEM.md
    ├── 09_ADMIN_SECURITY_TESTING_AND_OPERATIONS.md
    ├── 10_MASTER_BUILD_INSTRUCTIONS.md
    ├── 11_LEAGUE_MEMBER_CHARACTER_SYSTEM.md
    ├── 12_TONY_PERSONALITY_BIBLE.md
    ├── 13_INSIDE_JOKE_MANAGER_AND_DYNAMIC_LORE.md
    ├── 14_WORLD_LORE_AND_CANON.md
    └── 15_MVP_DEVELOPMENT_ROADMAP.md
```

Batch-specific README files are not part of the final package.

---

## 5. Required Reading Order

Read every file before implementation, in this order:

1. `README.md`
2. `PROJECT_SPEC/00_PROJECT_RULES.md`
3. `PROJECT_SPEC/01_VISION_AND_DESIGN_PHILOSOPHY.md`
4. `PROJECT_SPEC/02_UI_UX_AND_FRONTEND_SPEC.md`
5. `PROJECT_SPEC/03_GAME_SYSTEMS_AND_ECONOMY.md`
6. `PROJECT_SPEC/04_BACKEND_ARCHITECTURE_AND_DATA_MODEL.md`
7. `PROJECT_SPEC/05_CONTENT_BIBLE_AND_DIALOGUE.md`
8. `PROJECT_SPEC/06_ART_BIBLE_PIXEL_STYLE_AND_ASSET_RULES.md`
9. `PROJECT_SPEC/07_AI_STORY_ENGINE_AND_EVENT_ANALYSIS.md`
10. `PROJECT_SPEC/08_TONYS_TUESDAY_SLICE_GAZETTE_SYSTEM.md`
11. `PROJECT_SPEC/09_ADMIN_SECURITY_TESTING_AND_OPERATIONS.md`
12. `PROJECT_SPEC/10_MASTER_BUILD_INSTRUCTIONS.md`
13. `PROJECT_SPEC/11_LEAGUE_MEMBER_CHARACTER_SYSTEM.md`
14. `PROJECT_SPEC/12_TONY_PERSONALITY_BIBLE.md`
15. `PROJECT_SPEC/13_INSIDE_JOKE_MANAGER_AND_DYNAMIC_LORE.md`
16. `PROJECT_SPEC/14_WORLD_LORE_AND_CANON.md`
17. `PROJECT_SPEC/15_MVP_DEVELOPMENT_ROADMAP.md`
18. `CLAUDE_FIRST_PROMPT.md`

Do not skip character, lore, content, art, or operations files because they appear less technical. They contain product rules that materially affect architecture and implementation.

---

## 6. Document Responsibilities

### `00_PROJECT_RULES.md`

Defines the non-negotiable project rules, product boundaries, source-of-truth expectations, and prohibited implementation behavior.

### `01_VISION_AND_DESIGN_PHILOSOPHY.md`

Defines why the product exists, the emotional goals, the weekly return loop, nostalgia, social competition, dopamine, collectibility, and long-term identity.

### `02_UI_UX_AND_FRONTEND_SPEC.md`

Defines the parlor homepage, navigation, responsive behavior, interaction patterns, basement presentation, motion, loading, accessibility, and frontend experience.

### `03_GAME_SYSTEMS_AND_ECONOMY.md`

Defines tokens, rewards, loot boxes, collectibles, basements, casino systems, prop bets, auctions, seasons, and persistence rules.

### `04_BACKEND_ARCHITECTURE_AND_DATA_MODEL.md`

Defines the backend architecture, database concepts, season and manager mapping, ledger design, Sleeper sync, scheduled jobs, feature flags, and core data relationships.

### `05_CONTENT_BIBLE_AND_DIALOGUE.md`

Defines user-facing writing, runtime dialogue, notification copy, errors, empty states, curated dialogue pools, templating, tone, and content restrictions.

### `06_ART_BIBLE_PIXEL_STYLE_AND_ASSET_RULES.md`

Defines the visual world, pixel-art strategy, Tony’s appearance, environment design, collectible assets, rarity presentation, motion, sound, accessibility, rights, and asset production rules.

### `07_AI_STORY_ENGINE_AND_EVENT_ANALYSIS.md`

Defines how verified fantasy and application events become structured story candidates, how candidates are scored, how fact packets are built, and how unsupported claims are blocked.

### `08_TONYS_TUESDAY_SLICE_GAZETTE_SYSTEM.md`

Defines the weekly publication, editorial structure, story count, commissioner review, generation, validation, publishing, versioning, corrections, archive, and homepage integration.

### `09_ADMIN_SECURITY_TESTING_AND_OPERATIONS.md`

Defines commissioner controls, authentication support, sandbox, time machine, feature flags, audit logs, backups, testing, incident response, release process, season close, and new-season operations.

### `10_MASTER_BUILD_INSTRUCTIONS.md`

Defines how Claude Code or another implementation agent should interpret the specification, review architecture, propose an MVP, phase work, and avoid prohibited patterns.

### `11_LEAGUE_MEMBER_CHARACTER_SYSTEM.md`

Defines each manager’s approved character canon, fantasy habits, Tony relationship, rivalries, joke boundaries, restricted topics, and rules for future character growth.

### `12_TONY_PERSONALITY_BIBLE.md`

Defines Tony’s appearance, personality, voice, humor, emotional range, relationships, memory, frequency, behavior by surface, and prohibited characterization.

### `13_INSIDE_JOKE_MANAGER_AND_DYNAMIC_LORE.md`

Defines lore records, eligibility, cooldowns, usage logs, rare NPC frequency, memory confidence, joke aging, retirement, restricted lore, and new-canon approval.

### `14_WORLD_LORE_AND_CANON.md`

Defines the fictional world, parlor, casino, basements, NPCs, Bapple, Feasel, Cottage Inn, Clooner, Berardo, Topouzian brothers, Freddy, recurring objects, and mysteries that must remain unexplained.

### `15_MVP_DEVELOPMENT_ROADMAP.md`

Defines the implementation phases, MVP success criteria, deferred features, release gates, risks, and practical build priorities.

### `CLAUDE_FIRST_PROMPT.md`

Contains the exact first instruction to give Claude Code after the complete package has been added to the repository.

---

## 7. Source-of-Truth Hierarchy

When requirements appear to conflict, use this order:

1. `00_PROJECT_RULES.md`;
2. this final `README.md`;
3. the most specialized canonical file for the relevant system;
4. the most recent explicitly versioned requirement;
5. commissioner clarification.

Examples are illustrative unless they are labeled as fixed requirements.

Do not silently resolve material contradictions.

Before implementation:

- identify the conflict;
- explain the consequences;
- recommend a resolution;
- wait for commissioner approval.

---

## 8. Non-Negotiable Product Decisions

### Product identity

- Build a game world, not another fantasy dashboard.
- Sleeper remains the core fantasy platform and source of truth.
- Tony’s Pizza should reduce commissioner work rather than create a second league-management workload.
- Mobile is a primary usage surface.
- The homepage is a navigable pizza-parlor hub.

### Tony and content

- Tony is a recurring character inside the world, not an all-purpose AI narrator.
- Tony must remain consistent with his personality bible.
- Tony’s Tuesday Slice is the only planned live AI-written content feature.
- All ordinary Tony, manager, NPC, casino, event, notification, and UI dialogue uses curated content or validated templates.
- AI-generated prose does not automatically become canon.
- Inside jokes must be contextual, cooldown-controlled, and never overexplained.
- Zack’s personality must not be invented.

### Fantasy and story accuracy

- Sleeper and persisted application records provide authoritative facts.
- The system has defenses and no kickers.
- Story candidates are calculated deterministically.
- Every published factual claim must be traceable to verified data.
- Quiet weeks may produce fewer stories.
- The first season of Tony’s Tuesday Slice requires commissioner approval before publication.

### Economy and collectibles

- Fantasy performance is the primary source of tokens.
- Tokens reset every season.
- Collectibles, characters, basement themes, trophies, Gazette history, and league records persist.
- Loot boxes are purchased with tokens.
- Routine fantasy rewards should not directly grant random loot boxes.
- Token mutations use an append-only ledger.
- Loot-box and casino results are server-authoritative.
- Token and casino actions must be transactional and idempotent.
- Do not introduce levels, clout, prestige, or achievements.

### Casino and betting

- Launch casino games are blackjack and slots.
- Roulette may be technically prepared but must remain disabled behind a feature flag until explicitly enabled.
- “Crash” is removed from current scope.
- The site uses fictional tokens.
- The site never holds or transfers real money.
- Real-money side-bet features, if ever enabled, are peer-to-peer agreement records only and require separate legal/platform review.

### Basements and customization

- Every manager has a persistent basement.
- Basements use fixed, curated display slots.
- Do not implement unrestricted drag-and-drop room design.
- Inventory ownership is separate from display placement.
- Entrance animations, cosmetics, auras, shelves, wall displays, and themes may expand over time.

### Art, motion, and usability

- Nostalgia must not reduce clarity.
- Important animations should be short and skippable.
- Reduced-motion behavior is required.
- Rarity must be understandable without relying on color alone.
- Protected logos, likenesses, signatures, music, and art must not be copied without rights.
- The homepage must become usable before every decorative asset finishes loading.

### Operations and security

- PINs are securely hashed and never viewable by the commissioner.
- Forgotten PINs are resolved through reset.
- Permanent manager identity is separate from seasonal Sleeper roster identity.
- Sandbox and production data must remain separate.
- Important admin actions require audit logs.
- Season close requires backup, snapshot, dry run, and explicit confirmation.
- Feature flags fail closed.
- Provider failure must preserve prior valid data.

---

## 9. Reconciled Decisions

The following decisions supersede older or duplicated notes:

- Runtime generative AI is reserved for Tony’s Tuesday Slice.
- Ordinary dialogue is curated or template-driven.
- Duplicate Tuesday Slice/Gazette specifications have been merged into one canonical document.
- Tuesday Slice issues should contain approximately three to five strong stories rather than forced recurring sections.
- Commissioner approval is mandatory during season one.
- Achievements are removed from current scope.
- Levels, clout, and prestige are not part of the product.
- Blackjack and slots are the launch casino games.
- Roulette is prepared behind a disabled feature flag.
- Crash is removed from current scope.
- Loot boxes are opened by spending tokens.
- Collectibles persist while seasonal token balances reset.
- PINs are resettable but never recoverable in plaintext.
- Manager identity is permanent; Sleeper roster identity is seasonal.
- Zack remains intentionally undefined until real league behavior establishes his canon.
- Sandbox, time-machine, backup, audit, season-close, and manager-turnover systems are required.
- Economy actions are server-authoritative, atomic, auditable, and idempotent.

---

## 10. Build Philosophy

Build the smallest polished version that preserves the identity of Tony’s Pizza Fantasy.

Prefer:

- one excellent weekly experience over many shallow sections;
- a few memorable collectibles over filler inventory;
- two polished casino games over a large unfinished arcade;
- fixed basement display slots over complicated room editing;
- database-driven configuration over one-off hardcoding;
- feature flags over unfinished public releases;
- verified history over generated spontaneity;
- a short true Tuesday Slice over a long fabricated one;
- recoverable operations over irreversible shortcuts.

A visually present but nonfunctional feature is not complete.

---

## 11. Recommended MVP Loop

The smallest release should prove this loop:

1. A manager securely accesses their profile.
2. Sleeper data syncs automatically.
3. The manager enters Tony’s Pizza Parlor.
4. The homepage communicates what changed.
5. The manager reads Tony’s Tuesday Slice.
6. The manager earns or holds tokens.
7. The manager spends tokens to open a loot box.
8. The manager receives a persistent collectible.
9. The manager displays it in their basement.
10. Other league members can visit and see it.
11. The manager returns the following week.

A release without Tuesday Slice or collectibles risks feeling like a themed fantasy dashboard.

A release with every casino, lore, and seasonal system risks never reaching polish.

---

## 12. Before Writing Code

Claude Code must first provide:

1. its understanding of the product and player experience;
2. the core weekly return loop;
3. recommended technical architecture;
4. recommended repository and domain structure;
5. database-schema review;
6. identity and manager-mapping model;
7. Sleeper synchronization and idempotency strategy;
8. economy, loot-box, collectible, and basement integrity strategy;
9. Story Engine and Tuesday Slice architecture;
10. admin, sandbox, backup, feature-flag, and season-transition architecture;
11. authentication, authorization, security, and rate-limiting plan;
12. current hosting, API, cost, licensing, legal, and platform risks;
13. contradictions or unresolved decisions;
14. the smallest polished MVP;
15. a phased implementation plan;
16. a complete testing strategy;
17. any recommended simplifications or deferrals.

Claude must then wait for commissioner approval.

Do not:

- initialize the application;
- create migrations;
- write components;
- create API routes;
- implement schemas;
- generate production assets;
- begin coding;

until the architecture and MVP scope are approved.

---

## 13. Implementation Guardrails

Do not:

- use AI to invent league facts;
- generate Tuesday Slice content on page load;
- trust client token balances;
- calculate casino outcomes in the browser;
- store plaintext PINs;
- identify a permanent manager only by Sleeper roster ID;
- hardcode unreleased features as visible;
- mix sandbox and production data;
- silently overwrite published history;
- silently correct token balances without ledger entries;
- overuse rare NPCs;
- explain inside jokes;
- invent Zack’s personality;
- add achievements, levels, clout, prestige, Crash, or unrestricted room furnishing;
- create real-money custody;
- copy protected art or character designs;
- begin implementation from a partial package.

---

## 14. Definition of Done

A feature is complete only when:

- functional requirements are met;
- server-side authorization is correct;
- data integrity is protected;
- loading, success, error, and recovery states exist;
- critical tests pass;
- mobile behavior works;
- accessibility has been reviewed;
- reduced-motion behavior exists where relevant;
- admin controls exist where required;
- audit or observability exists where required;
- documentation is updated;
- rollback or recovery is possible;
- the feature is polished enough to feel intentional.

---

## 15. Final Principle

Sleeper records what happened.

Tony’s Pizza turns it into a place, a memory, and a reason for the league to come back next week.
