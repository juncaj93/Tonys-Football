# 09 — Admin, Security, Testing, and Operations

**Version:** 2.0  
**Status:** Canonical specification  
**Primary question:** How is Tony’s Pizza safely operated, tested, maintained, and controlled by the commissioner?

---

## 1. Purpose

This document defines the operational systems required to run Tony’s Pizza Fantasy Football Hub reliably.

It governs:

- commissioner administration;
- feature flags;
- content controls;
- sandbox tools;
- authentication support;
- security;
- audit logs;
- backups;
- testing;
- release management;
- observability;
- incident handling;
- season transitions.

The project is intentionally automated for league members, but the commissioner must retain clear control over important content, data, and seasonal actions.

---

## 2. Operational Philosophy

The system should feel effortless to players and highly inspectable to the commissioner.

Core principles:

1. **Automate routine work.**
2. **Require approval for high-impact actions.**
3. **Never hide destructive consequences.**
4. **Keep production and sandbox behavior separate.**
5. **Record who changed what and when.**
6. **Prefer recoverable mistakes over permanent mistakes.**
7. **Treat external data as fallible and asynchronous.**
8. **Do not make the commissioner manage ordinary weekly activity manually.**

---

## 3. Admin Roles

### 3.1 Commissioner

The commissioner may:

- manage league settings;
- map Sleeper managers;
- review and publish Tuesday Slice issues;
- manage feature flags;
- edit content pools;
- manage lore;
- run manual syncs;
- inspect token transactions;
- correct display metadata;
- configure seasonal windows;
- initiate season close;
- initiate a new season;
- access sandbox and testing tools;
- view audit history;
- manage PIN recovery.

### 3.2 Support admin

Optional future role with narrower permissions:

- assist with account access;
- review sync status;
- inspect logs;
- not alter economy settings;
- not publish Gazette issues;
- not initiate season close;
- not access sensitive audit exports.

### 3.3 Player

Players may:

- access their own account;
- view league content;
- manage their basement;
- use tokens;
- participate in enabled games;
- view their own transaction history;
- use league-wide social features.

Players must not access admin routes or hidden feature state.

---

## 4. Admin Dashboard

The admin dashboard should provide a clear operational summary.

Recommended sections:

- system health;
- Sleeper sync status;
- current season;
- active week;
- feature flags;
- Gazette status;
- pending approvals;
- token economy summary;
- recent errors;
- recent admin changes;
- backup status;
- upcoming seasonal transitions;
- user access issues.

The dashboard should not be overloaded with raw database detail.

---

## 5. Feature Flags

Feature flags are required for:

- roulette;
- seasonal content;
- new loot-box collections;
- future anniversary systems;
- sportsbook modules;
- real-money agreement ledger;
- experimental NPC events;
- new basement themes;
- draft-night tools;
- optional social modules.

Each flag should include:

- stable key;
- name;
- description;
- environment;
- active state;
- rollout scope;
- start time;
- end time;
- dependency flags;
- created by;
- updated by;
- audit history.

Flags must fail closed. If a flag service or configuration cannot load, unreleased features remain disabled.

---

## 6. Sandbox and Preview Environment

The sandbox exists to test the world without affecting production.

Required capabilities:

- fake league;
- fake managers;
- synthetic weekly results;
- adjustable current date;
- adjustable season/week;
- token grant and reset;
- loot-box simulator;
- collectible grant;
- casino simulator;
- NPC event trigger;
- Gazette candidate generator;
- Gazette preview;
- lore cooldown viewer;
- feature-flag preview;
- season-close simulator;
- manager turnover simulator.

Sandbox data must be visually labeled and physically separated from production data.

No sandbox action may:

- alter a production balance;
- publish a production issue;
- change production feature flags;
- send production notifications;
- overwrite production history.

---

## 7. Time Machine

A time-machine tool should allow administrators to simulate:

- preseason;
- active week;
- Tuesday publication;
- playoffs;
- final playoff week;
- silent-auction close;
- season-close countdown;
- offseason museum mode;
- new-season activation.

The time machine must operate through an injected application clock or environment-scoped override. Do not scatter direct system-time calls across business logic.

---

## 8. Authentication and PIN Recovery

### 8.1 Account model

The intended player flow is:

1. select or enter Sleeper identity;
2. claim the matching league manager profile;
3. establish a private PIN;
4. use that profile and PIN for future access.

Authentication must use secure server-side verification.

### 8.2 PIN rules

Requirements:

- never store plaintext PINs;
- use a modern password-hashing algorithm;
- rate-limit attempts;
- lock or slow repeated failures;
- use secure, HTTP-only session cookies;
- rotate sessions after authentication;
- support logout from all devices;
- record recovery actions.

A PIN may be simple enough for a private friend group, but the system still must protect against automated guessing.

### 8.3 Commissioner recovery

The commissioner may reset a forgotten PIN.

Recovery flow:

- select manager;
- explicitly confirm reset;
- invalidate existing sessions;
- issue one-time recovery code or require new PIN setup;
- record admin identity and timestamp;
- notify the affected user in the application if practical.

The commissioner should not be able to view the user’s existing PIN.

---

## 9. Authorization

Authorization must be enforced server-side.

Do not rely on:

- hidden buttons;
- client-side route guards;
- obscured URLs;
- user-supplied role claims.

Every protected action must verify:

- current authenticated user;
- current league;
- role;
- season context;
- ownership where applicable;
- feature flag;
- action-specific permission.

Supabase Row Level Security or an equivalent database authorization layer should reinforce application checks.

---

## 10. Data Security

### 10.1 Secrets

Store secrets in managed environment configuration.

Never commit:

- service-role keys;
- provider tokens;
- model API keys;
- database passwords;
- signing secrets.

Use separate credentials for development, preview, and production.

### 10.2 Input handling

Treat all user, provider, and admin text as untrusted.

Requirements:

- schema validation;
- safe escaping;
- parameterized queries;
- file-type validation;
- upload size limits;
- sanitized rich text;
- URL validation;
- no arbitrary HTML execution.

### 10.3 File storage

For uploaded or generated media:

- use private or controlled buckets where appropriate;
- use signed URLs when needed;
- validate MIME type and extension;
- scan or restrict uploads;
- remove unused temporary files;
- track source and rights metadata.

---

## 11. Economy Integrity

Token balances must be derived from an immutable transaction ledger.

Never update a balance without:

- transaction type;
- amount;
- reason;
- source event;
- idempotency key;
- season;
- actor;
- timestamp.

Economy actions must use database transactions.

Examples:

- fantasy reward;
- starting balance;
- daily reward if retained;
- loot-box purchase;
- casino bet;
- casino payout;
- auction escrow;
- auction settlement;
- admin correction;
- end-of-season reset.

Admin corrections should create compensating entries rather than silently rewriting history.

---

## 12. Casino Integrity

Casino outcomes must be generated server-side.

Requirements:

- cryptographically appropriate random source for game outcomes;
- validated bet amount;
- sufficient token check;
- atomic bet and payout;
- idempotency;
- per-user and global rate limits;
- game-version logging;
- outcome logging;
- rejection of replayed requests;
- no client-authoritative result.

The casino uses only fictional tokens.

The application must not custody real money.

---

## 13. Real-Money Agreement Ledger

The proposed “After Dark” module is a peer-to-peer agreement record only.

It may record:

- participants;
- terms;
- acceptance;
- status;
- result;
- manual settlement acknowledgment.

It must not:

- collect money;
- transfer funds;
- hold balances;
- calculate platform fees;
- act as escrow;
- present itself as licensed gambling.

This feature carries legal and platform risk and should remain disabled until reviewed for the actual jurisdiction and deployment context.

---

## 14. Sleeper Sync Operations

Admin controls should include:

- last successful sync;
- last attempted sync;
- current provider response status;
- manual retry;
- specific season/week retry;
- sync log;
- records changed;
- records skipped;
- conflict warnings.

Sync operations must be idempotent.

Provider failure must not delete or overwrite previously valid data.

---

## 15. Gazette Operations

The admin interface must support:

- generate candidates;
- inspect candidate facts;
- include/exclude;
- generate draft;
- inspect validation;
- edit text;
- regenerate one story;
- preview;
- approve;
- publish;
- correct a published issue;
- archive;
- view generation cost and logs.

No language-model generation should be available to ordinary players.

---

## 16. Content Administration

Admin-managed content includes:

- Tony dialogue;
- league-member dialogue;
- system copy;
- lore;
- NPC events;
- seasonal messages;
- loot-box descriptions;
- collectible metadata;
- Gazette restrictions.

Required controls:

- active/inactive;
- preview;
- weight;
- cooldown;
- season scope;
- eligibility;
- usage history;
- restrictions;
- notes;
- created/updated metadata.

Retiring content must not delete historical usage.

---

## 17. Inside Joke Manager

The inside-joke manager should include:

- canonical name;
- context;
- associated people;
- allowed surfaces;
- prohibited surfaces;
- weight;
- cooldown;
- seasonal cap;
- active/retired status;
- sensitivity notes;
- examples;
- last used;
- total uses;
- publication history.

The commissioner must be able to retire a joke immediately.

---

## 18. Audit Logging

Audit-log all meaningful admin and system actions.

Examples:

- user mapping;
- PIN reset;
- economy correction;
- feature-flag change;
- content edit;
- Gazette publish;
- issue correction;
- season close;
- new season;
- collectible metadata change;
- auction intervention;
- backup restore;
- manual sync.

Audit records should include:

- actor;
- action;
- target;
- prior value where appropriate;
- new value;
- reason;
- environment;
- request ID;
- timestamp.

Audit logs should be append-only for ordinary administrators.

---

## 19. Backups and Recovery

### 19.1 Backup targets

Back up:

- database;
- published Gazette content;
- collectible registry;
- user inventory;
- token ledger;
- league history;
- content configuration;
- feature flags;
- admin audit data;
- critical media metadata.

### 19.2 Recovery expectations

Document:

- backup frequency;
- retention;
- recovery point objective;
- recovery time objective;
- restore procedure;
- restore test cadence;
- ownership.

A backup is not trusted until a restore has been tested.

### 19.3 Season snapshots

Before season close:

- complete final sync;
- freeze final standings;
- snapshot rosters;
- snapshot inventories;
- snapshot token ledger;
- snapshot published issues;
- snapshot manager mappings;
- create a labeled season archive.

---

## 20. Season Close Operations

Season close should be an explicit workflow, not a single dangerous button.

Recommended steps:

1. confirm final fantasy data;
2. confirm final Gazette;
3. close token-earning systems;
4. close auctions before token expiration;
5. show spend-down deadline;
6. resolve unsettled token actions;
7. take backup;
8. create season snapshot;
9. reset seasonal token balances through ledger entries;
10. switch to museum mode;
11. verify archived access;
12. publish close confirmation.

Use multiple confirmations and a dry-run summary.

Collectibles and permanent history persist.

---

## 21. New Season Operations

Start New Season workflow:

1. identify Sleeper league and season;
2. sync league settings;
3. import managers and rosters;
4. map returning identities;
5. identify manager turnover;
6. preserve historical owner relationships;
7. establish starting token balances;
8. activate seasonal systems;
9. configure feature flags;
10. verify scheduled jobs;
11. publish opening status.

Do not assume `roster_id` remains a permanent manager identity.

---

## 22. Testing Strategy

Testing should include:

- unit tests;
- integration tests;
- database constraint tests;
- Row Level Security tests;
- end-to-end user flows;
- visual regression;
- accessibility testing;
- performance checks;
- security review;
- synthetic season simulations.

### 22.1 Critical unit-test areas

- token calculations;
- rarity selection;
- duplicate compensation;
- casino outcomes;
- prop settlement;
- story thresholds;
- lineup eligibility;
- season transitions;
- manager mapping;
- cooldown logic.

### 22.2 Critical integration tests

- Sleeper sync to normalized data;
- reward event to token ledger;
- loot-box purchase to inventory;
- casino bet to ledger;
- Gazette facts to publication;
- auction escrow and settlement;
- PIN recovery and session invalidation.

### 22.3 End-to-end flows

- new manager claims account;
- returning manager logs in;
- commissioner resets PIN;
- user opens box;
- user equips collectible;
- visitor enters basement;
- user plays blackjack;
- commissioner publishes Slice;
- season closes;
- offseason archive remains available;
- new season maps returning and replacement managers.

---

## 23. Security Testing

Required reviews:

- authentication bypass;
- authorization bypass;
- insecure direct object reference;
- rate-limit bypass;
- duplicate request replay;
- token manipulation;
- client-side casino tampering;
- admin route exposure;
- stored cross-site scripting;
- malicious file upload;
- leaked secret detection;
- RLS policy gaps;
- session fixation;
- CSRF where applicable.

High-impact economy and admin actions should receive adversarial tests before launch.

---

## 24. Accessibility Testing

Test:

- keyboard navigation;
- screen-reader labels;
- focus order;
- contrast;
- zoom;
- reduced motion;
- mobile touch targets;
- error announcements;
- modal behavior;
- animation skipping;
- non-color rarity cues.

Accessibility is part of release readiness.

---

## 25. Observability

Monitor:

- application errors;
- database errors;
- sync failures;
- scheduled-job failures;
- AI generation failures;
- validation failures;
- authentication failures;
- suspicious rate patterns;
- economy anomalies;
- negative balances;
- duplicate ledger keys;
- backup failures;
- performance by route.

Logs must avoid plaintext secrets and PINs.

Use request and job IDs to trace a workflow across services.

---

## 26. Release Process

Recommended environments:

- local;
- preview/staging;
- production.

Release checklist:

- tests pass;
- migrations reviewed;
- backup available;
- feature flags default correctly;
- admin paths verified;
- mobile smoke test;
- accessibility smoke test;
- performance checked;
- secrets present;
- rollback plan documented;
- scheduled jobs verified;
- provider integrations checked.

Deploy code separately from enabling major features when practical.

---

## 27. Incident Response

For a production incident:

1. contain the issue;
2. disable affected feature flag;
3. preserve logs;
4. identify scope;
5. prevent further data mutation;
6. restore or correct through ledger/history-safe actions;
7. verify;
8. document cause;
9. add regression test;
10. communicate clearly to users if needed.

Never “fix” an economy incident by manually overwriting balances without transaction records.

---

## 28. Acceptance Criteria

Operations are ready when:

- roles are enforced server-side;
- PINs are securely hashed;
- commissioner recovery invalidates sessions;
- all important admin actions are audited;
- sandbox cannot mutate production;
- economy writes are atomic and idempotent;
- provider failure preserves prior data;
- backups are tested;
- season close has a dry run;
- manager turnover preserves history;
- critical workflows have end-to-end tests;
- feature flags fail closed;
- no real-money custody exists;
- security and accessibility checks are part of release readiness.

---

## 29. Final Principle

Players should feel like Tony runs the place.

The commissioner should know exactly how the place is actually being run.
