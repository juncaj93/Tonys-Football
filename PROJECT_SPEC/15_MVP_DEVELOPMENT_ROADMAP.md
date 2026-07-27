# 15 — MVP Development Roadmap and Build Priorities

**Version:** 2.0  
**Status:** Canonical roadmap  
**Primary question:** What should be built first, what should wait, and how do we avoid turning a strong idea into an unfinished feature pile?

---

## 1. Purpose

This roadmap converts the full design bible into a practical delivery sequence.

The project contains many strong ideas:

- Sleeper automation;
- parlor homepage;
- Tony;
- Tuesday Slice;
- collectibles;
- loot boxes;
- basements;
- casino;
- props;
- social feed;
- auctions;
- seasonal events;
- NPCs;
- deep league history.

They should not all launch at once.

The goal is:

> Build the smallest version that already delivers the unique Tony’s Pizza experience.

---

## 2. MVP Definition

The MVP is not merely a login page plus standings.

It must prove the central product loop:

1. connect the league;
2. enter Tony’s Pizza;
3. understand what happened;
4. earn or possess tokens;
5. open a box;
6. receive a persistent collectible;
7. display it;
8. read the weekly Slice;
9. return next week.

A feature belongs in MVP only when it strengthens that loop.

---

## 3. MVP Success Criteria

The first release succeeds when:

- all ten managers can access their profiles;
- Sleeper data syncs automatically;
- the homepage feels like Tony’s Pizza;
- current league context is clear;
- token history is trustworthy;
- one loot-box experience is polished;
- collectibles persist;
- each user has a functional basement;
- Tuesday Slice can be reviewed and published accurately;
- the commissioner does not perform routine manual weekly data entry;
- mobile and desktop both work;
- no critical economy or authentication exploit exists.

---

## 4. Phase 0 — Product and Technical Foundation

### Goals

- freeze the initial scope;
- validate architecture;
- establish environments;
- establish design tokens and asset direction;
- remove unresolved contradictions.

### Deliverables

- final schema proposal;
- repository structure;
- architecture decision records;
- local development setup;
- preview/staging environment;
- production environment;
- CI pipeline;
- migration strategy;
- error monitoring;
- feature-flag framework;
- application clock abstraction;
- synthetic league fixtures;
- baseline accessibility standards;
- initial art prototype.

### Exit criteria

- complete design-bible manifest is present;
- technical risks are documented;
- identity model is approved;
- manager turnover model is approved;
- MVP feature list is frozen;
- open decisions have owners.

---

## 5. Phase 1 — Identity, League, and Sleeper Sync

### Scope

- permanent user identity;
- league manager profiles;
- seasonal roster mapping;
- account claim;
- secure PIN setup;
- login;
- session management;
- commissioner PIN reset;
- Sleeper league import;
- league settings;
- rosters;
- matchups;
- standings;
- transactions;
- sync logs;
- admin mapping screen.

### Required behavior

- manager profiles survive roster-ID changes;
- provider failures preserve prior valid data;
- manual retry exists;
- duplicate syncs do not duplicate events;
- league rules correctly reflect defenses and no kickers.

### Exit criteria

- all active managers map correctly;
- login and recovery pass security tests;
- current and historical data can be inspected;
- sync runs without manual weekly data entry.

---

## 6. Phase 2 — Tony’s Pizza Parlor

### Scope

- responsive homepage;
- Tony greeting;
- league pulse;
- current-week status;
- Tuesday Slice newspaper object;
- collectible-machine shortcut;
- basement destination;
- casino door shown only as appropriate;
- seasonal anchor points;
- loading/error states;
- reduced-motion behavior.

### MVP constraint

The parlor should be polished but not overloaded.

Use a small number of meaningful interactive zones.

### Exit criteria

- users immediately know what changed;
- users can reach every MVP destination;
- mobile is not a shrunken desktop scene;
- Tony does not block navigation;
- core content loads before decorative assets.

---

## 7. Phase 3 — Economy Foundation

### Scope

- seasonal token ledger;
- starting balance;
- fantasy reward framework;
- admin corrections;
- balance reconciliation;
- transaction history;
- spend validation;
- season reset mechanism;
- economy configuration.

### Open decision

The exact starting balance and whether a daily token reward remains must be finalized before production launch.

A prior concept used:

- 250 starting tokens;
- possible 25-token daily reward.

This is not final until economy simulation confirms it does not overwhelm fantasy-earned rewards.

### Exit criteria

- every mutation has a ledger entry;
- no negative balance is possible unless explicitly designed;
- duplicate requests cannot double-reward;
- commissioner can inspect and correct safely;
- season reset preserves history.

---

## 8. Phase 4 — Loot Box and Collectibles MVP

### Scope

- one base loot-box type;
- token purchase;
- rarity selection;
- initial catalog;
- inventory;
- duplicate behavior;
- reveal animation;
- Tony reaction;
- legendary social announcement;
- asset metadata;
- collection browsing.

### Rules

- users spend tokens to open boxes;
- direct random box grants are excluded unless later explicitly approved;
- collectibles persist across seasons;
- reveal outcome is server-authoritative;
- rarity is readable without color alone.

### Catalog strategy

Launch with a smaller high-quality catalog.

Prioritize:

- football memorabilia;
- signed jersey-style items;
- league-lore items;
- cosmetics;
- one or two auras;
- at least one entrance animation;
- basement décor;
- Bapple-related item.

### Exit criteria

- purchase and reward are atomic;
- inventory is accurate;
- reveal is skippable after first view;
- legendary event persists;
- duplicate behavior is clear;
- catalog has no unreviewed rights risk.

---

## 9. Phase 5 — Basement MVP

### Scope

- permanent basement;
- one polished default theme;
- curated shelf slots;
- curated wall slots;
- character display;
- equipped cosmetic;
- visitor mode;
- one entrance animation slot;
- save and preview;
- mobile layout.

### Deferred

- unrestricted drag-and-drop;
- complex furniture placement;
- many themes;
- advanced interactive props;
- multiplayer simultaneous presence.

### Exit criteria

- inventory and display placement are separate;
- visitors see the owner’s saved room;
- placement conflicts are handled;
- entrance animation is optional;
- room remains useful with reduced motion.

---

## 10. Phase 6 — Story Engine and Tuesday Slice

### Scope

- normalized weekly events;
- candidate generation;
- transparent scoring;
- fact packets;
- targeted character/lore context;
- AI generation;
- deterministic validation;
- commissioner review;
- preview;
- publish;
- archive;
- corrections;
- homepage integration.

### First-season rule

Commissioner approval is mandatory.

### MVP editorial target

- three to five worthwhile stories;
- quiet-week support;
- no forced recurring sections;
- exact source traceability;
- no kicker references;
- no invented quotes.

### Exit criteria

- every published factual claim traces to data;
- issue generation is not page-load-driven;
- failed validation blocks publication;
- commissioner can edit/regenerate one story;
- archive survives offseason;
- corrections are versioned.

---

## 11. Recommended First Public Release

The strongest first public release includes:

- Phase 1 identity and sync;
- Phase 2 parlor;
- Phase 3 economy;
- Phase 4 loot boxes;
- Phase 5 basement;
- Phase 6 Tuesday Slice.

This combination proves the project’s actual differentiation.

A release without Slice or collectibles risks feeling like a themed dashboard.

A release with every casino and lore concept risks never becoming polished.

---

## 12. Phase 7 — Casino Launch

### Scope

- blackjack;
- slots;
- server-authoritative randomness;
- token bets;
- token payouts;
- limits;
- dialogue pools;
- game history;
- admin economy visibility.

### Deferred

- roulette activation;
- real-money features;
- broad sportsbook;
- Crash;
- complex tournaments.

### Exit criteria

- no client-authoritative outcome;
- atomic ledger integration;
- rate limits;
- understandable odds/mechanics;
- mobile usability;
- no manipulative loss-chasing design.

---

## 13. Phase 8 — Prop Bets and Sportsbook

### Scope

- primetime fantasy lines;
- manager-versus-manager props;
- spreads;
- totals;
- settlement;
- limits;
- exposure reporting;
- configurable lines;
- approximately balanced propositions.

### Requirements

- lines use verified data and documented formulas;
- user-controlled exploitable props are avoided;
- no real-money custody;
- external betting-line APIs require separate cost/legal review.

### Exit criteria

- every prop has deterministic settlement;
- lines are versioned;
- void conditions are explicit;
- idempotent settlement exists;
- economy simulation remains healthy.

---

## 14. Phase 9 — Social and Auction Systems

### Scope

- meaningful social feed;
- silent auction;
- auction escrow;
- collectible transfer;
- final-week scheduling;
- settlement;
- notifications.

### Auction timing

The final seasonal silent auction must end several days before token expiration so sellers can spend proceeds.

### Exit criteria

- bids cannot overspend;
- settlement is atomic;
- users understand close time;
- seller proceeds arrive before spend-down deadline;
- no duplicate ownership occurs.

---

## 15. Phase 10 — Seasonal and Rare World Content

### Scope

- Halloween;
- Thanksgiving;
- Christmas;
- seasonal boxes;
- temporary décor;
- rare NPCs;
- first/repeat encounter behavior;
- additional basement themes;
- more entrance animations;
- expanded lore manager.

### Rules

- seasonal features are flag-controlled;
- rare NPCs remain rare;
- 2027 anniversary content remains dormant until enabled;
- no seasonal feature requires permanent code deletion afterward.

---

## 16. Phase 11 — Draft Night Support

### Scope

- TV-friendly display;
- live pick entry or data feed;
- manager row;
- ADP reach/value reaction;
- Tony commentary;
- board-support mode.

The physical draft board remains primary.

Do not turn this into a full draft platform unless later approved.

---

## 17. Phase 12 — Offseason Museum and Season Transition

### Scope

- archive mode;
- basements remain visitable;
- collectibles remain visible;
- stats/history remain available;
- Gazette archive;
- inactive games/shop;
- season snapshot;
- token reset;
- new-season import;
- manager turnover mapping.

### Exit criteria

- no permanent item is lost;
- token history remains available;
- inactive systems clearly communicate status;
- returning managers retain identity;
- replacement managers do not inherit another person’s history incorrectly.

---

## 18. Explicitly Deferred Systems

Do not include in initial MVP unless separately approved:

- roulette activation;
- real-money agreement ledger;
- external Vegas-line integration;
- advanced auction system;
- many basement themes;
- broad NPC catalog;
- live AI Tony chat;
- open-ended user-generated rooms;
- achievements;
- levels;
- clout;
- prestige;
- Crash;
- full Sleeper replacement;
- automated public posting;
- complex social chat.

---

## 19. Risk Register

### 19.1 Scope risk

Mitigation:

- freeze MVP;
- feature flags;
- phased releases;
- one polished version per system.

### 19.2 AI accuracy risk

Mitigation:

- deterministic facts;
- fact packets;
- validation;
- commissioner review;
- immutable archive.

### 19.3 Economy risk

Mitigation:

- ledger;
- simulation;
- limits;
- idempotency;
- admin visibility.

### 19.4 Identity risk

Mitigation:

- permanent person identity;
- seasonal roster mapping;
- commissioner review;
- turnover tests.

### 19.5 Art-production risk

Mitigation:

- shared sprite system;
- small launch catalog;
- frozen perspective;
- asset registry;
- rights review.

### 19.6 Hosting risk

Mitigation:

- review current plan limits;
- avoid fragile long-running jobs;
- use durable scheduled-job records;
- monitor generation cost.

### 19.7 Legal/platform risk

Mitigation:

- fictional tokens only;
- no money custody;
- hold After Dark;
- review logos, likenesses, and signatures;
- avoid unlicensed assets.

---

## 20. Build Prioritization Test

Before adding a feature, ask:

1. Does it strengthen the weekly return loop?
2. Does it create a persistent memory or collectible?
3. Does it reduce commissioner work?
4. Does it make the world feel more alive?
5. Can it be delivered at a high level of polish?
6. Does it depend on unfinished foundations?
7. Can it be hidden safely behind a flag?

Features failing the first five questions should usually wait.

---

## 21. Release Gates

No release should proceed without:

- passing critical tests;
- security review of affected systems;
- mobile test;
- accessibility test;
- migration review;
- backup;
- rollback plan;
- admin control;
- feature-flag verification;
- content review;
- performance check.

Economy and authentication changes require extra scrutiny.

---

## 22. Post-Launch Measurement

Useful metrics:

- weekly active managers;
- Slice open rate;
- Slice completion rate;
- box opens;
- basement visits;
- collectible equip rate;
- token sources and sinks;
- casino net flow;
- repeated error rate;
- sync reliability;
- admin time per week;
- manager distribution in content;
- rare NPC frequency.

Do not optimize purely for maximum clicks.

The project should optimize for shared memory and weekly anticipation.

---

## 23. Final Principle

The roadmap should protect the project from its own best ideas.

Tony’s Pizza becomes special when a small number of systems feel deeply connected—not when every idea appears at once.
