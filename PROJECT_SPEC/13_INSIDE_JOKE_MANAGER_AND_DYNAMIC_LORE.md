# 13 — Inside Joke Manager and Dynamic Lore

**Version:** 2.0  
**Status:** Canonical specification  
**Primary question:** How does the site preserve inside jokes, callbacks, rare events, and evolving league memory without becoming repetitive or inaccurate?

---

## 1. Purpose

Tony’s Pizza should feel like a living private world shaped by the league’s real history.

That feeling comes from:

- recurring jokes;
- rare callbacks;
- remembered rivalries;
- evolving manager reputations;
- unusual NPC events;
- references to prior seasons;
- persistent world objects;
- selective surprise.

The system must preserve the meaning of each joke without explaining it, overusing it, or applying it to the wrong person or moment.

This document defines the content-management, eligibility, cooldown, history, and evolution rules for dynamic lore.

---

## 2. Core Principle

Inside jokes become valuable through recognition and timing.

They become weak when:

- repeated too often;
- inserted without relevance;
- explained;
- used on the wrong surface;
- assigned to the wrong person;
- treated as a substitute for new humor;
- allowed to contradict real history.

The system should prefer one perfectly timed callback over five references in one session.

---

## 3. Lore Categories

Each lore record belongs to one or more categories.

### 3.1 Person-associated lore

Examples:

- Brandon and the portable sauna;
- Nick and Bapple;
- Joe and the McDonald’s cookie tote;
- Matt Lee and his restricted adult joke;
- Alex and Juncer Score.

### 3.2 Rivalry lore

Examples:

- Nathan versus Joe;
- recurring playoff or championship matchups;
- historically verified trade feuds.

### 3.3 World-object lore

Examples:

- Bapple Tree;
- burn barrel;
- suspicious back door;
- basement objects;
- Tony’s old memorabilia.

### 3.4 NPC lore

Examples:

- Cottage Inn Delivery Guy;
- Clooner;
- Feasel;
- “Just 18” soccer player.

### 3.5 Historical league lore

Examples:

- Berardo’s quiet exile;
- Topouzian brothers shared-slot mythology;
- old championship stories;
- notorious trades;
- prior Gazette receipts.

### 3.6 Phrase lore

Examples:

- “Join the revolution.”
- “WHERE’S BRANDON?!”
- “Farmingtonnn, Farmington Hillllls.”
- “Go see mumma.”

Phrase lore needs stricter repetition controls than general thematic lore.

---

## 4. Lore Record Schema

Each lore record should include:

- `id`;
- canonical name;
- category;
- short context;
- full private admin context;
- associated people;
- eligible surfaces;
- prohibited surfaces;
- active or retired status;
- first known season/date;
- source or commissioner note;
- usage weight;
- exact-line cooldown;
- concept cooldown;
- per-user cooldown;
- per-season cap;
- global cap if applicable;
- first-use treatment;
- repeat-use treatment;
- sensitivity level;
- explicit-language flag;
- audience restrictions;
- eligible event tags;
- incompatible lore;
- required conditions;
- last used;
- total uses;
- notes.

The user-facing application should never expose private admin context or joke explanations.

---

## 5. Eligibility Pipeline

Before lore can appear:

1. Confirm the lore is active.
2. Confirm the current environment and surface are allowed.
3. Confirm associated people are relevant or present.
4. Confirm required event tags.
5. Confirm no prohibited condition.
6. Check exact-line cooldown.
7. Check broader concept cooldown.
8. Check per-user cooldown.
9. Check seasonal and global caps.
10. Check recent issue/session usage.
11. Check incompatibilities with other lore.
12. Confirm the content does not reveal private admin notes.
13. Add to the eligible pool.

Only then may weighting occur.

A high weight never bypasses eligibility.

---

## 6. Cooldown Types

### 6.1 Exact-line cooldown

Prevents the same wording from repeating.

### 6.2 Concept cooldown

Prevents variants of the same joke from appearing too often.

Example:

- exact line: “WHERE’S BRANDON?!”
- concept: Cottage Inn gunman entrance.

The line and the event require separate cooldowns.

### 6.3 Person cooldown

Prevents one manager from becoming the target of too many callbacks.

### 6.4 Surface cooldown

Allows a joke to appear in the Gazette without immediately repeating in the homepage or basement.

### 6.5 Seasonal cap

Limits use across one fantasy season.

### 6.6 Lifetime rarity

For rare NPC events, total frequency should remain very low even across multiple seasons.

---

## 7. Weighting

Weights influence eligible choices but do not guarantee selection.

Recommended factors:

- relevance to current event;
- time since last use;
- rarity;
- manager context;
- first-time bonus;
- seasonal context;
- current narrative value;
- recent target distribution.

Penalties:

- same manager recently targeted;
- same lore recently used elsewhere;
- same phrase recently used;
- weak connection to current event;
- overrepresented NPC;
- restricted content on a public-style surface.

The system should be able to choose no lore at all.

---

## 8. Usage Log

Every lore appearance should create a usage record containing:

- lore ID;
- exact variant;
- surface;
- user or audience;
- associated event;
- associated manager;
- season and week;
- timestamp;
- generated or curated source;
- Gazette issue ID if applicable;
- admin override;
- content version.

This log powers:

- cooldowns;
- audits;
- editorial review;
- frequency tuning;
- retirement decisions;
- history.

---

## 9. First Encounter Versus Repeat Encounter

First encounters may be cinematic.

Repeat encounters should be shorter.

### First Cottage Inn appearance

Possible treatment:

- door bursts open;
- screen shake;
- delivery person appears;
- “WHERE’S BRANDON?!”
- brief pause;
- event exits quickly.

### Later appearances

Possible treatment:

- door opens;
- one abbreviated line;
- immediate exit.

Do not replay a full cutscene every time.

The application should remember whether a user has seen the first encounter.

---

## 10. Rare NPC Frequency

Rare NPCs should remain genuinely rare.

Suggested initial principles:

- Cottage Inn Delivery Guy: approximately one or two meaningful appearances per season, not a fixed guaranteed schedule;
- Clooner: occasional contextual appearance;
- Feasel: rare event or story-driven appearance;
- “Just 18” player: extremely limited, context-restricted;
- Berardo/Topouzian references: archive or carefully selected callbacks.

Do not convert a rough rarity target into predictable weekly scheduling.

---

## 11. NPC Spawn Rules

An NPC event should specify:

- eligible route;
- eligible time window;
- eligible manager;
- required user action;
- minimum time since last spawn;
- first-encounter state;
- random probability after eligibility;
- max seasonal uses;
- reduced-motion alternative;
- audio behavior;
- interruption level.

NPCs must never:

- block a critical action;
- appear during account recovery;
- appear during destructive admin confirmation;
- interrupt a paid or irreversible action;
- cause data loss.

---

## 12. Dynamic League Memory

Dynamic memory should be derived from persisted facts.

### Permanent memory

Examples:

- championships;
- historic trades;
- league records;
- first legendary pull;
- major rivalry moments;
- iconic Gazette stories.

### Seasonal memory

Examples:

- current win streak;
- active rivalry arc;
- trade reputation;
- current casino heater;
- playoff race.

### Temporary context

Examples:

- current week;
- recent page action;
- current box;
- current casino result.

Each memory record needs:

- factual statement;
- source;
- entities;
- date;
- confidence;
- visibility;
- expiration policy;
- eligible surfaces;
- usage history.

---

## 13. Memory Confidence

Confidence levels may include:

- verified provider fact;
- verified application event;
- commissioner-approved canon;
- inferred pattern with sufficient evidence;
- unverified note.

Only the first three should be eligible for automatic user-facing claims.

Inferred patterns should require commissioner approval before becoming character canon.

Unverified notes remain admin-only.

---

## 14. Callback Selection

A callback should be used only when it adds meaning to the current event.

Good callback:

> A manager repeats the same trade mistake described in a prior Slice.

Weak callback:

> A random Bapple reference appears because Nick loaded the homepage.

Callbacks should be ranked by:

- factual relevance;
- emotional relevance;
- time distance;
- rarity;
- user recognition;
- freshness.

---

## 15. Joke Aging

A joke may move through states:

- new;
- active;
- established;
- limited;
- retired;
- archival.

A retired joke:

- remains in history;
- cannot appear in new runtime content;
- may remain visible in old Gazette issues;
- may be reactivated manually.

The commissioner should be able to retire content immediately.

---

## 16. New Lore Creation

New lore may originate from:

- commissioner entry;
- approved user suggestion;
- a verified league event;
- a memorable Gazette moment;
- a new collectible;
- a real recurring phrase;
- a newly established rivalry.

AI must not autonomously promote a generated joke into canon.

Workflow:

1. propose lore;
2. add private context;
3. assign people and surfaces;
4. set restrictions;
5. set cooldowns;
6. preview;
7. approve;
8. activate.

---

## 17. Lore and the Gazette

The Gazette should receive only a small eligible lore packet for each story.

The packet may include:

- lore ID;
- permitted framing;
- people;
- restrictions;
- last used;
- cooldown status;
- maximum usage;
- examples of tone.

The model should not see the entire lore database.

Every published lore usage must be recorded.

---

## 18. Lore and Runtime Dialogue

Runtime dialogue uses curated variants.

The system should not ask a model to improvise a new version of an inside joke.

Variants may be authored in advance and managed through:

- weights;
- cooldowns;
- context tags;
- explicit-language flags;
- surface restrictions.

---

## 19. Sensitive and Restricted Lore

Restricted lore requires:

- explicit admin approval;
- allowed surfaces;
- audience scope;
- stronger cooldown;
- easy disable control;
- no use in account, security, or public-style contexts.

Examples include:

- sexual humor;
- workplace-specific jokes;
- aggressive imagery;
- jokes involving real third parties.

The existence of a restricted joke in canon does not make it universally eligible.

---

## 20. Incompatibility Rules

Some lore should not appear together.

Examples:

- multiple rare NPCs in one short session;
- several Brandon-specific jokes in the same story;
- explicit adult humor in a sentimental season-close moment;
- Feasel and Cottage Inn interruptions in the same route visit.

The lore manager should support explicit incompatibility groups.

---

## 21. Testing Tools

Admin tools should support:

- view eligible lore for a scenario;
- simulate cooldown passage;
- trigger first encounter;
- trigger repeat encounter;
- test reduced-motion behavior;
- inspect usage history;
- preview exact dialogue;
- test manager targeting distribution;
- test seasonal caps;
- test retirement;
- verify no private context leaks.

---

## 22. Acceptance Criteria

The dynamic lore system is ready when:

- all lore has source and ownership metadata;
- exact lines and concepts have separate cooldowns;
- rare NPCs remain rare;
- first and repeat encounters differ;
- every use is logged;
- the system may choose no lore;
- retired lore cannot appear in new content;
- restricted lore is surface-controlled;
- AI cannot create canon automatically;
- callbacks are fact-based;
- Zack receives no invented lore;
- private explanations never appear to users.

---

## 23. Final Principle

The system should not make users think:

> “The website remembered a joke.”

It should make them think:

> “Of course Tony brought that up now.”
