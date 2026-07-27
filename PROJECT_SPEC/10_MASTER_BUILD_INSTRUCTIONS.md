# 10 — Master Build Instructions

**Version:** 2.0  
**Status:** Canonical specification  
**Primary audience:** Claude Code or another implementation agent  
**Primary question:** How should the specification be interpreted and turned into a working product?

---

## 1. Your Role

Act as a senior product engineer and technical architect responsible for building Tony’s Pizza Fantasy Football Hub.

This is not a generic fantasy dashboard.

It is:

> A persistent social game layered on top of Sleeper, built around league memory, collectibles, rivalries, weekly storytelling, and a nostalgic pizza-parlor world.

Your responsibility is to preserve both:

- correctness and maintainability;
- the distinctive player experience.

Do not begin by implementing every feature.

Begin by understanding the entire specification, identifying conflicts, and proposing the smallest polished vertical slice.

---

## 2. Mandatory Reading

Read every file in `PROJECT_SPEC` before implementation.

The final package README will contain the exact manifest and reading order.

Do not assume a partial batch is a complete specification.

If any manifest file is missing:

1. stop;
2. list the missing files;
3. do not begin implementation.

---

## 3. Source-of-Truth Hierarchy

When documents appear to conflict, use this hierarchy:

1. latest explicit project rules;
2. final package README manifest and decisions;
3. dedicated canonical file for the topic;
4. cross-file references;
5. examples;
6. older imported notes.

Examples are illustrative unless labeled as fixed requirements.

Do not silently choose between material contradictions. Flag them before implementation.

---

## 4. Non-Negotiable Product Principles

### 4.1 Sleeper remains the fantasy source of truth

The application may derive stories, rewards, and history from Sleeper data.

It must not replace Sleeper’s core league-management functions.

### 4.2 Truth before story

All fantasy facts must be computed deterministically and persisted before AI writes about them.

Never use a language model to calculate:

- scores;
- records;
- standings;
- trade history;
- matchup outcomes;
- token balances;
- collectible ownership.

### 4.3 AI is narrowly scoped

Generative AI is reserved for Tony’s Tuesday Slice.

All ordinary dialogue and interaction text use curated pools and verified templates.

### 4.4 Collectibles persist

Collectibles and historical records persist across seasons.

Seasonal tokens reset.

### 4.5 The homepage is a place

The primary experience is Tony’s Pizza Parlor, not a dashboard pasted onto a themed background.

### 4.6 Build polished systems, not broad stubs

A smaller complete system is preferred over many partially functioning features.

---

## 5. Current Technology Direction

Preferred stack:

- Next.js;
- TypeScript;
- Tailwind CSS;
- Framer Motion where motion adds value;
- Supabase/PostgreSQL;
- Supabase Storage where appropriate;
- Vercel deployment;
- Sleeper API;
- scheduled server jobs;
- external language-model API for Gazette generation only.

This stack is a direction, not permission to force a poor architecture.

Before coding, review:

- current stable framework versions;
- hosting limitations;
- cron reliability;
- database connection strategy;
- API route/runtime constraints;
- storage and image strategy;
- authentication options;
- Vercel Hobby limits;
- Supabase limits.

Use official documentation for current implementation details.

---

## 6. Architecture Principles

### 6.1 Domain-first design

Organize code around product domains such as:

- identity;
- league;
- Sleeper sync;
- economy;
- collectibles;
- basement;
- casino;
- story engine;
- Gazette;
- content;
- admin;
- seasons.

Do not create one large service or route file that owns unrelated behavior.

### 6.2 Server-authoritative state

The server/database owns:

- identity;
- roles;
- token balance;
- inventory;
- casino outcome;
- auction state;
- feature flags;
- story facts;
- publication state.

The client may optimistically render only where rollback is safe.

### 6.3 Immutable financial-style records

Token changes use append-only ledger transactions.

Published issues use immutable versions.

Historical league records should not be silently overwritten.

### 6.4 Idempotency

External syncs, scheduled jobs, rewards, casino actions, auction settlement, and publication workflows must be idempotent.

### 6.5 Configuration over hardcoding

Configurable items include:

- thresholds;
- token rewards;
- box prices;
- rarity rates;
- cooldowns;
- feature flags;
- seasonal dates;
- publication timing;
- casino limits.

Do not bury live-economy values in components.

---

## 7. Required Pre-Implementation Output

Before writing code, provide:

1. product understanding;
2. user journey;
3. architecture recommendation;
4. repository structure;
5. database schema review;
6. identity and manager-mapping model;
7. Sleeper sync strategy;
8. economy integrity strategy;
9. AI/Gazette architecture;
10. feature-flag strategy;
11. security risks;
12. legal/platform risks;
13. unresolved contradictions;
14. proposed MVP;
15. phased roadmap;
16. testing strategy;
17. deployment assumptions.

Wait for approval before beginning implementation.

---

## 8. Required Questions and Assumptions

Ask only questions that materially affect implementation.

Do not block on minor choices that can use:

- explicit placeholders;
- configuration;
- safe defaults;
- prototype evaluation.

Material decisions include:

- final MVP scope;
- account claim flow;
- initial token reward table;
- launch loot-box catalog;
- whether daily token reward remains;
- whether After Dark is excluded;
- exact deployment accounts and limits;
- selected art perspective.

Document every assumption.

---

## 9. MVP Definition

The first polished MVP should prioritize:

- account claim and PIN login;
- Sleeper league sync;
- manager mapping;
- parlor homepage;
- current league pulse;
- token ledger;
- one loot-box type;
- initial collectible inventory;
- one basement theme with curated display slots;
- Tuesday Slice candidate pipeline;
- commissioner review;
- publication and archive;
- core admin health controls.

Casino may follow once economy integrity is proven, unless the commissioner explicitly includes blackjack in the first vertical slice.

Do not include roulette at launch.

---

## 10. Suggested Implementation Phases

### Phase 0 — Foundation

- repository;
- environments;
- database;
- migrations;
- CI;
- error monitoring;
- configuration;
- feature flags;
- test framework.

### Phase 1 — Identity and League

- user identities;
- manager profiles;
- season mappings;
- PIN authentication;
- roles;
- Sleeper sync;
- current standings and matchup data.

### Phase 2 — Parlor and Core Navigation

- responsive parlor;
- key destinations;
- homepage state;
- loading/error behavior;
- mobile adaptation;
- accessibility baseline.

### Phase 3 — Economy and Collectibles

- ledger;
- rewards;
- box purchase;
- rarity draw;
- inventory;
- duplicate handling;
- reveal;
- social-feed event.

### Phase 4 — Basement

- permanent basement;
- theme;
- curated slots;
- inventory placement;
- visitor mode;
- entrance animation support.

### Phase 5 — Story Engine and Slice

- normalized events;
- candidate scoring;
- fact packets;
- AI drafting;
- validation;
- admin review;
- publication;
- archive.

### Phase 6 — Casino

- blackjack;
- slots;
- server-authoritative outcomes;
- limits;
- ledger integration;
- dialogue pools.

### Phase 7 — Seasonal and Social Depth

- seasonal boxes;
- silent auction;
- deeper lore;
- NPC events;
- more themes;
- advanced archive;
- prepared roulette behind flag.

---

## 11. Frontend Requirements

### 11.1 Responsive first

Design for:

- phone;
- tablet;
- desktop.

Do not implement desktop-only spatial interaction and attempt to shrink it.

### 11.2 Progressive enhancement

Core actions must remain usable when:

- animation is reduced;
- audio is muted;
- decorative assets are still loading;
- device performance is limited.

### 11.3 State communication

Every asynchronous action needs:

- pending state;
- success state;
- failure state;
- retry or recovery path;
- protection from duplicate submission.

### 11.4 Accessibility

Include:

- semantic controls;
- keyboard navigation;
- visible focus;
- contrast;
- reduced motion;
- screen-reader labels;
- accessible modals;
- clear errors.

---

## 12. Backend Requirements

### 12.1 Database constraints

Use constraints to enforce:

- unique ownership where required;
- nonnegative values where required;
- valid states;
- valid season relationships;
- idempotency keys;
- referential integrity.

### 12.2 Transactions

Use transactions for:

- box purchase and reward;
- casino bet and payout;
- auction bidding and escrow;
- auction settlement;
- season reset;
- reward granting;
- inventory placement changes where conflicts are possible.

### 12.3 Scheduled jobs

Jobs must:

- lock or claim work safely;
- be idempotent;
- record status;
- retry safely;
- expose failure to admin;
- not rely on a single in-memory process.

---

## 13. Sleeper Integration Requirements

The Sleeper adapter should:

- isolate provider response formats;
- preserve raw payloads where useful;
- normalize data;
- map provider IDs to internal entities;
- record sync metadata;
- tolerate missing fields;
- avoid deleting valid historical data;
- support replay from stored payloads;
- separate permanent manager identity from seasonal roster identity.

The league has:

- ten teams;
- half-PPR scoring;
- six-point passing touchdowns;
- defenses;
- no kickers;
- specified starter/bench/IR rules;
- FAAB and trade settings documented in the league bible.

Do not import generic kicker assumptions into scoring or editorial logic.

---

## 14. Economy Requirements

Use a ledger, not a mutable balance field as the only record.

Every token mutation must include:

- amount;
- type;
- source;
- season;
- user;
- idempotency key;
- timestamp.

A cached balance is acceptable if it can be reconciled against the ledger.

Loot boxes are purchased with tokens.

Do not grant random boxes directly unless a later approved decision explicitly creates a narrow exception.

---

## 15. Collectible Requirements

Collectibles require:

- stable catalog ID;
- rarity;
- category;
- display compatibility;
- active state;
- season or collection metadata;
- asset metadata;
- duplicate behavior;
- reveal configuration.

Inventory ownership is separate from display placement.

Do not model basement placement as unrestricted coordinate dragging.

---

## 16. Gazette Requirements

The Story Engine calculates facts.

The language model writes prose only from fact packets.

Required components:

- candidate generation;
- transparent scores;
- fact packet;
- prompt version;
- structured output;
- deterministic validation;
- commissioner review;
- immutable publication;
- corrections;
- archive.

Do not generate on page load.

---

## 17. Content and Lore Requirements

All runtime dialogue outside the Gazette comes from managed content.

Required support:

- weights;
- cooldowns;
- restrictions;
- active state;
- usage log;
- seasonal scope;
- safe fallback.

Do not invent Zack’s personality.

Do not explain inside jokes.

Do not overuse rare NPCs.

---

## 18. Security Requirements

At minimum:

- secure PIN hashing;
- secure sessions;
- rate limiting;
- server-side authorization;
- Row Level Security;
- secret management;
- input validation;
- audit logs;
- CSRF protection where applicable;
- replay protection for economy actions;
- secure admin routes;
- upload validation;
- environment separation.

Do not expose service-role credentials to the browser.

---

## 19. Testing Requirements

Tests must cover:

- provider sync;
- manager mapping;
- token ledger;
- box opening;
- rarity selection;
- duplicate handling;
- basement placement;
- casino integrity;
- story facts;
- Gazette validation;
- publication;
- season close;
- offseason access;
- new-season turnover;
- authorization;
- reduced motion;
- mobile flows.

Use synthetic fixtures and golden cases for story logic.

---

## 20. Performance Requirements

Measure:

- homepage interaction time;
- major route bundle size;
- image weight;
- database query count;
- sync duration;
- Gazette generation cost;
- slow admin queries;
- animation frame stability.

Do not load every basement, collectible asset, or archived issue on initial page load.

---

## 21. Documentation Requirements

Maintain:

- architecture decision records;
- schema documentation;
- environment setup;
- migration process;
- test instructions;
- release checklist;
- backup/restore procedure;
- scheduled-job inventory;
- feature-flag inventory;
- content-authoring guide;
- admin runbook.

Update docs with implementation changes.

---

## 22. Prohibited Implementation Patterns

Do not:

- start coding before full review;
- call AI from arbitrary UI components;
- store plaintext PINs;
- trust client token balances;
- calculate casino outcomes in the browser;
- identify managers solely by seasonal roster ID;
- hardcode production feature state;
- silently swallow sync errors;
- delete published history;
- mix sandbox and production data;
- add drag-and-drop room furnishing without approval;
- introduce levels, clout, or prestige;
- assume every concept belongs in MVP;
- use unlicensed protected art;
- create fake league events for user-visible content.

---

## 23. Definition of Done

A feature is done when:

- functional requirements are met;
- authorization is correct;
- errors are handled;
- tests exist;
- accessibility is checked;
- mobile behavior works;
- analytics or logs exist where needed;
- admin controls exist where required;
- content is approved;
- performance is reasonable;
- documentation is updated;
- rollback is possible.

A visually present but nonfunctional feature is not done.

---

## 24. Final Principle

Build the smallest version that already feels like Tony’s Pizza.

Do not build a generic fantasy app first and assume personality can be added later. The architecture, data, interface, and content systems must all support the same world from the beginning.
