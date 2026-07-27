# 08 — Tony’s Tuesday Slice Gazette System

**Version:** 2.0  
**Status:** Canonical specification  
**Official title:** Tony’s Tuesday Slice  
**Subtitle:** Fresh Out of the Oven  
**Primary question:** How is the league’s weekly editorial event created, reviewed, published, and experienced?

---

## 1. Purpose

Tony’s Tuesday Slice is the centerpiece weekly content feature of Tony’s Pizza Fantasy Football Hub.

Sleeper already shows scores, rosters, standings, and transactions. The Slice explains why the week mattered to this exact group of friends.

It should deliver:

- context;
- drama;
- personalized humor;
- rivalries;
- callbacks;
- memorable moments;
- anticipation for next week.

It should not read like a generic fantasy recap, a box-score summary, or an AI-generated newsletter.

---

## 2. Editorial Standard

The governing rule is:

> Accuracy before comedy. Selection before summary. Personality without fabrication.

The Slice may exaggerate the emotional meaning of a verified event. It may not exaggerate or invent the underlying fact.

The question for every issue is:

> What happened this week that people in this league may still mention years from now?

Not:

> Who ranked first in every available statistic?

---

## 3. Publication Cadence

Target publication:

- Tuesday after the fantasy week is final;
- only after the Sleeper sync and validation pipeline complete;
- held when provider data is incomplete or stat corrections remain material;
- manually publishable by the commissioner.

Do not hardcode an assumed universal Tuesday hour. The commissioner should configure the publication target in the league timezone.

For this league, scheduling should respect Eastern Time and daylight-saving changes.

---

## 4. End-to-End Workflow

1. Sleeper data sync completes.
2. Weekly data is marked sufficiently final.
3. Story Engine creates and scores candidates.
4. Admin reviews candidate slate.
5. Selected candidates are converted into structured fact packets.
6. Writing model drafts the issue.
7. Deterministic and model-assisted checks run.
8. Failed stories are corrected, regenerated, or removed.
9. Commissioner previews and edits.
10. Commissioner approves.
11. Exact issue version is saved.
12. Issue is published.
13. Homepage and archive update.
14. Publication event is recorded.

In the first season, approval is mandatory. No issue should auto-publish directly from a model response.

---

## 5. Issue Shape

The Slice should usually contain **four or five strong stories**.

Acceptable range:

- minimum: three when the week is quiet;
- typical: four or five;
- maximum: five primary stories, excluding a compact announcement or closing note.

Do not force sections. Do not publish filler to hit a quota.

Target reading time:

- approximately three to five minutes;
- highly scannable;
- short paragraphs;
- visual breaks;
- optional expandable evidence or stat detail.

---

## 6. Recommended Editorial Structure

The UI is a continuous scrollable newspaper experience, not a page-turning PDF.

Possible flow:

### 6.1 Masthead

- issue title;
- season and week;
- publication date;
- subtitle;
- compact Tony opener.

### 6.2 Lead story

The single most consequential or entertaining story.

It receives:

- strongest headline;
- largest illustration;
- most context;
- highest placement.

### 6.3 Supporting stories

Three or four shorter stories selected from the ranked candidates.

### 6.4 Optional modules

Use only when meaningful:

- Tony’s Receipts;
- casino report;
- collectible report;
- basement spotlight;
- feature announcement;
- next-week setup.

These are not permanent required columns.

### 6.5 Closing line

A brief Tony sign-off or transition into the upcoming week.

---

## 7. Story Categories

Eligible categories include:

- meaningful blowout;
- Monday-night heartbreak or comeback;
- upset;
- trade revenge;
- rivalry;
- fraud/luck;
- bench crime;
- historic team or player performance;
- playoff or standings swing;
- significant casino moment;
- legendary collectible;
- major auction result;
- basement spotlight;
- feature or seasonal announcement;
- Tony’s Receipts.

Category logic and thresholds are defined in `07_AI_STORY_ENGINE_AND_EVENT_ANALYSIS.md`.

The Gazette must consume candidates from that engine rather than recalculate facts itself.

---

## 8. Lead-Story Selection

The lead story should maximize the combination of:

- fantasy consequence;
- rarity;
- emotional drama;
- league relevance;
- historical importance;
- narrative completeness.

A high score alone does not guarantee the lead. The commissioner may override the ranking.

A feature launch or collectible pull should rarely displace a major fantasy story during the active season unless it is genuinely more important to the league.

---

## 9. Tony’s Opening Counter

The opening should be brief—generally one to three sentences.

Purpose:

- establish that the new issue has arrived;
- set the week’s emotional tone;
- tease the lead story;
- sound unmistakably like Tony.

Example pattern:

> Pizzas are hot, the coffee is questionable, and somebody just lost by six-tenths of a point. Let’s open the register.

The opener must not introduce facts that are absent from the approved issue packet.

---

## 10. Headline Rules

Headlines should be:

- specific;
- compact;
- readable at a glance;
- connected to the real event;
- varied across weeks.

Avoid:

- generic clickbait;
- vague “You Won’t Believe” construction;
- ESPN imitation;
- repeating the same named segment every issue;
- unsupported superlatives;
- too many pizza puns.

A headline can be funny without containing the full joke.

---

## 11. Story Body Rules

Each story should:

1. establish the verified event;
2. explain why it mattered;
3. add Tony’s perspective;
4. optionally connect approved history or lore;
5. end before the joke becomes repetitive.

Use exact scores and statistics only when they improve the story.

Do not turn every fact packet into a paragraph-by-paragraph recitation.

Suggested lengths:

- lead story: roughly 150–300 words;
- supporting story: roughly 80–180 words;
- micro-module: roughly 30–90 words.

These are editorial targets, not strict schema limits.

---

## 12. Tony’s Voice

Tony should sound like the owner of the place, not a sports columnist impersonating one.

Use:

- short declarations;
- dry confidence;
- selective outrage;
- affectionate roasting;
- local-shop imagery;
- occasional Detroit or football flavor;
- callbacks that users already understand.

Avoid:

- “As an AI”;
- analytical boilerplate;
- constant modern slang;
- excessive section labels;
- forced metaphor;
- moralizing;
- explaining inside jokes.

Tony is not the newspaper editor as a separate character. The Slice is a publication from his world and voice, but the system should not create a new editor persona.

Tony’s full canon appears in `12_TONY_PERSONALITY_BIBLE.md`.

---

## 13. Roast Rules

The Slice may be sharper than routine UI copy, but it remains affectionate.

Good targets:

- a disastrous lineup decision;
- a ridiculous trade outcome;
- a lucky record;
- premature confidence;
- a historic loss;
- a casino misadventure.

Avoid:

- protected traits;
- real health or family matters;
- deeply personal insecurity;
- career harm;
- claims that a person said or believed something they did not;
- repeated targeting of one manager every week.

The commissioner may edit or remove any joke before publication.

---

## 14. Inside Jokes and Lore

Lore may appear only when:

- relevant to the story;
- active;
- not on cooldown;
- approved for the involved managers and surface;
- not recently overused.

Rules:

- never explain the joke;
- do not cram multiple lore references into one short story;
- rare NPCs should remain rare;
- do not use retired lore;
- record every published lore usage.

The publication engine should receive a narrow set of eligible lore, not the full canon.

---

## 15. Tony’s Receipts

Tony’s Receipts allows the publication to acknowledge a prior wrong take.

Use:

- no more than one or two times in an issue;
- only when a prior claim exists in the saved archive;
- with the original issue and statement traceable;
- without inventing a prediction.

Example pattern:

> Last week Tony said Matty B’s team was cooked. The archive has been reviewed. Tony was wrong. The oven remains operational.

Receipts should increase continuity and trust, not manufacture fake continuity.

---

## 16. Casino and Collectible Coverage

These modules appear only for significant events.

### Casino thresholds

Use configured net-swing, jackpot, or streak thresholds. Summarize the event without encouraging loss chasing.

### Collectible thresholds

Normally include:

- legendary pull;
- first-ever item;
- major silent-auction result;
- extraordinary display milestone.

Do not include ordinary box openings merely to advertise the economy.

---

## 17. Basement Spotlight

Basement Spotlight is occasional rather than weekly.

Possible triggers:

- exceptional new display;
- creative theme;
- newly equipped legendary entrance animation;
- seasonal transformation;
- commissioner-selected showcase.

The spotlight should link directly to the manager’s basement.

Do not create subjective “best basement” rankings unless the selection method is explicit.

---

## 18. Announcements

The Slice may announce:

- active seasonal event;
- shipped feature;
- new collectible collection;
- newly enabled casino game;
- commissioner message;
- end-of-season deadline.

Announcements must come from approved application state or commissioner input.

Never announce:

- roadmap concepts;
- hidden feature flags;
- unfinished systems;
- an anniversary event before activation.

---

## 19. Visual Experience

The issue should resemble a playful local pizza-shop paper while remaining a responsive web article.

Visual ingredients:

- newspaper masthead;
- coupon-like accents;
- checkered details;
- subtle grease marks;
- halftone or pixel illustrations;
- Tony annotations;
- varied story scale;
- archival date stamp.

Avoid:

- dense multi-column text on phones;
- tiny fonts;
- fake page turning;
- excessive texture;
- a rigid print layout that harms accessibility.

Desktop may use editorial columns. Mobile should become a clean single-column scroll.

---

## 20. Illustrations

Each issue may use:

- candidate-specific pixel scene;
- manager character sprites;
- scorecard graphic;
- collectible image;
- casino snapshot;
- reusable category illustration.

Illustrations must not depict an event falsely. If no bespoke image exists, use a truthful generic category treatment rather than fabricated visual detail.

The publishing pipeline should support human-selected or templated art before relying on generated issue-specific art.

---

## 21. Fact-Checking Contract

Every story must pass:

- source-data verification;
- number and identity verification;
- historical coverage check;
- league-rule check;
- unsupported-claim check;
- kicker-reference check;
- quote check;
- lore eligibility check;
- feature-state check.

A language model may perform a secondary self-check, but it cannot be the sole validator.

Every factual sentence should be traceable to one or more fact IDs.

---

## 22. Commissioner Review Screen

The review interface should show:

- issue metadata;
- selected candidates;
- candidate scores;
- fact packet;
- generated headline and body;
- highlighted factual claims;
- validation results;
- eligible lore used;
- recent manager/category distribution;
- edit controls;
- regenerate-story control;
- exclude/replace controls;
- preview;
- approve/publish action.

Regeneration must lock the fact packet unless the commissioner deliberately returns to candidate selection.

All edits and approvals must be audit logged.

---

## 23. Publishing and Versioning

An issue should have statuses such as:

- `draft`;
- `needs_review`;
- `approved`;
- `published`;
- `superseded`;
- `archived`.

Publishing creates an immutable version snapshot containing:

- final headline;
- final body;
- story order;
- media references;
- issue metadata;
- fact references;
- model and prompt version;
- commissioner edits;
- publication timestamp.

Corrections should create a new version with a visible correction note when material. Do not silently rewrite league history.

---

## 24. Homepage Integration

When a new issue is published:

- the newspaper object or primary homepage module changes state;
- a prominent “new issue” indicator appears;
- the lead headline may be teased;
- users can open the issue without navigating through menus;
- the previous issue remains in the archive.

The indicator should clear after the user opens the issue or explicitly dismisses it.

The homepage may also present verified “League Pulse” and “Recent Chaos” modules, but these are separate from the issue and should not reveal every story before the user opens it.

---

## 25. Archive

The archive is a permanent league history.

Users should be able to browse by:

- season;
- week;
- manager;
- category;
- rivalry or tag where appropriate.

Archived issues must remain available in offseason museum mode.

Search and filtering should use persisted metadata rather than a generative model.

---

## 26. Quiet Weeks

Some weeks will not produce five great stories.

Allowed responses:

- publish three excellent stories;
- include one commissioner announcement;
- use a compact “Counter Notes” module with verified minor items;
- keep the issue shorter.

Not allowed:

- invent drama;
- declare arbitrary records;
- overuse lore;
- recycle old jokes without relevance;
- report every matchup equally.

A short true issue is better than a full fake one.

---

## 27. Failure Modes

### Incomplete data

Hold publication and show admin status.

### AI generation failure

Retain candidates and fact packets. Allow retry or manual writing.

### Validation failure

Block publication until corrected.

### Provider outage

Do not overwrite prior data. Display last successful sync.

### Commissioner unavailable

Keep issue in review. Do not bypass required approval.

### Late stat correction

Evaluate whether the correction changes a published factual claim. If yes, create a corrected issue version or correction notice.

---

## 28. Cost and Model Controls

Generate once per issue or per explicitly requested story revision—not on every page load.

Controls:

- fixed model configuration;
- token budget;
- maximum regeneration attempts;
- cached drafts;
- prompt versioning;
- usage logging;
- admin-only generation;
- no user-triggered unlimited rewrites.

The published issue is stored content, not live-generated content.

---

## 29. Acceptance Criteria

The Gazette is ready when:

- it consumes only Story Engine candidates;
- each factual claim maps to verified facts;
- commissioner approval is mandatory in season one;
- issues contain three to five worthwhile stories;
- no fixed section is forced;
- mobile reading is comfortable;
- exact published versions are archived;
- corrections are versioned;
- lore cooldowns are enforced;
- no ordinary page load invokes AI;
- quiet weeks remain truthful;
- unreleased features cannot be announced;
- users can browse past issues during the offseason.

---

## 30. Final Principle

Sleeper records the week.

Tony’s Tuesday Slice preserves what the league will remember about it.
